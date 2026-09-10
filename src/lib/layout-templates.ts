import prisma from '@/lib/prisma';
import type { LayoutTemplate, LayoutTemplateTokens, TemplateMode, TemplatePlatform } from '@/lib/layout-template-types';

const TEMPLATE_SETTINGS_KEY = 'layout_templates_v1';

const BASE_TOKENS: LayoutTemplateTokens = {
  accentColor: '#0ea5e9',
  textColor: '#334155',
  headingColor: '#0f172a',
  bgColor: '#ffffff',
  fontSize: 16,
  lineHeight: 1.85,
  paragraphSpacing: 16,
  imageRadius: 10,
  h1Size: 30,
  h2Size: 24,
  h3Size: 20,
  quoteBg: '#f8fafc',
  quoteBorder: '#38bdf8',
  codeBg: '#f1f5f9',
  dividerColor: '#dbeafe',
};

function nowIso(): string {
  return new Date().toISOString();
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

function normalizeColor(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim();
  if (!normalized) return fallback;
  return normalized;
}

function normalizePlatforms(value: unknown): TemplatePlatform[] {
  if (!Array.isArray(value)) return ['all'];
  const allowed = new Set<TemplatePlatform>(['wechat', 'xiaohongshu', 'mowen', 'obsidian', 'all']);
  const result = value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item): item is TemplatePlatform => allowed.has(item as TemplatePlatform));
  return result.length > 0 ? Array.from(new Set(result)) : ['all'];
}

function sanitizeTokens(input: Partial<LayoutTemplateTokens> | null | undefined): LayoutTemplateTokens {
  const data = input || {};
  return {
    accentColor: normalizeColor(data.accentColor, BASE_TOKENS.accentColor),
    textColor: normalizeColor(data.textColor, BASE_TOKENS.textColor),
    headingColor: normalizeColor(data.headingColor, BASE_TOKENS.headingColor),
    bgColor: normalizeColor(data.bgColor, BASE_TOKENS.bgColor),
    fontSize: clampNumber(data.fontSize, 12, 24, BASE_TOKENS.fontSize),
    lineHeight: clampNumber(data.lineHeight, 1.3, 2.3, BASE_TOKENS.lineHeight),
    paragraphSpacing: clampNumber(data.paragraphSpacing, 8, 36, BASE_TOKENS.paragraphSpacing),
    imageRadius: clampNumber(data.imageRadius, 0, 32, BASE_TOKENS.imageRadius),
    h1Size: clampNumber(data.h1Size, 20, 48, BASE_TOKENS.h1Size),
    h2Size: clampNumber(data.h2Size, 18, 40, BASE_TOKENS.h2Size),
    h3Size: clampNumber(data.h3Size, 16, 34, BASE_TOKENS.h3Size),
    quoteBg: normalizeColor(data.quoteBg, BASE_TOKENS.quoteBg),
    quoteBorder: normalizeColor(data.quoteBorder, BASE_TOKENS.quoteBorder),
    codeBg: normalizeColor(data.codeBg, BASE_TOKENS.codeBg),
    dividerColor: normalizeColor(data.dividerColor, BASE_TOKENS.dividerColor),
  };
}

