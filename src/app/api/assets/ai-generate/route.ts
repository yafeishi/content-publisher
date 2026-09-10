import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import dotenv from 'dotenv';
import prisma from '@/lib/prisma';

const AI_IMAGES_DIR = path.join(process.cwd(), 'public', 'uploads', 'ai');
const MAX_COUNT = 4;
const CODEX_IMAGE_MODEL = 'codex-imagegen';
const MINIMAX_IMAGE_MODELS = ['minimax-image-01', 'minimax-image-01-live'] as const;
type SupportedImageModel = typeof CODEX_IMAGE_MODEL | typeof MINIMAX_IMAGE_MODELS[number];

function ensureAiDir() {
  if (!fs.existsSync(AI_IMAGES_DIR)) {
    fs.mkdirSync(AI_IMAGES_DIR, { recursive: true });
  }
}

function stripAnsi(value: string): string {
  return value.replace(/\u001b\[[0-9;]*m/g, '');
}

function sanitizeImageModel(value: unknown): SupportedImageModel {
  const input = typeof value === 'string' ? value.trim() : '';
  if (!input) return CODEX_IMAGE_MODEL;
  if (input === CODEX_IMAGE_MODEL || isMiniMaxModel(input)) return input as SupportedImageModel;
  throw new Error('当前仅支持 Codex 内置生图和 MiniMax。请在模型中选择这两个渠道之一。');
}

function isMiniMaxModel(model: string) {
  return MINIMAX_IMAGE_MODELS.includes(model as typeof MINIMAX_IMAGE_MODELS[number]);
}

function loadSharedEnvValue(key: string): string {
  const direct = process.env[key]?.trim();
  if (direct) return direct;

  const envFiles = [
    path.join(process.cwd(), '.baoyu-skills', '.env'),
    path.join(os.homedir(), '.baoyu-skills', '.env'),
  ];

  for (const envFile of envFiles) {
    if (!fs.existsSync(envFile)) continue;
    const parsed = dotenv.parse(fs.readFileSync(envFile, 'utf-8'));
    const value = parsed[key]?.trim();
    if (value) return value;
  }

  return '';
}

function getMiniMaxConfig() {
  const apiKey = loadSharedEnvValue('MINIMAX_API_KEY');
  const baseUrl = loadSharedEnvValue('MINIMAX_BASE_URL') || 'https://api.minimaxi.com';
  return {
    apiKey,
    baseUrl: baseUrl.replace(/\/+$/g, ''),
  };
}

function inferExtFromResponse(contentType: string | null, fallbackUrl: string): string {
  if (contentType?.includes('image/jpeg')) return '.jpg';
  if (contentType?.includes('image/webp')) return '.webp';
  if (contentType?.includes('image/gif')) return '.gif';
  if (contentType?.includes('image/png')) return '.png';
  const match = fallbackUrl.match(/\.(png|jpg|jpeg|webp|gif)(?:\?|$)/i);
  if (!match) return '.png';
  const ext = match[1].toLowerCase();
  return ext === 'jpeg' ? '.jpg' : `.${ext}`;
}

type PreviewFile = {
  path: string;
  filename: string;
  size: number;
  type: 'image';
};

type GenerateSpeedMode = 'fast' | 'quality';

function sanitizeGenerateSpeedMode(value: unknown): GenerateSpeedMode {
  return value === 'quality' ? 'quality' : 'fast';
}

async function runMiniMaxImageGeneration(
  prompt: string,
  model: string,
  count: number
): Promise<{ files: string[]; usedModels: string[] }> {
  const { apiKey, baseUrl } = getMiniMaxConfig();
  if (!apiKey) {
    throw new Error('未检测到 MINIMAX_API_KEY，请检查 ~/.baoyu-skills/.env。');
  }

  const minimaxModel = model === 'minimax-image-01-live' ? 'image-01-live' : 'image-01';
  const response = await fetch(`${baseUrl}/v1/image_generation`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: minimaxModel,
      prompt,
      n: count,
      aspect_ratio: '1:1',
      response_format: 'base64',
      prompt_optimizer: false,
      aigc_watermark: false,
    }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`MiniMax API error (${response.status}): ${message}`);
  }

  const payload = await response.json() as {
    data?: {
      image_base64?: string[];
      image_urls?: string[];
    };
    base_resp?: {
      status_code?: number;
      status_msg?: string;
    };
  };

  if (payload.base_resp?.status_code && payload.base_resp.status_code !== 0) {
    throw new Error(payload.base_resp.status_msg || 'MiniMax 图片生成失败');
  }

  const base64Images = payload.data?.image_base64 || [];
  if (base64Images.length > 0) {
    const files: string[] = [];
    for (const [index, imageData] of base64Images.entries()) {
      const filename = `ai-${Date.now()}-${index + 1}-${Math.random().toString(36).slice(2, 8)}.png`;
      const outputPath = path.join(AI_IMAGES_DIR, filename);
      fs.writeFileSync(outputPath, Buffer.from(imageData, 'base64'));
      files.push(outputPath);
    }
    return {
      files,
      usedModels: Array.from({ length: files.length }, () => model),
    };
  }

  const imageUrls = payload.data?.image_urls || [];
  if (imageUrls.length > 0) {
    const previews = await downloadRemoteImagesToPreviewFiles(imageUrls.slice(0, count));
    return {
      files: previews.map((item) => path.join(AI_IMAGES_DIR, item.filename)),
      usedModels: Array.from({ length: previews.length }, () => model),
    };
  }

  throw new Error('MiniMax 返回成功，但未包含图片数据');
}

