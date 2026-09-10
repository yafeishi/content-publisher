import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const logs = await prisma.log.findMany({
      where: { projectId: id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return NextResponse.json(logs);
  } catch (error) {
    console.error('Failed to fetch logs:', error);
    return NextResponse.json({ error: 'Failed to fetch logs' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const log = await prisma.log.create({
      data: {
        action: body.action,
        result: body.result,
        projectId: id,
        contentId: body.contentId || null,
      },
    });

    return NextResponse.json(log);
  } catch (error) {
    console.error('Failed to create log:', error);
    return NextResponse.json({ error: 'Failed to create log' }, { status: 500 });
  }
}