export const BUILTIN_LAYOUT_TEMPLATES: LayoutTemplate[] = [
  {
    id: 'standard',
    name: '标准蓝调',
    description: '信息密度均衡，适合公众号和墨问的通用排版。',
    sourceType: 'system',
    sourceRef: 'builtin',
    platforms: ['all'],
    mode: 'adapt',
    createdAt: '2026-02-25T00:00:00.000Z',
    updatedAt: '2026-02-25T00:00:00.000Z',
    tokens: sanitizeTokens(BASE_TOKENS),
  },
  {
    id: 'clean-notes',
    name: '清爽笔记',
    description: '偏轻量的知识笔记风格，适合 Obsidian 与图文说明。',
    sourceType: 'system',
    sourceRef: 'builtin',
    platforms: ['obsidian', 'mowen', 'wechat'],
    mode: 'adapt',
    createdAt: '2026-02-25T00:00:00.000Z',
    updatedAt: '2026-02-25T00:00:00.000Z',
    tokens: sanitizeTokens({
      ...BASE_TOKENS,
      accentColor: '#0f766e',
      quoteBorder: '#14b8a6',
      quoteBg: '#f0fdfa',
      dividerColor: '#ccfbf1',
      imageRadius: 8,
      paragraphSpacing: 14,
      h1Size: 28,
      h2Size: 22,
      h3Size: 19,
    }),
  },
  {
    id: 'impact-mag',
    name: '杂志冲击',
    description: '标题对比更强，适合专题连载和结果展示。',
    sourceType: 'system',
    sourceRef: 'builtin',
    platforms: ['wechat', 'mowen'],
    mode: 'adapt',
    createdAt: '2026-02-25T00:00:00.000Z',
    updatedAt: '2026-02-25T00:00:00.000Z',
    tokens: sanitizeTokens({
      ...BASE_TOKENS,
      accentColor: '#2563eb',
      headingColor: '#111827',
      textColor: '#1f2937',
      fontSize: 17,
      lineHeight: 1.82,
      h1Size: 34,
      h2Size: 26,
      h3Size: 21,
      imageRadius: 12,
      quoteBg: '#eef2ff',
      quoteBorder: '#4f46e5',
      codeBg: '#e0e7ff',
      dividerColor: '#c7d2fe',
    }),
  },
];

export function sanitizeLayoutTemplates(input: unknown): LayoutTemplate[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => {
      const data = (item && typeof item === 'object' ? item : {}) as Partial<LayoutTemplate>;
      const id = typeof data.id === 'string' ? data.id.trim() : '';
      const name = typeof data.name === 'string' ? data.name.trim() : '';
      if (!id || !name) return null;
      return {
        id,
        name,
        description: typeof data.description === 'string' ? data.description : '',
        sourceType: data.sourceType === 'learned' ? 'learned' : 'system',
        sourceRef: typeof data.sourceRef === 'string' ? data.sourceRef : 'unknown',
        platforms: normalizePlatforms(data.platforms),
        mode: data.mode === 'strict' ? 'strict' : 'adapt',
        createdAt: typeof data.createdAt === 'string' ? data.createdAt : nowIso(),
        updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : nowIso(),
        tokens: sanitizeTokens(data.tokens),
      } satisfies LayoutTemplate;
    })
    .filter((item): item is LayoutTemplate => Boolean(item));
}

export async function getLearnedLayoutTemplates(): Promise<LayoutTemplate[]> {
  const row = await prisma.appSetting.findUnique({ where: { key: TEMPLATE_SETTINGS_KEY } });
  if (!row) return [];
  try {
    const parsed = JSON.parse(row.value);
    return sanitizeLayoutTemplates(parsed);
  } catch {
    return [];
  }
}

export async function saveLearnedLayoutTemplates(templates: LayoutTemplate[]): Promise<LayoutTemplate[]> {
  const sanitized = sanitizeLayoutTemplates(templates);
  await prisma.appSetting.upsert({
    where: { key: TEMPLATE_SETTINGS_KEY },
    create: { key: TEMPLATE_SETTINGS_KEY, value: JSON.stringify(sanitized) },
    update: { value: JSON.stringify(sanitized) },
  });
  return sanitized;
}

export async function listAllLayoutTemplates(): Promise<LayoutTemplate[]> {
  const learned = await getLearnedLayoutTemplates();
  return [...BUILTIN_LAYOUT_TEMPLATES, ...learned];
}

