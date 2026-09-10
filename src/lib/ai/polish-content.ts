import { marked } from 'marked';
import { generateByConfiguredProvider } from '@/lib/ai/generate';
import { buildStylePromptBlock, STYLE_LABEL_MAP } from '@/lib/ai/writing-style';
import type { WritingStylePreset, WritingStyleProfile } from '@/lib/settings-schema';

export function isWritingStylePreset(value: unknown): value is WritingStylePreset {
  return value === 'professional-review'
    || value === 'friend-chat'
    || value === 'calm-analysis'
    || value === 'practical-tutorial'
    || value === 'storytelling';
}

function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^```(?:html|markdown|md)?\s*([\s\S]*?)```$/i);
  return match ? match[1].trim() : trimmed;
}

function extractImageTagsBySrc(html: string): Map<string, string> {
  const map = new Map<string, string>();
  const regex = /<img[^>]*src=["']([^"']+)["'][^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    const src = (match[1] || '').trim();
    if (!src) continue;
    map.set(src, match[0]);
  }
  return map;
}

async function normalizeToHtml(raw: string): Promise<string> {
  const text = stripCodeFence(raw);
  if (!text) return '';
  if (/<[a-z][\s\S]*>/i.test(text)) return text;
  return await marked.parse(text);
}

export async function polishHtmlContent(input: {
  title: string;
  body: string;
  stylePreset: WritingStylePreset;
  profile: WritingStyleProfile;
}): Promise<{
  title: string;
  body: string;
  provider: string;
  stylePreset: WritingStylePreset;
  styleLabel: string;
}> {
  const styleBlock = buildStylePromptBlock(input.stylePreset, input.profile);

  const prompt = `你是中文内容编辑。请将下面文章润色为“真人作者”表达，但不要改动核心事实与结论。

要求:
1. 保持原有信息结构（标题层级、列表、重点）。
2. 语言更自然，减少 AI 模板腔。
3. 保留所有图片标签 <img ...>，不要删除、不替换 src。
4. 输出必须是 HTML 正文，不要输出 markdown，不要代码块。
5. 不要添加“本文将/首先其次最后/综上所述”等套话。

风格约束:
${styleBlock}

标题: ${input.title}

正文 HTML:
${input.body}`;

  const result = await generateByConfiguredProvider(prompt);
  let polishedHtml = await normalizeToHtml(result.content);

  if (!polishedHtml.trim()) {
    throw new Error('润色结果为空，请重试');
  }

  const originalImages = extractImageTagsBySrc(input.body);
  const rewrittenImages = extractImageTagsBySrc(polishedHtml);
  const missingImageTags: string[] = [];
  originalImages.forEach((tag, src) => {
    if (!rewrittenImages.has(src)) {
      missingImageTags.push(`<p>${tag}</p>`);
    }
  });
  if (missingImageTags.length > 0) {
    polishedHtml = `${polishedHtml}\n${missingImageTags.join('\n')}`;
  }

  return {
    title: input.title,
    body: polishedHtml,
    provider: result.provider,
    stylePreset: input.stylePreset,
    styleLabel: STYLE_LABEL_MAP[input.stylePreset],
  };
}
