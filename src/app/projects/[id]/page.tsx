'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Sparkles, FileText, Loader2, Folder, GitBranch, Image as ImageIcon, Video, Copy, Film } from 'lucide-react';
import { useDialog } from '@/components/ui/dialog-center';
import type { AppSettings } from '@/lib/settings-schema';

interface Project {
  id: string;
  name: string;
  description: string | null;
  path: string;
  type: string;
  scenario: string | null;
  needs: string | null;
  solution: string | null;
  highlights: string | null;
  outcomes: string | null;
  audience: string | null;
  stage: string | null;
  techStack: string;
  tags: string;
  createdAt: string;
}

interface Log {
  id: string;
  action: string;
  result: string;
  createdAt: string;
}

interface ProjectAsset {
  id: string;
  filename: string;
  path: string;
  type: string;
  size: number;
  projectId?: string | null;
}

interface SeriesPlanItem {
  day: number;
  title: string;
  angle: string;
  focus: string;
  hook: string;
  tags: string[];
  suggestedCta: string;
}

const contentAngles = [
  { id: 'scene', label: '场景问题定义', description: '为什么做这个项目、场景和问题是什么' },
  { id: 'solution', label: '方案实施详解', description: '如何落地、关键技术路径与过程' },
  { id: 'highlights', label: '亮点能力拆解', description: '项目中有价值的设计和工程亮点' },
  { id: 'results', label: '结果与价值展示', description: '效果、指标、收益与业务价值' },
  { id: 'review', label: '完整复盘总结', description: '从背景到结果的一篇完整复盘' },
];

const STAGE_OPTIONS = [
  { value: 'idea', label: '想法验证' },
  { value: 'building', label: '开发中' },
  { value: 'launched', label: '已上线' },
  { value: 'iterating', label: '持续迭代' },
];

const WRITING_STYLE_OPTIONS: Array<{ value: AppSettings['writingStylePreset']; label: string }> = [
  { value: 'professional-review', label: '专业复盘' },
  { value: 'friend-chat', label: '朋友聊天' },
  { value: 'calm-analysis', label: '冷静分析' },
  { value: 'practical-tutorial', label: '实战教程' },
  { value: 'storytelling', label: '故事叙事' },
];

function formatDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getDefaultSeriesStartDate(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(0, 0, 0, 0);
  return formatDateInputValue(date);
}

