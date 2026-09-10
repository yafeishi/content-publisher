import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const project = await prisma.project.findUnique({
      where: { id },
    });

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    return NextResponse.json(project);
  } catch (error) {
    console.error('Failed to fetch project:', error);
    return NextResponse.json({ error: 'Failed to fetch project' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const existing = await prisma.project.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const updateData: Prisma.ProjectUpdateInput = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.path !== undefined) updateData.path = body.path;
    if (body.description !== undefined) updateData.description = body.description || null;
    if (body.scenario !== undefined) updateData.scenario = body.scenario || null;
    if (body.needs !== undefined) updateData.needs = body.needs || null;
    if (body.solution !== undefined) updateData.solution = body.solution || null;
    if (body.highlights !== undefined) updateData.highlights = body.highlights || '[]';
    if (body.outcomes !== undefined) updateData.outcomes = body.outcomes || null;
    if (body.audience !== undefined) updateData.audience = body.audience || null;
    if (body.stage !== undefined) updateData.stage = body.stage || null;
    if (body.type !== undefined) updateData.type = body.type;
    if (body.techStack !== undefined) updateData.techStack = body.techStack || '[]';
    if (body.tags !== undefined) updateData.tags = body.tags || '[]';

    const project = await prisma.project.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json(project);
  } catch (error) {
    console.error('Failed to update project:', error);
    return NextResponse.json({ error: 'Failed to update project' }, { status: 500 });
  }
}
