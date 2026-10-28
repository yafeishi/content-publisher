import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const content = await prisma.content.findUnique({ where: { id }, select: { id: true } });
    if (!content) {
      return NextResponse.json({ error: 'Content not found' }, { status: 404 });
    }
    const records = await prisma.publishRecord.findMany({
      where: { contentId: id },
      orderBy: { publishedAt: 'desc' },
    });
    return NextResponse.json({ records });
  } catch (error) {
    console.error('Failed to fetch publish records:', error);
    return NextResponse.json({ error: 'Failed to fetch publish records' }, { status: 500 });
  }
}
