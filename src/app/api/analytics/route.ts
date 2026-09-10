import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET() {
    try {
        const parsePlatforms = (value: string): string[] => {
            try {
                const parsed: unknown = JSON.parse(value);
                if (!Array.isArray(parsed)) return [];
                return parsed.filter((item): item is string => typeof item === 'string' && item.length > 0);
            } catch {
                return [];
            }
        };

        // Content counts by status
        const [totalContent, draftCount, publishedCount, scheduledCount] = await Promise.all([
            prisma.content.count(),
            prisma.content.count({ where: { status: 'draft' } }),
            prisma.content.count({ where: { status: 'published' } }),
            prisma.content.count({ where: { status: 'scheduled' } }),
        ]);

        // Asset and project counts
        const [totalAssets, totalProjects] = await Promise.all([
            prisma.asset.count(),
            prisma.project.count(),
        ]);

        // Publish records stats
        const [totalPublishRecords, successRecords, failedRecords] = await Promise.all([
            prisma.publishRecord.count(),
            prisma.publishRecord.count({ where: { status: 'success' } }),
            prisma.publishRecord.count({ where: { status: 'failed' } }),
        ]);

        // Platform distribution from publish records + channel stats from content
        const [publishRecords, contentPlatformRows] = await Promise.all([
            prisma.publishRecord.findMany({
                select: { platform: true, status: true },
            }),
            prisma.content.findMany({
                select: { platforms: true, status: true },
            }),
        ]);

        const platformDistribution: Record<string, { total: number; success: number; failed: number }> = {};
        const channelStats: Record<
            string,
            {
                contentTotal: number;
                publishedContent: number;
                scheduledContent: number;
                draftContent: number;
                publishTotal: number;
                publishSuccess: number;
                publishFailed: number;
                publishSuccessRate: number;
            }
        > = {};

        for (const row of contentPlatformRows) {
            const platforms = parsePlatforms(row.platforms);
            for (const platform of platforms) {
                if (!channelStats[platform]) {
                    channelStats[platform] = {
                        contentTotal: 0,
                        publishedContent: 0,
                        scheduledContent: 0,
                        draftContent: 0,
                        publishTotal: 0,
                        publishSuccess: 0,
                        publishFailed: 0,
                        publishSuccessRate: 0,
                    };
                }
                channelStats[platform].contentTotal++;
                if (row.status === 'published') channelStats[platform].publishedContent++;
                else if (row.status === 'scheduled') channelStats[platform].scheduledContent++;
                else channelStats[platform].draftContent++;
            }
        }

        for (const record of publishRecords) {
            if (!platformDistribution[record.platform]) {
                platformDistribution[record.platform] = { total: 0, success: 0, failed: 0 };
            }
            platformDistribution[record.platform].total++;
            if (record.status === 'success') {
                platformDistribution[record.platform].success++;
            } else {
                platformDistribution[record.platform].failed++;
            }

            if (!channelStats[record.platform]) {
                channelStats[record.platform] = {
                    contentTotal: 0,
                    publishedContent: 0,
                    scheduledContent: 0,
                    draftContent: 0,
                    publishTotal: 0,
                    publishSuccess: 0,
                    publishFailed: 0,
                    publishSuccessRate: 0,
                };
            }
            channelStats[record.platform].publishTotal++;
            if (record.status === 'success') channelStats[record.platform].publishSuccess++;
            else channelStats[record.platform].publishFailed++;
        }

        for (const key of Object.keys(channelStats)) {
            const item = channelStats[key];
            item.publishSuccessRate = item.publishTotal > 0
                ? Math.round((item.publishSuccess / item.publishTotal) * 100)
                : 0;
        }

        // Content created per day for last 30 days
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const recentContent = await prisma.content.findMany({
            where: {
                createdAt: { gte: thirtyDaysAgo },
            },
            select: { createdAt: true, status: true },
            orderBy: { createdAt: 'asc' },
        });

        // Group by date
        const dailyTrend: Record<string, { total: number; published: number; draft: number }> = {};
        for (let i = 0; i < 30; i++) {
            const date = new Date();
            date.setDate(date.getDate() - (29 - i));
            const key = date.toISOString().split('T')[0];
            dailyTrend[key] = { total: 0, published: 0, draft: 0 };
        }
        for (const content of recentContent) {
            const key = content.createdAt.toISOString().split('T')[0];
            if (dailyTrend[key]) {
                dailyTrend[key].total++;
                if (content.status === 'published') {
                    dailyTrend[key].published++;
                } else {
                    dailyTrend[key].draft++;
                }
            }
        }

        // Recent logs
        const recentLogs = await prisma.log.findMany({
            orderBy: { createdAt: 'desc' },
            take: 20,
        });

        // Recently published content
        const recentPublished = await prisma.content.findMany({
            where: { status: 'published' },
            orderBy: { publishedAt: 'desc' },
            take: 10,
            select: {
                id: true,
                title: true,
                publishedAt: true,
                platforms: true,
            },
        });

        return NextResponse.json({
            overview: {
                totalContent,
                draftCount,
                publishedCount,
                scheduledCount,
                totalAssets,
                totalProjects,
            },
            publishStats: {
                total: totalPublishRecords,
                success: successRecords,
                failed: failedRecords,
                successRate: totalPublishRecords > 0
                    ? Math.round((successRecords / totalPublishRecords) * 100)
                    : 0,
            },
            platformDistribution,
            channelStats,
            dailyTrend: Object.entries(dailyTrend).map(([date, data]) => ({
                date,
                ...data,
            })),
            recentLogs,
            recentPublished: recentPublished.map((c) => ({
                ...c,
                platforms: (() => {
                    try { return JSON.parse(c.platforms); }
                    catch { return []; }
                })(),
            })),
        });
    } catch (error) {
        console.error('Failed to fetch analytics:', error);
        return NextResponse.json({ error: 'Failed to fetch analytics' }, { status: 500 });
    }
}
