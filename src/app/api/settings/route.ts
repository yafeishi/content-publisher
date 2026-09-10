import { NextRequest, NextResponse } from 'next/server';
import { getAppSettings, saveAppSettings } from '@/lib/settings';

export async function GET() {
  try {
    const settings = await getAppSettings();
    return NextResponse.json(settings);
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to load settings: ${String(error)}` },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const settings = await saveAppSettings(body || {});
    return NextResponse.json(settings);
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to save settings: ${String(error)}` },
      { status: 500 }
    );
  }
}