export async function upsertLearnedTemplate(template: LayoutTemplate): Promise<LayoutTemplate[]> {
  const learned = await getLearnedLayoutTemplates();
  const existingIndex = learned.findIndex((item) => item.id === template.id);
  const now = nowIso();
  const normalized: LayoutTemplate = {
    ...template,
    sourceType: 'learned',
    updatedAt: now,
    createdAt: template.createdAt || now,
    tokens: sanitizeTokens(template.tokens),
    platforms: normalizePlatforms(template.platforms),
  };

  if (existingIndex >= 0) {
    learned[existingIndex] = normalized;
  } else {
    learned.unshift(normalized);
  }
  return saveLearnedLayoutTemplates(learned);
}

export function parseTemplateIdFromTags(tags: string[] | string | null | undefined): string | null {
  const list: string[] = Array.isArray(tags)
    ? tags
    : (typeof tags === 'string'
      ? (() => {
        try {
          const parsed = JSON.parse(tags);
          return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
        } catch {
          return [];
        }
      })()
      : []);
  const tag = list.find((item) => typeof item === 'string' && item.startsWith('layout-template:'));
  if (!tag) return null;
  const templateId = tag.slice('layout-template:'.length).trim();
  return templateId || null;
}

export function buildTagsWithTemplate(baseTags: string[], templateId: string | null): string[] {
  const next = (baseTags || []).filter((item) => item && !item.startsWith('layout-template:'));
  if (templateId) next.push(`layout-template:${templateId}`);
  return Array.from(new Set(next));
}

export async function getLayoutTemplateById(templateId: string | null | undefined): Promise<LayoutTemplate | null> {
  if (!templateId) return null;
  const all = await listAllLayoutTemplates();
  return all.find((item) => item.id === templateId) || null;
}

