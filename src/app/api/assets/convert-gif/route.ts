import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import prisma from '@/lib/prisma';

function runCommand(command: string, args: string[]): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve) => {
    const proc = spawn(command, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    proc.on('close', (code) => {
      resolve({ code: code ?? 1, stderr });
    });
    proc.on('error', () => {
      resolve({ code: 1, stderr: `${command} not found` });
    });
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const assetId = typeof body.assetId === 'string' ? body.assetId : '';
    const fps = Number.isFinite(body.fps) ? Math.max(4, Math.min(20, Number(body.fps))) : 8;
    const width = Number.isFinite(body.width) ? Math.max(320, Math.min(1280, Number(body.width))) : 900;

    if (!assetId) {
      return NextResponse.json({ error: 'assetId 不能为空' }, { status: 400 });
    }

    const sourceAsset = await prisma.asset.findUnique({ where: { id: assetId } });
    if (!sourceAsset) {
      return NextResponse.json({ error: '素材不存在' }, { status: 404 });
    }
    if (sourceAsset.type !== 'video') {
      return NextResponse.json({ error: '仅支持视频素材转 GIF' }, { status: 400 });
    }

    const ffmpegCheck = await runCommand('ffmpeg', ['-version']);
    if (ffmpegCheck.code !== 0) {
      return NextResponse.json(
        { error: '未检测到 ffmpeg，请先安装后再使用视频转 GIF。macOS 可执行: brew install ffmpeg' },
        { status: 400 }
      );
    }

    const srcPath = path.join(process.cwd(), 'public', sourceAsset.path.replace(/^\//, ''));
    if (!fs.existsSync(srcPath)) {
      return NextResponse.json({ error: '源视频文件不存在' }, { status: 404 });
    }

    const uploadDir = path.join(process.cwd(), 'public', 'uploads');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

    const baseName = sourceAsset.filename.replace(/\.[^.]+$/, '');
    const gifFilename = `${Date.now()}-${baseName}.gif`;
    const outputPath = path.join(uploadDir, gifFilename);

    const ffmpegArgs = [
      '-y',
      '-i', srcPath,
      '-vf', `fps=${fps},scale=${width}:-1:flags=lanczos`,
      '-loop', '0',
      outputPath,
    ];

    const ffmpegResult = await runCommand('ffmpeg', ffmpegArgs);
    if (ffmpegResult.code !== 0 || !fs.existsSync(outputPath)) {
      return NextResponse.json(
        { error: `GIF 转换失败: ${ffmpegResult.stderr || '未知错误'}` },
        { status: 500 }
      );
    }

    const stat = fs.statSync(outputPath);
    const gifAsset = await prisma.asset.create({
      data: {
        filename: gifFilename,
        path: `/uploads/${gifFilename}`,
        type: 'image',
        size: stat.size,
        projectId: sourceAsset.projectId || null,
        description: `由视频 ${sourceAsset.filename} 转换`,
      },
    });

    return NextResponse.json({ asset: gifAsset });
  } catch (error) {
    console.error('Failed to convert video to gif:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
