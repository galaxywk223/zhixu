use std::{fs, path::Path};

use anyhow::{anyhow, Context, Result};
use calamine::{open_workbook_auto, Data, Reader};
use regex::Regex;
use serde::Serialize;
use sha2::{Digest, Sha256};

#[derive(Debug, Serialize)]
pub struct Output {
    pub schema_version: u32,
    pub source: &'static str,
    pub file_hash: String,
    pub sheet_name: String,
    pub export_user: Option<String>,
    pub range_start: Option<String>,
    pub range_end: Option<String>,
    pub declared_minutes: Option<i64>,
    pub declared_records: Option<i64>,
    pub sessions: Vec<Session>,
}

#[derive(Debug, Serialize)]
pub struct Session {
    pub source_key: String,
    pub legacy_source_key: Option<String>,
    pub start_local: String,
    pub end_local: String,
    pub task_name: String,
    pub duration_minutes: i64,
    pub reflection: Option<String>,
    pub status: String,
}

fn cell_text(cell: &Data) -> String {
    match cell {
        Data::Empty => String::new(),
        _ => cell.to_string().trim().to_string(),
    }
}

fn parse_number(text: &str) -> Option<i64> {
    text.chars()
        .filter(|c| c.is_ascii_digit() || *c == '-')
        .collect::<String>()
        .parse()
        .ok()
}

fn normalized_task(value: &str) -> String {
    value
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
}

fn cp1252_byte(character: char) -> Option<u8> {
    let mapped = match character {
        '\u{20ac}' => 0x80,
        '\u{201a}' => 0x82,
        '\u{0192}' => 0x83,
        '\u{201e}' => 0x84,
        '\u{2026}' => 0x85,
        '\u{2020}' => 0x86,
        '\u{2021}' => 0x87,
        '\u{02c6}' => 0x88,
        '\u{2030}' => 0x89,
        '\u{0160}' => 0x8a,
        '\u{2039}' => 0x8b,
        '\u{0152}' => 0x8c,
        '\u{017d}' => 0x8e,
        '\u{2018}' => 0x91,
        '\u{2019}' => 0x92,
        '\u{201c}' => 0x93,
        '\u{201d}' => 0x94,
        '\u{2022}' => 0x95,
        '\u{2013}' => 0x96,
        '\u{2014}' => 0x97,
        '\u{02dc}' => 0x98,
        '\u{2122}' => 0x99,
        '\u{0161}' => 0x9a,
        '\u{203a}' => 0x9b,
        '\u{0153}' => 0x9c,
        '\u{017e}' => 0x9e,
        '\u{0178}' => 0x9f,
        value if (value as u32) <= 0xff => value as u8,
        _ => return None,
    };
    Some(mapped)
}

fn decode_legacy_span(value: &str) -> Option<String> {
    if value.is_empty() {
        return None;
    }
    let bytes = value.chars().map(cp1252_byte).collect::<Option<Vec<_>>>()?;
    if bytes.len() % 2 != 0 {
        return None;
    }
    let units = bytes
        .chunks_exact(2)
        .map(|pair| u16::from_le_bytes([pair[0], pair[1]]))
        .collect::<Vec<_>>();
    let candidate = String::from_utf16(&units).ok()?;
    let has_cjk = candidate
        .chars()
        .any(|c| matches!(c as u32, 0x3400..=0x9fff | 0xf900..=0xfaff));
    let has_mojibake_marker = value
        .chars()
        .any(|c| c.is_control() || (0x7f..=0x9f).contains(&(c as u32)) || (c as u32) > 0xff);
    (has_cjk && has_mojibake_marker).then(|| candidate.replace('\0', ""))
}

fn repair_legacy_text(value: &str) -> String {
    if value.is_empty() {
        return String::new();
    }
    if value.is_ascii() && !value.chars().any(char::is_control) {
        return value.to_string();
    }
    if value.chars().filter(|c| c.is_ascii_digit()).count() >= 8 {
        let parts = value.split_whitespace().collect::<Vec<_>>();
        if parts.len() > 1 {
            return parts
                .into_iter()
                .map(repair_legacy_text)
                .collect::<Vec<_>>()
                .join(" ");
        }
    }
    if let Some(candidate) = decode_legacy_span(value) {
        return candidate.trim().to_string();
    }

    let mut repaired = String::new();
    let mut span = String::new();
    let flush_span = |span: &mut String, repaired: &mut String| {
        if span.is_empty() {
            return;
        }
        repaired.push_str(decode_legacy_span(span).as_deref().unwrap_or(span.as_str()));
        span.clear();
    };
    for character in value.chars() {
        if cp1252_byte(character).is_some() {
            span.push(character);
        } else {
            flush_span(&mut span, &mut repaired);
            repaired.push(character);
        }
    }
    flush_span(&mut span, &mut repaired);
    repaired.replace('\0', "").trim().to_string()
}

