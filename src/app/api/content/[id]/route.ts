import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { marked } from 'marked';
import {
  extractImagePathsFromHtml,
  mergeImagePaths,
  normalizeStoredBody,
  parseImagesJson,
} from '@/lib/content-body';

// Detect if body is legacy format: Markdown text wrapped in a single block tag (p or h1)
// This happens when old content was saved as raw Markdown but stored in a single HTML block
function looksLikeLegacyContent(html: string): boolean {
  const stripped = html.trim();
  // Match single outer block: either <p>...</p> or <h1>...</h1>
  const singleBlockMatch = stripped.match(/^<(p|h1)[^>]*>([\s\S]*)<\/\1>\s*$/i);
  if (!singleBlockMatch) return false;
  // Count real block-level structural tags inside (real Tiptap HTML has many)
  const blockTags = (stripped.match(/<(h[1-6]|ul|ol|li|blockquote|pre|hr|table)/gi) || []).length;
  if (blockTags > 3) return false; // already proper HTML structure
  // Check for markdown indicators in the text content
  const inner = stripped.replace(/<\/?[a-z][^>]*>/gi, ' ').trim();
  return /\s#{1,6}\s/.test(inner) ||
    /```/.test(inner) ||
    /\s---\s/.test(inner) ||
    /\s\d+\.\s/.test(inner);
}

async function normalizeBody(body: string): Promise<string> {
  if (!looksLikeLegacyContent(body)) return body;
  console.log('[Content API] Normalizing legacy Markdown-in-block body...');

  // Extract text from inside the outermost block tag, preserving inline HTML (strong, code, em)
  // but converting them to their Markdown equivalents so marked can re-parse correctly
  const inner = body
    .trim()
    .replace(/^<(?:p|h1)[^>]*>/i, '')
    .replace(/<\/(?:p|h1)>\s*$/i, '')
    // Strip trailing trailing empty paragraph + image pattern
    .replace(/<\/(?:p|h1)>\s*<p>\s*<\/p>\s*<img[^>]+>\s*<p>\s*<\/p>\s*$/i, '');

  // Convert inline HTML to equivalent markdown before stripping tags
  const withMdInline = inner
    .replace(/<img[^>]+>/gi, '')                // drop images (handled separately)
    .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**')
    .replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**')
    .replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*')
    .replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*')
    .replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`')
    .replace(/<[^>]+>/g, '')                    // strip remaining tags
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"');

  // Restore newlines: original Markdown newlines were collapsed into spaces when stored in a block tag
  const rebuilt = withMdInline
    .replace(/\s+(#{1,6})\s/g, '\n\n$1 ')
    .replace(/\s+---\s+/g, '\n\n---\n\n')
    .replace(/\s+(\d+\.\s)/g, '\n$1')
    .replace(/\s*(```)/g, '\n$1')
    .replace(/(```)\s*/g, '$1\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  console.log('[Content API] Rebuilt markdown preview:', rebuilt.substring(0, 300));
  return await marked.parse(rebuilt);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const content = await prisma.content.findUnique({
      where: { id },
    });

    if (!content) {
      return NextResponse.json({ error: 'Content not found' }, { status: 404 });
    }

    // Auto-normalize legacy Markdown-in-paragraph content so the editor renders it correctly
    const storedImages = parseImagesJson(content.images || '[]');
    const coverImage = content.coverImage || '';
    const legacyNormalizedBody = await normalizeBody(content.body);
    const normalizedBody = normalizeStoredBody(legacyNormalizedBody, storedImages, coverImage);
    const inlineImages = extractImagePathsFromHtml(normalizedBody);
    const mergedImages = mergeImagePaths(storedImages, inlineImages, coverImage ? [coverImage] : []);
    const nextImages = JSON.stringify(mergedImages);

    if (normalizedBody !== content.body || nextImages !== (content.images || '[]')) {
      // Persist normalized body and synced images back to DB so it won't need fixing next time
      await prisma.content.update({
        where: { id },
        data: { body: normalizedBody, images: nextImages },
      });
      return NextResponse.json({ ...content, body: normalizedBody, images: nextImages });
    }

    return NextResponse.json(content);
  } catch (error) {
    console.error('Failed to fetch content:', error);
    return NextResponse.json({ error: 'Failed to fetch content' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const existing = await prisma.content.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Content not found' }, { status: 404 });
    }

    const nextCover = body.coverImage !== undefined ? (body.coverImage || null) : existing.coverImage;
    const explicitImages = body.images !== undefined
      ? parseImagesJson(body.images || '[]')
      : (body.body !== undefined ? [] : parseImagesJson(existing.images || '[]'));
    const nextBody = body.body !== undefined
      ? normalizeStoredBody(String(body.body || ''), explicitImages, nextCover)
      : existing.body;
    const inlineImages = extractImagePathsFromHtml(nextBody);
    const mergedImages = mergeImagePaths(explicitImages, inlineImages, nextCover ? [nextCover] : []);

    // Build update data dynamically, only including fields that were sent
    const updateData: Prisma.ContentUpdateInput = {};
    if (body.title !== undefined) updateData.title = body.title;
    if (body.body !== undefined) updateData.body = nextBody;
    if (body.platforms !== undefined) updateData.platforms = body.platforms;
    if (body.projectId !== undefined) updateData.projectId = body.projectId || null;
    if (body.images !== undefined || body.body !== undefined || body.coverImage !== undefined) {
      updateData.images = JSON.stringify(mergedImages);
    }
    if (body.coverImage !== undefined) updateData.coverImage = body.coverImage;
    if (body.status !== undefined) updateData.status = body.status;
    if (body.tags !== undefined) updateData.tags = body.tags;
    if (body.scheduledAt !== undefined) {
      updateData.scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;
    }
    if (body.publishedAt !== undefined) {
      updateData.publishedAt = body.publishedAt ? new Date(body.publishedAt) : null;
    }

    const content = await prisma.content.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json(content);
  } catch (error) {
    console.error('Failed to update content:', error);
    return NextResponse.json({ error: 'Failed to update content' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.content.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete content:', error);
    return NextResponse.json({ error: 'Failed to delete content' }, { status: 500 });
  }
}
