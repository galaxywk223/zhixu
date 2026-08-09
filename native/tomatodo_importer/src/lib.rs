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
    pub rows: Vec<ImportRow>,
}

#[derive(Debug, Serialize)]
pub struct ImportRow {
    pub source_row: usize,
    pub source_key: Option<String>,
    pub legacy_source_key: Option<String>,
    pub start_local: Option<String>,
    pub end_local: Option<String>,
    pub task_name: String,
    pub duration_minutes: Option<i64>,
    pub reflection: Option<String>,
    pub status: String,
    pub classification: &'static str,
    pub reason: Option<String>,
    pub warnings: Vec<String>,
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

fn parse_duration_minutes(text: &str) -> Option<i64> {
    let value = text.trim();
    if value.contains("小时") {
        let hours = Regex::new(r"(-?\d+)\s*小时")
            .ok()?
            .captures(value)
            .and_then(|captures| captures.get(1))
            .and_then(|number| number.as_str().parse::<i64>().ok())?;
        let minutes = Regex::new(r"(-?\d+)\s*分钟")
            .ok()?
            .captures(value)
            .and_then(|captures| captures.get(1))
            .and_then(|number| number.as_str().parse::<i64>().ok())
            .unwrap_or(0);
        return Some(hours * 60 + minutes);
    }
    parse_number(value)
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

fn decode_utf16le(value: &str) -> Option<String> {
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
    let candidate = String::from_utf16(&units).ok()?.replace('\0', "");
    candidate
        .chars()
        .any(|c| matches!(c as u32, 0x3400..=0x9fff | 0xf900..=0xfaff))
        .then(|| candidate.trim().to_string())
}

fn has_mojibake_marker(value: &str) -> bool {
    value
        .chars()
        .any(|c| c.is_control() || (0x7f..=0x9f).contains(&(c as u32)) || (c as u32) > 0xff)
}

fn has_unresolved_mojibake(value: &str) -> bool {
    value.chars().any(|character| {
        let code = character as u32;
        character.is_control()
            || (0x7f..=0x9f).contains(&code)
            || (code > 0xff && !matches!(code, 0x3400..=0x9fff | 0xf900..=0xfaff))
    })
}

fn decode_legacy_span(value: &str) -> Option<String> {
    has_mojibake_marker(value)
        .then(|| decode_utf16le(value))
        .flatten()
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
        return candidate;
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

fn repair_known_text(value: &str, accepted: &[&str]) -> String {
    let repaired = repair_legacy_text(value);
    if accepted.contains(&repaired.as_str()) {
        return repaired;
    }
    decode_utf16le(value)
        .filter(|candidate| accepted.contains(&candidate.as_str()))
        .unwrap_or(repaired)
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
                    .any(|cell| repair_known_text(&cell_text(cell), &["专注时间"]) == "专注时间")
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
    let header_row_index = raw_rows
        .iter()
        .position(|row| {
            row.iter()
                .any(|value| repair_known_text(value, &["专注时间"]) == "专注时间")
        })
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
        (value.contains("时长共计") || (value.contains("小时") && value.contains("分钟")))
            .then(|| parse_duration_minutes(value))
            .flatten()
    });
    let declared_records = metadata.iter().find_map(|value| {
        if value.contains('共') && value.contains("条记录") {
            parse_number(value)
        } else {
            None
        }
    });

    let raw_headers = &raw_rows[header_row_index];
    let header_value = |index: usize| {
        repair_known_text(
            raw_headers.get(index).map(String::as_str).unwrap_or(""),
            &["专注时间", "待办名称", "专注时长(分钟)", "心得", "状态"],
        )
    };
    let headers = (0..raw_headers.len()).map(header_value).collect::<Vec<_>>();
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
    let mut import_rows = Vec::new();

    for (row_index, raw_row) in raw_rows.iter().enumerate().skip(header_row_index + 1) {
        if raw_row.iter().all(|value| value.is_empty()) {
            continue;
        }
        let time_text =
            repair_legacy_text(raw_row.get(time_index).map(String::as_str).unwrap_or(""));
        let captures = time_regex.captures(&time_text);
        let start = captures
            .as_ref()
            .and_then(|value| value.get(1))
            .map(|value| value.as_str().trim().to_string());
        let end = captures
            .as_ref()
            .and_then(|value| value.get(2))
            .map(|value| value.as_str().trim().to_string());
        let raw_task_name = raw_row.get(task_index).cloned().unwrap_or_default();
        let task_name = repair_known_text(&raw_task_name, &["睡眠", "睡觉", "起床", "醒来"]);
        let duration = parse_duration_minutes(
            raw_row
                .get(duration_index)
                .map(String::as_str)
                .unwrap_or(""),
        );
        let status = repair_known_text(
            raw_row.get(status_index).map(String::as_str).unwrap_or(""),
            &["已完成", "中途放弃"],
        );
        let reflection = raw_row
            .get(reflection_index)
            .map(|value| repair_legacy_text(value))
            .filter(|value| !value.is_empty());
        let canonical_key = start
            .as_deref()
            .zip(end.as_deref())
            .map(|(start, end)| source_key(start, end));
        let legacy_key = start
            .as_deref()
            .zip(end.as_deref())
            .map(|(start, end)| legacy_source_key(start, end, &raw_task_name));
        let mut warnings = Vec::new();
        if task_name != raw_task_name {
            warnings.push("已修复旧版编码文本".to_string());
        }

        let (classification, reason) = if status == "中途放弃" {
            ("excluded", Some("中途放弃".to_string()))
        } else if status != "已完成" {
            ("error", Some(format!("无法识别状态：{}", status)))
        } else if captures.is_none() {
            ("error", Some(format!("无法解析专注时间：{}", time_text)))
        } else if task_name.trim().is_empty() {
            ("error", Some("待办名称为空".to_string()))
        } else if has_unresolved_mojibake(&task_name) {
            (
                "error",
                Some("待办名称包含无法恢复的旧版编码文本".to_string()),
            )
        } else {
            match duration {
                None => ("error", Some("无法解析专注时长".to_string())),
                Some(value) if value < 0 => ("error", Some("专注时长不能为负数".to_string())),
                Some(value) if value > 0 => ("focus", None),
                Some(_) if matches!(task_name.as_str(), "睡眠" | "睡觉" | "起床" | "醒来") => {
                    ("life_event", None)
                }
                Some(_) => ("excluded", Some("零分钟且不是睡眠或起床".to_string())),
            }
        };

        import_rows.push(ImportRow {
            source_row: row_index + 1,
            source_key: canonical_key,
            legacy_source_key: legacy_key,
            start_local: start,
            end_local: end,
            task_name,
            duration_minutes: duration,
            reflection,
            status,
            classification,
            reason,
            warnings,
        });
    }

    let declared_minutes = declared_minutes.or_else(|| {
        Some(
            import_rows
                .iter()
                .filter(|row| row.classification == "focus")
                .filter_map(|row| row.duration_minutes)
                .sum(),
        )
    });
    let declared_records = declared_records.or_else(|| Some(import_rows.len() as i64));
    Ok(Some(Output {
        schema_version: 4,
        source: "tomatodo",
        file_hash,
        sheet_name: repair_legacy_text(&sheet_name),
        export_user: user,
        range_start,
        range_end,
        declared_minutes,
        declared_records,
        rows: import_rows,
    }))
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use super::{
        legacy_source_key, normalized_task, parse_duration_minutes, parse_number, parse_workbook,
        repair_known_text, repair_legacy_text, source_key,
    };
    use regex::Regex;

    #[test]
    fn parses_duration_text_and_hour_summaries() {
        assert_eq!(parse_number("13 分钟"), Some(13));
        assert_eq!(parse_duration_minutes("13 分钟"), Some(13));
        assert_eq!(parse_duration_minutes("10 小时 30 分钟"), Some(630));
        assert_eq!(parse_duration_minutes("0"), Some(0));
        assert_eq!(parse_duration_minutes("无"), None);
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
    fn repairs_known_ascii_legacy_text_without_touching_english() {
        assert_eq!(repair_known_text("aw w", &["睡眠", "起床"]), "睡眠");
        assert_eq!(
            repair_known_text("vibe coding", &["睡眠", "起床"]),
            "vibe coding"
        );
        assert_eq!(repair_legacy_text("w\u{008d}Š^"), "起床");
        assert_eq!(repair_legacy_text("ò]Œ[\u{0010}b"), "已完成");
        assert_eq!(repair_legacy_text("\u{0013}Nèlöeô•"), "专注时间");
        assert_eq!(repair_legacy_text("y˜îv\0_ÑS"), "项目开发");
        assert_eq!(repair_legacy_text("保研:gÕ‹\rY`N"), "保研机试复习");
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

    #[test]
    fn parses_reference_workbook_with_expected_business_rules() {
        let fixture = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("fixtures")
            .join("tomatodo_history_2192.xls");
        if !fixture.exists() {
            return;
        }
        let output = parse_workbook(&fixture, false)
            .expect("fixture should parse")
            .expect("fixture should produce output");
        assert_eq!(output.schema_version, 4);
        assert_eq!(output.declared_minutes, Some(630));
        assert_eq!(output.rows.len(), 18);
        assert_eq!(
            output
                .rows
                .iter()
                .filter(|row| row.classification == "focus")
                .count(),
            11
        );
        assert_eq!(
            output
                .rows
                .iter()
                .filter(|row| row.classification == "life_event")
                .count(),
            5
        );
        assert_eq!(
            output
                .rows
                .iter()
                .filter(|row| row.reason.as_deref() == Some("中途放弃"))
                .count(),
            2
        );
        assert_eq!(
            output
                .rows
                .iter()
                .filter(|row| row.task_name == "睡眠")
                .count(),
            2
        );
    }
}