function buildSeriesScheduledAt(startDate: string, publishTime: string, dayOffset: number): string | null {
  const [year, month, day] = startDate.split('-').map((part) => Number(part));
  const [hour, minute] = publishTime.split(':').map((part) => Number(part));

  if (!year || !month || !day) return null;
  if (Number.isNaN(hour) || Number.isNaN(minute)) return null;

  const date = new Date(year, month - 1, day + dayOffset, hour, minute, 0, 0);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export default function ProjectDetail() {
  const router = useRouter();
  const params = useParams();
  const [project, setProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedAngle, setSelectedAngle] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedContent, setGeneratedContent] = useState('');
  const [seriesDays, setSeriesDays] = useState(5);
  const [seriesStartDate, setSeriesStartDate] = useState(getDefaultSeriesStartDate());
  const [seriesPublishTime, setSeriesPublishTime] = useState('10:00');
  const [seriesSaveStatus, setSeriesSaveStatus] = useState<'draft' | 'scheduled'>('draft');
  const [seriesTitle, setSeriesTitle] = useState('');
  const [seriesSummary, setSeriesSummary] = useState('');
  const [seriesPlanItems, setSeriesPlanItems] = useState<SeriesPlanItem[]>([]);
  const [selectedWritingStyle, setSelectedWritingStyle] = useState<AppSettings['writingStylePreset']>('professional-review');
  const [isGeneratingSeriesPlan, setIsGeneratingSeriesPlan] = useState(false);
  const [isGeneratingSeriesContent, setIsGeneratingSeriesContent] = useState(false);
  const [logs, setLogs] = useState<Log[]>([]);
  const [scenario, setScenario] = useState('');
  const [needs, setNeeds] = useState('');
  const [solution, setSolution] = useState('');
  const [highlights, setHighlights] = useState('');
  const [outcomes, setOutcomes] = useState('');
  const [audience, setAudience] = useState('');
  const [stage, setStage] = useState<'idea' | 'building' | 'launched' | 'iterating'>('building');
  const [isSavingNarrative, setIsSavingNarrative] = useState(false);
  const [projectAssets, setProjectAssets] = useState<ProjectAsset[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const { notify } = useDialog();

  const fetchProject = useCallback(async () => {
    try {
      const response = await fetch(`/api/projects/${params.id}`);
      if (response.ok) {
        const data = await response.json();
        setProject(data);
        setScenario(data.scenario || '');
        setNeeds(data.needs || '');
        setSolution(data.solution || '');
        try {
          const highlightsList = JSON.parse(data.highlights || '[]');
          setHighlights(Array.isArray(highlightsList) ? highlightsList.join('\n') : '');
        } catch {
          setHighlights('');
        }
        setOutcomes(data.outcomes || '');
        setAudience(data.audience || '');
        setStage((data.stage || 'building') as 'idea' | 'building' | 'launched' | 'iterating');
      }
    } catch (error) {
      console.error('Failed to fetch project:', error);
    } finally {
      setIsLoading(false);
    }
  }, [params.id]);

  const fetchLogs = useCallback(async () => {
    try {
      const response = await fetch(`/api/projects/${params.id}/logs`);
      if (response.ok) {
        const data = await response.json();
        setLogs(data);
      }
    } catch (error) {
      console.error('Failed to fetch logs:', error);
    }
  }, [params.id]);

  useEffect(() => {
    fetchProject();
    fetchLogs();
  }, [fetchProject, fetchLogs]);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const response = await fetch('/api/settings');
        if (!response.ok) return;
        const data = (await response.json()) as Pick<AppSettings, 'writingStylePreset'>;
        if (data.writingStylePreset) {
          setSelectedWritingStyle(data.writingStylePreset);
        }
      } catch (error) {
        console.error('Failed to load style settings:', error);
      }
    };
    loadSettings();
  }, []);

  const fetchProjectAssets = useCallback(async () => {
    if (!params.id) return;
    setLoadingAssets(true);
    try {
      const response = await fetch(`/api/assets?projectId=${encodeURIComponent(String(params.id))}`);
      if (!response.ok) return;
      const data = await response.json();
      setProjectAssets(data.assets || []);
    } catch (error) {
      console.error('Failed to fetch project assets:', error);
    } finally {
      setLoadingAssets(false);
    }
  }, [params.id]);

  useEffect(() => {
    fetchProjectAssets();
  }, [fetchProjectAssets]);

  const handleGenerate = async () => {
    if (!selectedAngle || !project) return;

    setIsGenerating(true);
    setGeneratedContent('');

    const angle = contentAngles.find(a => a.id === selectedAngle);

    // Add start log
    const logId = `log_${Date.now()}`;
    setLogs(prev => [...prev, {
      id: logId,
      action: `开始分析项目: ${project.name}`,
      result: `选择角度: ${angle?.label}`,
      createdAt: new Date().toISOString()
    }]);

    try {
      const response = await fetch('/api/ai/generate-from-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: project.id,
          projectPath: project.path,
          projectName: project.name,
          projectDescription: project.description,
          scenario,
          needs,
          solution,
          highlights: highlights.split('\n').map(v => v.trim()).filter(Boolean),
          outcomes,
          audience,
          stage,
          angle: selectedAngle,
          angleLabel: angle?.label,
          stylePreset: selectedWritingStyle,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setGeneratedContent(data.content);

        // 自动保存为草稿
        const contentTitle = `${project.name} - ${angle?.label}`;
        try {
          const contentRes = await fetch('/api/content', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: contentTitle,
              body: data.content,
              status: 'draft',
              platforms: '[]',
              projectId: project.id,
            }),
          });

          if (contentRes.ok) {
            await contentRes.json();
            // Add success log with content preview
            const contentPreview = data.content.substring(0, 100).replace(/\n/g, ' ') + '...';
            setLogs(prev => [...prev, {
              id: `log_${Date.now()}`,
              action: `AI 生成完成`,
              result: `生成内容约 ${data.content.length} 字\n📝 已保存为草稿: ${contentTitle}\n📄 内容预览: ${contentPreview}`,
              createdAt: new Date().toISOString()
            }]);
          } else {
            throw new Error('Failed to save content');
          }
        } catch {
          // 即使保存失败，也显示生成成功
          setLogs(prev => [...prev, {
            id: `log_${Date.now()}`,
            action: `AI 生成完成`,
            result: `生成内容约 ${data.content.length} 字 (保存草稿失败，请手动创建)`,
            createdAt: new Date().toISOString()
          }]);
        }
      } else {
        const error = await response.json();
        setLogs(prev => [...prev, {
          id: `log_${Date.now()}`,
          action: `AI 生成失败`,
          result: error.error || '未知错误',
          createdAt: new Date().toISOString()
        }]);
      }
    } catch (error) {
      console.error('Failed to generate:', error);
      setLogs(prev => [...prev, {
        id: `log_${Date.now()}`,
        action: `AI 生成失败`,
        result: String(error),
        createdAt: new Date().toISOString()
      }]);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateSeriesPlan = async () => {
    if (!project) return;
    setIsGeneratingSeriesPlan(true);

    try {
      const response = await fetch('/api/ai/generate-series-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: project.id,
          projectPath: project.path,
          projectName: project.name,
          projectDescription: project.description,
          scenario,
          needs,
          solution,
          highlights: highlights.split('\n').map((value) => value.trim()).filter(Boolean),
          outcomes,
          audience,
          stage,
          days: seriesDays,
          stylePreset: selectedWritingStyle,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        notify(data.error || '生成连载规划失败', 'error');
        return;
      }

      const items = Array.isArray(data.items) ? data.items : [];
      const normalized: SeriesPlanItem[] = items.map((item: unknown, index: number) => {
        const typedItem = (item && typeof item === 'object' ? item : {}) as Partial<SeriesPlanItem>;
        return {
          day: index + 1,
          title: typedItem.title || `第 ${index + 1} 天`,
          angle: typedItem.angle || 'review',
          focus: typedItem.focus || '围绕项目重点展开。',
          hook: typedItem.hook || '',
          tags: Array.isArray(typedItem.tags) ? typedItem.tags.filter((tag): tag is string => typeof tag === 'string') : [],
          suggestedCta: typedItem.suggestedCta || '',
        };
      });

      setSeriesTitle(data.seriesTitle || `${project.name} 连载`);
      setSeriesSummary(data.summary || '');
      setSeriesPlanItems(normalized);
      notify(`已生成 ${normalized.length} 天连载规划`, 'success');
      await fetchLogs();
    } catch (error) {
      console.error('Failed to generate series plan:', error);
      notify('生成连载规划失败', 'error');
    } finally {
      setIsGeneratingSeriesPlan(false);
    }
  };

  const updateSeriesPlanItem = (index: number, patch: Partial<SeriesPlanItem>) => {
    setSeriesPlanItems((prev) => prev.map((item, currentIndex) => (
      currentIndex === index ? { ...item, ...patch } : item
    )));
  };

  const handleGenerateSeriesContent = async () => {
    if (!project || seriesPlanItems.length === 0) return;
    setIsGeneratingSeriesContent(true);

    const plannedItems = seriesPlanItems.map((item, index) => ({
      ...item,
      day: index + 1,
      scheduledAt: buildSeriesScheduledAt(seriesStartDate, seriesPublishTime, index),
    }));

    try {
      const response = await fetch('/api/ai/generate-series-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: project.id,
          projectPath: project.path,
          projectName: project.name,
          projectDescription: project.description,
          scenario,
          needs,
          solution,
          highlights: highlights.split('\n').map((value) => value.trim()).filter(Boolean),
          outcomes,
          audience,
          stage,
          seriesTitle: seriesTitle || `${project.name} 连载`,
          seriesSummary,
          planItems: plannedItems,
          saveStatus: seriesSaveStatus,
          platforms: [],
          stylePreset: selectedWritingStyle,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        notify(data.error || '批量生成连载内容失败', 'error');
        return;
      }

      const createdCount = Number(data.createdCount || 0);
      const failedCount = Number(data.failedCount || 0);
      if (failedCount > 0) {
        notify(`已生成 ${createdCount} 篇，失败 ${failedCount} 篇`, 'info');
      } else {
        notify(`连载生成完成，共 ${createdCount} 篇`, 'success');
      }
      await fetchLogs();
    } catch (error) {
      console.error('Failed to generate series content:', error);
      notify('批量生成连载内容失败', 'error');
    } finally {
      setIsGeneratingSeriesContent(false);
    }
  };

  const handleSaveNarrative = async () => {
    if (!project) return;
    setIsSavingNarrative(true);
    try {
      const response = await fetch(`/api/projects/${project.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenario,
          needs,
          solution,
          highlights: JSON.stringify(highlights.split('\n').map(v => v.trim()).filter(Boolean)),
          outcomes,
          audience,
          stage,
        }),
      });
      if (response.ok) {
        const updated = await response.json();
        setProject(updated);
        notify('项目叙事信息已保存', 'success');
      } else {
        notify('保存项目叙事信息失败', 'error');
      }
    } catch (error) {
      console.error('Failed to save project narrative:', error);
      notify('保存失败，请稍后重试', 'error');
    } finally {
      setIsSavingNarrative(false);
    }
  };

  const handleCreateContent = async () => {
    if (!generatedContent || !project) return;

    try {
      const response = await fetch('/api/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `${project.name} - ${contentAngles.find(a => a.id === selectedAngle)?.label}`,
          body: generatedContent,
          status: 'draft',
          platforms: '[]',
          projectId: project.id,
        }),
      });

      if (response.ok) {
        router.push('/content');
      }
    } catch (error) {
      console.error('Failed to create content:', error);
    }
  };

  const handleUploadProjectMedia = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0 || !project) return;
    setUploadingMedia(true);
    try {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('projectId', project.id);
        await fetch('/api/assets', {
          method: 'POST',
          body: formData,
        });
      }
      await fetchProjectAssets();
    } catch (error) {
      console.error('Failed to upload project media:', error);
      notify('上传素材失败', 'error');
    } finally {
      setUploadingMedia(false);
      event.target.value = '';
    }
  };

  const handleConvertToGif = async (assetId: string) => {
    setConvertingId(assetId);
    try {
      const response = await fetch('/api/assets/convert-gif', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetId }),
      });
      const data = await response.json();
      if (!response.ok) {
        notify(data.error || '转换失败', 'error');
      } else {
        notify('转换成功', 'success');
        await fetchProjectAssets();
      }
    } catch (error) {
      console.error('Failed to convert gif:', error);
      notify('转换失败', 'error');
    } finally {
      setConvertingId(null);
    }
  };

  const copyAssetPath = async (assetPath: string) => {
    try {
      await navigator.clipboard.writeText(assetPath);
      notify('素材路径已复制', 'success');
    } catch {
      notify('复制失败', 'error');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="theme-muted h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="text-center py-12">
        <p className="theme-muted">项目不存在</p>
      </div>
    );
  }

  let techStack: string[] = [];
  try {
    techStack = project.techStack ? JSON.parse(project.techStack) : [];
  } catch {
    techStack = [];
  }

  return (
    <div className="space-y-6">
      <div className="theme-panel flex items-center gap-4 p-6">
        <button
          onClick={() => router.back()}
          className="button-secondary rounded-lg p-2"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="page-title">{project.name}</h1>
          <p className="page-subtitle">{project.description || '暂无描述'}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* 项目信息 */}
          <div className="theme-card p-6">
            <h2 className="theme-title mb-4 font-semibold">项目信息</h2>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                {project.type === 'github' ? (
                  <GitBranch className="theme-muted h-4 w-4" />
                ) : (
                  <Folder className="theme-muted h-4 w-4" />
                )}
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{project.path}</span>
              </div>
              {techStack.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {techStack.map((tech: string, index: number) => (
                    <span key={index} className="tag-neutral rounded px-2 py-1 text-xs">
                      {tech}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="theme-card p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="theme-title font-semibold">项目叙事信息</h2>
              <button
                onClick={handleSaveNarrative}
                disabled={isSavingNarrative}
                className="button-primary rounded-lg px-3 py-1.5 text-sm disabled:opacity-50"
              >
                {isSavingNarrative ? '保存中...' : '保存信息'}
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>使用场景</label>
                <textarea
                  value={scenario}
                  onChange={(e) => setScenario(e.target.value)}
                  rows={2}
                  className="theme-input w-full resize-none rounded-lg px-3 py-2 text-sm"
                  placeholder="例如：面向内部运营团队的内容发布协作场景"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>解决需求/痛点</label>
                <textarea
                  value={needs}
                  onChange={(e) => setNeeds(e.target.value)}
                  rows={3}
                  className="theme-input w-full resize-none rounded-lg px-3 py-2 text-sm"
                  placeholder="例如：多平台发布流程分散、素材复用效率低、排期不可视化"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>方案与实施路径</label>
                <textarea
                  value={solution}
                  onChange={(e) => setSolution(e.target.value)}
                  rows={3}
                  className="theme-input w-full resize-none rounded-lg px-3 py-2 text-sm"
                  placeholder="例如：统一编辑器 + 素材库 + 多平台发布 API + 项目驱动内容生成"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>实施亮点（每行一条）</label>
                <textarea
                  value={highlights}
                  onChange={(e) => setHighlights(e.target.value)}
                  rows={4}
                  className="theme-input w-full resize-none rounded-lg px-3 py-2 text-sm"
                  placeholder={'例如：\n支持项目驱动一键生稿\n图片在发布链路自动同步\n发布日志可追踪到平台结果'}
                />
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>阶段性结果</label>
                  <textarea
                    value={outcomes}
                    onChange={(e) => setOutcomes(e.target.value)}
                    rows={3}
                    className="theme-input w-full resize-none rounded-lg px-3 py-2 text-sm"
                    placeholder="例如：发布时间缩短 50%，素材复用率提升 30%"
                  />
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>目标读者</label>
                    <input
                      value={audience}
                      onChange={(e) => setAudience(e.target.value)}
                      className="theme-input w-full rounded-lg px-3 py-2 text-sm"
                      placeholder="例如：前端团队 / 内容运营负责人"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>项目阶段</label>
                    <select
                      value={stage}
                      onChange={(e) => setStage(e.target.value as 'idea' | 'building' | 'launched' | 'iterating')}
                      className="theme-input w-full rounded-lg px-3 py-2 text-sm"
                    >
                      {STAGE_OPTIONS.map((item) => (
                        <option key={item.value} value={item.value}>{item.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* AI 生成内容 */}
          <div className="theme-card p-6">
            <h2 className="theme-title mb-4 font-semibold">AI 内容生成</h2>
            <div className="mb-4 rounded-lg border p-3 text-xs" style={{ borderColor: 'var(--border)', background: 'var(--surface-soft)' }}>
              <p className="theme-muted">
                若你要基于本项目继续写内容，可直接进入内容编辑页并自动关联本项目素材。
              </p>
              <button
                onClick={() => router.push(`/content/new?projectId=${project.id}`)}
                className="button-secondary mt-2 rounded px-3 py-1.5 text-xs"
              >
                新建关联内容
              </button>
            </div>

            <div className="mb-4">
              <label className="mb-2 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                写作风格
              </label>
              <select
                value={selectedWritingStyle}
                onChange={(event) => setSelectedWritingStyle(event.target.value as AppSettings['writingStylePreset'])}
                className="theme-input w-full rounded-lg px-3 py-2 text-sm"
              >
                {WRITING_STYLE_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            </div>

            <div className="mb-4">
              <label className="mb-2 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                选择内容角度
              </label>
              <div className="grid grid-cols-1 gap-2">
                {contentAngles.map((angle) => (
                  <button
                    key={angle.id}
                    onClick={() => setSelectedAngle(angle.id)}
                    className={`rounded-lg border p-3 text-left transition-colors ${
                      selectedAngle === angle.id
                        ? 'border-sky-300 bg-sky-50 text-sky-700'
                        : 'hover:bg-slate-50'
                    }`}
                    style={selectedAngle === angle.id ? undefined : { borderColor: 'var(--border)' }}
                  >
                    <div className="theme-title font-medium">{angle.label}</div>
                    <div className="theme-muted text-sm">{angle.description}</div>
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleGenerate}
              disabled={!selectedAngle || isGenerating}
              className="button-primary flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2 disabled:opacity-50"
            >
              {isGenerating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {isGenerating ? 'AI 正在分析项目...' : '开始生成内容'}
            </button>

            {generatedContent && (
              <div className="mt-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="theme-title font-medium">生成的内容</h3>
                  <button
                    onClick={handleCreateContent}
                    className="flex items-center gap-1 text-sm text-sky-600 hover:text-blue-700"
                  >
                    <FileText className="h-4 w-4" />
                    创建为内容
                  </button>
                </div>
                <div className="max-h-96 overflow-y-auto rounded-lg p-4 text-sm whitespace-pre-wrap" style={{ background: 'var(--surface-soft)', color: 'var(--text-secondary)' }}>
                  {generatedContent}
                </div>
              </div>
            )}

            <div className="mt-6 border-t pt-6" style={{ borderColor: 'var(--border)' }}>
              <div className="mb-3">
                <h3 className="theme-title font-medium">项目连载生成（3~5 天）</h3>
                <p className="theme-muted mt-1 text-xs">先生成连载大纲，再一键批量写入内容库。支持按天定时。</p>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div>
                  <label className="mb-1.5 block text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>连载天数</label>
                  <select
                    value={seriesDays}
                    onChange={(event) => setSeriesDays(Number(event.target.value))}
                    className="theme-input w-full rounded-lg px-3 py-2 text-sm"
                  >
                    <option value={3}>3 天</option>
                    <option value={4}>4 天</option>
                    <option value={5}>5 天</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>起始日期</label>
                  <input
                    type="date"
                    value={seriesStartDate}
                    onChange={(event) => setSeriesStartDate(event.target.value)}
                    className="theme-input w-full rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>每日发布时间</label>
                  <input
                    type="time"
                    value={seriesPublishTime}
                    onChange={(event) => setSeriesPublishTime(event.target.value)}
                    className="theme-input w-full rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>入库状态</label>
                  <select
                    value={seriesSaveStatus}
                    onChange={(event) => setSeriesSaveStatus(event.target.value as 'draft' | 'scheduled')}
                    className="theme-input w-full rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="draft">仅草稿</option>
                    <option value="scheduled">定时发布</option>
                  </select>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  onClick={handleGenerateSeriesPlan}
                  disabled={isGeneratingSeriesPlan}
                  className="button-secondary flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm disabled:opacity-50"
                >
                  {isGeneratingSeriesPlan ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {isGeneratingSeriesPlan ? '规划生成中...' : '生成连载规划'}
                </button>
                <button
                  onClick={handleGenerateSeriesContent}
                  disabled={isGeneratingSeriesContent || seriesPlanItems.length === 0}
                  className="button-primary flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm disabled:opacity-50"
                >
                  {isGeneratingSeriesContent ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                  {isGeneratingSeriesContent ? '批量生成中...' : '一键生成连载内容'}
                </button>
              </div>

              {seriesPlanItems.length > 0 && (
                <div className="mt-4 space-y-3">
                  <div className="rounded-lg border p-3" style={{ borderColor: 'var(--border)', background: 'var(--surface-soft)' }}>
                    <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>连载总标题</label>
                    <input
                      value={seriesTitle}
                      onChange={(event) => setSeriesTitle(event.target.value)}
                      className="theme-input w-full rounded-lg px-3 py-2 text-sm"
                      placeholder="输入连载总标题"
                    />
                    <label className="mb-1 mt-3 block text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>连载说明</label>
                    <textarea
                      value={seriesSummary}
                      onChange={(event) => setSeriesSummary(event.target.value)}
                      rows={2}
                      className="theme-input w-full resize-none rounded-lg px-3 py-2 text-sm"
                      placeholder="输入连载说明"
                    />
                  </div>

                  {seriesPlanItems.map((item, index) => {
                    const scheduledAt = buildSeriesScheduledAt(seriesStartDate, seriesPublishTime, index);
                    const scheduledText = scheduledAt ? new Date(scheduledAt).toLocaleString('zh-CN') : '未设置';

                    return (
                      <div key={`${item.day}-${index}`} className="rounded-lg border p-3" style={{ borderColor: 'var(--border)' }}>
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>Day {index + 1}</span>
                          <span className="theme-muted text-xs">{scheduledText}</span>
                        </div>
                        <div className="space-y-2">
                          <input
                            value={item.title}
                            onChange={(event) => updateSeriesPlanItem(index, { title: event.target.value })}
                            className="theme-input w-full rounded-lg px-3 py-2 text-sm"
                            placeholder="当天标题"
                          />
                          <textarea
                            value={item.focus}
                            onChange={(event) => updateSeriesPlanItem(index, { focus: event.target.value })}
                            rows={2}
                            className="theme-input w-full resize-none rounded-lg px-3 py-2 text-sm"
                            placeholder="当天重点"
                          />
                          <input
                            value={item.tags.join('，')}
                            onChange={(event) => updateSeriesPlanItem(index, {
                              tags: event.target.value.split(/[，,]/).map((tag) => tag.trim()).filter(Boolean),
                            })}
                            className="theme-input w-full rounded-lg px-3 py-2 text-sm"
                            placeholder="标签（逗号分隔）"
                          />
                          <input
                            value={item.hook}
                            onChange={(event) => updateSeriesPlanItem(index, { hook: event.target.value })}
                            className="theme-input w-full rounded-lg px-3 py-2 text-sm"
                            placeholder="下一篇预告"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="theme-card p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="theme-title font-semibold">截图与动图素材</h2>
              <label className="button-secondary cursor-pointer rounded-lg px-3 py-1.5 text-sm">
                {uploadingMedia ? '上传中...' : '上传截图/录屏'}
                <input
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  onChange={handleUploadProjectMedia}
                  className="hidden"
                  disabled={uploadingMedia}
                />
              </label>
            </div>
            <p className="theme-muted mb-4 text-xs">
              支持上传截图（PNG/JPG）和录屏（MP4/MOV/WebM）。录屏可一键转 GIF 用于文章展示。
            </p>

            {loadingAssets ? (
              <div className="theme-muted py-8 text-center text-sm">加载素材中...</div>
            ) : projectAssets.length === 0 ? (
              <div className="rounded-lg border border-dashed py-8 text-center" style={{ borderColor: 'var(--border)' }}>
                <ImageIcon className="mx-auto h-8 w-8 text-slate-300" />
                <p className="theme-muted mt-2 text-sm">还没有项目素材</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {projectAssets.map((asset) => (
                  <div key={asset.id} className="rounded-lg border p-3" style={{ borderColor: 'var(--border)' }}>
                    <div className="mb-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {asset.type === 'image' ? <ImageIcon className="h-4 w-4 text-sky-600" /> : <Video className="h-4 w-4 text-amber-600" />}
                        <span className="truncate text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>{asset.filename}</span>
                      </div>
                      <button
                        onClick={() => copyAssetPath(asset.path)}
                        className="button-secondary rounded px-2 py-1 text-xs"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {asset.type === 'image' ? (
                      <img src={asset.path} alt={asset.filename} className="h-32 w-full rounded object-cover" />
                    ) : (
                      <video src={asset.path} controls className="h-32 w-full rounded bg-black object-contain" />
                    )}
                    <div className="mt-2 flex items-center gap-2">
                      {asset.type === 'video' && (
                        <button
                          onClick={() => handleConvertToGif(asset.id)}
                          disabled={convertingId === asset.id}
                          className="button-secondary flex items-center gap-1 rounded px-2.5 py-1 text-xs disabled:opacity-50"
                        >
                          <Film className="h-3.5 w-3.5" />
                          {convertingId === asset.id ? '转换中...' : '转 GIF'}
                        </button>
                      )}
                      <span className="theme-muted text-[11px]">{asset.path}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 日志 */}
        <div className="theme-card p-6">
          <h2 className="theme-title mb-4 font-semibold">操作日志</h2>
          <div className="space-y-3 max-h-[500px] overflow-y-auto">
            {logs.length > 0 ? (
              logs.slice().reverse().map((log) => (
                <div key={log.id} className="rounded-lg p-3" style={{ background: 'var(--surface-soft)' }}>
                  <div className="theme-title text-sm font-medium">{log.action}</div>
                  <div className="theme-muted mt-1 text-xs whitespace-pre-wrap">{log.result}</div>
                  <div className="theme-muted mt-1 text-xs">
                    {new Date(log.createdAt).toLocaleString('zh-CN')}
                  </div>
                </div>
              ))
            ) : (
              <p className="theme-muted py-4 text-center text-sm">暂无日志</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
