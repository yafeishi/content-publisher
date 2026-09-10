import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_MCP_URL = process.env.MCP_URL || 'http://localhost:18060/mcp';
const XHS_MCP_BIN = `${process.env.HOME || ''}/.local/bin/xiaohongshu-mcp`;
const XHS_PROFILE_DIR = process.env.XHS_PROFILE_DIR
  || path.join(process.env.HOME || '', '.xiaohongshu', 'rod-profile-main');
const XHS_DEFAULT_PREFERENCES = {
  profile: {
    default_content_setting_values: {
      geolocation: 2,
    },
  },
};

let startingPromise: Promise<boolean> | null = null;

async function pingMcp(mcpUrl: string): Promise<boolean> {
  try {
    const response = await fetch(mcpUrl, {
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
      signal: AbortSignal.timeout(2500),
    });
    return Boolean(response.headers.get('mcp-session-id'));
  } catch {
    return false;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getPortFlagFromMcpUrl(mcpUrl: string): string | null {
  try {
    const url = new URL(mcpUrl);
    if (url.port) return `:${url.port}`;
  } catch {
    return null;
  }
  return null;
}

async function ensurePersistentProfile(profileDir: string): Promise<void> {
  const defaultDir = path.join(profileDir, 'Default');
  const preferencesPath = path.join(defaultDir, 'Preferences');

  await mkdir(defaultDir, { recursive: true });

  let current: Record<string, any> = {};
  try {
    const raw = await readFile(preferencesPath, 'utf8');
    current = JSON.parse(raw) as Record<string, any>;
  } catch {
    current = {};
  }

  const merged = {
    ...current,
    profile: {
      ...(current.profile || {}),
      default_content_setting_values: {
        ...((current.profile as Record<string, any> | undefined)?.default_content_setting_values || {}),
        ...XHS_DEFAULT_PREFERENCES.profile.default_content_setting_values,
      },
    },
  };

  await writeFile(preferencesPath, JSON.stringify(merged), 'utf8');
}

async function startMcpProcess(mcpUrl: string): Promise<boolean> {
  if (await pingMcp(mcpUrl)) return true;

  if (!startingPromise) {
    startingPromise = (async () => {
      try {
        await ensurePersistentProfile(XHS_PROFILE_DIR);

        const args = ['-rod', `dir=${XHS_PROFILE_DIR}`];
        const portFlag = getPortFlagFromMcpUrl(mcpUrl);
        if (portFlag) {
          args.push('-port', portFlag);
        }

        const child = spawn(XHS_MCP_BIN, args, {
          detached: true,
          stdio: 'ignore',
          env: {
            ...process.env,
            no_proxy: `${process.env.no_proxy ? `${process.env.no_proxy},` : ''}localhost,127.0.0.1`,
          },
        });
        child.unref();
      } catch {
        return false;
      }

      for (let i = 0; i < 8; i += 1) {
        await sleep(1000);
        if (await pingMcp(mcpUrl)) return true;
      }
      return false;
    })().finally(() => {
      startingPromise = null;
    });
  }

  return startingPromise;
}

export async function ensureXiaohongshuMcpAvailable(mcpUrl = DEFAULT_MCP_URL): Promise<{
  ok: boolean;
  started: boolean;
  error?: string;
}> {
  if (await pingMcp(mcpUrl)) {
    return { ok: true, started: false };
  }

  const started = await startMcpProcess(mcpUrl);
  if (started) {
    return { ok: true, started: true };
  }

  return {
    ok: false,
    started: false,
    error: '小红书 MCP 未运行，且自动拉起失败。',
  };
}
