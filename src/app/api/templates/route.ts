import { NextRequest, NextResponse } from 'next/server';
import {
  listAllLayoutTemplates,
  saveLearnedLayoutTemplates,
  sanitizeLayoutTemplates,
  getLearnedLayoutTemplates,
} from '@/lib/layout-templates';

export async function GET() {
  try {
    const templates = await listAllLayoutTemplates();
    return NextResponse.json({ templates });
  } catch (error) {
    return NextResponse.json({ error: `Failed to load templates: ${String(error)}` }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as { templates?: unknown };
    const incoming = sanitizeLayoutTemplates(body.templates || []);
    const learnedOnly = incoming.filter((item) => item.sourceType === 'learned');
    const saved = await saveLearnedLayoutTemplates(learnedOnly);
    return NextResponse.json({ templates: saved });
  } catch (error) {
    return NextResponse.json({ error: `Failed to save templates: ${String(error)}` }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as { id?: string };
    const id = typeof body.id === 'string' ? body.id.trim() : '';
    if (!id) {
      return NextResponse.json({ error: 'Missing template id' }, { status: 400 });
    }

    const learned = await getLearnedLayoutTemplates();
    const next = learned.filter((item) => item.id !== id);
    if (next.length === learned.length) {
      return NextResponse.json({ error: 'Template not found or builtin template cannot be deleted' }, { status: 404 });
    }

    await saveLearnedLayoutTemplates(next);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: `Failed to delete template: ${String(error)}` }, { status: 500 });
  }
}
