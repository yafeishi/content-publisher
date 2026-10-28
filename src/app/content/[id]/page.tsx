'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  ArrowLeft,
  Save,
  Send,
  Loader2,
  Wand2,
  Sparkles,
  Eye,
  Trash2,
  Image as ImageIcon,
} from 'lucide-react';
import AiImageInsertDialog from '@/components/AiImageInsertDialog';
import PolishCompareDialog from '@/components/PolishCompareDialog';
import RichTextEditor from '@/components/RichTextEditor';
import ImageManager from '@/components/ImageManager';
import ContentPreviewModal from '@/components/ContentPreviewModal';
import { useDialog } from '@/components/ui/dialog-center';
import PublishingPlatformPicker, { type PlatformHealthResult } from '@/components/PublishingPlatformPicker';
import PublishDistributionCard, { type PublishRecordItem } from '@/components/PublishDistributionCard';
import { homepageBlockReason, parseBlockTagList } from '@/lib/homepage-note';
import type { LayoutTemplate } from '@/lib/layout-template-types';
import { platformLabel, PUBLISHING_PLATFORM_IDS } from '@/lib/publishing-platforms';
import type { AppSettings } from '@/lib/settings-schema';

interface Content {
  id: string;
  title: string;
  body: string;
  status: string;
  projectId: string | null;
  platforms: string;
  images: string;
  coverImage: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  tags?: string;
}

interface ProjectOption {
  id: string;
  name: string;
}

interface LogItem {
  id: string;
  action: string;
  result: string;
  createdAt: string;
}

interface PolishCompareCandidate {
  title: string;
  body: string;
  provider: string;
  stylePreset: AppSettings['writingStylePreset'];
  styleLabel: string;
}

type TiptapInsertImageFn = (src: string, alt?: string) => void;

const isVideoPath = (assetPath: string) => /\.(mp4|mov|webm|m4v|avi)$/i.test(assetPath);
const isImagePath = (assetPath: string) => !isVideoPath(assetPath);

const WRITING_STYLE_OPTIONS: Array<{ value: AppSettings['writingStylePreset']; label: string }> = [
  { value: 'professional-review', label: '专业复盘' },
  { value: 'friend-chat', label: '朋友聊天' },
  { value: 'calm-analysis', label: '冷静分析' },
  { value: 'practical-tutorial', label: '实战教程' },
  { value: 'storytelling', label: '故事叙事' },
];

const buildAiImagePromptSeed = (title: string, body: string) => {
  const selectedText = typeof window !== 'undefined'
    ? (window.getSelection?.()?.toString().trim() || '')
    : '';
  if (selectedText) return selectedText.slice(0, 180);

  const plainBody = body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (title.trim() && plainBody) return `${title.trim()}：${plainBody.slice(0, 120)}`;
  return title.trim() || plainBody.slice(0, 180);
};

