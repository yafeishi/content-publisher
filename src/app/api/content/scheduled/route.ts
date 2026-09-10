import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// 定时发布检查 - 可以被定时任务调用或手动触发
export async function POST(request: NextRequest) {
  try {
    // 获取需要发布的定时内容
    const now = new Date();
    const scheduledContents = await prisma.content.findMany({
      where: {
        status: 'scheduled',
        scheduledAt: {
          lte: now, // 到期或过期的
        },
      },
    });

    if (scheduledContents.length === 0) {
      return NextResponse.json({
        message: '没有需要发布的定时内容',
        published: 0
      });
    }

    const results = [];

    for (const content of scheduledContents) {
      const platforms = JSON.parse(content.platforms || '[]');

      // 这里可以调用实际的发布接口
      // 目前标记为已发布
      await prisma.content.update({
        where: { id: content.id },
        data: {
          status: 'published',
          publishedAt: now,
        },
      });

      // 记录日志
      await prisma.log.create({
        data: {
          action: '定时发布',
          result: `《${content.title}》已发布到 ${platforms.join(', ')}`,
          contentId: content.id,
        },
      });

      results.push({
        id: content.id,
        title: content.title,
        platforms,
      });
    }

    return NextResponse.json({
      message: `成功发布 ${results.length} 篇定时内容`,
      published: results.length,
      results,
    });
  } catch (error) {
    console.error('定时发布失败:', error);
    return NextResponse.json({ error: '定时发布失败' }, { status: 500 });
  }
}

// 获取待发布的定时内容列表
export async function GET() {
  try {
    const scheduledContents = await prisma.content.findMany({
      where: {
        status: 'scheduled',
        scheduledAt: {
          not: null,
        },
      },
      orderBy: {
        scheduledAt: 'asc',
      },
      select: {
        id: true,
        title: true,
        scheduledAt: true,
        platforms: true,
      },
    });

    return NextResponse.json({
      scheduled: scheduledContents.map(c => ({
        ...c,
        platforms: JSON.parse(c.platforms || '[]'),
      }))
    });
  } catch (error) {
    console.error('获取定时内容失败:', error);
    return NextResponse.json({ error: '获取失败' }, { status: 500 });
  }
}
