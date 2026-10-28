'use client';

import { Suspense, useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Plus, Search, FileText, MoreVertical, Edit, Trash2, Play } from 'lucide-react';
import { useDialog } from '@/components/ui/dialog-center';
import { platformLabel } from '@/lib/publishing-platforms';

interface Content {
  id: string;
  title: string;
  status: string;
  body: string;
  scheduledAt: string | null;
  platforms: string;
  createdAt: string;
  updatedAt: string;
}

type StatusFilter = 'all' | 'draft_scheduled' | 'draft' | 'scheduled' | 'published';

const FILTER_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'draft_scheduled', label: '草稿+定时' },
  { value: 'draft', label: '草稿' },
  { value: 'scheduled', label: '定时发布' },
  { value: 'published', label: '已发布' },
];

interface PublishResultItem {
  success: boolean;
  error?: string;
  warning?: string;
}

const resolveFilterFromQuery = (statusParam: string | null): StatusFilter => {
  if (!statusParam) return 'all';
  if (statusParam === 'draft,scheduled' || statusParam === 'scheduled,draft') return 'draft_scheduled';
  if (statusParam === 'draft') return 'draft';
  if (statusParam === 'scheduled') return 'scheduled';
  if (statusParam === 'published') return 'published';
  return 'all';
};

const filterToStatusParam = (filter: StatusFilter): string | null => {
  if (filter === 'all') return null;
  if (filter === 'draft_scheduled') return 'draft,scheduled';
  return filter;
};

