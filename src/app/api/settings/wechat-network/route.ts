import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { NextResponse } from 'next/server';

const execFileAsync = promisify(execFile);

type IpLookupResult = {
  ip: string;
  source: string;
};

type WechatApiProbeResult = {
  ok: boolean;
  currentIp?: string;
  error?: string;
  rawError?: string;
  checkedAt: string;
};

function loadEnvFile(envPath: string): Record<string, string> {
  const env: Record<string, string> = {};
  if (!fs.existsSync(envPath)) return env;
  const content = fs.readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
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
  if (!appId || !appSecret) {
    throw new Error('未检测到 WECHAT_APP_ID / WECHAT_APP_SECRET，请先配置微信公众号 API 凭据。');
  }
  return { appId, appSecret };
}

async function probeWechatAccessToken(): Promise<WechatApiProbeResult> {
  const checkedAt = new Date().toISOString();
  const { appId, appSecret } = getWechatCredentials();
  const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(appId)}&secret=${encodeURIComponent(appSecret)}`;
  const response = await fetch(url, { cache: 'no-store' });
  const text = await response.text();

  try {
    const data = JSON.parse(text) as {
      access_token?: string;
      errcode?: number;
      errmsg?: string;
    };
    if (response.ok && data.access_token) {
      return {
        ok: true,
        checkedAt,
      };
    }

    const rawError = data.errmsg || `HTTP ${response.status}`;
    const invalidIpMatch = rawError.match(/invalid ip\s+([^\s,]+)/i);
    if (invalidIpMatch) {
      return {
        ok: false,
        currentIp: invalidIpMatch[1],
        error: `当前出口 IP ${invalidIpMatch[1]} 未加入微信公众平台 IP 白名单。`,
        rawError,
        checkedAt,
      };
    }

    return {
      ok: false,
      error: rawError,
      rawError,
      checkedAt,
    };
  } catch {
    return {
      ok: false,
      error: text || `HTTP ${response.status}`,
      rawError: text || `HTTP ${response.status}`,
      checkedAt,
    };
  }
}

async function fetchPublicIp(): Promise<IpLookupResult> {
  try {
    const probeScript = [
      'const providers = [',
      '"https://api.ipify.org?format=json",',
      '"https://api64.ipify.org?format=json",',
      '"https://ifconfig.me/ip"',
      '];',
      'for (const url of providers) {',
      '  try {',
      '    const resp = await fetch(url, { headers: { "User-Agent": "content-publisher/1.0" } });',
      '    if (!resp.ok) continue;',
      '    const text = (await resp.text()).trim();',
      '    let ip = text;',
      '    if (text.startsWith("{")) {',
      '      ip = JSON.parse(text).ip || "";',
      '    }',
      '    ip = String(ip).trim();',
      '    if (/^[0-9a-fA-F:.]+$/.test(ip)) {',
      '      console.log(JSON.stringify({ ip, source: url }));',
      '      process.exit(0);',
      '    }',
      '  } catch {}',
      '}',
      'process.exit(1);',
    ].join('');
    const { stdout } = await execFileAsync('npx', ['-y', 'bun', '-e', probeScript], {
      timeout: 15000,
      maxBuffer: 1024 * 64,
    });
    const parsed = JSON.parse(stdout.trim()) as { ip?: string; source?: string };
    if (parsed.ip) {
      return {
        ip: parsed.ip,
        source: `bun:${parsed.source || 'unknown'}`,
      };
    }
  } catch {
    // Fall back to direct fetch below.
  }

  const providers: Array<{
    source: string;
    url: string;
    parse: (text: string) => string;
  }> = [
    {
      source: 'api.ipify.org',
      url: 'https://api.ipify.org?format=json',
      parse: (text) => {
        const data = JSON.parse(text) as { ip?: string };
        return String(data.ip || '').trim();
      },
    },
    {
      source: 'api64.ipify.org',
      url: 'https://api64.ipify.org?format=json',
      parse: (text) => {
        const data = JSON.parse(text) as { ip?: string };
        return String(data.ip || '').trim();
      },
    },
    {
      source: 'ifconfig.me',
      url: 'https://ifconfig.me/ip',
      parse: (text) => text.trim(),
    },
  ];

  const ipPattern = /^[0-9a-fA-F:.]+$/;

  for (const provider of providers) {
    try {
      const response = await fetch(provider.url, {
        cache: 'no-store',
        headers: {
          'User-Agent': 'content-publisher/1.0',
          Accept: 'application/json,text/plain;q=0.9,*/*;q=0.8',
        },
      });
      if (!response.ok) continue;
      const text = await response.text();
      const ip = provider.parse(text);
      if (ip && ipPattern.test(ip)) {
        return { ip, source: provider.source };
      }
    } catch {
      // Try next provider.
    }
  }

  throw new Error('无法获取当前公网出口 IP');
}

export async function GET() {
  try {
    const result = await fetchPublicIp();
    return NextResponse.json({
      ok: true,
      ...result,
      hint: '如微信公众号返回 invalid ip / 40164，请将该 IP 加入微信公众平台开发接口白名单。',
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : '检测失败',
      },
      { status: 500 }
    );
  }
}

export async function POST() {
  try {
    const result = await probeWechatAccessToken();
    if (result.ok) {
      return NextResponse.json({
        ...result,
        message: '微信 API 鉴权成功，当前环境可以正常调用公众号接口。',
      });
    }
    return NextResponse.json(
      {
        ...result,
        message: result.error || '微信 API 鉴权失败',
      },
      { status: 400 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : '微信 API 鉴权失败',
        checkedAt: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
