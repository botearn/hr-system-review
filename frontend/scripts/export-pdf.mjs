#!/usr/bin/env node
/**
 * 把 Markdown 导出为 PDF。默认导出 QUICK_START.md；传参可导出其他文件。
 *
 * 用法：
 *   cd frontend
 *   node scripts/export-pdf.mjs                     # 默认 QUICK_START.md → docs/QUICK_START.pdf
 *   node scripts/export-pdf.mjs USER_GUIDE.md       # 导出 USER_GUIDE.md → docs/USER_GUIDE.pdf
 */
import puppeteer from "puppeteer-core";
import { marked } from "marked";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");

const mdName = process.argv[2] ?? "QUICK_START.md";
const MD_PATH = path.join(ROOT, mdName);
const OUT_NAME = path.basename(mdName, ".md") + ".pdf";
const OUT_PATH = path.join(ROOT, "docs", OUT_NAME);

const CHROME_PATHS = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
];

async function findChrome() {
  for (const p of CHROME_PATHS) {
    try {
      await fs.access(p);
      return p;
    } catch {}
  }
  throw new Error("Google Chrome not found");
}

const CSS = `
  body {
    font-family: -apple-system, "PingFang SC", "Hiragino Sans GB",
                 "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif;
    max-width: 880px;
    margin: 0 auto;
    padding: 0 24px;
    color: #24292f;
    line-height: 1.65;
    font-size: 14px;
  }
  h1 { font-size: 28px; border-bottom: 2px solid #eaecef; padding-bottom: 8px; margin-top: 32px; }
  h2 { font-size: 20px; margin-top: 32px; border-bottom: 1px solid #eaecef; padding-bottom: 6px; }
  h3 { font-size: 16px; margin-top: 24px; }
  h4 { font-size: 14px; margin-top: 20px; }

  code {
    background: #f6f8fa;
    padding: 2px 6px;
    border-radius: 3px;
    font-family: "SF Mono", Menlo, Monaco, Consolas, monospace;
    font-size: 12.5px;
    color: #cf222e;
  }
  pre {
    background: #f6f8fa;
    padding: 14px 16px;
    border-radius: 6px;
    overflow-x: auto;
    font-size: 12.5px;
    line-height: 1.5;
    page-break-inside: avoid;
  }
  pre code { background: transparent; padding: 0; color: #24292f; }

  table { border-collapse: collapse; margin: 16px 0; width: 100%; font-size: 13px; }
  th, td { border: 1px solid #d0d7de; padding: 6px 12px; text-align: left; }
  th { background: #f6f8fa; font-weight: 600; }

  img {
    max-width: 100%;
    max-height: 360px;
    width: auto;
    height: auto;
    display: block;
    margin: 16px auto;
    border: 1px solid #e5e7eb;
    border-radius: 4px;
    break-inside: avoid;
  }

  a { color: #0969da; text-decoration: none; }
  blockquote {
    border-left: 4px solid #d1d5db;
    margin: 16px 0;
    padding: 4px 12px;
    color: #57606a;
  }
  hr { border: none; border-top: 1px solid #eaecef; margin: 24px 0; }
  ul, ol { padding-left: 24px; }
  li { margin: 4px 0; }

  /* 分页控制：只对代码块和表格避免切断，标题和图片允许跨页 */
  pre, table { break-inside: avoid; }
  h1 { break-before: page; }
  h1:first-of-type { break-before: auto; }
`;

const MIME_BY_EXT = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

async function inlineImages(html) {
  const re = /<img([^>]*?)src="([^"]+)"([^>]*)>/g;
  const tasks = [];
  html.replace(re, (_, pre, src, post) => {
    tasks.push({ src, pre, post });
    return _;
  });

  const replacements = new Map();
  for (const { src } of tasks) {
    if (src.startsWith("data:") || src.startsWith("http://") || src.startsWith("https://")) {
      continue;
    }
    const abs = path.isAbsolute(src) ? src : path.join(ROOT, src);
    try {
      const buf = await fs.readFile(abs);
      const ext = path.extname(abs).toLowerCase();
      const mime = MIME_BY_EXT[ext] ?? "application/octet-stream";
      const dataUri = `data:${mime};base64,${buf.toString("base64")}`;
      replacements.set(src, dataUri);
    } catch (e) {
      console.warn(`  ! 图片加载失败: ${src} (${e.message})`);
    }
  }

  return html.replace(re, (m, pre, src, post) => {
    const data = replacements.get(src);
    if (!data) return m;
    return `<img${pre}src="${data}"${post}>`;
  });
}

async function main() {
  const md = await fs.readFile(MD_PATH, "utf-8");
  marked.use({ gfm: true, breaks: false });
  const rawHtml = marked.parse(md);
  const htmlBody = await inlineImages(rawHtml);

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <style>${CSS}</style>
</head>
<body>
${htmlBody}
</body>
</html>`;

  const chromePath = process.env.CHROME_PATH ?? (await findChrome());
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: "new",
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    await page.pdf({
      path: OUT_PATH,
      format: "A4",
      margin: { top: "20mm", bottom: "20mm", left: "18mm", right: "18mm" },
      printBackground: true,
    });
    console.log(`✓ ${mdName}  →  ${path.relative(ROOT, OUT_PATH)}`);
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
