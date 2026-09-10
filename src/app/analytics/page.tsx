'use client';

import { useState, useEffect } from 'react';
import {
  BarChart3,
  FileText,
  CheckCircle,
  Clock,
  Activity,
  FolderKanban,
  Image,
  Loader2,
  Send,
} from 'lucide-react';

interface AnalyticsData {
  overview: {
    totalContent: number;
    draftCount: number;
    publishedCount: number;
    scheduledCount: number;
    totalAssets: number;
    totalProjects: number;
  };
  publishStats: {
    total: number;
    success: number;
    failed: number;
    successRate: number;
  };
  platformDistribution: Record<
    string,
    { total: number; success: number; failed: number }
  >;
  channelStats: Record<
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
  >;
  dailyTrend: Array<{
    date: string;
    total: number;
    published: number;
    draft: number;
  }>;
  recentLogs: Array<{
    id: string;
    action: string;
    result: string;
    createdAt: string;
  }>;
  recentPublished: Array<{
    id: string;
    title: string;
    publishedAt: string;
    platforms: string[];
  }>;
}

const PLATFORM_NAMES: Record<string, string> = {
  xiaohongshu: '小红书',
  wechat: '微信公众号',
  mowen: '墨问笔记',
  obsidian: 'Obsidian',
};

const CHANNEL_COLORS: Record<string, string> = {
  xiaohongshu: 'bg-rose-500',
  wechat: 'bg-emerald-500',
  mowen: 'bg-sky-500',
  obsidian: 'bg-slate-600',
};

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    try {
      const res = await fetch('/api/analytics');
      if (res.ok) {
        const result = await res.json();
        setData(result);
      }
    } catch (error) {
      console.error('Failed to fetch analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto theme-muted" />
          <p className="theme-muted mt-3">加载数据中...</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-12">
        <BarChart3 className="h-12 w-12 mx-auto mb-4 text-gray-300" />
        <p className="theme-muted">数据加载失败</p>
      </div>
    );
  }

  const maxTrend = Math.max(...data.dailyTrend.map((d) => d.total), 1);
  const hasTrendData = data.dailyTrend.some((d) => d.total > 0);
  const channelEntries = Object.entries(data.channelStats).sort(
    (a, b) => b[1].contentTotal - a[1].contentTotal
  );

  return (
    <div className="space-y-6">
      <div className="theme-panel p-6">
        <h1 className="page-title">数据看板</h1>
        <p className="page-subtitle">全面了解内容发布情况</p>
      </div>

      {/* Overview cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <OverviewCard
          label="内容总数"
          value={data.overview.totalContent}
          icon={FileText}
          color="blue"
        />
        <OverviewCard
          label="已发布"
          value={data.overview.publishedCount}
          icon={CheckCircle}
          color="green"
        />
        <OverviewCard
          label="草稿"
          value={data.overview.draftCount}
          icon={Clock}
          color="gray"
        />
        <OverviewCard
          label="待发布"
          value={data.overview.scheduledCount}
          icon={Send}
          color="indigo"
        />
        <OverviewCard
          label="素材"
          value={data.overview.totalAssets}
          icon={Image}
          color="purple"
        />
        <OverviewCard
          label="项目"
          value={data.overview.totalProjects}
          icon={FolderKanban}
          color="orange"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 30-day trend chart */}
        <div className="lg:col-span-2 theme-card p-6">
          <h2 className="text-lg font-semibold theme-title mb-4">
            近 30 天内容创作趋势
          </h2>
          {hasTrendData ? (
            <>
              <div className="h-48 flex items-end gap-[3px]">
                {data.dailyTrend.map((day) => {
                  const barHeightPx = maxTrend > 0
                    ? Math.max((day.total / maxTrend) * 180, 4)
                    : 4;
                  const date = new Date(day.date + 'T00:00:00');
                  const isToday = day.date === new Date().toISOString().split('T')[0];

                  return (
                    <div key={day.date} className="flex-1 flex flex-col items-center group relative">
                      {/* Tooltip */}
                      <div className="absolute bottom-full mb-2 hidden group-hover:block z-10">
                        <div className="bg-gray-800 text-white text-xs rounded-lg px-3 py-2 whitespace-nowrap shadow-lg">
                          <div className="font-medium">{date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}</div>
                          <div className="text-gray-300 mt-1">
                            总计: {day.total} | 发布: {day.published} | 草稿: {day.draft}
                          </div>
                        </div>
                      </div>

                      <div
                        className={`w-full rounded-t transition-all duration-300 ${isToday ? 'bg-blue-500' : day.total > 0 ? 'bg-blue-400/80' : 'bg-slate-200'
                          }`}
                        style={{ height: `${barHeightPx}px` }}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between mt-2 text-[10px] theme-muted">
                <span>{new Date(data.dailyTrend[0]?.date + 'T00:00:00').toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}</span>
                <span>今天</span>
              </div>
            </>
          ) : (
            <div className="h-48 flex flex-col items-center justify-center text-center">
              <p className="theme-muted text-sm">近 30 天暂无新建内容</p>
              <p className="theme-muted text-xs mt-1">创建内容后这里会显示每日创作趋势</p>
            </div>
          )}
        </div>

        {/* Publishing stats */}
        <div className="theme-card p-6">
          <h2 className="text-lg font-semibold theme-title mb-4">发布统计</h2>

          {data.publishStats.total > 0 ? (
            <div className="space-y-5">
              {/* Success rate ring */}
              <div className="flex items-center justify-center">
                <div className="relative w-32 h-32">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
                    <circle cx="60" cy="60" r="50" fill="none" stroke="#f3f4f6" strokeWidth="10" />
                    <circle
                      cx="60"
                      cy="60"
                      r="50"
                      fill="none"
                      stroke={data.publishStats.successRate >= 80 ? '#22c55e' : data.publishStats.successRate >= 50 ? '#eab308' : '#ef4444'}
                      strokeWidth="10"
                      strokeLinecap="round"
                      strokeDasharray={`${data.publishStats.successRate * 3.14} ${314 - data.publishStats.successRate * 3.14}`}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="page-title">
                      {data.publishStats.successRate}%
                    </span>
                    <span className="text-xs theme-muted">成功率</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="text-center">
                  <div className="text-lg font-bold theme-title">{data.publishStats.total}</div>
                  <div className="text-xs theme-muted">总发布</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-green-600">{data.publishStats.success}</div>
                  <div className="text-xs theme-muted">成功</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-red-600">{data.publishStats.failed}</div>
                  <div className="text-xs theme-muted">失败</div>
                </div>
              </div>

              {/* Platform breakdown */}
              {Object.keys(data.platformDistribution).length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <h4 className="text-sm font-medium text-gray-700 mb-3">平台分布</h4>
                  <div className="space-y-2">
                    {Object.entries(data.platformDistribution).map(([platform, stats]) => (
                      <div key={platform} className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">
                          {PLATFORM_NAMES[platform] || platform}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-green-600">{stats.success} 成功</span>
                          {stats.failed > 0 && (
                            <span className="text-xs text-red-500">{stats.failed} 失败</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8">
              <Send className="h-10 w-10 mx-auto mb-3 text-gray-300" />
              <p className="theme-muted text-sm">暂无发布记录</p>
              <p className="theme-muted text-xs mt-1">发布内容后将自动统计</p>
            </div>
          )}
        </div>
      </div>

      {/* Channel statistics */}
      <div className="theme-card p-6">
        <h2 className="text-lg font-semibold theme-title mb-4">发布渠道统计</h2>
        {channelEntries.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {channelEntries.map(([platform, stats]) => {
              const totalByStatus = Math.max(stats.contentTotal, 1);
              return (
                <div
                  key={platform}
                  className="rounded-xl border p-4"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-full ${CHANNEL_COLORS[platform] || 'bg-slate-400'}`} />
                      <h3 className="font-semibold theme-title text-sm">
                        {PLATFORM_NAMES[platform] || platform}
                      </h3>
                    </div>
                    <span className="text-xs theme-muted">内容 {stats.contentTotal}</span>
                  </div>

                  <div className="mt-3 h-2.5 rounded-full overflow-hidden flex bg-slate-100">
                    {stats.publishedContent > 0 && (
                      <div
                        className="bg-green-500"
                        style={{ width: `${(stats.publishedContent / totalByStatus) * 100}%` }}
                      />
                    )}
                    {stats.scheduledContent > 0 && (
                      <div
                        className="bg-blue-500"
                        style={{ width: `${(stats.scheduledContent / totalByStatus) * 100}%` }}
                      />
                    )}
                    {stats.draftContent > 0 && (
                      <div
                        className="bg-gray-300"
                        style={{ width: `${(stats.draftContent / totalByStatus) * 100}%` }}
                      />
                    )}
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-xs theme-muted">已发布</p>
                      <p className="text-sm font-semibold text-green-600">{stats.publishedContent}</p>
                    </div>
                    <div>
                      <p className="text-xs theme-muted">待发布</p>
                      <p className="text-sm font-semibold text-blue-600">{stats.scheduledContent}</p>
                    </div>
                    <div>
                      <p className="text-xs theme-muted">草稿</p>
                      <p className="text-sm font-semibold text-slate-600">{stats.draftContent}</p>
                    </div>
                  </div>

                  <div className="mt-3 pt-3 border-t flex items-center justify-between text-xs" style={{ borderColor: 'var(--border)' }}>
                    <span className="theme-muted">
                      发布记录 {stats.publishSuccess}/{stats.publishTotal}
                    </span>
                    <span className={`font-semibold ${stats.publishSuccessRate >= 80 ? 'text-green-600' : stats.publishSuccessRate >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>
                      成功率 {stats.publishSuccessRate}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8">
            <Send className="h-10 w-10 mx-auto mb-3 text-gray-300" />
            <p className="theme-muted text-sm">暂无渠道统计数据</p>
            <p className="theme-muted text-xs mt-1">请先给内容设置发布平台</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent published content */}
        <div className="theme-card p-6">
          <h2 className="text-lg font-semibold theme-title mb-4">最近发布</h2>
          {data.recentPublished.length > 0 ? (
            <div className="space-y-3">
              {data.recentPublished.map((content) => (
                <a
                  key={content.id}
                  href={`/content/${content.id}`}
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-sky-50/70 dark:hover:bg-slate-800/60 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium theme-title truncate">
                      {content.title || '无标题'}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      {content.platforms.map((p: string) => (
                        <span
                          key={p}
                          className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded"
                        >
                          {PLATFORM_NAMES[p] || p}
                        </span>
                      ))}
                    </div>
                  </div>
                  <span className="text-xs theme-muted flex-shrink-0 ml-3">
                    {content.publishedAt
                      ? new Date(content.publishedAt).toLocaleDateString('zh-CN')
                      : '-'}
                  </span>
                </a>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <FileText className="h-10 w-10 mx-auto mb-3 text-gray-300" />
              <p className="theme-muted text-sm">暂无已发布内容</p>
            </div>
          )}
        </div>

        {/* Recent activity log */}
        <div className="theme-card p-6">
          <h2 className="text-lg font-semibold theme-title mb-4">操作日志</h2>
          {data.recentLogs.length > 0 ? (
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {data.recentLogs.map((log) => (
                <div key={log.id} className="flex items-start gap-3 p-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-2 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm theme-title">{log.action}</p>
                    <p className="text-xs theme-muted mt-0.5 truncate">{log.result}</p>
                    <p className="text-[10px] theme-muted mt-0.5">
                      {new Date(log.createdAt).toLocaleString('zh-CN')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <Activity className="h-10 w-10 mx-auto mb-3 text-gray-300" />
              <p className="theme-muted text-sm">暂无操作日志</p>
            </div>
          )}
        </div>
      </div>

      {/* Content status distribution */}
      <div className="theme-card p-6">
        <h2 className="text-lg font-semibold theme-title mb-4">内容状态分布</h2>
        {data.overview.totalContent > 0 ? (
          <div>
            {/* Status bar */}
            <div className="h-8 rounded-full overflow-hidden flex mb-4">
              {data.overview.publishedCount > 0 && (
                <div
                  className="bg-green-500 transition-all flex items-center justify-center"
                  style={{ width: `${(data.overview.publishedCount / data.overview.totalContent) * 100}%` }}
                >
                  {data.overview.publishedCount > 0 && (
                    <span className="text-white text-xs font-medium px-2">{data.overview.publishedCount}</span>
                  )}
                </div>
              )}
              {data.overview.scheduledCount > 0 && (
                <div
                  className="bg-blue-500 transition-all flex items-center justify-center"
                  style={{ width: `${(data.overview.scheduledCount / data.overview.totalContent) * 100}%` }}
                >
                  {data.overview.scheduledCount > 0 && (
                    <span className="text-white text-xs font-medium px-2">{data.overview.scheduledCount}</span>
                  )}
                </div>
              )}
              {data.overview.draftCount > 0 && (
                <div
                  className="bg-gray-300 transition-all flex items-center justify-center"
                  style={{ width: `${(data.overview.draftCount / data.overview.totalContent) * 100}%` }}
                >
                  {data.overview.draftCount > 0 && (
                    <span className="text-gray-700 text-xs font-medium px-2">{data.overview.draftCount}</span>
                  )}
                </div>
              )}
            </div>
            {/* Legend */}
            <div className="flex items-center gap-6 justify-center">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-500" />
                <span className="text-sm text-gray-600">已发布 ({data.overview.publishedCount})</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-blue-500" />
                <span className="text-sm text-gray-600">待发布 ({data.overview.scheduledCount})</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-gray-300" />
                <span className="text-sm text-gray-600">草稿 ({data.overview.draftCount})</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-8">
            <BarChart3 className="h-10 w-10 mx-auto mb-3 text-gray-300" />
            <p className="theme-muted text-sm">暂无数据</p>
          </div>
        )}
      </div>
    </div>
  );
}

// Helper component
function OverviewCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  color: string;
}) {
  const colorMap: Record<string, { bg: string; icon: string }> = {
    blue: { bg: 'bg-blue-100', icon: 'text-blue-600' },
    green: { bg: 'bg-green-100', icon: 'text-green-600' },
    gray: { bg: 'bg-gray-100', icon: 'text-gray-600' },
    indigo: { bg: 'bg-indigo-100', icon: 'text-indigo-600' },
    purple: { bg: 'bg-purple-100', icon: 'text-purple-600' },
    orange: { bg: 'bg-orange-100', icon: 'text-orange-600' },
  };

  const colors = colorMap[color] || colorMap.blue;

  return (
    <div className="theme-card p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium theme-muted">{label}</p>
          <p className="text-2xl font-bold theme-title mt-1">{value}</p>
        </div>
        <div className={`p-2.5 ${colors.bg} rounded-lg`}>
          <Icon className={`h-5 w-5 ${colors.icon}`} />
        </div>
      </div>
    </div>
  );
}
