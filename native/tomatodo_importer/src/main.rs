use std::path::PathBuf;

use anyhow::Result;
use clap::Parser;
use zhixu_tomatodo_importer::parse_workbook;

#[derive(Parser)]
struct Args {
    path: PathBuf,
    #[arg(long)]
    dump: bool,
}

fn main() -> Result<()> {
    let args = Args::parse();
    if let Some(output) = parse_workbook(&args.path, args.dump)? {
        serde_json::to_writer_pretty(std::io::stdout(), &output)?;
    }
    Ok(())
}
