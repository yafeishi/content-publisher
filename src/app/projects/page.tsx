'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Plus, Search, FolderKanban, GitBranch, Folder } from 'lucide-react';

interface Project {
  id: string;
  name: string;
  description: string | null;
  stage: string | null;
  path: string;
  type: string;
  techStack: string;
  tags: string;
  createdAt: string;
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      const response = await fetch('/api/projects');
      if (response.ok) {
        const data = await response.json();
        setProjects(data);
      }
    } catch (error) {
      console.error('Failed to fetch projects:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getTypeIcon = (type: string) => {
    return type === 'github' ? <GitBranch className="h-5 w-5" /> : <Folder className="h-5 w-5" />;
  };

  const getStageLabel = (stage: string | null) => {
    if (stage === 'idea') return '想法验证';
    if (stage === 'building') return '开发中';
    if (stage === 'launched') return '已上线';
    if (stage === 'iterating') return '持续迭代';
    return '未标注';
  };

  const filteredProjects = projects.filter((project) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      project.name.toLowerCase().includes(q) ||
      (project.description || '').toLowerCase().includes(q) ||
      project.path.toLowerCase().includes(q) ||
      getStageLabel(project.stage).toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <div className="theme-panel flex items-center justify-between p-6">
        <div>
          <h1 className="page-title">项目管理</h1>
          <p className="page-subtitle">管理你的项目，生成内容</p>
        </div>
        <Link
          href="/projects/new"
          className="button-primary flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium"
        >
          <Plus className="h-4 w-4" />
          添加项目
        </Link>
      </div>

      <div className="theme-card">
        <div className="border-b p-4" style={{ borderColor: 'var(--border)' }}>
          <div className="relative max-w-md">
            <Search className="theme-muted absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" />
            <input
              type="text"
              placeholder="搜索项目..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="theme-input w-full rounded-xl py-2.5 pl-10 pr-4 text-sm"
            />
          </div>
        </div>

        {!isLoading && filteredProjects.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
            {filteredProjects.map((project) => (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                className="rounded-xl border p-4 transition-colors hover:bg-sky-50/70 dark:hover:bg-slate-800/60"
                style={{ borderColor: 'var(--border)' }}
              >
                <div className="flex items-start gap-3">
                  <div className="tag-neutral rounded-lg p-2">
                    {getTypeIcon(project.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="theme-title truncate font-medium">{project.name}</h3>
                    <p className="theme-muted mt-1 line-clamp-2 text-sm">
                      {project.description || '暂无描述'}
                    </p>
                    <div className="flex items-center gap-2 mt-3">
                      <span className="theme-muted truncate text-xs">{project.path}</span>
                      <span className="tag-neutral rounded px-2 py-0.5 text-[10px]">{getStageLabel(project.stage)}</span>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : !isLoading ? (
          <div className="text-center py-12">
            <FolderKanban className="mx-auto mb-4 h-12 w-12 text-slate-300" />
            {projects.length > 0 ? (
              <p className="theme-muted mb-4">没有匹配当前搜索条件的项目</p>
            ) : (
              <>
                <p className="theme-muted mb-4">还没有添加任何项目</p>
                <Link
                  href="/projects/new"
                  className="button-primary inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium"
                >
                  <Plus className="h-4 w-4" />
                  添加第一个项目
                </Link>
              </>
            )}
          </div>
        ) : (
          <div className="theme-muted p-8 text-center">加载中...</div>
        )}
      </div>
    </div>
  );
}