function resolveCodexExecutable() {
  const candidates = [
    process.env.CODEX_BIN,
    path.join(os.homedir(), '.local', 'bin', 'codex'),
    '/Applications/Codex.app/Contents/Resources/codex',
    '/opt/homebrew/bin/codex',
    '/usr/local/bin/codex',
    'codex',
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    if (candidate === 'codex' || fs.existsSync(candidate)) return candidate;
  }
  return 'codex';
}

function buildCodexPrompt(prompt: string, paths: string[], speedMode: GenerateSpeedMode) {
  const qualityText = speedMode === 'quality'
    ? '偏高清和精细质感，适合封面或正式配图。'
    : '优先快速生成清晰预览，适合先看方向。';
  const pathList = paths.map((item, index) => `${index + 1}. ${item}`).join('\n');
  return [
    '请使用 $imagegen 通过 Codex 内置图片生成能力生成图片。',
    `图片主题: ${prompt}`,
    `生成要求: ${qualityText}`,
    `需要生成 ${paths.length} 张 PNG 图片，并分别保存到以下绝对路径:`,
    pathList,
    '不要调用外部图片 API，不要使用 Gemini、infsh 或其他第三方生图服务。',
    '完成后请只回复 JSON，格式为 {"files":["/absolute/path/image.png"]}。',
  ].join('\n\n');
}

function runCommandWithIgnoredStdin(
  command: string,
  args: string[],
  options: {
    cwd: string;
    timeout: number;
    env: NodeJS.ProcessEnv;
  }
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`命令执行超时: ${command}`));
    }, options.timeout);

    child.stdout.setEncoding('utf-8');
    child.stderr.setEncoding('utf-8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(`命令退出失败: code=${code ?? 'null'} signal=${signal ?? 'null'}\n${stripAnsi(`${stdout}\n${stderr}`).slice(0, 1200)}`));
    });
  });
}

async function runCodexImageGeneration(
  prompt: string,
  count: number,
  speedMode: GenerateSpeedMode
): Promise<{ files: string[]; usedModels: string[] }> {
  ensureAiDir();
  const now = Date.now();
  const outputPaths = Array.from({ length: count }, (_, index) => {
    const filename = `ai-${now}-${index + 1}-${crypto.randomUUID().slice(0, 8)}.png`;
    return path.join(AI_IMAGES_DIR, filename);
  });
  const summaryPath = path.join(os.tmpdir(), `content-publisher-codex-image-${crypto.randomUUID()}.txt`);
  const args = [
    'exec',
    '--sandbox',
    'workspace-write',
    '--add-dir',
    AI_IMAGES_DIR,
    '--skip-git-repo-check',
    '--cd',
    process.cwd(),
    '--output-last-message',
    summaryPath,
    '--color',
    'never',
    buildCodexPrompt(prompt, outputPaths, speedMode),
  ];

  try {
    const { stdout, stderr } = await runCommandWithIgnoredStdin(resolveCodexExecutable(), args, {
      cwd: process.cwd(),
      timeout: 600000,
      env: {
        ...process.env,
        NO_COLOR: '1',
      },
    });
    const outputText = stripAnsi(`${stdout}\n${stderr}`);
    const generated = outputPaths.filter((item) => fs.existsSync(item) && fs.statSync(item).size > 0);
    if (generated.length > 0) {
      return {
        files: generated,
        usedModels: Array.from({ length: generated.length }, () => CODEX_IMAGE_MODEL),
      };
    }

    const finalMessage = fs.existsSync(summaryPath) ? fs.readFileSync(summaryPath, 'utf-8') : '';
    throw new Error(`Codex 生图未生成目标文件。输出: ${stripAnsi(`${finalMessage}\n${outputText}`).slice(0, 800)}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Codex 内置生图失败：${message}`);
  } finally {
    if (fs.existsSync(summaryPath)) fs.unlinkSync(summaryPath);
  }
}

function buildPreviewFilesFromLocalFiles(localFiles: string[]) {
  const previews: PreviewFile[] = [];
  for (const file of localFiles) {
    const buffer = fs.readFileSync(file);
    const filename = path.basename(file);
    previews.push({
      filename,
      path: `/uploads/ai/${filename}`,
      size: buffer.length,
      type: 'image',
    });
  }
  return previews;
}

