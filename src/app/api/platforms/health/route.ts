import fs from 'node:fs';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { getAppSettings } from '@/lib/settings';
import { ensureXiaohongshuMcpAvailable } from '@/lib/xiaohongshu-mcp';

type HealthStatus = 'success' | 'warning' | 'failed';

type PlatformHealthResult = {
  ok: boolean;
  status: HealthStatus;
  message: string;
};

const MOWEN_API_KEY = process.env.MOWEN_API_KEY || '';
const MOWEN_ENDPOINT_BASE = 'https://open.mowen.cn/api/open/mcp/v1/note';

function loadEnvFile(envPath: string): Record<string, string> {
  const env: Record<string, string> = {};
  if (!fs.existsSync(envPath)) return env;
  const content = fs.readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith('\'') && value.endsWith('\''))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function getWechatCredentials() {
  const cwdEnv = loadEnvFile(path.join(process.cwd(), '.baoyu-skills', '.env'));
  const homeEnv = loadEnvFile(path.join(process.env.HOME || '', '.baoyu-skills', '.env'));
  const appId = process.env.WECHAT_APP_ID || cwdEnv.WECHAT_APP_ID || homeEnv.WECHAT_APP_ID;
  const appSecret = process.env.WECHAT_APP_SECRET || cwdEnv.WECHAT_APP_SECRET || homeEnv.WECHAT_APP_SECRET;
  if (!appId || !appSecret) return null;
  return { appId, appSecret };
}

async function checkXiaohongshu(): Promise<PlatformHealthResult> {
  const mcpUrl = process.env.MCP_URL || 'http://localhost:18060/mcp';
  try {
    const availability = await ensureXiaohongshuMcpAvailable(mcpUrl);
    if (!availability.ok) {
      return {
        ok: false,
        status: 'failed',
        message: availability.error || '小红书 MCP 不可用。',
      };
    }

    const initResp = await fetch(mcpUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'content-publisher', version: '1.0' },
        },
      }),
    });

    const sessionId = initResp.headers.get('mcp-session-id');
    if (!sessionId) {
      return { ok: false, status: 'failed', message: 'MCP 服务未返回会话，无法检测小红书状态。' };
    }

    await fetch(mcpUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Mcp-Session-Id': sessionId,
      },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
    });

    const toolResp = await fetch(mcpUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Mcp-Session-Id': sessionId,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'check_login_status', arguments: {} },
      }),
    });

    const toolData = await toolResp.json().catch(() => ({})) as {
      error?: { message?: string };
      result?: { content?: Array<{ type?: string; text?: string }> };
    };
    if (toolData.error) {
      return {
        ok: false,
        status: 'failed',
        message: toolData.error.message || 'MCP 工具调用失败',
      };
    }

    const text = (toolData.result?.content || [])
      .filter((item) => item.type === 'text')
      .map((item) => item.text || '')
      .join('\n');

    if (text.includes('未登录') || text.includes('❌')) {
      return { ok: false, status: 'failed', message: '未登录，请先扫码登录小红书。' };
    }
    if (text.includes('已登录') || text.includes('✅')) {
      return {
        ok: true,
        status: 'success',
        message: availability.started ? '已自动拉起 MCP，且当前已登录。' : '已登录，可执行发布。',
      };
    }
    return {
      ok: true,
      status: 'warning',
      message: text || (availability.started ? 'MCP 已自动拉起，但未拿到明确登录状态。' : 'MCP 可用，但未拿到明确登录状态。'),
    };
  } catch (error) {
    return {
      ok: false,
      status: 'failed',
      message: `无法连接小红书 MCP：${String(error)}`,
    };
  }
}