fn source_key(start: &str, end: &str) -> String {
    let stable = format!("tomatodo|{}|{}", start, end);
    format!("v3:{:x}", Sha256::digest(stable.as_bytes()))
}

fn legacy_source_key(start: &str, end: &str, task_name: &str) -> String {
    let stable = format!("tomatodo|{}|{}|{}", start, end, normalized_task(task_name));
    format!("{:x}", Sha256::digest(stable.as_bytes()))
}

pub fn parse_workbook(path: &Path, dump: bool) -> Result<Option<Output>> {
    let bytes = fs::read(path).with_context(|| format!("无法读取文件: {}", path.display()))?;
    let file_hash = format!("{:x}", Sha256::digest(&bytes));
    let mut workbook = open_workbook_auto(path).context("无法解析 Excel 工作簿")?;
    let sheet_names = workbook.sheet_names().to_vec();
    let sheet_name = if dump {
        sheet_names.first().cloned()
    } else {
        sheet_names.iter().find_map(|name| {
            let range = workbook.worksheet_range(name).ok()?;
            let has_header = range.rows().any(|row| {
                row.iter()
                    .any(|cell| repair_legacy_text(&cell_text(cell)) == "专注时间")
                    || row
                        .first()
                        .map(|cell| {
                            let value = cell_text(cell);
                            value.starts_with("20") && value.len() >= 16
                        })
                        .unwrap_or(false)
            });
            has_header.then(|| name.clone())
        })
    }
    .ok_or_else(|| anyhow!("工作簿没有包含番茄 TODO 表头的工作表"))?;
    let range = workbook
        .worksheet_range(&sheet_name)
        .context("无法读取工作表")?;
    let raw_rows: Vec<Vec<String>> = range
        .rows()
        .map(|row| row.iter().map(cell_text).collect())
        .collect();
    let rows: Vec<Vec<String>> = raw_rows
        .iter()
        .map(|row| row.iter().map(|value| repair_legacy_text(value)).collect())
        .collect();
    if dump {
        for (row_index, row) in rows.iter().enumerate() {
            eprintln!("row {row_index}: {row:?}");
            for (column_index, value) in row.iter().enumerate() {
                let codes = value
                    .chars()
                    .map(|character| format!("{:04X}", character as u32))
                    .collect::<Vec<_>>();
                eprintln!("  col {column_index}: {codes:?}");
            }
        }
        return Ok(None);
    }
    if rows.len() < 2 {
        return Err(anyhow!("工作表缺少表头"));
    }

    let time_regex =
        Regex::new(r"^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}).*?(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})$")?;
    let data_row_index = rows.iter().position(|row| {
        row.first()
            .map(|value| value.starts_with("20") && value.len() >= 16)
            .unwrap_or(false)
    });
    let header_row_index = rows
        .iter()
        .position(|row| row.iter().any(|value| value == "专注时间"))
        .or_else(|| data_row_index.map(|index| index.saturating_sub(1)))
        .ok_or_else(|| anyhow!("缺少字段: 专注时间"))?;
    let metadata = rows
        .iter()
        .take(header_row_index)
        .flatten()
        .cloned()
        .collect::<Vec<_>>();
    let user = metadata
        .iter()
        .find_map(|value| value.strip_prefix("用户:"))
        .or_else(|| {
            metadata
                .first()
                .and_then(|value| value.split_once(':').map(|(_, suffix)| suffix))
        })
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);
    let date_range_regex = Regex::new(r"(20\d{2}-\d{2}-\d{2}).*?(20\d{2}-\d{2}-\d{2})")?;
    let date_range = metadata
        .iter()
        .find_map(|value| date_range_regex.captures(value));
    let (range_start, range_end) = date_range
        .map(|captures| (Some(captures[1].to_string()), Some(captures[2].to_string())))
        .unwrap_or((None, None));
    let declared_minutes = metadata.iter().find_map(|value| {
        if value.contains("时长共计") {
            parse_number(value)
        } else {
            None
        }
    });
    let declared_records = metadata.iter().find_map(|value| {
        if value.contains("共") && value.contains("条记录") {
            parse_number(value)
        } else {
            None
        }
    });

    let headers = &rows[header_row_index];
    let index = |name: &str| headers.iter().position(|value| value == name);
    let positional_layout = headers.len() >= 6;
    let column =
        |name: &str, fallback: usize| index(name).or_else(|| positional_layout.then_some(fallback));
    let time_index = column("专注时间", 0).ok_or_else(|| anyhow!("缺少字段: 专注时间"))?;
    let task_index = column("待办名称", 1).ok_or_else(|| anyhow!("缺少字段: 待办名称"))?;
    let duration_index =
        column("专注时长(分钟)", 2).ok_or_else(|| anyhow!("缺少字段: 专注时长(分钟)"))?;
    let reflection_index = column("心得", 3).ok_or_else(|| anyhow!("缺少字段: 心得"))?;
    let status_index = column("状态", 4).ok_or_else(|| anyhow!("缺少字段: 状态"))?;
    let mut sessions = Vec::new();

    for (row_index, row) in rows.iter().enumerate().skip(header_row_index + 1) {
        if row.iter().all(|value| value.is_empty()) {
            continue;
        }
        let time_text = row.get(time_index).cloned().unwrap_or_default();
        let captures = time_regex
            .captures(&time_text)
            .ok_or_else(|| anyhow!("无法解析专注时间: {}", time_text))?;
        let start = captures.get(1).unwrap().as_str().trim().to_string();
        let end = captures.get(2).unwrap().as_str().trim().to_string();
        let task_name = row.get(task_index).cloned().unwrap_or_default();
        let legacy_task_name = raw_rows
            .get(row_index)
            .and_then(|raw| raw.get(task_index))
            .cloned()
            .unwrap_or_else(|| task_name.clone());
        let duration =
            parse_number(row.get(duration_index).map(String::as_str).unwrap_or("0")).unwrap_or(0);
        let status = row.get(status_index).cloned().unwrap_or_default();
        let reflection = row
            .get(reflection_index)
            .cloned()
            .filter(|value| !value.is_empty());
        let canonical_key = source_key(&start, &end);
        let legacy_key = legacy_source_key(&start, &end, &legacy_task_name);
        sessions.push(Session {
            source_key: canonical_key.clone(),
            legacy_source_key: Some(legacy_key),
            start_local: start,
            end_local: end,
            task_name,
            duration_minutes: duration,
            reflection,
            status,
        });
    }

    let declared_minutes = declared_minutes.or_else(|| {
        Some(
            sessions
                .iter()
                .map(|session| session.duration_minutes.max(0))
                .sum(),
        )
    });
    let declared_records = declared_records.or_else(|| Some(sessions.len() as i64));
    Ok(Some(Output {
        schema_version: 3,
        source: "tomatodo",
        file_hash,
        sheet_name: repair_legacy_text(&sheet_name),
        export_user: user,
        range_start,
        range_end,
        declared_minutes,
        declared_records,
        sessions,
    }))
}

