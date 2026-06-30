#!/usr/bin/env node
/**
 * 自动截图脚本：用 puppeteer-core 驱动系统 Chrome，登录并截图各核心页面。
 *
 * 运行前提：
 *   - 后端和前端都在运行（http://localhost:8000、http://localhost:5173）
 *   - 系统已安装 Google Chrome
 *   - 前端 node_modules 已装好 puppeteer-core（npm install --save-dev puppeteer-core）
 *
 * 用法：
 *   cd frontend
 *   node ../scripts/take-screenshots.mjs
 *
 * 截图输出：docs/screenshots/
 */
import puppeteer from "puppeteer-core";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");
const OUT_DIR = path.join(ROOT, "docs", "screenshots");

const CHROME_PATHS = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
];

const BASE = "http://localhost:5173";

async function findChrome() {
  for (const p of CHROME_PATHS) {
    try {
      await fs.access(p);
      return p;
    } catch {}
  }
  throw new Error("Chrome not found. Install Google Chrome or set CHROME_PATH env.");
}

async function shoot(page, filename) {
  const p = path.join(OUT_DIR, filename);
  await page.screenshot({ path: p, fullPage: false });
  console.log(`  ✓ ${filename}`);
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const chromePath = process.env.CHROME_PATH ?? (await findChrome());

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: "new",
    defaultViewport: { width: 1440, height: 900 },
    args: ["--no-sandbox"],
  });

  try {
    const page = await browser.newPage();

    // 1. 登录页
    console.log("[1/6] login page");
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
    await page.waitForSelector("input[type='password']", { timeout: 5000 });
    await sleep(600);
    await shoot(page, "01-login.png");

    // 填写登录：找到第一个可见的 text input + password input
    const usernameInput = await page.$("input:not([type='password'])");
    if (usernameInput) {
      await usernameInput.click({ clickCount: 3 });
      await usernameInput.type("admin", { delay: 20 });
    }
    const passwordInput = await page.$("input[type='password']");
    if (passwordInput) {
      await passwordInput.click();
      await passwordInput.type("admin123", { delay: 20 });
    }
    await page.click("button[type='submit']");
    await page.waitForNavigation({ waitUntil: "networkidle0" }).catch(() => {});
    await sleep(2000);

    // 2. 候选人列表
    console.log("[2/6] candidates page");
    await page.goto(`${BASE}/candidates`, { waitUntil: "networkidle0" });
    await sleep(1500);
    await shoot(page, "02-candidates-list.png");

    // 3. 打开简历导入 Drawer
    console.log("[3/6] resume import drawer");
    const buttons = await page.$$("button");
    for (const b of buttons) {
      const t = await (await b.getProperty("textContent")).jsonValue();
      if (t && t.includes("上传简历")) {
        await b.click();
        break;
      }
    }
    await sleep(1200);
    await shoot(page, "03-resume-import.png");
    // 关闭 drawer
    await page.keyboard.press("Escape");
    await sleep(500);

    // 4. 企业页
    console.log("[4/7] companies page");
    await page.goto(`${BASE}/companies`, { waitUntil: "networkidle0" });
    await sleep(1200);
    await shoot(page, "04-companies.png");

    // 4b. 企业"从 URL 导入"弹窗
    console.log("[5/7] company URL import modal");
    const cbtns = await page.$$("button");
    for (const b of cbtns) {
      const t = await (await b.getProperty("textContent")).jsonValue();
      if (t && t.includes("从 URL 导入")) {
        await b.click();
        break;
      }
    }
    await sleep(800);
    // 往 URL 输入框填示例值，让截图更直观
    const urlInputs = await page.$$(".ant-modal input[type='text']");
    if (urlInputs.length > 0) {
      await urlInputs[0].type("https://www.bytedance.com/zh/", { delay: 10 });
      await sleep(400);
    }
    await shoot(page, "04b-company-url-modal.png");
    // 关闭弹窗
    await page.keyboard.press("Escape");
    await sleep(400);

    // 5. 岗位页
    console.log("[6/7] positions page");
    await page.goto(`${BASE}/positions`, { waitUntil: "networkidle0" });
    await sleep(1200);
    await shoot(page, "05-positions.png");

    // 6. 智能匹配（先点击"开始匹配"，再等结果渲染出来）
    console.log("[7/7] matches page");
    await page.goto(`${BASE}/matches`, { waitUntil: "networkidle0" });
    await sleep(1500);
    const mbuttons = await page.$$("button");
    for (const b of mbuttons) {
      const t = await (await b.getProperty("textContent")).jsonValue();
      if (t && t.includes("开始匹配")) {
        await b.click();
        break;
      }
    }
    // 等待"匹配结果 (N)" 里 N > 0（最多 60 秒）
    try {
      await page.waitForFunction(
        () => {
          const h = Array.from(document.querySelectorAll(".ant-card-head-title")).find(
            (el) => el.textContent && el.textContent.includes("匹配结果"),
          );
          if (!h) return false;
          const m = h.textContent.match(/\((\d+)\)/);
          return m && Number(m[1]) > 0;
        },
        { timeout: 60000 },
      );
    } catch {
      console.log("  ! 匹配结果未在 60 秒内返回，按当前状态截图");
    }
    await sleep(800);
    await shoot(page, "06-matches.png");

    console.log(`\nAll screenshots saved to ${OUT_DIR}`);
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