async function checkWechat(): Promise<PlatformHealthResult> {
  const creds = getWechatCredentials();
  if (!creds) {
    return { ok: false, status: 'failed', message: '未配置微信公众号 API 凭据。' };
  }
  try {
    const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(creds.appId)}&secret=${encodeURIComponent(creds.appSecret)}`;
    const resp = await fetch(url, { cache: 'no-store' });
    const data = await resp.json().catch(() => ({})) as {
      access_token?: string;
      errcode?: number;
      errmsg?: string;
    };

    if (resp.ok && data.access_token) {
      return { ok: true, status: 'success', message: 'API 鉴权通过，可执行发布。' };
    }

    const errorText = data.errmsg || `HTTP ${resp.status}`;
    const invalidIpMatch = errorText.match(/invalid ip\s+([^\s,]+)/i);
    if (invalidIpMatch) {
      return {
        ok: false,
        status: 'failed',
        message: `出口 IP ${invalidIpMatch[1]} 未加入白名单。`,
      };
    }
    return {
      ok: false,
      status: 'failed',
      message: errorText,
    };
  } catch (error) {
    return {
      ok: false,
      status: 'failed',
      message: `微信 API 检测失败：${String(error)}`,
    };
  }
}

async function checkMowen(): Promise<PlatformHealthResult> {
  if (!MOWEN_API_KEY) {
    return { ok: false, status: 'failed', message: '未配置 MOWEN_API_KEY。' };
  }
  const endpoint = `${MOWEN_ENDPOINT_BASE}?key=${encodeURIComponent(MOWEN_API_KEY)}`;
  try {
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: '__healthcheck__', arguments: {} },
      }),
    });
    if (resp.ok) {
      return { ok: true, status: 'warning', message: '接口可达；未执行真实写入探针。' };
    }
    return {
      ok: false,
      status: resp.status === 405 ? 'warning' : 'failed',
      message: resp.status === 405 ? '接口可达；当前端点拒绝该探针请求。' : `接口返回 HTTP ${resp.status}`,
    };
  } catch (error) {
    return {
      ok: false,
      status: 'failed',
      message: `无法连接墨问接口：${String(error)}`,
    };
  }
}

async function checkObsidian(): Promise<PlatformHealthResult> {
  const settings = await getAppSettings();
  if (!settings.obsidianVaultPath) {
    return { ok: false, status: 'failed', message: '未配置 Obsidian Vault 路径。' };
  }

  try {
    const vaultPath = path.resolve(settings.obsidianVaultPath);
    if (!fs.existsSync(vaultPath) || !fs.statSync(vaultPath).isDirectory()) {
      return { ok: false, status: 'failed', message: 'Vault 路径不存在或不可用。' };
    }
    fs.accessSync(vaultPath, fs.constants.R_OK | fs.constants.W_OK);

    const noteDir = path.resolve(vaultPath, settings.obsidianFolder || 'Inbox');
    fs.mkdirSync(noteDir, { recursive: true });
    fs.accessSync(noteDir, fs.constants.R_OK | fs.constants.W_OK);

    const assetDir = path.resolve(vaultPath, settings.obsidianAssetFolder || 'assets/content-publisher');
    fs.mkdirSync(assetDir, { recursive: true });
    fs.accessSync(assetDir, fs.constants.R_OK | fs.constants.W_OK);

    return { ok: true, status: 'success', message: 'Vault 可写，本地发布可用。' };
  } catch (error) {
    return {
      ok: false,
      status: 'failed',
      message: `Vault 检测失败：${String(error)}`,
    };
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({})) as { platforms?: string[] };
    const requested = Array.isArray(body.platforms) && body.platforms.length > 0
      ? body.platforms
      : ['xiaohongshu', 'wechat', 'mowen', 'obsidian'];

    const results: Record<string, PlatformHealthResult> = {};

    for (const platform of requested) {
      if (platform === 'xiaohongshu') {
        results[platform] = await checkXiaohongshu();
      } else if (platform === 'wechat') {
        results[platform] = await checkWechat();
      } else if (platform === 'mowen') {
        results[platform] = await checkMowen();
      } else if (platform === 'obsidian') {
        results[platform] = await checkObsidian();
      }
    }

    return NextResponse.json({
      ok: true,
      checkedAt: new Date().toISOString(),
      results,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : '平台检测失败',
      },
      { status: 500 }
    );
  }
}
