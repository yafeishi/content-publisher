import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, copyFile } from 'node:fs/promises';
import fs from 'node:fs';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { marked } from 'marked';
import prisma from '@/lib/prisma';
import { applyLayoutTemplateToHtml, getLayoutTemplateById } from '@/lib/layout-templates';
import {
  extractImagePathsFromHtml,
  mergeImagePaths,
  normalizeStoredBody,
} from '@/lib/content-body';

const PUBLIC_UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads', 'agent-ingest');

type IngestMediaInput =
  | string
  | {
      url?: string;
      path?: string;
      dataUrl?: string;
      filename?: string;
      alt?: string;
    };

type IngestPayload = {
  title?: string;
  body?: string;
  markdown?: string;
  bodyFormat?: 'html' | 'markdown' | 'plain';
  tags?: string[] | string;
  platforms?: string[] | string;
  projectId?: string | null;
  status?: 'draft' | 'published' | 'scheduled';
  publishedAt?: string | null;
  scheduledAt?: string | null;
  templateId?: string | null;
  coverImage?: IngestMediaInput | null;
  images?: IngestMediaInput[];
  source?: {
    agent?: string;
    sessionId?: string;
    threadUrl?: string;
    note?: string;
  };
  options?: {
    prependCoverToBody?: boolean;
    appendImagesToBody?: boolean;
  };
};

type LocalizedMedia = {
  original: string;
  path: string;
  filename: string;
  alt: string;
};

const GET_DOC = {
  name: 'agent-submit',
  method: 'POST',
  path: '/api/agent-submit',
  description: '供其他 agent / 会话将整理后的内容直接写入内容库，自动处理排版、图片、封面图与草稿创建。',
  body: {
    title: 'string, required',
    markdown: 'string, optional, 与 body 二选一。推荐其他 agent 直接传 markdown',
    body: 'string, optional, HTML 或纯文本',
    bodyFormat: '"html" | "markdown" | "plain", optional',
    coverImage: 'string | { url | path | dataUrl | filename | alt }, optional',
    images: 'Array<string | { url | path | dataUrl | filename | alt }>, optional',
    templateId: 'string, optional，例如 standard / clean-notes / impact-mag',
    tags: 'string[] | JSON string, optional',
    platforms: 'string[] | JSON string, optional',
    projectId: 'string, optional',
    status: '"draft" | "published" | "scheduled", optional, default draft',
    scheduledAt: 'ISO time, optional',
    publishedAt: 'ISO time, optional',
    source: '{ agent, sessionId, threadUrl, note }, optional',
    options: '{ prependCoverToBody, appendImagesToBody }, optional',
  },
  example: {
    title: '某次 Agent 会话总结',
    markdown:
      '# 结论\\n\\n这是其他 agent 的总结正文。\\n\\n![截图](https://example.com/demo.png)\\n\\n## 下一步\\n\\n- 补测试\\n- 发草稿',
    coverImage: 'https://example.com/cover.png',
    images: ['https://example.com/step-1.png'],
    templateId: 'standard',
    tags: ['agent-summary', 'weekly-review'],
    platforms: ['wechat', 'mowen', 'obsidian'],
    projectId: 'your-project-id',
    status: 'draft',
    source: {
      agent: 'codex',
      sessionId: 'thread-123',
      threadUrl: 'https://example.com/thread/123',
      note: '来自另一个会话的阶段总结',
    },
    options: {
      prependCoverToBody: false,
      appendImagesToBody: true,
    },
  },
};

const IMAGE_EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/svg+xml': '.svg',
  'image/avif': '.avif',
};

function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      return parseStringArray(parsed);
    } catch {
      return trimmed
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }
  return [];
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function convertPlainTextToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

function buildImageHtml(src: string, alt: string) {
  return `<img class="rounded-lg max-w-full mx-auto my-4" src="${escapeHtml(src)}" alt="${escapeHtml(alt || 'image')}">`;
}

