import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getAppSettings } from '@/lib/settings';
import { isWritingStylePreset, polishHtmlContent } from '@/lib/ai/polish-content';
import type { WritingStylePreset } from '@/lib/settings-schema';

const DEFAULT_COMPARE_STYLES: WritingStylePreset[] = [
  'professional-review',
  'friend-chat',
  'calm-analysis',
  'practical-tutorial',
  'storytelling',
];

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      if (currentIndex >= items.length) break;
      results[currentIndex] = await mapper(items[currentIndex]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const payload = (await request.json().catch(() => ({}))) as {
      title?: unknown;
      body?: unknown;
      styles?: unknown;
    };

    const content = await prisma.content.findUnique({ where: { id } });
    if (!content) {
      return NextResponse.json({ error: 'Content not found' }, { status: 404 });
    }

    const sourceTitle = typeof payload.title === 'string' && payload.title.trim()
      ? payload.title.trim()
      : content.title;
    const sourceBody = typeof payload.body === 'string' && payload.body.trim()
      ? payload.body
      : content.body;

    if (!sourceBody.trim()) {
      return NextResponse.json({ error: '正文为空，无法对比润色' }, { status: 400 });
    }

    const requestedStyles = Array.isArray(payload.styles)
      ? payload.styles.filter(isWritingStylePreset)
      : [];
    const styles = (requestedStyles.length > 0 ? requestedStyles : DEFAULT_COMPARE_STYLES)
      .filter((item, index, list) => list.indexOf(item) === index);

    const settings = await getAppSettings();
    const failedStyles: Array<{ stylePreset: string; error: string }> = [];

    const settled = await mapWithConcurrency(styles, 2, async (stylePreset) => {
      try {
        const candidate = await polishHtmlContent({
          title: sourceTitle,
          body: sourceBody,
          stylePreset,
          profile: settings.writingStyleProfile,
        });
        return { ok: true as const, candidate };
      } catch (error) {
        return {
          ok: false as const,
          stylePreset,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    const candidates = settled
      .filter((item): item is { ok: true; candidate: Awaited<ReturnType<typeof polishHtmlContent>> } => item.ok)
      .map((item) => item.candidate);

    settled.forEach((item) => {
      if (!item.ok) {
        failedStyles.push({ stylePreset: item.stylePreset, error: item.error });
      }
    });

    if (candidates.length === 0) {
      const firstFailure = failedStyles[0]?.error || '';
      return NextResponse.json({
        error: firstFailure || '所有润色候选都生成失败，请稍后重试',
        failedStyles,
      }, { status: 500 });
    }

    await prisma.log.create({
      data: {
        action: '生成润色对比候选',
        result: `success=${candidates.length}; failed=${failedStyles.length}`,
        contentId: id,
        projectId: content.projectId || undefined,
      },
    });

    return NextResponse.json({
      success: true,
      candidates,
      failedStyles,
    });
  } catch (error) {
    console.error('Failed to compare polish candidates:', error);
    return NextResponse.json({ error: '对比润色失败，请稍后重试' }, { status: 500 });
  }
}
