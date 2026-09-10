import { exec, spawn } from 'child_process';
import { writeFile, unlink } from 'fs/promises';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { promisify } from 'util';
import { getAppSettings } from '@/lib/settings';

const execAsync = promisify(exec);

type AiProvider = 'claude-cli' | 'openai-compatible' | 'codex-api' | 'local-client';
type LocalClientPreset = 'codex' | 'claude' | 'gemini' | 'qwen' | 'custom';
export type AiRuntimeSettings = {
  aiProvider: AiProvider;
  aiModel: string;
  claudePath: string;
  localClientPreset: LocalClientPreset;
  localClientCommand: string;
};

const LOCAL_CLIENT_PRESET_COMMAND: Record<Exclude<LocalClientPreset, 'custom'>, string> = {
  codex: 'codex',
  claude: 'claude -p',
  gemini: 'gemini',
  qwen: 'qwen',
};

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
}

function parseResponsesText(payload: unknown): string {
  const data = payload as {
    output_text?: string;
    output?: Array<{
      type?: string;
      content?: Array<{ type?: string; text?: string }>;
    }>;
  };
  if (typeof data.output_text === 'string' && data.output_text.trim()) {
    return data.output_text.trim();
  }
  const output = Array.isArray(data.output) ? data.output : [];
  const pieces: string[] = [];
  for (const item of output) {
    const content = Array.isArray(item.content) ? item.content : [];
    for (const c of content) {
      if (c?.type === 'output_text' && typeof c.text === 'string') {
        pieces.push(c.text);
      }
    }
  }
  return pieces.join('\n').trim();
}

function parseChatCompletionsText(payload: unknown): string {
  const data = payload as {
    choices?: Array<{
      message?: {
        content?: string;
      };
    }>;
  };
  const text = data.choices?.[0]?.message?.content;
  return typeof text === 'string' ? text.trim() : '';
}

function resolveExecutable(command: string): string {
  const trimmed = (command || '').trim();
  if (!trimmed) return trimmed;

  const [bin, ...rest] = trimmed.split(/\s+/);
  if (!bin) return trimmed;
  if (bin.includes('/')) return trimmed;

  const candidateDirs = [
    ...(process.env.PATH ? process.env.PATH.split(':') : []),
    path.join(os.homedir(), '.local', 'bin'),
    '/Applications/Codex.app/Contents/Resources',
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
  ].filter(Boolean);

  const resolvedBin = candidateDirs
    .map((dir) => path.join(dir, bin))
    .find((candidate) => fs.existsSync(candidate));

  if (!resolvedBin) return trimmed;
  return [resolvedBin, ...rest].join(' ');
}

async function runCommandWithStdin(command: string, input: string, timeoutMs = 180000): Promise<string> {
  return await new Promise((resolve, reject) => {
    const child = spawn('/bin/bash', ['-lc', command], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGTERM');
      reject(new Error(`命令执行超时（>${timeoutMs}ms）: ${command}`));
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) {
        resolve(stdout.trim());
        return;
      }
      const suffix = stderr.trim() || stdout.trim() || `exit=${code ?? 'null'} signal=${signal ?? 'null'}`;
      reject(new Error(`命令执行失败: ${suffix}`));
    });

    child.stdin.write(input);
    child.stdin.end();
  });
}

async function generateWithClaude(prompt: string, claudePath: string): Promise<string> {
  const tempPath = path.join(os.tmpdir(), `content-publisher-claude-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`);
  await writeFile(tempPath, prompt, 'utf8');
  try {
    const resolvedClaude = resolveExecutable(claudePath || 'claude');
    const command = `unset CLAUDECODE && ${resolvedClaude} -p < "${tempPath}"`;
    const { stdout } = await execAsync(command, { timeout: 180000, shell: '/bin/bash' });
    const text = stdout.trim();
    if (!text) throw new Error('Claude CLI 返回为空');
    return text;
  } finally {
    await unlink(tempPath).catch(() => undefined);
  }
}

