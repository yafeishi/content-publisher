import Link from 'next/link';
import { ArrowRight, FileText, FolderKanban, Image, PenLine, TrendingUp } from 'lucide-react';
import prisma from '@/lib/prisma';
import AgentHandoffCard from '@/components/AgentHandoffCard';

async function getStats() {
  const contentCount = await prisma.content.count();
  const projectCount = await prisma.project.count();
  const assetCount = await prisma.asset.count();
  const publishedCount = await prisma.content.count({
    where: { status: 'published' }
  });

  return { contentCount, projectCount, assetCount, publishedCount };
}

async function getRecentContent() {
  return await prisma.content.findMany({
    orderBy: { updatedAt: 'desc' },
    take: 5,
  });
}

export default async function Dashboard() {
  const stats = await getStats();
  const recentContent = await getRecentContent();

  const statCards = [
    {
      title: '内容总数',
      value: stats.contentCount,
      icon: FileText,
      iconClass: 'from-sky-500 to-blue-600',
    },
    {
      title: '项目数',
      value: stats.projectCount,
      icon: FolderKanban,
      iconClass: 'from-emerald-500 to-teal-600',
    },
    {
      title: '素材数',
      value: stats.assetCount,
      icon: Image,
      iconClass: 'from-indigo-500 to-blue-600',
    },
    {
      title: '已发布',
      value: stats.publishedCount,
      icon: TrendingUp,
      iconClass: 'from-amber-500 to-orange-600',
    },
  ];

  return (
    <div className="space-y-6 md:space-y-7">
      {/* 欢迎区域 */}
      <div className="theme-panel flex flex-col items-start justify-between gap-4 p-6 md:flex-row md:items-center">
        <div>
          <h1 className="theme-title text-2xl font-semibold md:text-3xl">欢迎回来</h1>
          <p className="theme-muted mt-1">开始创作你的下一篇精彩内容</p>
        </div>
        <Link
          href="/content/new"
          className="button-primary inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium"
        >
          <PenLine className="h-4 w-4" />
          新建内容
        </Link>
      </div>

      <AgentHandoffCard />

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((stat) => (
          <div
            key={stat.title}
            className="theme-card p-6"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="theme-muted text-sm font-medium">{stat.title}</p>
                <p className="theme-title mt-2 text-3xl font-bold">{stat.value}</p>
              </div>
              <div className={`rounded-xl bg-gradient-to-br p-3 text-white shadow-lg ${stat.iconClass}`}>
                <stat.icon className="h-6 w-6 text-white" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 快捷操作和最近内容 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 快捷操作 */}
        <div className="theme-card p-6">
          <h2 className="theme-title mb-4 text-lg font-semibold">快捷操作</h2>
          <div className="grid grid-cols-2 gap-4">
            <Link
              href="/content/new"
              className="flex flex-col items-center gap-2 rounded-xl border p-4 transition-colors hover:bg-sky-50 dark:hover:bg-sky-900/20"
              style={{ borderColor: 'var(--border)' }}
            >
              <PenLine className="h-8 w-8 text-sky-600" />
              <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>新建内容</span>
            </Link>
            <Link
              href="/projects/new"
              className="flex flex-col items-center gap-2 rounded-xl border p-4 transition-colors hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
              style={{ borderColor: 'var(--border)' }}
            >
              <FolderKanban className="h-8 w-8 text-emerald-600" />
              <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>添加项目</span>
            </Link>
            <Link
              href="/assets"
              className="flex flex-col items-center gap-2 rounded-xl border p-4 transition-colors hover:bg-indigo-50 dark:hover:bg-indigo-900/20"
              style={{ borderColor: 'var(--border)' }}
            >
              <Image className="h-8 w-8 text-indigo-600" />
              <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>上传素材</span>
            </Link>
            <Link
              href="/analytics"
              className="flex flex-col items-center gap-2 rounded-xl border p-4 transition-colors hover:bg-amber-50 dark:hover:bg-amber-900/20"
              style={{ borderColor: 'var(--border)' }}
            >
              <TrendingUp className="h-8 w-8 text-amber-600" />
              <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>查看数据</span>
            </Link>
          </div>
        </div>

        {/* 最近内容 */}
        <div className="theme-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="theme-title text-lg font-semibold">最近内容</h2>
            <Link
              href="/content"
              className="flex items-center gap-1 text-sm font-medium text-sky-600 hover:text-blue-600"
            >
              查看全部
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          {recentContent.length > 0 ? (
            <div className="space-y-3">
              {recentContent.map((content) => (
                <Link
                  key={content.id}
                  href={`/content/${content.id}`}
                  className="flex items-center justify-between rounded-xl p-3 transition-colors hover:bg-sky-50/70 dark:hover:bg-slate-800/60"
                >
                  <div className="flex-1 min-w-0">
                    <p className="theme-title truncate text-sm font-medium">
                      {content.title || '无标题'}
                    </p>
                    <p className="theme-muted mt-1 text-xs">
                      {new Date(content.updatedAt).toLocaleDateString('zh-CN')}
                    </p>
                  </div>
                  <span
                    className={`px-2 py-1 text-xs font-medium rounded-full ${content.status === 'published'
                        ? 'bg-emerald-100 text-emerald-700'
                        : content.status === 'scheduled'
                          ? 'bg-sky-100 text-sky-700'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                  >
                    {content.status === 'published'
                      ? '已发布'
                      : content.status === 'scheduled'
                        ? '定时'
                        : '草稿'}
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="theme-muted py-8 text-center">
              <FileText className="mx-auto mb-3 h-12 w-12 text-slate-300" />
              <p>暂无内容</p>
              <Link
                href="/content/new"
                className="text-sm text-sky-600 hover:text-blue-600"
              >
                创建第一篇内容
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
