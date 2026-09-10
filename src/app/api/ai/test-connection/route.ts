import { NextRequest, NextResponse } from 'next/server';
import { testConnectionBySettings } from '@/lib/ai/generate';
import { sanitizeAppSettings } from '@/lib/settings-schema';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const sanitized = sanitizeAppSettings(body || {});
    const result = await testConnectionBySettings({
      aiProvider: sanitized.aiProvider,
      aiModel: sanitized.aiModel,
      claudePath: sanitized.claudePath,
      localClientPreset: sanitized.localClientPreset,
      localClientCommand: sanitized.localClientCommand,
    });

    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          provider: result.provider,
          error: result.error || '连接失败',
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      provider: result.provider,
      preview: result.preview || '',
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: `连接测试失败: ${String(error)}` },
      { status: 500 }
    );
  }
}
