use std::{fs, path::PathBuf};

use anyhow::{anyhow, Context, Result};
use calamine::{open_workbook_auto, Data, Reader};
use clap::Parser;
use regex::Regex;
use serde::Serialize;
use sha2::{Digest, Sha256};

#[derive(Parser)]
struct Args {
    path: PathBuf,
    #[arg(long)]
    dump: bool,
}

#[derive(Debug, Serialize)]
struct Output {
    schema_version: u32,
    source: &'static str,
    file_hash: String,
    sheet_name: String,
    export_user: Option<String>,
    range_start: Option<String>,
    range_end: Option<String>,
    declared_minutes: Option<i64>,
    declared_records: Option<i64>,
    sessions: Vec<Session>,
}

#[derive(Debug, Serialize)]
struct Session {
    source_key: String,
    start_local: String,
    end_local: String,
    task_name: String,
    duration_minutes: i64,
    reflection: Option<String>,
    status: String,
    completion_percent: i64,
}

fn cell_text(cell: &Data) -> String {
    match cell {
        Data::Empty => String::new(),
        _ => cell.to_string().replace('\0', "").trim().to_string(),
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
    value.split_whitespace().collect::<Vec<_>>().join(" ").to_lowercase()
}

fn main() -> Result<()> {
    let args = Args::parse();
    let bytes = fs::read(&args.path).with_context(|| format!("无法读取文件: {}", args.path.display()))?;
    let file_hash = format!("{:x}", Sha256::digest(&bytes));
    let mut workbook = open_workbook_auto(&args.path).context("无法解析 Excel 工作簿")?;
    let sheet_names = workbook.sheet_names().to_vec();
    let sheet_name = if args.dump {
        sheet_names.first().cloned()
    } else {
        sheet_names
            .iter()
            .find_map(|name| {
                let range = workbook.worksheet_range(name).ok()?;
                let has_header = range
                    .rows()
                    .any(|row| {
                        row.iter().any(|cell| cell_text(cell) == "专注时间")
                            || row.first().map(|cell| {
                                let value = cell_text(cell);
                                value.starts_with("20") && value.len() >= 16
                            }).unwrap_or(false)
                    });
                has_header.then(|| name.clone())
            })
    }
        .ok_or_else(|| anyhow!("工作簿没有包含番茄 TODO 表头的工作表"))?;
    let range = workbook
        .worksheet_range(&sheet_name)
        .context("无法读取工作表")?;
    let rows: Vec<Vec<String>> = range.rows().map(|row| row.iter().map(cell_text).collect()).collect();
    if args.dump {
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
        return Ok(());
    }
    if rows.len() < 2 {
        return Err(anyhow!("工作表缺少表头"));
    }

    let time_regex = Regex::new(
        r"^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}).*?(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})$",
    )?;
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
    let user = metadata.iter().find_map(|value| value.strip_prefix("用户:")).map(str::trim).map(str::to_string);
    let export_range = metadata.iter().find_map(|value| value.strip_prefix("导出范围:")).map(str::trim).unwrap_or_default();
    let (range_start, range_end) = export_range.split_once(" 至 ").map(|(a, b)| (Some(a.to_string()), Some(b.to_string()))).unwrap_or((None, None));
    let declared_minutes = metadata.iter().find_map(|value| {
        if value.contains("时长共计") { parse_number(value) } else { None }
    });
    let declared_records = metadata.iter().find_map(|value| {
        if value.contains("共") && value.contains("条记录") { parse_number(value) } else { None }
    });

    let headers = &rows[header_row_index];
    let index = |name: &str| headers.iter().position(|value| value == name);
    let positional_layout = headers.len() >= 6;
    let column = |name: &str, fallback: usize| {
        index(name).or_else(|| positional_layout.then_some(fallback))
    };
    let time_index = column("专注时间", 0).ok_or_else(|| anyhow!("缺少字段: 专注时间"))?;
    let task_index = column("待办名称", 1).ok_or_else(|| anyhow!("缺少字段: 待办名称"))?;
    let duration_index = column("专注时长(分钟)", 2)
        .ok_or_else(|| anyhow!("缺少字段: 专注时长(分钟)"))?;
    let reflection_index = column("心得", 3).ok_or_else(|| anyhow!("缺少字段: 心得"))?;
    let status_index = column("状态", 4).ok_or_else(|| anyhow!("缺少字段: 状态"))?;
    let completion_index = column("完成度", 5).ok_or_else(|| anyhow!("缺少字段: 完成度"))?;
    let mut sessions = Vec::new();

    for row in rows.iter().skip(header_row_index + 1) {
        if row.iter().all(|value| value.is_empty()) { continue; }
        let time_text = row.get(time_index).cloned().unwrap_or_default();
        let captures = time_regex.captures(&time_text).ok_or_else(|| anyhow!("无法解析专注时间: {}", time_text))?;
        let start = captures.get(1).unwrap().as_str().trim().to_string();
        let end = captures.get(2).unwrap().as_str().trim().to_string();
        let task_name = row.get(task_index).cloned().unwrap_or_default();
        let duration = parse_number(row.get(duration_index).map(String::as_str).unwrap_or("0")).unwrap_or(0);
        let completion = parse_number(row.get(completion_index).map(String::as_str).unwrap_or("0")).unwrap_or(0).clamp(0, 100);
        let status = row.get(status_index).cloned().unwrap_or_default();
        let reflection = row.get(reflection_index).cloned().filter(|value| !value.is_empty());
        let stable = format!("tomatodo|{}|{}|{}", start, end, normalized_task(&task_name));
        let source_key = format!("{:x}", Sha256::digest(stable.as_bytes()));
        sessions.push(Session { source_key, start_local: start, end_local: end, task_name, duration_minutes: duration, reflection, status, completion_percent: completion });
    }

    let declared_minutes = declared_minutes.or_else(|| {
        Some(sessions.iter().map(|session| session.duration_minutes.max(0)).sum())
    });
    let declared_records = declared_records.or_else(|| Some(sessions.len() as i64));
    serde_json::to_writer_pretty(std::io::stdout(), &Output { schema_version: 1, source: "tomatodo", file_hash, sheet_name, export_user: user, range_start, range_end, declared_minutes, declared_records, sessions })?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{normalized_task, parse_number};
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
        let regex = Regex::new(
            r"^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}).*?(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})$",
        )
        .expect("valid regex");
        let captures = regex
            .captures("2026-08-07 12:49 ó\u{81} 2026-08-07 13:02")
            .expect("time range should parse");
        assert_eq!(&captures[1], "2026-08-07 12:49");
        assert_eq!(&captures[2], "2026-08-07 13:02");
    }
}
