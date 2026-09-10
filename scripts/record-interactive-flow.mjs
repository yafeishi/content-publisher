#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { chromium } from 'playwright';

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

function slugify(input) {
  return String(input || 'flow')
    .trim()
    .replace(/[^\w\u4e00-\u9fa5-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50) || 'flow';
}

function buildLocator(page, step) {
  const by = step.by || 'css';
  const value = step.value || '';
  if (by === 'placeholder') return page.getByPlaceholder(value);
  if (by === 'text') return page.getByText(value, { exact: false });
  if (by === 'role') return page.getByRole(step.role || 'button', { name: value });
  return page.locator(value);
}

async function executeStep(page, step, baseUrl) {
  const action = step.action;
  if (action === 'goto') {
    const target = step.url
      ? step.url
      : new URL(step.path || step.value || '/', baseUrl).toString();
    await page.goto(target, { waitUntil: 'networkidle', timeout: step.timeoutMs || 60000 });
    return `goto ${target}`;
  }
  if (action === 'wait') {
    const ms = Number(step.ms) || 500;
    await wait(ms);
    return `wait ${ms}ms`;
  }
  if (action === 'click') {
    const locator = buildLocator(page, step).first();
    await locator.click({ timeout: step.timeoutMs || 12000 });
    return `click ${step.by || 'css'}:${step.value || ''}`;
  }
  if (action === 'type') {
    const locator = buildLocator(page, step).first();
    await locator.click({ timeout: step.timeoutMs || 12000 });
    if (step.clear !== false) {
      await locator.fill('');
    }
    const text = String(step.text || '');
    const delayMs = Number(step.delayMs) || 0;
    if (delayMs > 0) {
      await locator.type(text, { delay: delayMs });
    } else {
      await locator.fill(text);
    }
    return `type ${text.length} chars`;
  }
  if (action === 'press') {
    const key = step.key || 'Enter';
    if (step.by && step.value) {
      const locator = buildLocator(page, step).first();
      await locator.click({ timeout: step.timeoutMs || 12000 });
      await locator.press(key);
    } else {
      await page.keyboard.press(key);
    }
    return `press ${key}`;
  }
  if (action === 'assertVisible') {
    const locator = buildLocator(page, step).first();
    await locator.waitFor({ state: 'visible', timeout: step.timeoutMs || 12000 });
    return `assertVisible ${step.by || 'css'}:${step.value || ''}`;
  }
  if (action === 'scroll') {
    const ms = Number(step.ms) || 450;
    const amount = Number(step.y) || 700;
    const position = step.position || '';
    if (position === 'bottom') {
      await page.evaluate(() => {
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'auto' });
      });
      await wait(ms);
      return 'scroll to bottom';
    }
    if (position === 'top') {
      await page.evaluate(() => {
        window.scrollTo({ top: 0, behavior: 'auto' });
      });
      await wait(ms);
      return 'scroll to top';
    }
    await page.mouse.wheel(0, amount);
    await wait(ms);
    return `scroll ${amount}`;
  }
  throw new Error(`unsupported action: ${String(action)}`);
}

async function run() {
  const mode = process.env.MODE === 'dry-run' ? 'dry-run' : 'record';
  const flowRaw = process.env.FLOW_JSON || '{}';
  const parsed = JSON.parse(flowRaw);
  const baseUrl = parsed.baseUrl || 'http://127.0.0.1:13847';
  const flowName = parsed.flowName || '交互录制流程';
  const steps = Array.isArray(parsed.steps) ? parsed.steps : [];

  if (steps.length === 0) {
    throw new Error('no steps provided');
  }

  fs.mkdirSync(RAW_DIR, { recursive: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const logs = [];
  let browser = null;
  let context = null;
  let page = null;
  let pageVideo = null;

  try {
    browser = await chromium.launch({ headless: true });
    if (mode === 'record') {
      context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
        recordVideo: {
          dir: RAW_DIR,
          size: { width: 1280, height: 720 },
        },
      });
    } else {
      context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
      });
    }

    page = await context.newPage();
    pageVideo = mode === 'record' ? page.video() : null;

    for (let i = 0; i < steps.length; i += 1) {
      const step = steps[i];
      const started = Date.now();
      try {
        const detail = await executeStep(page, step, baseUrl);
        logs.push({
          index: i + 1,
          action: step.action,
          status: 'ok',
          detail,
          durationMs: Date.now() - started,
        });
      } catch (error) {
        if (step.optional) {
          logs.push({
            index: i + 1,
            action: step.action,
            status: 'skipped',
            detail: `optional step skipped: ${String(error)}`,
            durationMs: Date.now() - started,
          });
          continue;
        }
        logs.push({
          index: i + 1,
          action: step.action,
          status: 'failed',
          detail: String(error),
          durationMs: Date.now() - started,
        });
        throw error;
      }
    }

    await wait(600);
  } finally {
    if (page) await page.close().catch(() => {});
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }

  let rawVideo = undefined;
  let mp4Video = undefined;

  if (mode === 'record') {
    const recordedPath = pageVideo ? await pageVideo.path() : null;
    if (!recordedPath || !fs.existsSync(recordedPath)) {
      throw new Error('recorded video not found');
    }

    const stamp = nowStamp();
    const slug = slugify(flowName);
    rawVideo = path.join(RAW_DIR, `${slug}-${stamp}.webm`);
    mp4Video = path.join(OUT_DIR, `${slug}-${stamp}.mp4`);
    fs.copyFileSync(recordedPath, rawVideo);

    const ffmpeg = spawnSync(
      'ffmpeg',
      [
        '-y',
        '-i',
        rawVideo,
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-movflags',
        '+faststart',
        mp4Video,
      ],
      { encoding: 'utf-8' }
    );
    if (ffmpeg.status !== 0) {
      throw new Error(`ffmpeg convert failed: ${ffmpeg.stderr || ffmpeg.stdout || 'unknown error'}`);
    }
  }

  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        mode,
        baseUrl,
        flowName,
        logs,
        rawVideo,
        mp4Video,
      },
      null,
      2
    )
  );
}

run().catch((error) => {
  process.stdout.write(
    JSON.stringify(
      {
        ok: false,
        error: String(error),
      },
      null,
      2
    )
  );
  process.exit(1);
});