export default function ContentDetail() {
  const router = useRouter();
  const params = useParams();
  const [content, setContent] = useState<Content | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isFormatting, setIsFormatting] = useState(false);
  const [isPolishing, setIsPolishing] = useState(false);
  const [isComparingPolish, setIsComparingPolish] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [coverImage, setCoverImage] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showAiImageDialog, setShowAiImageDialog] = useState(false);
  const [aiImagePromptSeed, setAiImagePromptSeed] = useState('');
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [publishRecords, setPublishRecords] = useState<PublishRecordItem[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [homepageGuard, setHomepageGuard] = useState({ blockParenting: true, blockTags: '育儿,党哥育儿,parenting,亲子' });
  const [isTestingPlatforms, setIsTestingPlatforms] = useState(false);
  const [platformHealth, setPlatformHealth] = useState<Record<string, PlatformHealthResult>>({});
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [projectId, setProjectId] = useState('');
  const [templates, setTemplates] = useState<LayoutTemplate[]>([]);
  const [selectedLayoutTemplateId, setSelectedLayoutTemplateId] = useState('standard');
  const [selectedWritingStyle, setSelectedWritingStyle] = useState<AppSettings['writingStylePreset']>('professional-review');
  const [showPolishCompare, setShowPolishCompare] = useState(false);
  const [polishCompareCandidates, setPolishCompareCandidates] = useState<PolishCompareCandidate[]>([]);
  const [baseTags, setBaseTags] = useState<string[]>([]);
  const { notify, confirm } = useDialog();

  // Title character limit
  const titleLimit = platforms.includes('xiaohongshu') ? 20 : 64;
  const titleOverLimit = title.length > titleLimit;
  const selectedImageCount = selectedImages.filter(isImagePath).length;
  const hasCoverImage = Boolean(coverImage && isImagePath(coverImage));
  const xiaohongshuImageCount = selectedImageCount + (hasCoverImage && !selectedImages.includes(coverImage as string) ? 1 : 0);

  const homepageNotice = platforms.includes('homepage')
    ? homepageBlockReason({
      title,
      tags: baseTags,
      enabled: homepageGuard.blockParenting,
      blockTags: parseBlockTagList(homepageGuard.blockTags),
    })
    : null;

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const response = await fetch('/api/projects');
        if (!response.ok) return;
        const data = (await response.json()) as ProjectOption[];
        setProjects((data || []).map((p) => ({ id: p.id, name: p.name })));
      } catch (error) {
        console.error('Failed to load projects:', error);
      }
    };
    fetchProjects();
  }, []);

  useEffect(() => {
    const loadTemplateContext = async () => {
      try {
        const [settingsResp, templatesResp] = await Promise.all([
          fetch('/api/settings'),
          fetch('/api/templates'),
        ]);
        if (settingsResp.ok) {
          const settings = await settingsResp.json() as Pick<AppSettings, 'defaultLayoutTemplateId' | 'writingStylePreset' | 'homepageBlockParenting' | 'homepageBlockTags'>;
          if (settings.defaultLayoutTemplateId) {
            setSelectedLayoutTemplateId(settings.defaultLayoutTemplateId);
          }
          if (settings.writingStylePreset) {
            setSelectedWritingStyle(settings.writingStylePreset);
          }
          setHomepageGuard({
            blockParenting: settings.homepageBlockParenting !== false,
            blockTags: settings.homepageBlockTags || '育儿,党哥育儿,parenting,亲子',
          });
        }
        if (templatesResp.ok) {
          const data = await templatesResp.json() as { templates?: LayoutTemplate[] };
          setTemplates(Array.isArray(data.templates) ? data.templates : []);
        }
      } catch (error) {
        console.error('Failed to load template context:', error);
      }
    };
    loadTemplateContext();
  }, []);

  const buildContentTags = (templateId: string, previousTags: string[]) => {
    const tags = (previousTags || []).filter((item) => item && !item.startsWith('layout-template:'));
    if (templateId) tags.push(`layout-template:${templateId}`);
    return Array.from(new Set(tags));
  };

  const createClientLogId = () => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return `log_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  };

  const fetchContent = useCallback(async () => {
    try {
      const response = await fetch(`/api/content/${params.id}`);
      if (response.ok) {
        const data = await response.json();
        setContent(data);
        setTitle(data.title);
        setBody(data.body);
        setPlatforms(data.platforms ? JSON.parse(data.platforms) : []);
        setSelectedImages(data.images ? JSON.parse(data.images) : []);
        setCoverImage(data.coverImage || null);
        setProjectId(data.projectId || '');
        let safeTags: string[] = [];
        try {
          const parsedTags = data.tags ? JSON.parse(data.tags) : [];
          safeTags = Array.isArray(parsedTags) ? parsedTags.filter((item: unknown): item is string => typeof item === 'string') : [];
        } catch {
          safeTags = [];
        }
        setBaseTags(safeTags);
        const templateTag = safeTags.find((item) => item.startsWith('layout-template:'));
        if (templateTag) {
          const templateId = templateTag.replace('layout-template:', '').trim();
          if (templateId) setSelectedLayoutTemplateId(templateId);
        }
      }
    } catch (error) {
      console.error('Failed to fetch content:', error);
    } finally {
      setIsLoading(false);
    }
  }, [params.id]);

  const fetchLogs = useCallback(async () => {
    try {
      const response = await fetch(`/api/content/${params.id}/logs`);
      if (response.ok) {
        const data = await response.json();
        setLogs(data);
      }
    } catch (error) {
      console.error('Failed to fetch logs:', error);
    }
  }, [params.id]);

  const fetchPublishRecords = useCallback(async () => {
    if (!params.id) return;
    setRecordsLoading(true);
    try {
      const response = await fetch(`/api/content/${params.id}/publish-records`);
      if (!response.ok) return;
      const data = await response.json() as { records?: PublishRecordItem[] };
      setPublishRecords(Array.isArray(data.records) ? data.records : []);
    } catch (error) {
      console.error('Failed to fetch publish records:', error);
    } finally {
      setRecordsLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    if (params.id) {
      fetchContent();
      fetchLogs();
      fetchPublishRecords();
    }
  }, [params.id, fetchContent, fetchLogs, fetchPublishRecords]);

  const handleSave = async () => {
    return saveDraft(title, body);
  };

  const saveDraft = async (nextTitle: string, nextBody: string) => {
    setIsSaving(true);
    try {
      const response = await fetch(`/api/content/${params.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: nextTitle,
          body: nextBody,
          platforms: JSON.stringify(platforms),
          tags: JSON.stringify(buildContentTags(selectedLayoutTemplateId, baseTags)),
          images: JSON.stringify(selectedImages),
          coverImage,
          projectId: projectId || null,
        }),
      });

      if (response.ok) {
        setLogs((prev) => [
          ...prev,
          {
            id: createClientLogId(),
            action: '保存内容',
            result: '内容已保存',
            createdAt: new Date().toISOString(),
          },
        ]);
        return true;
      }
    } catch (error) {
      console.error('Failed to save:', error);
    } finally {
      setIsSaving(false);
    }
    return false;
  };

  const handlePublish = async () => {
    if (platforms.length === 0) {
      notify('请先选择发布平台', 'error');
      return;
    }

    if (platforms.includes('xiaohongshu') && xiaohongshuImageCount === 0) {
      notify('小红书发布需要至少 1 张图片', 'error');
      return;
    }

    // <-- Fix: Must save the current page state (especially selectedImages and formats) to DB BEFORE publishing
    await handleSave();

    setIsPublishing(true);

    setLogs((prev) => [
      ...prev,
      {
        id: createClientLogId(),
        action: '开始发布',
        result: `发布到: ${platforms.map((item) => platformLabel(item)).join(', ')}`,
        createdAt: new Date().toISOString(),
      },
    ]);

    try {
      const response = await fetch('/api/content/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contentId: params.id,
          platforms,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        const typedResults = data.results as Record<string, { success: boolean; message?: string; error?: string; warning?: string }>;
        const successes: string[] = [];
        const failures: string[] = [];
        const warnings: string[] = [];

        for (const [platform, result] of Object.entries(typedResults)) {
          const platformName = platformLabel(platform);
          if (result.success) {
            successes.push(result.message || `${platformName}: 发布成功`);
            if (result.warning) warnings.push(`${platformName}: ${result.warning}`);
          } else {
            failures.push(result.message || `${platformName}: ${result.error || '发布失败'}`);
          }

          setLogs((prev) => [
            ...prev,
            {
              id: createClientLogId(),
              action: `发布到 ${platform}`,
              result: result.message || (
                result.success
                  ? (result.warning ? `发布成功（${result.warning}）` : '发布成功')
                  : result.error || '发布失败'
              ),
              createdAt: new Date().toISOString(),
            },
          ]);
        }

        if (successes.length > 0 && failures.length === 0 && warnings.length === 0) {
          notify(`发布成功：${successes.join('；')}`, 'success');
        } else if (successes.length > 0) {
          notify(`部分成功：${successes.join('；')}`, 'info');
          if (warnings.length > 0) notify(`告警：${warnings.join('；')}`, 'info');
          if (failures.length > 0) notify(`失败：${failures.join('；')}`, 'error');
        } else {
          notify(`发布失败：${failures.join('；') || '未知错误'}`, 'error');
        }
      } else {
        notify(data.error || '发布失败', 'error');
      }
    } catch (error) {
      console.error('Failed to publish:', error);
      notify('发布失败', 'error');
    } finally {
      setIsPublishing(false);
      fetchPublishRecords();
    }
  };

  const handleTestPlatforms = async () => {
    setIsTestingPlatforms(true);
    try {
      const response = await fetch('/api/platforms/health', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platforms: PUBLISHING_PLATFORM_IDS,
        }),
      });
      const data = await response.json() as {
        ok: boolean;
        results?: Record<string, PlatformHealthResult>;
        error?: string;
      };
      if (!response.ok || !data.ok || !data.results) {
        notify(data.error || '平台检测失败', 'error');
        return;
      }
      setPlatformHealth(data.results);
      const failedCount = Object.values(data.results).filter((item) => item.status === 'failed').length;
      const warningCount = Object.values(data.results).filter((item) => item.status === 'warning').length;
      if (failedCount === 0 && warningCount === 0) {
        notify('平台检测完成：全部通过', 'success');
      } else if (failedCount === 0) {
        notify(`平台检测完成：${warningCount} 个告警`, 'info');
      } else {
        notify(`平台检测完成：${failedCount} 个失败，${warningCount} 个告警`, 'error');
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : '平台检测失败', 'error');
    } finally {
      setIsTestingPlatforms(false);
    }
  };

  const handleFormatBody = async () => {
    const raw = body.trim();
    if (!raw) {
      notify('正文为空，无法排版', 'error');
      return;
    }

    setIsFormatting(true);
    try {
      const response = await fetch('/api/content/format', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: raw, templateId: selectedLayoutTemplateId }),
      });

      const data = await response.json();
      if (!response.ok || typeof data?.formattedBody !== 'string') {
        notify(data?.error || '排版失败，请稍后重试', 'error');
        return;
      }

      setBody(data.formattedBody);
      setShowPreview(true);
      notify('排版完成，已打开预览', 'success');
    } catch (error) {
      console.error('Failed to format body:', error);
      notify('排版失败，请稍后重试', 'error');
    } finally {
      setIsFormatting(false);
    }
  };

  const handlePolishBody = async () => {
    const raw = body.trim();
    if (!raw) {
      notify('正文为空，无法润色', 'error');
      return;
    }
    setIsPolishing(true);
    try {
      const response = await fetch(`/api/content/${params.id}/polish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          body: raw,
          stylePreset: selectedWritingStyle,
        }),
      });
      const data = await response.json();
      if (!response.ok || typeof data?.body !== 'string') {
        notify(data?.error || '润色失败，请稍后重试', 'error');
        return;
      }
      setTitle(typeof data.title === 'string' ? data.title : title);
      setBody(data.body);
      notify(`润色完成（${data.provider || 'AI'}）`, 'success');
      setLogs((prev) => [
        ...prev,
        {
          id: createClientLogId(),
          action: '按风格润色',
          result: `已按「${WRITING_STYLE_OPTIONS.find((item) => item.value === selectedWritingStyle)?.label || selectedWritingStyle}」更新草稿`,
          createdAt: new Date().toISOString(),
        },
      ]);
    } catch (error) {
      console.error('Failed to polish body:', error);
      notify('润色失败，请稍后重试', 'error');
    } finally {
      setIsPolishing(false);
    }
  };

  const handleComparePolish = async () => {
    const raw = body.trim();
    if (!raw) {
      notify('正文为空，无法对比润色', 'error');
      return;
    }
    setShowPolishCompare(true);
    setIsComparingPolish(true);
    try {
      const orderedStyles = [
        selectedWritingStyle,
        ...WRITING_STYLE_OPTIONS.map((item) => item.value).filter((value) => value !== selectedWritingStyle),
      ];
      const response = await fetch(`/api/content/${params.id}/polish-compare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          body: raw,
          styles: orderedStyles,
        }),
      });
      const data = await response.json();
      if (!response.ok || !Array.isArray(data?.candidates)) {
        const firstFailure = Array.isArray(data?.failedStyles) && data.failedStyles.length > 0
          ? data.failedStyles[0]?.error
          : '';
        notify(firstFailure || data?.error || '对比润色失败，请稍后重试', 'error');
        setShowPolishCompare(false);
        return;
      }
      setPolishCompareCandidates(data.candidates);
      const failedCount = Array.isArray(data.failedStyles) ? data.failedStyles.length : 0;
      if (failedCount > 0) {
        notify(`已生成 ${data.candidates.length} 套候选，另有 ${failedCount} 套失败`, 'info');
      } else {
        notify(`已生成 ${data.candidates.length} 套润色候选`, 'success');
      }
    } catch (error) {
      console.error('Failed to compare polish body:', error);
      notify('对比润色失败，请稍后重试', 'error');
      setShowPolishCompare(false);
    } finally {
      setIsComparingPolish(false);
    }
  };

  const handleApplyPolishCandidate = async (candidate: PolishCompareCandidate) => {
    setTitle(candidate.title);
    setBody(candidate.body);
    const ok = await saveDraft(candidate.title, candidate.body);
    if (!ok) {
      notify('已应用到编辑区，但保存失败，请手动再保存一次', 'error');
      return;
    }
    setShowPolishCompare(false);
    setLogs((prev) => [
      ...prev,
      {
        id: createClientLogId(),
        action: '应用对比润色结果',
        result: `已应用「${candidate.styleLabel}」版本`,
        createdAt: new Date().toISOString(),
      },
    ]);
    notify(`已应用「${candidate.styleLabel}」版本`, 'success');
  };

  const handleDelete = async () => {
    const ok = await confirm({
      title: '删除内容',
      description: '删除后无法恢复，确定要删除这篇内容吗？',
      confirmText: '删除',
      danger: true,
    });
    if (!ok) return;
    try {
      await fetch(`/api/content/${params.id}`, { method: 'DELETE' });
      notify('内容已删除', 'success');
      router.push('/content');
    } catch (error) {
      console.error('Failed to delete:', error);
      notify('删除失败，请稍后重试', 'error');
    }
  };

  const togglePlatform = (platform: string) => {
    setPlatforms((prev) =>
      prev.includes(platform)
        ? prev.filter((p) => p !== platform)
        : [...prev, platform]
    );
  };

  const handleInsertImageToEditor = (path: string, filename: string) => {
    setSelectedImages((prev) => (prev.includes(path) ? prev : [...prev, path]));
    const insertImage = (window as unknown as { __tiptapInsertImage?: TiptapInsertImageFn }).__tiptapInsertImage;
    if (insertImage) {
      insertImage(path, filename);
    }
  };

  const handleOpenAiImageDialog = () => {
    setAiImagePromptSeed(buildAiImagePromptSeed(title, body));
    setShowAiImageDialog(true);
  };

  const handleSyncSavedAiAssets = (assets: Array<{ path: string }>) => {
    const nextPaths = assets.map((item) => item.path);
    if (nextPaths.length === 0) return;
    setSelectedImages((prev) => Array.from(new Set([...prev, ...nextPaths])));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="theme-muted h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!content) {
    return (
      <div className="text-center py-12">
        <p className="theme-muted">内容不存在</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="theme-panel flex items-center justify-between p-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="button-secondary rounded-lg p-2"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="page-title">编辑内容</h1>
            <p className="page-subtitle">
              状态:{' '}
              {content.status === 'published'
                ? '已发布'
                : content.status === 'scheduled'
                  ? '定时发布'
                  : '草稿'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={selectedLayoutTemplateId}
            onChange={(e) => setSelectedLayoutTemplateId(e.target.value)}
            className="theme-input rounded-xl px-3 py-2 text-sm"
          >
            {(templates.length > 0 ? templates : [{ id: 'standard', name: '标准蓝调' } as LayoutTemplate]).map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
          <button
            onClick={handleDelete}
            className="flex items-center gap-2 rounded-xl border border-red-200 px-4 py-2 text-red-600 transition-colors hover:bg-red-50"
          >
            <Trash2 className="h-4 w-4" />
            删除
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || isFormatting || isPolishing}
            className="button-secondary flex items-center gap-2 rounded-xl px-4 py-2 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {isSaving ? '保存中...' : '保存'}
          </button>
          <button
            onClick={handlePolishBody}
            disabled={isSaving || isPublishing || isFormatting || isPolishing || isComparingPolish || !body.trim()}
            className="button-secondary flex items-center gap-2 rounded-xl px-4 py-2 disabled:opacity-50"
          >
            {isPolishing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {isPolishing ? '润色中...' : '风格润色'}
          </button>
          <button
            onClick={handleComparePolish}
            disabled={isSaving || isPublishing || isFormatting || isPolishing || isComparingPolish || !body.trim()}
            className="button-secondary flex items-center gap-2 rounded-xl px-4 py-2 disabled:opacity-50"
          >
            {isComparingPolish ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {isComparingPolish ? '对比中...' : '对比润色'}
          </button>
          <button
            onClick={handleOpenAiImageDialog}
            disabled={isSaving || isPublishing || isFormatting || isPolishing || isComparingPolish}
            className="button-secondary flex items-center gap-2 rounded-xl px-4 py-2 disabled:opacity-50"
          >
            <ImageIcon className="h-4 w-4" />
            AI 配图
          </button>
          <button
            onClick={handleFormatBody}
            disabled={isSaving || isPublishing || isFormatting || isPolishing || isComparingPolish || !body.trim()}
            className="button-secondary flex items-center gap-2 rounded-xl px-4 py-2 disabled:opacity-50"
          >
            {isFormatting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Wand2 className="h-4 w-4" />
            )}
            {isFormatting ? '排版中...' : '一键排版'}
          </button>
          <button
            onClick={() => setShowPreview(true)}
            disabled={isFormatting || isPolishing || isComparingPolish || (!title && !body)}
            className="button-secondary flex items-center gap-2 rounded-xl px-4 py-2 disabled:opacity-50"
          >
            <Eye className="h-4 w-4" />
            预览
          </button>
          <button
            onClick={handlePublish}
            disabled={isPublishing || isFormatting || isPolishing || isComparingPolish || platforms.length === 0}
            className="button-primary flex items-center gap-2 rounded-xl px-4 py-2 disabled:opacity-50"
          >
            {isPublishing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            {isPublishing ? '发布中...' : '发布'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main editor */}
        <div className="lg:col-span-2 space-y-4">
          {/* Title */}
          <div className="theme-card p-5">
            <input
              type="text"
              placeholder="输入标题..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full border-none bg-transparent text-xl font-semibold focus:outline-none focus:ring-0 placeholder:text-slate-300"
            />
            <div className="mt-2 flex items-center border-t pt-2" style={{ borderColor: 'var(--border)' }}>
              <span
                className={`text-xs ${titleOverLimit ? 'text-red-600 font-medium' : 'theme-muted'
                  }`}
              >
                {title.length}/{titleLimit} 字
                {titleOverLimit && ' ⚠️ 超出限制'}
              </span>
            </div>
          </div>

          {/* Rich text editor */}
          <RichTextEditor
            content={body}
            onChange={setBody}
            platforms={platforms}
            onInsertImage={() => {
              const btn = document.querySelector('[data-image-picker-trigger]') as HTMLButtonElement;
              if (btn) btn.click();
            }}
          />
        </div>

        {/* Sidebar */}
        <div className="space-y-5">
          {/* Platform selection */}
          <div className="theme-card p-5">
            <h3 className="theme-title mb-4 font-semibold">写作风格</h3>
            <select
              value={selectedWritingStyle}
              onChange={(e) => setSelectedWritingStyle(e.target.value as AppSettings['writingStylePreset'])}
              className="theme-input w-full rounded-lg px-3 py-2 text-sm"
            >
              {WRITING_STYLE_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
            <p className="theme-muted mt-2 text-xs">
              点击顶部“风格润色”会直接按此风格重写当前草稿；“对比润色”会一次生成多套候选，供你挑选后再应用。
            </p>
          </div>

          <div className="theme-card p-5">
            <h3 className="theme-title mb-4 font-semibold">关联项目</h3>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="theme-input w-full rounded-lg px-3 py-2 text-sm"
            >
              <option value="">不关联项目</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>{project.name}</option>
              ))}
            </select>
          </div>

          <div className="theme-card p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="theme-title font-semibold">发布平台</h3>
              <button
                type="button"
                onClick={handleTestPlatforms}
                disabled={isTestingPlatforms}
                className="button-secondary rounded-lg px-3 py-1.5 text-xs disabled:opacity-60"
              >
                {isTestingPlatforms ? '检测中...' : '连通性测试'}
              </button>
            </div>
            <PublishingPlatformPicker
              platforms={platforms}
              onToggle={togglePlatform}
              health={platformHealth}
              notice={homepageNotice}
            />

            {platforms.includes('xiaohongshu') && xiaohongshuImageCount === 0 && (
              <div className="mt-3 p-2 bg-red-50 rounded-lg">
                <p className="text-xs text-red-600 font-medium">
                  ❗ 小红书发布需要至少 1 张图片
                </p>
              </div>
            )}
          </div>

          {/* Image Manager */}
          <ImageManager
            selectedImages={selectedImages}
            coverImage={coverImage}
            onImagesChange={setSelectedImages}
            onCoverChange={setCoverImage}
            onInsertToEditor={handleInsertImageToEditor}
            projectId={projectId || null}
          />

          <PublishDistributionCard records={publishRecords} loading={recordsLoading} />

          {/* Activity logs */}
          <div className="theme-card p-5">
            <h3 className="theme-title mb-4 font-semibold">操作日志</h3>
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {logs.length > 0 ? (
                logs
                  .slice()
                  .reverse()
                  .map((log) => (
                    <div key={log.id} className="rounded-lg p-3" style={{ background: 'var(--surface-soft)' }}>
                      <div className="theme-title text-sm font-medium">
                        {log.action}
                      </div>
                      <div className="theme-muted mt-1 text-xs">
                        {log.result}
                      </div>
                    </div>
                  ))
              ) : (
                <p className="theme-muted py-2 text-center text-sm">
                  暂无日志
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      <ContentPreviewModal
        open={showPreview}
        onClose={() => setShowPreview(false)}
        title={title}
        body={body}
        coverImage={coverImage}
        selectedImages={selectedImages}
        platforms={platforms}
      />

      <PolishCompareDialog
        open={showPolishCompare}
        loading={isComparingPolish}
        candidates={polishCompareCandidates}
        onClose={() => {
          if (isComparingPolish) return;
          setShowPolishCompare(false);
        }}
        onApply={handleApplyPolishCandidate}
      />

      <AiImageInsertDialog
        open={showAiImageDialog}
        defaultTopic={aiImagePromptSeed}
        projectId={projectId || null}
        onClose={() => setShowAiImageDialog(false)}
        onInsert={handleInsertImageToEditor}
        onSetCover={setCoverImage}
        onAssetsSaved={handleSyncSavedAiAssets}
      />
    </div>
  );
}
