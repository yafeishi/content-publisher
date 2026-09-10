import { NextRequest, NextResponse } from 'next/server';
import { marked } from 'marked';
import { applyLayoutTemplateToHtml, getLayoutTemplateById } from '@/lib/layout-templates';

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"');
}

function stripHtmlToText(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<\/h[1-6]>/gi, '\n\n')
      .replace(/<\/li>/gi, '\n')
      .replace(/<\/ul>|<\/ol>|<\/blockquote>|<\/pre>|<\/div>/gi, '\n')
      .replace(/<hr\s*\/?>/gi, '\n---\n')
      .replace(/<img[^>]+>/gi, '')
      .replace(/<[^>]+>/g, '')
  )
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function looksLikeMarkdown(text: string): boolean {
  if (!text) return false;
  return /^#{1,6}\s/m.test(text)
    || /```[\s\S]*```/.test(text)
    || /^\s*[-*+]\s+/m.test(text)
    || /^\s*\d+\.\s+/m.test(text)
    || /^\s*>\s+/m.test(text)
    || /\n---\n/.test(text);
}

function looksLikeLegacyMarkdownHtml(html: string): boolean {
  const stripped = html.trim();
  if (!stripped) return false;
  const singleBlock = stripped.match(/^<(p|h1)[^>]*>[\s\S]*<\/\1>\s*$/i);
  if (!singleBlock) return false;
  const blockTags = (stripped.match(/<(h[1-6]|ul|ol|li|blockquote|pre|hr|table)/gi) || []).length;
  if (blockTags > 3) return false;
  return looksLikeMarkdown(stripHtmlToText(stripped));
}

function rebuildCollapsedMarkdown(text: string): string {
  return text
    .replace(/\s+(#{1,6})\s+/g, '\n\n$1 ')
    .replace(/\s+---\s+/g, '\n\n---\n\n')
    .replace(/\s+(\d+\.\s)/g, '\n$1')
    .replace(/\s*(```)/g, '\n$1')
    .replace(/(```)\s*/g, '$1\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function cleanupHtml(html: string): string {
  return html
    .replace(/<p>(?:\s|&nbsp;|<br\s*\/?>)*<\/p>/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function smartFormatHtml(body: string): Promise<string> {
  const input = String(body || '').trim();
  if (!input) return '';

  const text = stripHtmlToText(input);
  const shouldParseMarkdown = looksLikeLegacyMarkdownHtml(input) || looksLikeMarkdown(text);
  if (!shouldParseMarkdown) {
    return cleanupHtml(input);
  }

  const rebuilt = rebuildCollapsedMarkdown(text);
  const parsed = await marked.parse(rebuilt);
  return cleanupHtml(parsed);
}

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json().catch(() => ({}))) as { body?: unknown; templateId?: unknown };
    const body = typeof payload.body === 'string' ? payload.body : '';
    const templateId = typeof payload.templateId === 'string' ? payload.templateId.trim() : '';
    const normalizedBody = await smartFormatHtml(body);

    let formattedBody = normalizedBody;
    if (templateId) {
      const template = await getLayoutTemplateById(templateId);
      if (template) {
        formattedBody = applyLayoutTemplateToHtml(normalizedBody, template);
      }
    }

    return NextResponse.json({
      success: true,
      formattedBody,
    });
  } catch (error) {
    console.error('Format content failed:', error);
    return NextResponse.json({ error: '内容排版失败' }, { status: 500 });
  }
}