function normalizeFilename(input: string, fallbackExt = '.png'): string {
  const parsed = path.parse(input);
  const base = (parsed.name || 'asset')
    .replace(/[^a-zA-Z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'asset';
  const ext = parsed.ext || fallbackExt;
  return `${base}-${randomUUID().slice(0, 8)}${ext}`;
}

function resolveMediaInput(input: IngestMediaInput): {
  source: string;
  alt: string;
  filenameHint: string;
  kind: 'remote' | 'local' | 'data' | 'existing';
} | null {
  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('/uploads/')) {
      return { source: trimmed, alt: 'image', filenameHint: path.basename(trimmed), kind: 'existing' };
    }
    if (/^https?:\/\//i.test(trimmed)) {
      return { source: trimmed, alt: 'image', filenameHint: path.basename(new URL(trimmed).pathname) || 'remote-image', kind: 'remote' };
    }
    if (/^data:image\//i.test(trimmed)) {
      return { source: trimmed, alt: 'image', filenameHint: 'data-image', kind: 'data' };
    }
    return { source: trimmed, alt: 'image', filenameHint: path.basename(trimmed) || 'local-image', kind: 'local' };
  }

  if (!input || typeof input !== 'object') return null;
  const alt = typeof input.alt === 'string' && input.alt.trim() ? input.alt.trim() : 'image';
  const filenameHint = typeof input.filename === 'string' && input.filename.trim()
    ? input.filename.trim()
    : 'asset';

  if (typeof input.url === 'string' && input.url.trim()) {
    const url = input.url.trim();
    if (url.startsWith('/uploads/')) {
      return { source: url, alt, filenameHint, kind: 'existing' };
    }
    return { source: url, alt, filenameHint, kind: 'remote' };
  }
  if (typeof input.dataUrl === 'string' && input.dataUrl.trim()) {
    return { source: input.dataUrl.trim(), alt, filenameHint, kind: 'data' };
  }
  if (typeof input.path === 'string' && input.path.trim()) {
    return { source: input.path.trim(), alt, filenameHint, kind: 'local' };
  }
  return null;
}

async function ensureUploadDir() {
  await mkdir(PUBLIC_UPLOAD_DIR, { recursive: true });
}

async function persistAssetRecord(filename: string, publicPath: string, projectId: string | null, size: number | null) {
  return prisma.asset.create({
    data: {
      filename,
      path: publicPath,
      type: 'image',
      projectId,
      size: size ?? undefined,
      tags: JSON.stringify(['agent-ingest']),
      description: '由 agent-submit 自动写入',
    },
  });
}

async function localizeMedia(input: IngestMediaInput, projectId: string | null): Promise<LocalizedMedia | null> {
  const resolved = resolveMediaInput(input);
  if (!resolved) return null;

  if (resolved.kind === 'existing') {
    return {
      original: resolved.source,
      path: resolved.source,
      filename: resolved.filenameHint || path.basename(resolved.source),
      alt: resolved.alt,
    };
  }

  await ensureUploadDir();

  if (resolved.kind === 'local') {
    if (!path.isAbsolute(resolved.source) || !fs.existsSync(resolved.source)) {
      throw new Error(`本地图片不存在: ${resolved.source}`);
    }
    const stat = await fs.promises.stat(resolved.source);
    const filename = normalizeFilename(resolved.filenameHint || path.basename(resolved.source), path.extname(resolved.source) || '.png');
    const destPath = path.join(PUBLIC_UPLOAD_DIR, filename);
    await copyFile(resolved.source, destPath);
    const publicPath = `/uploads/agent-ingest/${filename}`;
    await persistAssetRecord(filename, publicPath, projectId, stat.size);
    return { original: resolved.source, path: publicPath, filename, alt: resolved.alt };
  }

  if (resolved.kind === 'data') {
    const match = resolved.source.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!match) throw new Error('不支持的 dataUrl 图片格式');
    const mime = match[1];
    const data = Buffer.from(match[2], 'base64');
    const filename = normalizeFilename(resolved.filenameHint, IMAGE_EXT_BY_MIME[mime] || '.png');
    const destPath = path.join(PUBLIC_UPLOAD_DIR, filename);
    await writeFile(destPath, data);
    const publicPath = `/uploads/agent-ingest/${filename}`;
    await persistAssetRecord(filename, publicPath, projectId, data.length);
    return { original: resolved.source.slice(0, 48), path: publicPath, filename, alt: resolved.alt };
  }

  const response = await fetch(resolved.source);
  if (!response.ok) {
    throw new Error(`下载远程图片失败: ${resolved.source} (${response.status})`);
  }
  const mime = response.headers.get('content-type')?.split(';')[0].trim() || 'image/png';
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const ext = IMAGE_EXT_BY_MIME[mime] || path.extname(new URL(resolved.source).pathname) || '.png';
  const filename = normalizeFilename(resolved.filenameHint, ext);
  const destPath = path.join(PUBLIC_UPLOAD_DIR, filename);
  await writeFile(destPath, buffer);
  const publicPath = `/uploads/agent-ingest/${filename}`;
  await persistAssetRecord(filename, publicPath, projectId, buffer.length);
  return { original: resolved.source, path: publicPath, filename, alt: resolved.alt };
}

async function buildHtmlBody(payload: IngestPayload): Promise<string> {
  const markdown = typeof payload.markdown === 'string' ? payload.markdown.trim() : '';
  const body = typeof payload.body === 'string' ? payload.body.trim() : '';
  const bodyFormat = payload.bodyFormat || (markdown ? 'markdown' : 'html');

  if (markdown) return await marked.parse(markdown);
  if (!body) return '';
  if (bodyFormat === 'markdown') return await marked.parse(body);
  if (bodyFormat === 'plain') return convertPlainTextToHtml(body);
  return body;
}