function mergeInlineStyle(attrs: string, styleText: string): string {
  const styleMatch = attrs.match(/\sstyle=("([^"]*)"|'([^']*)')/i);
  const existing = (styleMatch?.[2] || styleMatch?.[3] || '').trim();
  const merged = [existing, styleText].filter(Boolean).join('; ').replace(/;;+/g, ';').trim();

  const attrsWithoutStyle = attrs.replace(/\sstyle=("[^"]*"|'[^']*')/ig, '');
  return `${attrsWithoutStyle} style="${merged}"`;
}

function rewriteTagWithStyle(html: string, tagName: string, styleText: string): string {
  const regex = new RegExp(`<${tagName}([^>]*)>`, 'gi');
  return html.replace(regex, (_match, attrs: string) => `<${tagName}${mergeInlineStyle(attrs || '', styleText)}>`);
}

export function applyLayoutTemplateToHtml(html: string, template: LayoutTemplate): string {
  const input = String(html || '').trim();
  if (!input) return '';
  const t = template.tokens;

  const containerStyle = [
    `font-size: ${t.fontSize}px`,
    `line-height: ${t.lineHeight}`,
    `color: ${t.textColor}`,
    `background: ${t.bgColor}`,
    'word-break: break-word',
  ].join('; ');

  let output = input;
  output = rewriteTagWithStyle(output, 'h1', `margin: 1.2em 0 0.7em; font-size: ${t.h1Size}px; line-height: 1.35; font-weight: 700; color: ${t.headingColor}; border-bottom: 2px solid ${t.dividerColor}; padding-bottom: 0.25em;`);
  output = rewriteTagWithStyle(output, 'h2', `margin: 1.1em 0 0.65em; font-size: ${t.h2Size}px; line-height: 1.4; font-weight: 650; color: ${t.headingColor}; padding-left: 10px; border-left: 4px solid ${t.accentColor};`);
  output = rewriteTagWithStyle(output, 'h3', `margin: 1em 0 0.55em; font-size: ${t.h3Size}px; line-height: 1.4; font-weight: 600; color: ${t.headingColor};`);
  output = rewriteTagWithStyle(output, 'p', `margin: ${Math.max(8, t.paragraphSpacing * 0.55)}px 0 ${t.paragraphSpacing}px; color: ${t.textColor}; font-size: ${t.fontSize}px; line-height: ${t.lineHeight};`);
  output = rewriteTagWithStyle(output, 'blockquote', `margin: ${Math.max(10, t.paragraphSpacing * 0.7)}px 0; padding: 10px 14px; background: ${t.quoteBg}; border-left: 4px solid ${t.quoteBorder}; border-radius: 6px; color: ${t.textColor};`);
  output = rewriteTagWithStyle(output, 'pre', `margin: ${Math.max(10, t.paragraphSpacing * 0.7)}px 0; background: ${t.codeBg}; color: ${t.headingColor}; padding: 12px 14px; border-radius: 8px; overflow-x: auto;`);
  output = rewriteTagWithStyle(output, 'code', `background: ${t.codeBg}; color: ${t.headingColor}; padding: 2px 6px; border-radius: 4px;`);
  output = rewriteTagWithStyle(output, 'li', `margin: 0.4em 0; color: ${t.textColor};`);
  output = rewriteTagWithStyle(output, 'ul', `margin: ${Math.max(10, t.paragraphSpacing * 0.6)}px 0; padding-left: 1.5em;`);
  output = rewriteTagWithStyle(output, 'ol', `margin: ${Math.max(10, t.paragraphSpacing * 0.6)}px 0; padding-left: 1.5em;`);
  output = rewriteTagWithStyle(output, 'a', `color: ${t.accentColor}; text-decoration: underline;`);
  output = rewriteTagWithStyle(output, 'hr', `margin: ${Math.max(14, t.paragraphSpacing)}px 0; border: none; border-top: 1px solid ${t.dividerColor};`);
  output = rewriteTagWithStyle(output, 'img', `max-width: 100%; height: auto; border-radius: ${t.imageRadius}px; margin: ${Math.max(10, t.paragraphSpacing * 0.65)}px auto; display: block;`);

  const wrapped = `<div data-layout-template="${template.id}" style="${containerStyle}">${output}</div>`;
  return wrapped;
}

export function getTemplateLearningPrompt(input: {
  sourceText: string;
  sourceUrl?: string;
  mode: TemplateMode;
  platforms: TemplatePlatform[];
  preferredName?: string;
}): string {
  const platforms = input.platforms.join(', ');
  return `你是内容排版系统的模板抽取器。请根据给定素材抽取一套可复用的排版模板，输出严格 JSON。\n\n来源链接: ${input.sourceUrl || '未提供'}\n学习模式: ${input.mode}\n目标平台: ${platforms}\n模板命名偏好: ${input.preferredName || '无'}\n\n素材内容:\n${input.sourceText.slice(0, 6000)}\n\n输出要求:\n1. 只输出 JSON，不要解释。\n2. tokens 字段要给出可直接用于网页内联样式的值。\n3. accentColor/textColor/headingColor/bgColor/quoteBg/quoteBorder/codeBg/dividerColor 使用十六进制色值。\n4. 数值范围建议: fontSize 14-20, lineHeight 1.5-2.1, paragraphSpacing 10-28, imageRadius 0-20。\n\nJSON 结构:\n{\n  "name": "模板名",\n  "description": "模板描述",\n  "tokens": {\n    "accentColor": "#0ea5e9",\n    "textColor": "#334155",\n    "headingColor": "#0f172a",\n    "bgColor": "#ffffff",\n    "fontSize": 16,\n    "lineHeight": 1.8,\n    "paragraphSpacing": 16,\n    "imageRadius": 10,\n    "h1Size": 30,\n    "h2Size": 24,\n    "h3Size": 20,\n    "quoteBg": "#f8fafc",\n    "quoteBorder": "#38bdf8",\n    "codeBg": "#f1f5f9",\n    "dividerColor": "#dbeafe"\n  }\n}`;
}

export function extractJsonFromModelOutput(raw: string): Record<string, unknown> {
  const trimmed = String(raw || '').trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] || trimmed).trim();

  const attempts = [candidate];
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start >= 0 && end > start) attempts.push(candidate.slice(start, end + 1));

  for (const text of attempts) {
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
    } catch {
      // continue
    }
  }
  throw new Error('模型输出不是有效 JSON');
}
