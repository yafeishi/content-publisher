import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET() {
  try {
    const projects = await prisma.project.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(projects);
  } catch (error) {
    console.error('Failed to fetch projects:', error);
    return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const project = await prisma.project.create({
      data: {
        name: body.name,
        path: body.path,
        description: body.description || null,
        scenario: body.scenario || null,
        needs: body.needs || null,
        solution: body.solution || null,
        highlights: body.highlights || '[]',
        outcomes: body.outcomes || null,
        audience: body.audience || null,
        stage: body.stage || null,
        type: body.type || 'local',
        techStack: body.techStack || '[]',
        tags: body.tags || '[]',
      },
    });
    return NextResponse.json(project);
  } catch (error) {
    console.error('Failed to create project:', error);
    return NextResponse.json({ error: 'Failed to create project' }, { status: 500 });
  }
}