#[cfg(test)]
mod tests {
    use super::{legacy_source_key, normalized_task, parse_number, repair_legacy_text, source_key};
    use regex::Regex;

    #[test]
    fn parses_signed_duration_text() {
        assert_eq!(parse_number("13 分钟"), Some(13));
        assert_eq!(parse_number("0"), Some(0));
        assert_eq!(parse_number("无"), None);
    }

    #[test]
    fn normalizes_task_for_deduplication() {
        assert_eq!(normalized_task("  Read   Book "), "read book");
        assert_eq!(normalized_task("学习\t计划"), "学习 计划");
    }

    #[test]
    fn accepts_mojibake_time_separator() {
        let regex =
            Regex::new(r"^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}).*?(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})$")
                .expect("valid regex");
        let captures = regex
            .captures("2026-08-07 12:49 ó\u{81} 2026-08-07 13:02")
            .expect("time range should parse");
        assert_eq!(&captures[1], "2026-08-07 12:49");
        assert_eq!(&captures[2], "2026-08-07 13:02");
    }

    #[test]
    fn repairs_legacy_utf16le_text_without_touching_ascii() {
        assert_eq!(repair_legacy_text("w\u{008d}Š^"), "起床");
        assert_eq!(repair_legacy_text("ò]Œ[\u{0010}b"), "已完成");
        assert_eq!(repair_legacy_text("\u{0013}Nèlöeô•"), "专注时间");
        assert_eq!(repair_legacy_text("y˜îv\0_ÑS"), "项目开发");
        assert_eq!(repair_legacy_text("保研:gÕ‹\rY`N"), "保研机试复习");
        assert_eq!(repair_legacy_text("vibe coding"), "vibe coding");
    }

    #[test]
    fn time_identity_ignores_renamed_tasks_and_keeps_legacy_alias() {
        let canonical = source_key("2026-08-07 12:49", "2026-08-07 13:02");
        let renamed = source_key("2026-08-07 12:49", "2026-08-07 13:02");
        let legacy = legacy_source_key("2026-08-07 12:49", "2026-08-07 13:02", "vibe coding");
        assert_eq!(canonical, renamed);
        assert_ne!(canonical, legacy);
        assert!(canonical.starts_with("v3:"));
    }
}
