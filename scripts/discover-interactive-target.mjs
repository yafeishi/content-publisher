#!/usr/bin/env node
import { chromium } from 'playwright';

function normalizePath(href, origin) {
  try {
    const url = new URL(href, origin);
    if (url.origin !== origin) return null;
    return `${url.pathname}${url.search || ''}${url.hash || ''}`;
  } catch {
    return null;
  }
}

async function collectPageSnapshot(page) {
  return page.evaluate(() => {
    const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();

    const heading = clean(
      document.querySelector('h1')?.textContent ||
      document.querySelector('[role="heading"]')?.textContent ||
      ''
    );

    const buttonCandidates = Array.from(
      document.querySelectorAll(
        'button,[role="button"],[role="tab"],[role="menuitem"],input[type="button"],input[type="submit"]'
      )
    )
      .map((el) => {
        const text = clean(
          (el instanceof HTMLInputElement ? el.value : el.textContent) ||
          el.getAttribute('aria-label') ||
          ''
        );
        return { name: text };
      })
      .filter((item) => item.name.length > 0)
      .slice(0, 60);

    const inputCandidates = Array.from(document.querySelectorAll('input,textarea,select'))
      .map((el) => {
        const placeholder = clean(el.getAttribute('placeholder') || '');
        const label = clean(
          el.getAttribute('aria-label') ||
          el.getAttribute('name') ||
          el.getAttribute('id') ||
          ''
        );
        const type = el instanceof HTMLInputElement ? (el.type || 'text') : el.tagName.toLowerCase();
        return { placeholder, label, type };
      })
      .slice(0, 20);

    const links = Array.from(document.querySelectorAll('a[href]'))
      .map((a) => ({
        href: a.getAttribute('href') || '',
        text: clean(a.textContent || a.getAttribute('aria-label') || ''),
      }))
      .filter((item) => item.href)
      .slice(0, 160);

    const bodySample = clean(document.body?.innerText || '').slice(0, 900);

    return {
      title: document.title || '',
      heading,
      buttonCandidates,
      inputCandidates,
      links,
      bodySample,
    };
  });
}

function isSafeNavName(name) {
  if (!name) return false;
  // Avoid destructive/action buttons while probing possible navigation entries.
  const blocked = /删除|移除|清空|重置|发布|保存|提交|确认|上传|下载|导出|退出|登出|注销|停止|运行|执行|录制|付款|支付/i;
  return !blocked.test(name);
}

function isLikelyNavName(name) {
  const value = String(name || '').trim();
  if (!value) return false;
  if (!isSafeNavName(value)) return false;
  if (/^[\d\s<>«»◀▶←→+\-×]+$/.test(value)) return false;
  if (value.length < 2 || value.length > 18) return false;
  const hasText = /[A-Za-z\u4e00-\u9fa5]/.test(value);
  if (!hasText) return false;
  const blocked = /加载|添加|清空|清除|导出|生成|刷新|分享|发送|保存|测试|关闭|编辑|删除|分析|配置|预览|执行|重置|搜索|前一天|后一天|今天|复制|发布|邮件|路径/i;
  return !blocked.test(value);
}

function normalizeBodyForDiff(value) {
  return String(value || '')
    .replace(/\d{4}-\d{2}-\d{2}\s*\d{2}:\d{2}:\d{2}/g, '')
    .replace(/\d+/g, '#')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 700);
}

