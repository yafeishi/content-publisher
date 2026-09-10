import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getAppSettings } from '@/lib/settings';
import { isWritingStylePreset, polishHtmlContent } from '@/lib/ai/polish-content';
import type { WritingStylePreset } from '@/lib/settings-schema';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const payload = (await request.json().catch(() => ({}))) as {
      title?: unknown;
      body?: unknown;
      stylePreset?: unknown;
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
      return NextResponse.json({ error: '正文为空，无法润色' }, { status: 400 });
    }

    const settings = await getAppSettings();
    const stylePreset: WritingStylePreset = isWritingStylePreset(payload.stylePreset)
      ? payload.stylePreset
      : settings.writingStylePreset;
    const result = await polishHtmlContent({
      title: sourceTitle,
      body: sourceBody,
      stylePreset,
      profile: settings.writingStyleProfile,
    });

    const updated = await prisma.content.update({
      where: { id },
      data: {
        title: sourceTitle,
        body: result.body,
      },
    });

    await prisma.log.create({
      data: {
        action: '按风格润色草稿',
        result: `provider=${result.provider}; style=${stylePreset}; length=${result.body.length}`,
        contentId: id,
        projectId: content.projectId || undefined,
      },
    });

    return NextResponse.json({
      success: true,
      title: updated.title,
      body: updated.body,
      provider: result.provider,
      stylePreset,
    });
  } catch (error) {
    console.error('Failed to polish content:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '润色失败，请稍后重试' },
      { status: 500 }
    );
  }
}
