import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import prisma from '@/lib/prisma';

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads');

function ensureUploadDir() {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q') || '';
    const projectId = searchParams.get('projectId') || '';
    const [assets, projects, contents] = await Promise.all([
      prisma.asset.findMany({
        orderBy: { createdAt: 'desc' },
        where: {
          ...(projectId ? { projectId } : {}),
          ...(q
            ? {
              OR: [
                { filename: { contains: q } },
                { description: { contains: q } },
              ],
            }
            : {}),
        },
      }),
      prisma.project.findMany({
        select: { id: true, name: true },
      }),
      prisma.content.findMany({
        select: {
          id: true,
          title: true,
          images: true,
          coverImage: true,
          updatedAt: true,
        },
      }),
    ]);

    const projectNameById = new Map(projects.map((p) => [p.id, p.name]));
    const pathToRefs = new Map<string, Array<{ id: string; title: string; updatedAt: Date }>>();

    const parseImages = (value: string | null): string[] => {
      if (!value) return [];
      try {
        const parsed: unknown = JSON.parse(value);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((item): item is string => typeof item === 'string');
      } catch {
        return [];
      }
    };

    for (const c of contents) {
      const refs = new Set<string>();
      for (const p of parseImages(c.images)) {
        if (p.startsWith('/uploads/')) refs.add(p);
      }
      if (c.coverImage && c.coverImage.startsWith('/uploads/')) refs.add(c.coverImage);

      for (const p of refs) {
        if (!pathToRefs.has(p)) pathToRefs.set(p, []);
        pathToRefs.get(p)?.push({
          id: c.id,
          title: c.title,
          updatedAt: c.updatedAt,
        });
      }
    }

    const enrichedAssets = assets.map((asset) => {
      const refs = pathToRefs.get(asset.path) || [];
      return {
        ...asset,
        projectName: asset.projectId ? (projectNameById.get(asset.projectId) || null) : null,
        referencedByCount: refs.length,
        referencedContents: refs.map((ref) => ({
          id: ref.id,
          title: ref.title,
          updatedAt: ref.updatedAt,
        })),
      };
    });

    return NextResponse.json({ assets: enrichedAssets });
  } catch (error) {
    console.error('Failed to fetch assets:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    ensureUploadDir();

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const projectIdValue = formData.get('projectId');
    const projectId = typeof projectIdValue === 'string' && projectIdValue.trim() ? projectIdValue.trim() : null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const ext = path.extname(file.name) || '.jpg';
    const filename = `${Date.now()}-${Math.random().toString(36).substring(7)}${ext}`;
    const filePath = path.join(UPLOAD_DIR, filename);

    const buffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(filePath, buffer);

    const asset = await prisma.asset.create({
      data: {
        filename: file.name,
        path: `/uploads/${filename}`,
        type: file.type.startsWith('image') ? 'image' : 'video',
        projectId,
        size: file.size,
      },
    });

    return NextResponse.json({ asset });
  } catch (error) {
    console.error('Failed to upload asset:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// 更新素材备注 / 描述
export async function PATCH(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const body = await request.json();
    const ids = Array.isArray(body.ids) ? body.ids.filter((v: unknown): v is string => typeof v === 'string' && v.length > 0) : [];

    // Bulk update mode
    if (ids.length > 0) {
      const assets = await prisma.asset.findMany({
        where: { id: { in: ids } },
        select: { id: true, tags: true },
      });

      const addTag = typeof body.addTag === 'string' ? body.addTag.trim() : '';
      const projectIdValue = body.projectId;

      const operations = assets.flatMap((asset) => {
          const nextData: Record<string, unknown> = {};

          if (addTag) {
            let existing: string[] = [];
            try {
              const parsed: unknown = JSON.parse(asset.tags || '[]');
              if (Array.isArray(parsed)) {
                existing = parsed.filter((item): item is string => typeof item === 'string' && item.length > 0);
              }
            } catch {
              existing = [];
            }
            if (!existing.includes(addTag)) {
              existing.push(addTag);
            }
            nextData.tags = JSON.stringify(existing);
          }

          if (projectIdValue !== undefined) {
            nextData.projectId = typeof projectIdValue === 'string' && projectIdValue.trim() ? projectIdValue.trim() : null;
          }

          if (Object.keys(nextData).length === 0) return [];
          return [prisma.asset.update({
            where: { id: asset.id },
            data: nextData,
          })];
        });

      if (operations.length > 0) {
        await prisma.$transaction(operations);
      }

      return NextResponse.json({ success: true, updatedCount: operations.length });
    }

    if (!id) {
      return NextResponse.json({ error: 'Asset ID required' }, { status: 400 });
    }

    const asset = await prisma.asset.update({
      where: { id },
      data: {
        ...(body.description !== undefined && { description: body.description }),
        ...(body.filename !== undefined && { filename: body.filename }),
        ...(body.projectId !== undefined && { projectId: body.projectId || null }),
        ...(body.tags !== undefined && { tags: body.tags }),
      },
    });

    return NextResponse.json({ asset });
  } catch (error) {
    console.error('Failed to update asset:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    let ids: string[] = [];

    if (id) {
      ids = [id];
    } else {
      try {
        const body = await request.json();
        if (Array.isArray(body?.ids)) {
          ids = body.ids.filter((v: unknown): v is string => typeof v === 'string' && v.length > 0);
        }
      } catch {
        ids = [];
      }
    }

    if (ids.length === 0) {
      return NextResponse.json({ error: 'Asset ID(s) required' }, { status: 400 });
    }

    const assets = await prisma.asset.findMany({
      where: { id: { in: ids } },
    });
    if (assets.length === 0) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    }

    for (const asset of assets) {
      const filePath = path.join(process.cwd(), 'public', asset.path);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    await prisma.asset.deleteMany({
      where: { id: { in: assets.map((asset) => asset.id) } },
    });

    return NextResponse.json({ success: true, deletedCount: assets.length });
  } catch (error) {
    console.error('Failed to delete asset:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