async function collectPathsFromClickableNav(params) {
  const { page, origin, baseUrl, buttonNames, maxModules, homeSnapshot } = params;
  const paths = [];
  const virtualModules = [];
  const seen = new Set();
  const seenVirtual = new Set();

  const addPath = (value) => {
    if (!value || seen.has(value)) return;
    seen.add(value);
    paths.push(value);
  };

  const addVirtualModule = (module) => {
    if (!module?.path || seenVirtual.has(module.path)) return;
    seenVirtual.add(module.path);
    virtualModules.push(module);
  };

  const uniqueNames = Array.from(new Set(buttonNames))
    .map((name) => String(name || '').trim())
    .filter((name) => isLikelyNavName(name))
    .slice(0, 12);

  for (const name of uniqueNames) {
    if (paths.length >= Math.max(0, maxModules - 1)) break;

    try {
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      const beforePath = normalizePath(page.url(), origin) || '/';

      const tab = page.getByRole('tab', { name }).first();
      const button = page.getByRole('button', { name }).first();
      const menuItem = page.getByRole('menuitem', { name }).first();

      let clicked = false;
      for (const locator of [tab, button, menuItem]) {
        try {
          await locator.click({ timeout: 2000 });
          clicked = true;
          break;
        } catch {
          // try next candidate locator
        }
      }
      if (!clicked) continue;

      await page.waitForTimeout(650);
      const afterPath = normalizePath(page.url(), origin);
      if (afterPath && afterPath !== beforePath) {
        addPath(afterPath);
      } else {
        const snapshot = await collectPageSnapshot(page);
        const virtualPath = `${beforePath}#view=${encodeURIComponent(name)}`;
        addVirtualModule({
          path: virtualPath,
          url: page.url(),
          title: snapshot.title || name,
          heading: snapshot.heading || name,
          buttonCandidates: snapshot.buttonCandidates,
          inputCandidates: snapshot.inputCandidates,
          hasSearchInput: snapshot.inputCandidates.some((item) =>
            /search|搜索|查找|filter|筛选/i.test(`${item.placeholder} ${item.label}`)
          ),
          bodySample: snapshot.bodySample || '',
          entryButtonName: name,
          basePath: beforePath,
        });
      }
      const probeSnapshot = await collectPageSnapshot(page);
      for (const link of probeSnapshot.links || []) {
        const linkPath = normalizePath(link.href, origin);
        if (!linkPath) continue;
        addPath(linkPath);
        if (paths.length >= Math.max(0, maxModules - 1)) break;
      }
    } catch {
      // Continue probing next candidate
    }
  }

  // Keep only virtual modules whose content differs from home sample (avoid noisy duplicates).
  const cleanedVirtualModules = virtualModules.filter((module) => {
    const sample = normalizeBodyForDiff(module.bodySample);
    const homeSample = normalizeBodyForDiff(homeSnapshot.bodySample);
    return sample.length > 0 && sample !== homeSample;
  });

  return {
    paths,
    virtualModules: cleanedVirtualModules,
  };
}

async function run() {
  const payload = JSON.parse(process.env.DISCOVER_JSON || '{}');
  const baseUrl = payload.baseUrl || 'http://127.0.0.1:13847';
  const maxModules = Math.max(4, Math.min(Number(payload.maxModules) || 12, 24));

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();

  try {
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const current = new URL(page.url());
    const origin = current.origin;
    const home = await collectPageSnapshot(page);

    const seen = new Set();
    const modulePaths = [];

    const addPath = (value) => {
      if (!value) return;
      if (seen.has(value)) return;
      seen.add(value);
      modulePaths.push(value);
    };

    addPath(`${current.pathname}${current.search || ''}${current.hash || ''}` || '/');
    for (const link of home.links) {
      const path = normalizePath(link.href, origin);
      if (!path) continue;
      addPath(path);
      if (modulePaths.length >= maxModules) break;
    }

    // Some systems are full SPA without anchor links. Probe nav buttons/tabs by URL change.
    let virtualModules = [];
    if (modulePaths.length <= 1 && home.buttonCandidates.length > 0) {
      const discoveredByNav = await collectPathsFromClickableNav({
        page,
        origin,
        baseUrl,
        buttonNames: home.buttonCandidates.map((item) => item.name),
        maxModules,
        homeSnapshot: home,
      });
      for (const path of discoveredByNav.paths) {
        addPath(path);
        if (modulePaths.length >= maxModules) break;
      }
      virtualModules = discoveredByNav.virtualModules || [];
    }

    const modules = [];
    for (const pathValue of modulePaths) {
      try {
        await page.goto(new URL(pathValue, origin).toString(), {
          waitUntil: 'domcontentloaded',
          timeout: 30000,
        });
        const snapshot = await collectPageSnapshot(page);
        modules.push({
          path: pathValue,
          url: page.url(),
          title: snapshot.title,
          heading: snapshot.heading,
          buttonCandidates: snapshot.buttonCandidates,
          inputCandidates: snapshot.inputCandidates,
          hasSearchInput: snapshot.inputCandidates.some((item) =>
            /search|搜索|查找|filter|筛选/i.test(`${item.placeholder} ${item.label}`)
          ),
        });
      } catch {
        modules.push({
          path: pathValue,
          url: new URL(pathValue, origin).toString(),
          title: '',
          heading: '',
          buttonCandidates: [],
          inputCandidates: [],
          hasSearchInput: false,
        });
      }
      if (modules.length >= maxModules) break;
    }

    if (virtualModules.length > 0) {
      const existing = new Set(modules.map((item) => item.path));
      for (const virtualModule of virtualModules) {
        if (existing.has(virtualModule.path)) continue;
        modules.push(virtualModule);
        existing.add(virtualModule.path);
        if (modules.length >= maxModules) break;
      }
    }

    process.stdout.write(
      JSON.stringify(
        {
          ok: true,
          baseUrl,
          origin,
          modules,
        },
        null,
        2
      )
    );
  } finally {
    await page.close().catch(() => {});
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
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
