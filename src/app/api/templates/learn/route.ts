import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import {
  extractJsonFromModelOutput,
  getTemplateLearningPrompt,
  upsertLearnedTemplate,
  sanitizeLayoutTemplates,
} from '@/lib/layout-templates';
import type { LayoutTemplate, LayoutTemplateTokens, TemplateMode, TemplatePlatform } from '@/lib/layout-template-types';
import { generateByConfiguredProvider } from '@/lib/ai/generate';

type LearnPayload = {
  sourceUrl?: string;
  sourceText?: string;
  sourceHtml?: string;
  preferredName?: string;
  platforms?: string[];
  mode?: string;
};

function sanitizeMode(value: unknown): TemplateMode {
  return value === 'strict' ? 'strict' : 'adapt';
}

function sanitizePlatforms(value: unknown): TemplatePlatform[] {
  if (!Array.isArray(value) || value.length === 0) return ['all'];
  const allowed = new Set<TemplatePlatform>(['wechat', 'xiaohongshu', 'mowen', 'obsidian', 'all']);
  const result = value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item): item is TemplatePlatform => allowed.has(item as TemplatePlatform));
  return result.length > 0 ? Array.from(new Set(result)) : ['all'];
}

function stripHtmlToText(html: string): string {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

async function fetchUrlText(url: string): Promise<string> {
  if (!/^https?:\/\//i.test(url)) return '';
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Content Publisher Template Learner)',
      Accept: 'text/html,application/xhtml+xml',
    },
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error(`URL 抓取失败: HTTP ${response.status}`);
  }
  const html = await response.text();
  return stripHtmlToText(html).slice(0, 12000);
}

function buildFallbackTokens(sourceText: string): LayoutTemplateTokens {
  const hasSteps = /第一步|第二步|第三步|步骤|如何使用/.test(sourceText);
  const hasStrongPromo = /一键|快速|高效|模板/.test(sourceText);
  const base = {
    accentColor: hasStrongPromo ? '#2563eb' : '#0ea5e9',
    textColor: '#334155',
    headingColor: '#0f172a',
    bgColor: '#ffffff',
    fontSize: 16,
    lineHeight: hasSteps ? 1.86 : 1.8,
    paragraphSpacing: hasSteps ? 16 : 14,
    imageRadius: hasStrongPromo ? 12 : 10,
    h1Size: 32,
    h2Size: 24,
    h3Size: 20,
    quoteBg: '#f8fafc',
    quoteBorder: hasStrongPromo ? '#2563eb' : '#38bdf8',
    codeBg: '#f1f5f9',
    dividerColor: '#dbeafe',
  };
  return sanitizeLayoutTemplates([{ id: 'tmp', name: 'tmp', description: '', sourceType: 'learned', sourceRef: '', platforms: ['all'], mode: 'adapt', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), tokens: base }])[0].tokens;
}

function normalizeName(name: string): string {
  return name
    .trim()
    .replace(/[\n\r\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .slice(0, 32) || '学习模板';
}

function normalizeId(name: string): string {
  const basic = name
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  const hash = crypto.createHash('md5').update(`${name}-${Date.now()}`).digest('hex').slice(0, 6);
  return `${basic || 'learned-template'}-${hash}`;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as LearnPayload;
    const sourceUrl = typeof body.sourceUrl === 'string' ? body.sourceUrl.trim() : '';
    const sourceTextRaw = typeof body.sourceText === 'string' ? body.sourceText.trim() : '';
    const sourceHtml = typeof body.sourceHtml === 'string' ? body.sourceHtml.trim() : '';
    const mode = sanitizeMode(body.mode);
    const platforms = sanitizePlatforms(body.platforms);

    let sourceText = sourceTextRaw;
    if (!sourceText && sourceHtml) {
      sourceText = stripHtmlToText(sourceHtml);
    }
    if (!sourceText && sourceUrl) {
      try {
        sourceText = await fetchUrlText(sourceUrl);
      } catch {
        // keep empty and fallback below
      }
    }

    if (!sourceText) {
      return NextResponse.json({ error: '学习素材为空，请提供链接、文本或HTML。' }, { status: 400 });
    }

    const prompt = getTemplateLearningPrompt({
      sourceText,
      sourceUrl,
      mode,
      platforms,
      preferredName: body.preferredName,
    });

    let modelName = typeof body.preferredName === 'string' && body.preferredName.trim() ? normalizeName(body.preferredName) : '';
    let description = '由系统学习生成的排版模板';
    let tokens = buildFallbackTokens(sourceText);
    let provider = 'fallback';

    try {
      const result = await generateByConfiguredProvider(prompt);
      provider = result.provider;
      const parsed = extractJsonFromModelOutput(result.content);

      if (typeof parsed.name === 'string' && parsed.name.trim()) {
        modelName = normalizeName(parsed.name);
      }
      if (typeof parsed.description === 'string' && parsed.description.trim()) {
        description = parsed.description.trim().slice(0, 120);
      }
      if (parsed.tokens && typeof parsed.tokens === 'object') {
        tokens = sanitizeLayoutTemplates([{ id: 'tmp', name: 'tmp', description: '', sourceType: 'learned', sourceRef: '', platforms: ['all'], mode: 'adapt', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), tokens: parsed.tokens as Partial<LayoutTemplateTokens> }])[0].tokens;
      }
    } catch {
      provider = 'fallback';
    }

    if (!modelName) {
      let fallbackName = '学习模板';
      if (sourceUrl) {
        try {
          fallbackName = `学习模板-${new URL(sourceUrl).hostname}`;
        } catch {
          fallbackName = '学习模板';
        }
      }
      modelName = normalizeName(fallbackName);
    }

    const now = new Date().toISOString();
    const template: LayoutTemplate = {
      id: normalizeId(modelName),
      name: modelName,
      description,
      sourceType: 'learned',
      sourceRef: sourceUrl || 'manual-input',
      platforms,
      mode,
      createdAt: now,
      updatedAt: now,
      tokens,
    };

    await upsertLearnedTemplate(template);

    return NextResponse.json({
      success: true,
      provider,
      template,
    });
  } catch (error) {
    return NextResponse.json({ error: `模板学习失败: ${String(error)}` }, { status: 500 });
  }
}