async function rewriteBodyImages(html: string, projectId: string | null) {
  const localized: LocalizedMedia[] = [];
  let nextHtml = html;
  const matches = Array.from(html.matchAll(/<img([^>]*?)src=["']([^"']+)["']([^>]*)>/gi));

  for (const match of matches) {
    const originalTag = match[0];
    const src = (match[2] || '').trim();
    if (!src || src.startsWith('/uploads/')) continue;

    const altMatch = originalTag.match(/alt=["']([^"']*)["']/i);
    const localizedMedia = await localizeMedia({ url: src, alt: altMatch?.[1] || 'image' }, projectId);
    if (!localizedMedia) continue;

    localized.push(localizedMedia);
    nextHtml = nextHtml.replace(src, localizedMedia.path);
  }

  return { html: nextHtml, localized };
}

export async function GET() {
  return NextResponse.json(GET_DOC);
}

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as IngestPayload;
    const title = typeof payload.title === 'string' ? payload.title.trim() : '';
    if (!title) {
      return NextResponse.json({ error: 'title is required' }, { status: 400 });
    }

    const projectId = typeof payload.projectId === 'string' && payload.projectId.trim()
      ? payload.projectId.trim()
      : null;
    const status = payload.status || (payload.scheduledAt ? 'scheduled' : 'draft');
    const tags = parseStringArray(payload.tags);
    const platforms = parseStringArray(payload.platforms);
    const options = payload.options || {};

    let bodyHtml = await buildHtmlBody(payload);
    const rewrittenBody = await rewriteBodyImages(bodyHtml, projectId);
    bodyHtml = rewrittenBody.html;

    const cover = payload.coverImage ? await localizeMedia(payload.coverImage, projectId) : null;
    const explicitImages = (
      await Promise.all((payload.images || []).map((item) => localizeMedia(item, projectId)))
    ).filter((item): item is LocalizedMedia => Boolean(item));

    const inlineImagePaths = extractImagePathsFromHtml(bodyHtml);
    const explicitImagePaths = explicitImages.map((item) => item.path);
    const mergedImagePaths = mergeImagePaths(inlineImagePaths, explicitImagePaths, rewrittenBody.localized.map((item) => item.path));

    if (options.prependCoverToBody && cover && !bodyHtml.includes(cover.path)) {
      bodyHtml = `${buildImageHtml(cover.path, cover.alt)}${bodyHtml}`;
    }

    if (options.appendImagesToBody) {
      const missingImages = explicitImages.filter((item) => !bodyHtml.includes(item.path));
      if (missingImages.length > 0) {
        bodyHtml += missingImages.map((item) => buildImageHtml(item.path, item.alt)).join('');
      }
    }

    const templateId = typeof payload.templateId === 'string' ? payload.templateId.trim() : '';
    if (templateId) {
      const template = await getLayoutTemplateById(templateId);
      if (template) {
        bodyHtml = applyLayoutTemplateToHtml(bodyHtml, template);
        tags.push(`layout-template:${template.id}`);
      }
    }

    const normalizedBody = normalizeStoredBody(
      bodyHtml,
      mergeImagePaths(mergedImagePaths, extractImagePathsFromHtml(bodyHtml)),
      cover?.path || null
    );

    const content = await prisma.content.create({
      data: {
        title,
        body: normalizedBody,
        status,
        platforms: JSON.stringify(platforms),
        publishedAt: payload.publishedAt ? new Date(payload.publishedAt) : null,
        scheduledAt: payload.scheduledAt ? new Date(payload.scheduledAt) : null,
        coverImage: cover?.path || null,
        images: JSON.stringify(mergeImagePaths(mergedImagePaths, extractImagePathsFromHtml(normalizedBody), cover ? [cover.path] : [])),
        tags: JSON.stringify(tags),
        projectId,
      },
    });

    await prisma.log.create({
      data: {
        action: 'agent_ingest',
        result: JSON.stringify({
          title,
          source: payload.source || null,
          coverImage: cover?.path || null,
          imageCount: mergeImagePaths(mergedImagePaths, extractImagePathsFromHtml(normalizedBody)).length,
        }),
        projectId,
        contentId: content.id,
      },
    });

    return NextResponse.json({
      success: true,
      content,
      localizedAssets: {
        coverImage: cover?.path || null,
        images: explicitImages.map((item) => item.path),
        rewrittenBodyImages: rewrittenBody.localized.map((item) => item.path),
      },
      usage: {
        endpoint: '/api/agent-submit',
        contentId: content.id,
      },
    });
  } catch (error) {
    console.error('Agent ingest failed:', error);
    return NextResponse.json(
      { error: `Agent ingest failed: ${String(error)}` },
      { status: 500 }
    );
  }
}