function ContentListView() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [contents, setContents] = useState<Content[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const menuContainerRef = useRef<HTMLDivElement | null>(null);
  const { confirm, notify } = useDialog();

  useEffect(() => {
    fetchContents();
  }, []);

  const selectedFilter = resolveFilterFromQuery(searchParams.get('status'));

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!menuContainerRef.current) return;
      if (!menuContainerRef.current.contains(event.target as Node)) {
        setOpenMenuId(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchContents = async () => {
    try {
      const response = await fetch('/api/content');
      if (response.ok) {
        const data = await response.json();
        setContents(data);
      }
    } catch (error) {
      console.error('Failed to fetch contents:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const statusFilteredContents = contents.filter((content) => {
    if (selectedFilter === 'all') return true;
    if (selectedFilter === 'draft_scheduled') return content.status === 'draft' || content.status === 'scheduled';
    return content.status === selectedFilter;
  });

  const filteredContents = statusFilteredContents.filter((content) =>
    (content.title || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'published':
        return <span className="tag-success px-2 py-1 text-xs font-medium rounded-full">已发布</span>;
      case 'scheduled':
        return <span className="tag-info px-2 py-1 text-xs font-medium rounded-full">定时发布</span>;
      default:
        return <span className="tag-neutral px-2 py-1 text-xs font-medium rounded-full">草稿</span>;
    }
  };

  const updateFilter = (filter: StatusFilter) => {
    const params = new URLSearchParams(searchParams.toString());
    const statusParam = filterToStatusParam(filter);
    if (statusParam) params.set('status', statusParam);
    else params.delete('status');
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  };

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: '删除内容',
      description: '删除后无法恢复，确定要删除这篇内容吗？',
      confirmText: '删除',
      danger: true,
    });
    if (!ok) return;
    try {
      const response = await fetch(`/api/content/${id}`, { method: 'DELETE' });
      if (response.ok) {
        setContents((prev) => prev.filter((item) => item.id !== id));
        notify('内容已删除', 'success');
      } else {
        notify('删除失败，请稍后重试', 'error');
      }
    } catch (error) {
      console.error('Failed to delete content:', error);
      notify('删除失败，请稍后重试', 'error');
    } finally {
      setOpenMenuId(null);
    }
  };

  const handlePublishNow = async (content: Content) => {
    try {
      let platforms: string[] = [];
      try {
        const parsed: unknown = JSON.parse(content.platforms || '[]');
        if (Array.isArray(parsed)) {
          platforms = parsed.filter((item): item is string => typeof item === 'string');
        }
      } catch {
        platforms = [];
      }

      if (platforms.length === 0) {
        notify('该内容未选择发布平台，请先编辑并选择平台', 'error');
        return;
      }

      const publishResp = await fetch('/api/content/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentId: content.id, platforms }),
      });
      const publishData = await publishResp.json();
      const results = (publishData?.results || {}) as Record<string, PublishResultItem>;

      if (publishResp.ok && publishData?.results) {
        const successes: string[] = [];
        const failures: string[] = [];
        const warnings: string[] = [];

        for (const [platform, result] of Object.entries(results)) {
          const name = platformLabel(platform);
          if (result.success) {
            successes.push(name);
            if (result.warning) warnings.push(`${name}: ${result.warning}`);
          } else {
            failures.push(`${name}: ${result.error || '失败'}`);
          }
        }

        if (successes.length > 0) {
          notify(`发布成功: ${successes.join(', ')}`, 'success');
          if (warnings.length > 0) notify(`告警: ${warnings.join('；')}`, 'info');
          if (failures.length > 0) notify(`失败: ${failures.join('；')}`, 'error');
        } else {
          notify(`发布失败: ${failures.join('；')}`, 'error');
        }
      } else {
        notify(`发布失败: ${publishData?.error || '未知错误'}`, 'error');
      }
      fetchContents();
    } catch (error) {
      console.error('Failed to publish:', error);
      notify('发布失败', 'error');
    } finally {
      setOpenMenuId(null);
    }
  };

  const counts = {
    all: contents.length,
    draft_scheduled: contents.filter((c) => c.status === 'draft' || c.status === 'scheduled').length,
    draft: contents.filter((c) => c.status === 'draft').length,
    scheduled: contents.filter((c) => c.status === 'scheduled').length,
    published: contents.filter((c) => c.status === 'published').length,
  };

  return (
    <div className="space-y-6">
      <div className="theme-panel flex items-center justify-between p-6">
        <div>
          <h1 className="page-title">内容管理</h1>
          <p className="page-subtitle">管理和创作你的内容</p>
        </div>
        <Link
          href="/content/new"
          className="button-primary flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium"
        >
          <Plus className="h-4 w-4" />
          新建内容
        </Link>
      </div>

      <div className="theme-card">
        <div className="border-b p-4" style={{ borderColor: 'var(--border)' }}>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {FILTER_OPTIONS.map((item) => {
              const isActive = selectedFilter === item.value;
              return (
                <button
                  key={item.value}
                  onClick={() => updateFilter(item.value)}
                  className={`rounded-full px-3 py-1.5 text-xs transition-colors ${isActive
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                >
                  {item.label} ({counts[item.value]})
                </button>
              );
            })}
          </div>
          <div className="relative max-w-md">
            <Search className="theme-muted absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" />
            <input
              type="text"
              placeholder="搜索内容..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="theme-input w-full rounded-xl py-2.5 pl-10 pr-4 text-sm"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="theme-muted py-12 text-center">加载中...</div>
        ) : filteredContents.length > 0 ? (
          <div style={{ borderColor: 'var(--border)' }}>
            {filteredContents.map((content) => (
              <div
                key={content.id}
                className="flex items-center justify-between p-4 transition-colors hover:bg-sky-50/60 dark:hover:bg-slate-800/50"
              >
                <Link href={`/content/${content.id}`} className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <FileText className="theme-muted h-5 w-5" />
                    <div>
                      <p className="theme-title truncate text-sm font-medium">
                        {content.title || '无标题'}
                      </p>
                      <p className="theme-muted mt-1 text-xs">
                        {content.status === 'scheduled' && content.scheduledAt
                          ? `计划发布于 ${new Date(content.scheduledAt).toLocaleString('zh-CN')}`
                          : `更新于 ${new Date(content.updatedAt).toLocaleDateString('zh-CN')}`}
                      </p>
                    </div>
                  </div>
                </Link>
                <div className="flex items-center gap-3">
                  {getStatusBadge(content.status)}
                  {content.status === 'scheduled' && (
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handlePublishNow(content);
                      }}
                      className="rounded-md px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30"
                    >
                      <span className="inline-flex items-center gap-1">
                        <Play className="h-3.5 w-3.5" />
                        立即发布
                      </span>
                    </button>
                  )}
                  <div className="relative" ref={openMenuId === content.id ? menuContainerRef : null}>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setOpenMenuId((prev) => (prev === content.id ? null : content.id));
                      }}
                      className="theme-muted rounded p-1 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
                      aria-label="更多操作"
                      title="更多操作"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </button>
                    {openMenuId === content.id && (
                      <div
                        className="absolute right-0 top-8 z-20 min-w-28 rounded-lg border bg-white p-1 shadow-lg dark:bg-slate-900"
                        style={{ borderColor: 'var(--border)' }}
                      >
                        <Link
                          href={`/content/${content.id}`}
                          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
                          onClick={() => setOpenMenuId(null)}
                        >
                          <Edit className="h-3.5 w-3.5" />
                          编辑
                        </Link>
                        {content.status === 'scheduled' && (
                          <button
                            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handlePublishNow(content);
                            }}
                          >
                            <Play className="h-3.5 w-3.5" />
                            立即发布
                          </button>
                        )}
                        <button
                          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleDelete(content.id);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          删除
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <FileText className="mx-auto mb-4 h-12 w-12 text-slate-300" />
            <p className="theme-muted mb-4">
              {searchQuery ? '没有匹配的内容' : '该筛选下暂无内容'}
            </p>
            <Link
              href="/content/new"
              className="button-primary inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium"
            >
              <Plus className="h-4 w-4" />
              创建第一篇内容
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ContentList() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-slate-500">正在加载内容列表…</div>}>
      <ContentListView />
    </Suspense>
  );
}
