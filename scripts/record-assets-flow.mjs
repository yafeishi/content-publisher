#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:13847';
const WORKSPACE_ROOT = process.cwd();
const OUTPUT_ROOT = process.env.RECORDINGS_DIR
  ? path.resolve(WORKSPACE_ROOT, process.env.RECORDINGS_DIR)
  : '/tmp/content-publisher-recordings';
const RAW_DIR = path.join(OUTPUT_ROOT, 'raw');
const OUT_DIR = path.join(OUTPUT_ROOT, 'mp4');

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nowStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

async function run() {
  fs.mkdirSync(RAW_DIR, { recursive: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const stamp = nowStamp();
  const rawName = `assets-flow-${stamp}.webm`;
  const rawPath = path.join(RAW_DIR, rawName);
  const mp4Path = path.join(OUT_DIR, `assets-flow-${stamp}.mp4`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: {
      dir: RAW_DIR,
      size: { width: 1280, height: 720 },
    },
  });
  const page = await context.newPage();

  try {
    await page.goto(`${BASE_URL}/assets`, { waitUntil: 'networkidle', timeout: 60000 });
    await wait(1000);

    const search = page.getByPlaceholder('搜索文件名、备注、标签、项目、引用内容...');
    await search.click();
    await search.type('test', { delay: 120 });
    await wait(600);
    await search.press('Backspace');
    await search.press('Backspace');
    await wait(400);
    await search.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
    await search.type('png', { delay: 120 });
    await wait(700);

    const clearBtn = page.locator('button[title="清空搜索"]');
    if (await clearBtn.count()) {
      await clearBtn.first().click();
      await wait(600);
    }

    const unusedBtn = page.getByRole('button', { name: '未引用' });
    if (await unusedBtn.count()) {
      await unusedBtn.first().click();
      await wait(800);
    }
    const allBtn = page.getByRole('button', { name: '全部' });
    if (await allBtn.count()) {
      await allBtn.first().click();
      await wait(700);
    }

    const selectAll = page.getByRole('button', { name: '全选当前结果' });
    if (await selectAll.count()) {
      await selectAll.first().click();
      await wait(800);
    }
    const clearSelection = page.getByRole('button', { name: '清空选择' });
    if (await clearSelection.count()) {
      await clearSelection.first().click();
      await wait(700);
    }

    const previewButtons = page.locator('button[title="预览"]');
    if (await previewButtons.count()) {
      await previewButtons.first().click();
      await wait(1300);
      await page.keyboard.press('Escape');
      await wait(700);
    }

    await wait(1200);
  } finally {
    await page.close();
    await context.close();
    await browser.close();
  }

  const files = fs.readdirSync(RAW_DIR)
    .filter((name) => name.endsWith('.webm'))
    .map((name) => path.join(RAW_DIR, name))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);

  if (!files.length) {
    throw new Error('No raw video found after recording.');
  }

  const latestRaw = files[0];
  fs.copyFileSync(latestRaw, rawPath);

  const ffmpeg = spawnSync(
    'ffmpeg',
    [
      '-y',
      '-i',
      rawPath,
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      mp4Path,
    ],
    { encoding: 'utf-8' }
  );

  if (ffmpeg.status !== 0) {
    throw new Error(`ffmpeg convert failed: ${ffmpeg.stderr || ffmpeg.stdout || 'unknown error'}`);
  }

  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        baseUrl: BASE_URL,
        rawVideo: rawPath,
        mp4Video: mp4Path,
      },
      null,
      2
    ) + '\n'
  );
}

run().catch((error) => {
  process.stderr.write(`record failed: ${String(error)}\n`);
  process.exit(1);
});
