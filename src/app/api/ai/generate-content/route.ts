import { NextRequest, NextResponse } from 'next/server';
import { marked } from 'marked';
import { generateByConfiguredProvider } from '@/lib/ai/generate';
import { getAppSettings } from '@/lib/settings';
import { buildStylePromptBlock, humanizeMarkdownIfNeeded } from '@/lib/ai/writing-style';
import type { WritingStylePreset } from '@/lib/settings-schema';

function isWritingStylePreset(value: unknown): value is WritingStylePreset {
  return value === 'professional-review'
    || value === 'friend-chat'
    || value === 'calm-analysis'
    || value === 'practical-tutorial'
    || value === 'storytelling';
}

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as { topic?: string; stylePreset?: unknown };
    const topic = payload.topic?.trim();

    if (!topic) {
      return NextResponse.json({ error: 'Topic is required' }, { status: 400 });
    }

    const settings = await getAppSettings();
    const stylePreset = isWritingStylePreset(payload.stylePreset)
      ? payload.stylePreset
      : settings.writingStylePreset;
    const styleBlock = buildStylePromptBlock(stylePreset, settings.writingStyleProfile);

    // Build prompt for Claude CLI
    const prompt = `你是一个技术博主，擅长用通俗易懂的语言分享技术内容。

请根据以下主题，生成一篇适合在小红书和微信公众号发布的文章。

主题: ${topic}

要求:
1. 标题要吸引眼球（小红书风格，20字以内）
2. 内容要实用有趣，适合中文社交媒体风格
3. 字数控制在 600-800 字
4. 开头要有吸引力，中间有干货，结尾有互动引导
5. 可以适当使用 emoji
6. 输出格式：先输出标题（用 # 开头），然后是正文
7. 保持明显的人类作者口吻，避免模板腔

风格约束:
${styleBlock}

请直接输出文章内容。`;

    let content = '';
    try {
      const result = await generateByConfiguredProvider(prompt);
      content = result.content;
    } catch (providerError: unknown) {
      console.error('AI provider error:', providerError);

      // Fallback template
      content = `# ${topic}

大家好！今天来聊聊 ${topic}！

## 背景

${topic} 是一个很有意思的话题...

## 核心内容

今天来分享一些关于 ${topic} 的经验和见解...

### 1. 第一点

...

### 2. 第二点

...

### 3. 第三点

...

## 总结

以上就是关于 ${topic} 的分享，希望对大家有帮助！

#${topic} #技术分享`;
    }

    content = await humanizeMarkdownIfNeeded({
      markdown: content,
      stylePreset,
      profile: settings.writingStyleProfile,
      enabled: settings.humanizeRewriteEnabled,
    });

    // Parse the generated Markdown to HTML so the frontend editor (Tiptap) displays and saves it correctly
    const htmlContent = await marked.parse(content);

    return NextResponse.json({ content: htmlContent });
  } catch (error) {
    console.error('Failed to generate content:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
