import { createHash } from "node:crypto";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = join(root, "release", "windows");
const appPackage = JSON.parse(
  await readFile(join(root, "apps", "windows", "package.json"), "utf8"),
);
const version = appPackage.version;
const fileName = `Zhixu-Setup-${version}.exe`;
const installerPath = join(outputDirectory, fileName);
const bytes = await readFile(installerPath);
const repository = process.env.GITHUB_REPOSITORY || "galaxywk223/zhixu";
const tag = `v${version}`;
const manifest = {
  schemaVersion: 1,
  version,
  notes:
    "知序 v0.4.0 新增手动格言收藏、设为今日和收藏反馈学习，移除外部语料并修复重复刷新与 AI 失败诊断；账号登录、云同步和历史数据兼容保持启用。",
  releaseUrl: `https://github.com/${repository}/releases/tag/${tag}`,
  assets: {
    windows: {
      fileName,
      downloadUrl: `https://github.com/${repository}/releases/download/${tag}/${fileName}`,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      size: (await stat(installerPath)).size,
    },
  },
};

await writeFile(
  join(outputDirectory, "update-manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8",
);

const generated = (await readdir(outputDirectory)).filter((name) =>
  [fileName, "latest.yml", "update-manifest.json"].includes(name),
);
process.stdout.write(`Generated release metadata: ${generated.join(", ")}\n`);