async function generateWithLocalClient(prompt: string, model: string, commandTemplate: string): Promise<string> {
  const template = commandTemplate.trim();
  if (!template) throw new Error('本地客户端命令为空');

  const escapedPrompt = prompt.replace(/'/g, "'\\''");
  const safeModel = model || '';
  const normalizedTemplate = resolveExecutable(template);
  const withModel = normalizedTemplate.replaceAll('{model}', safeModel);

  const text = withModel.includes('{prompt}')
    ? (await execAsync(withModel.replaceAll('{prompt}', `'${escapedPrompt}'`), { timeout: 180000, shell: '/bin/bash' })).stdout.trim()
    : await runCommandWithStdin(withModel, prompt, 180000);
  if (!text) throw new Error('本地客户端返回为空，请检查命令参数或输出方式');
  return text;
}

async function generateWithCodexApi(prompt: string, model: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('缺少 OPENAI_API_KEY，无法调用 Codex API。');
  }
  const baseUrl = normalizeBaseUrl(process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1');
  const resp = await fetch(`${baseUrl}/responses`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model || 'gpt-5-codex',
      input: prompt,
    }),
  });
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(`Codex API 调用失败: ${JSON.stringify(data)}`);
  }
  const text = parseResponsesText(data);
  if (!text) throw new Error('Codex API 返回为空');
  return text;
}

async function generateWithOpenAICompatible(prompt: string, model: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('缺少 OPENAI_API_KEY，无法调用 OpenAI-compatible API。');
  }
  const baseUrl = normalizeBaseUrl(process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1');
  const resp = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model || 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
    }),
  });
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(`OpenAI-compatible API 调用失败: ${JSON.stringify(data)}`);
  }
  const text = parseChatCompletionsText(data);
  if (!text) throw new Error('OpenAI-compatible API 返回为空');
  return text;
}

export async function generateByConfiguredProvider(prompt: string): Promise<{ content: string; provider: AiProvider }> {
  const settings = await getAppSettings();
  const runtimeSettings: AiRuntimeSettings = {
    aiProvider: settings.aiProvider as AiProvider,
    aiModel: settings.aiModel,
    claudePath: settings.claudePath,
    localClientPreset: settings.localClientPreset,
    localClientCommand: settings.localClientCommand,
  };

  try {
    return await generateBySettings(runtimeSettings, prompt);
  } catch (error) {
    if (runtimeSettings.aiProvider === 'claude-cli') {
      const fallbackSettings: AiRuntimeSettings = {
        ...runtimeSettings,
        aiProvider: 'local-client',
      };
      try {
        return await generateBySettings(fallbackSettings, prompt);
      } catch {
        throw error;
      }
    }
    throw error;
  }
}

export async function generateBySettings(
  settings: AiRuntimeSettings,
  prompt: string
): Promise<{ content: string; provider: AiProvider }> {
  const provider = settings.aiProvider as AiProvider;

  if (provider === 'codex-api') {
    const content = await generateWithCodexApi(prompt, settings.aiModel);
    return { content, provider };
  }
  if (provider === 'openai-compatible') {
    const content = await generateWithOpenAICompatible(prompt, settings.aiModel);
    return { content, provider };
  }
  if (provider === 'local-client') {
    const presetCommand =
      settings.localClientPreset === 'custom'
        ? ''
        : LOCAL_CLIENT_PRESET_COMMAND[settings.localClientPreset];
    const commandTemplate = settings.localClientCommand?.trim() || presetCommand || LOCAL_CLIENT_PRESET_COMMAND.codex;
    const content = await generateWithLocalClient(prompt, settings.aiModel, commandTemplate);
    return { content, provider };
  }
  const content = await generateWithClaude(prompt, settings.claudePath);
  return { content, provider: 'claude-cli' };
}

export async function testConnectionBySettings(settings: AiRuntimeSettings): Promise<{
  ok: boolean;
  provider: AiProvider;
  preview?: string;
  error?: string;
}> {
  try {
    const { content, provider } = await generateBySettings(
      settings,
      '请只回复“连接成功”。不要输出其他内容。'
    );
    return {
      ok: true,
      provider,
      preview: content.slice(0, 80),
    };
  } catch (error: unknown) {
    return {
      ok: false,
      provider: settings.aiProvider,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
