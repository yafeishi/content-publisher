import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {
  extractImagePathsFromHtml,
  mergeImagePaths,
  normalizeStoredBody,
  parseImagesJson,
} from '@/lib/content-body';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    const where = status ? {
      status: {
        in: status.split(','),
      },
    } : {};

    const contents = await prisma.content.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
    });
    return NextResponse.json(contents);
  } catch (error) {
    console.error('Failed to fetch contents:', error);
    return NextResponse.json({ error: 'Failed to fetch contents' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const coverImage = typeof body.coverImage === 'string' ? body.coverImage : '';
    const manualImages = parseImagesJson(body.images || '[]');
    const bodyHtml = normalizeStoredBody(typeof body.body === 'string' ? body.body : '', manualImages, coverImage || null);
    const inlineImages = extractImagePathsFromHtml(bodyHtml);
    const mergedImages = mergeImagePaths(manualImages, inlineImages, coverImage ? [coverImage] : []);

    const content = await prisma.content.create({
      data: {
        title: body.title || '',
        body: bodyHtml,
        status: body.status || 'draft',
        platforms: body.platforms || '[]',
        publishedAt: body.publishedAt ? new Date(body.publishedAt) : null,
        scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
        coverImage: coverImage || null,
        images: JSON.stringify(mergedImages),
        tags: body.tags || '[]',
        projectId: body.projectId || null,
      },
    });
    return NextResponse.json(content);
  } catch (error) {
    console.error('Failed to create content:', error);
    return NextResponse.json({ error: 'Failed to create content' }, { status: 500 });
  }
}