async function downloadRemoteImagesToPreviewFiles(urls: string[]) {
  const previews: PreviewFile[] = [];
  let index = 0;
  for (const url of urls) {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`下载生成图片失败: ${resp.status}`);
    const buffer = Buffer.from(await resp.arrayBuffer());
    const ext = inferExtFromResponse(resp.headers.get('content-type'), url);
    const filename = `ai-${Date.now()}-${index + 1}-${Math.random().toString(36).slice(2, 8)}${ext}`;
    const outputPath = path.join(AI_IMAGES_DIR, filename);
    fs.writeFileSync(outputPath, buffer);
    previews.push({
      filename,
      path: `/uploads/ai/${filename}`,
      size: buffer.length,
      type: 'image',
    });
    index += 1;
  }
  return previews;
}

function resolvePreviewFile(previewPath: string): { fullPath: string; filename: string } | null {
  if (typeof previewPath !== 'string' || !previewPath.startsWith('/uploads/ai/')) return null;
  const filename = path.basename(previewPath);
  if (!filename || filename.includes('..')) return null;
  return {
    filename,
    fullPath: path.join(AI_IMAGES_DIR, filename),
  };
}

async function savePreviewFilesToAssets(
  previewPaths: string[],
  topic: string,
  style: string,
  model: string,
  projectId: string | null
) {
  const assets = [];
  let index = 0;
  for (const previewPath of previewPaths) {
    const resolved = resolvePreviewFile(previewPath);
    if (!resolved || !fs.existsSync(resolved.fullPath)) continue;
    const buffer = fs.readFileSync(resolved.fullPath);
    const ext = path.extname(resolved.filename) || '.png';
    const asset = await prisma.asset.create({
      data: {
        filename: `${topic}-${index + 1}${ext}`,
        path: `/uploads/ai/${resolved.filename}`,
        type: 'image',
        projectId,
        size: buffer.length,
        description: style ? `AI生成 · ${style}` : 'AI生成',
        tags: JSON.stringify(['ai-generated', topic, style || 'default-style', model ? `model:${model}` : `model:${CODEX_IMAGE_MODEL}`]),
      },
    });
    assets.push(asset);
    index += 1;
  }
  return assets;
}

async function discardPreviewFiles(previewPaths: string[]) {
  for (const previewPath of previewPaths) {
    const resolved = resolvePreviewFile(previewPath);
    if (!resolved || !fs.existsSync(resolved.fullPath)) continue;
    fs.unlinkSync(resolved.fullPath);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const action = typeof body.action === 'string' ? body.action : 'generate';
    const topic = typeof body.topic === 'string' ? body.topic.trim() : '';
    const style = typeof body.style === 'string' ? body.style.trim() : '';
    const projectId = typeof body.projectId === 'string' && body.projectId.trim() ? body.projectId.trim() : null;
    const requestedCount = Number(body.count || 1);
    const count = Number.isFinite(requestedCount) ? Math.min(Math.max(Math.floor(requestedCount), 1), MAX_COUNT) : 1;
    const requestedModel = typeof body.model === 'string' ? body.model.trim() : '';
    const imageModel = sanitizeImageModel(requestedModel);
    const speedMode = sanitizeGenerateSpeedMode(body.speedMode);
    const previewPaths = Array.isArray(body.previewPaths)
      ? body.previewPaths.filter((item: unknown): item is string => typeof item === 'string')
      : [];

    if (action === 'save') {
      if (!topic) {
        return NextResponse.json({ error: '缺少图片主题，无法入库' }, { status: 400 });
      }
      if (previewPaths.length === 0) {
        return NextResponse.json({ error: '没有可入库的预览图片' }, { status: 400 });
      }
      const assets = await savePreviewFilesToAssets(previewPaths, topic, style, imageModel, projectId);
      if (assets.length === 0) {
        return NextResponse.json({ error: '预览图片不存在或已失效，请重新生成' }, { status: 400 });
      }
      return NextResponse.json({
        assets,
        meta: {
          saved: assets.length,
          model: imageModel,
        },
      });
    }

    if (action === 'discard') {
      await discardPreviewFiles(previewPaths);
      return NextResponse.json({ success: true, discarded: previewPaths.length });
    }

    if (!topic) {
      return NextResponse.json({ error: '请输入图片主题' }, { status: 400 });
    }

    ensureAiDir();
    const prompt = style ? `${topic}，风格：${style}` : topic;

    const generationResult = isMiniMaxModel(imageModel)
      ? await runMiniMaxImageGeneration(prompt, imageModel, count)
      : await runCodexImageGeneration(prompt, count, speedMode);
    const previews = buildPreviewFilesFromLocalFiles(generationResult.files);
    return NextResponse.json({
      previews,
      meta: {
        provider: isMiniMaxModel(imageModel) ? 'minimax' : 'codex',
        model: generationResult.usedModels.join(','),
        generated: previews.length,
        speedMode,
      },
    });
  } catch (error) {
    console.error('Failed to generate AI image:', error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
