'use client';

import { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  Save,
  Send,
  Sparkles,
  FileText,
  Eye,
  Wand2,
  X,
  Loader2,
  Image as ImageIcon,
} from 'lucide-react';
import AiImageInsertDialog from '@/components/AiImageInsertDialog';
import RichTextEditor from '@/components/RichTextEditor';
import ImageManager from '@/components/ImageManager';
import ContentPreviewModal from '@/components/ContentPreviewModal';
import { useDialog } from '@/components/ui/dialog-center';
import PublishingPlatformPicker, { type PlatformHealthResult } from '@/components/PublishingPlatformPicker';
import { homepageBlockReason, parseBlockTagList } from '@/lib/homepage-note';
import type { LayoutTemplate } from '@/lib/layout-template-types';
import { platformLabel, PUBLISHING_PLATFORM_IDS } from '@/lib/publishing-platforms';
import type { AppSettings } from '@/lib/settings-schema';

interface ProjectOption {
  id: string;
  name: string;
}

interface AssetOption {
  id: string;
  path: string;
  filename: string;
  type: string;
}

interface PublishPlatformResult {
  success: boolean;
  message?: string;
  error?: string;
  warning?: string;
}

type TiptapInsertImageFn = (src: string, alt?: string) => void;

// Content templates
const TEMPLATES = [
  {
    id: 'tech-share',
    name: '技术分享',
    title: '【技术分享】{topic}',
    body: `<h2>背景</h2><p>{topic} 是一个非常重要的话题...</p><h2>核心内容</h2><h3>1. 第一点</h3><p>详细介绍...</p><h3>2. 第二点</h3><p>详细介绍...</p><h3>3. 第三点</h3><p>详细介绍...</p><h2>总结</h2><p>以上就是关于 {topic} 的分享，希望对大家有帮助！</p><p>#技术分享 #{topic}</p>`,
  },
  {
    id: 'tool-intro',
    name: '工具推荐',
    title: '姐妹们！这个工具真的太好用了',
    body: `<p>姐妹们！今天必须给你们安利一个我最近在用的神器 ✨</p><h2>为什么需要它？</h2><p>之前每次做某件事都要...真的很麻烦😫</p><h2>核心功能</h2><p><strong>功能1</strong>：xxx</p><p><strong>功能2</strong>：xxx</p><p><strong>功能3</strong>：xxx</p><h2>实际使用感受</h2><p>用了两周最大的感受是：效率提升太多了！💪</p><hr><p>你们有用过类似的工具吗？评论区聊聊呗～</p><p>#工具推荐 #效率神器</p>`,
  },
  {
    id: 'lesson-learned',
    name: '踩坑记录',
    title: '花了3天，我终于解决了这个问题！',
    body: `<p>今天来分享一个我的踩坑经历...😢</p><h2>遇到的问题</h2><p>这个问题折磨了我整整3天！</p><h2>尝试的错误方法</h2><p>❌ 方法1：xxx</p><p>❌ 方法2：xxx</p><p>❌ 方法3：xxx</p><h2>正确的解决方式</h2><p>后来终于找到了正确的方法！✅</p><h2>总结</h2><p>踩坑是成长的必经之路，希望我的经历能帮到你！</p><p>#踩坑记录 #经验分享 #避坑指南</p>`,
  },
  {
    id: 'xhs-lifestyle',
    name: '小红书日常',
    title: '今天又是充实的一天～✨',
    body: `<p>姐妹们！今天又是充实的一天～✨</p><h2>今日完成</h2><p>✅ 第一件事</p><p>✅ 第二件事</p><p>✅ 第三件事</p><h2>感悟</h2><p>今天最大的收获是...</p><h2>明天计划</h2><p>🔮 计划一</p><p>🔮 计划二</p><hr><p>你们今天过得怎么样？评论区聊聊呗～👇</p><p>#日常分享 #生活记录 #今日感悟</p>`,
  },
];

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

function NewContentForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [scheduledAt, setScheduledAt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [isFormatting, setIsFormatting] = useState(false);
  const [showAiImageDialog, setShowAiImageDialog] = useState(false);
  const [aiImagePromptSeed, setAiImagePromptSeed] = useState('');
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [templates, setTemplates] = useState<LayoutTemplate[]>([]);
  const [selectedLayoutTemplateId, setSelectedLayoutTemplateId] = useState('standard');
  const [selectedWritingStyle, setSelectedWritingStyle] = useState<AppSettings['writingStylePreset']>('professional-review');
  const [projectId, setProjectId] = useState<string>('');
  const [projectAssets, setProjectAssets] = useState<Array<Pick<AssetOption, 'id' | 'path' | 'filename'>>>([]);
  const [loadingProjectAssets, setLoadingProjectAssets] = useState(false);

  // Image management
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [coverImage, setCoverImage] = useState<string | null>(null);

  // Content stats
  const [stats, setStats] = useState({ characters: 0, words: 0 });

  // Auto-save
  const [contentId, setContentId] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  // Title character limits
  const titleLimit = platforms.includes('xiaohongshu') ? 20 : 64;
  const titleOverLimit = title.length > titleLimit;
  const titleWarning = title.length > titleLimit * 0.8;
  const selectedImageCount = selectedImages.filter(isImagePath).length;
  const hasCoverImage = Boolean(coverImage && isImagePath(coverImage));
  const xiaohongshuImageCount = selectedImageCount + (hasCoverImage && !selectedImages.includes(coverImage as string) ? 1 : 0);

  useEffect(() => {
    const queryProjectId = searchParams.get('projectId');
    if (queryProjectId) setProjectId(queryProjectId);
  }, [searchParams]);

  // Auto-save effect
  useEffect(() => {
    if (!contentId) return;
    const timer = setTimeout(async () => {
      if (title || body) {
        try {
          await fetch(`/api/content/${contentId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title,
              body,
              platforms: JSON.stringify(platforms),
              tags: JSON.stringify(buildContentTags(selectedLayoutTemplateId)),
              images: JSON.stringify(selectedImages),
              coverImage,
              projectId: projectId || null,
            }),
          });
          setLastSaved(new Date());
        } catch (error) {
          console.error('Auto-save failed:', error);
        }
      }
    }, 5000);
    return () => clearTimeout(timer);
  }, [title, body, contentId, platforms, selectedLayoutTemplateId, selectedImages, coverImage, projectId]);

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
    if (!projectId) {
      setProjectAssets([]);
      return;
    }
    const fetchProjectAssets = async () => {
      setLoadingProjectAssets(true);
      try {
        const response = await fetch(`/api/assets?projectId=${encodeURIComponent(projectId)}`);
        if (!response.ok) return;
        const data = (await response.json()) as { assets?: AssetOption[] };
        const images = (data.assets || []).filter((a) => a.type === 'image');
        setProjectAssets(images.map((a) => ({
          id: a.id,
          path: a.path,
          filename: a.filename,
        })));
      } catch (error) {
        console.error('Failed to load project assets:', error);
      } finally {
        setLoadingProjectAssets(false);
      }
    };
    fetchProjectAssets();
  }, [projectId]);

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

  const buildContentTags = (templateId: string) => (templateId ? [`layout-template:${templateId}`] : []);

  const [isPublishing, setIsPublishing] = useState(false);
  const [isTestingPlatforms, setIsTestingPlatforms] = useState(false);
  const [homepageGuard, setHomepageGuard] = useState({ blockParenting: true, blockTags: '育儿,党哥育儿,parenting,亲子' });
  const [platformHealth, setPlatformHealth] = useState<Record<string, PlatformHealthResult>>({});
  const { notify } = useDialog();

  const handleSave = async (publish: boolean = false) => {
    setIsSaving(true);
    try {
      if (publish && platforms.includes('xiaohongshu') && xiaohongshuImageCount === 0) {
        notify('小红书发布需要至少 1 张图片', 'error');
        return;
      }

      let status = 'draft';
      const publishedAt = null;
      let scheduledAtVal = null;

      if (publish && scheduledAt) {
        status = 'scheduled';
        scheduledAtVal = new Date(scheduledAt).toISOString();
      }
      // Don't set status to 'published' yet - let the publish API handle that

      // Save content to database first
      const saveMethod = contentId ? 'PUT' : 'POST';
      const saveUrl = contentId ? `/api/content/${contentId}` : '/api/content';
      const response = await fetch(saveUrl, {
        method: saveMethod,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          body,
          platforms: JSON.stringify(platforms),
          status,
          publishedAt,
          scheduledAt: scheduledAtVal,
          tags: JSON.stringify(buildContentTags(selectedLayoutTemplateId)),
          images: JSON.stringify(selectedImages),
          coverImage,
          projectId: projectId || null,
        }),
      });

      if (!response.ok) {
        notify('保存失败，请重试', 'error');
        return;
      }

      const data = await response.json();
      const savedId = data.id || contentId;
      if (!contentId && savedId) {
        setContentId(savedId);
      }
      setLastSaved(new Date());

      // If publishing, call the actual publish API
      if (publish && platforms.length > 0 && savedId) {
        setIsPublishing(true);
        try {
          const publishResp = await fetch('/api/content/publish', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contentId: savedId,
              platforms,
            }),
          });

          const publishData = await publishResp.json();

          if (publishResp.ok && publishData.results) {
            // Check results per platform
            const results = publishData.results;
            const successes: string[] = [];
            const failures: string[] = [];
            const warnings: string[] = [];

            for (const [platform, result] of Object.entries(results as Record<string, PublishPlatformResult>)) {
              const platformName = platformLabel(platform);
              if (result.success) {
                successes.push(result.message || `${platformName}: 发布成功`);
                if (result.warning) {
                  warnings.push(`${platformName}: ${result.warning}`);
                }
              } else {
                failures.push(result.message || `${platformName}: ${result.error || '发布失败'}`);
              }
            }

            if (successes.length > 0 && failures.length === 0 && warnings.length === 0) {
              notify(`发布成功：${successes.join('；')}`, 'success');
              router.push('/content');
            } else if (successes.length > 0 && (failures.length > 0 || warnings.length > 0)) {
              notify(`部分成功：${successes.join('；')}`, 'info');
              if (warnings.length > 0) notify(`告警：${warnings.join('；')}`, 'info');
              if (failures.length > 0) notify(`失败：${failures.join('；')}`, 'error');
              router.push('/content');
            } else {
              notify(`发布失败：${failures.join('；')}`, 'error');
            }
          } else {
            notify(`发布失败：${publishData.error || '未知错误'}`, 'error');
          }
        } catch (publishError) {
          console.error('Publish error:', publishError);
          notify('发布请求失败，请检查网络连接', 'error');
        } finally {
          setIsPublishing(false);
        }
      } else if (publish && platforms.length === 0) {
        notify('请选择至少一个发布平台', 'error');
      } else if (status === 'scheduled') {
        notify('内容已保存，将在设定时间自动发布', 'success');
        router.push('/content');
      }
    } catch (error) {
      console.error('Failed to save:', error);
      notify('保存失败，请重试', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAIGenerate = async () => {
    if (!title) return;
    setIsGenerating(true);
    try {
      const response = await fetch('/api/ai/generate-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: title,
          stylePreset: selectedWritingStyle,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        // Convert markdown to basic HTML if needed
        let htmlContent = data.content || '';
        if (!htmlContent.includes('<')) {
          htmlContent = htmlContent
            .split('\n')
            .map((line: string) => {
              if (line.startsWith('### ')) return `<h3>${line.slice(4)}</h3>`;
              if (line.startsWith('## ')) return `<h2>${line.slice(3)}</h2>`;
              if (line.startsWith('# ')) return `<h1>${line.slice(2)}</h1>`;
              if (line.startsWith('- ')) return `<li>${line.slice(2)}</li>`;
              if (line.trim() === '---') return '<hr>';
              if (line.trim() === '') return '';
              return `<p>${line}</p>`;
            })
            .join('');
        }
        setBody(htmlContent);
      }
    } catch (error) {
      console.error('Failed to generate:', error);
    } finally {
      setIsGenerating(false);
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

  const applyTemplate = (template: (typeof TEMPLATES)[0]) => {
    const filledTitle = template.title.replace('{topic}', title || '主题');
    setTitle(filledTitle);
    setBody(template.body.replace(/{topic}/g, title || '主题'));
    setShowTemplates(false);
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

  const togglePlatform = (platform: string) => {
    setPlatforms((prev) =>
      prev.includes(platform)
        ? prev.filter((p) => p !== platform)
        : [...prev, platform]
    );
  };

  const importProjectAssets = () => {
    if (projectAssets.length === 0) return;
    const paths = projectAssets.map((item) => item.path);
    const merged = Array.from(new Set([...selectedImages, ...paths]));
    setSelectedImages(merged);
    if (!coverImage && paths.length > 0) setCoverImage(paths[0]);

    const insertImage = (window as unknown as { __tiptapInsertImage?: TiptapInsertImageFn }).__tiptapInsertImage;
    if (insertImage) {
      paths.slice(0, 3).forEach((path) => {
        const item = projectAssets.find((asset) => asset.path === path);
        insertImage(path, item?.filename || '项目配图');
      });
    }
  };

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
            <h1 className="page-title">新建内容</h1>
            <p className="page-subtitle">创作你的精彩内容</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {contentId && lastSaved && (
            <span className="theme-muted text-xs">
              已自动保存 {lastSaved.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={() => handleSave(false)}
            disabled={isSaving}
            className="button-secondary flex items-center gap-2 rounded-xl px-4 py-2 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            保存草稿
          </button>
          <button
            onClick={() => handleSave(true)}
            disabled={isSaving || isPublishing}
            className="button-primary flex items-center gap-2 rounded-xl px-4 py-2 disabled:opacity-50"
          >
            {(isSaving || isPublishing) ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            {isPublishing ? '发布中...' : '发布'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main editor area */}
        <div className="lg:col-span-2 space-y-4">
          {/* Title input with character count */}
          <div className="theme-card p-5">
            <input
              type="text"
              placeholder="输入标题..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full border-none bg-transparent text-xl font-semibold focus:outline-none focus:ring-0 placeholder:text-slate-300"
            />
            <div className="mt-2 flex items-center justify-between border-t pt-2" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center gap-2">
                <span
                  className={`text-xs ${titleOverLimit
                    ? 'text-red-600 font-medium'
                    : titleWarning
                      ? 'text-yellow-600'
                      : 'theme-muted'
                    }`}
                >
                  {title.length}/{titleLimit} 字
                  {titleOverLimit && ' ⚠️ 超出限制'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowTemplates(true)}
                  className="button-secondary flex items-center gap-1 rounded px-2 py-1 text-xs"
                >
                  <FileText className="h-3.5 w-3.5" />
                  模板
                </button>
                <button
                  onClick={() => setShowPreview(true)}
                  disabled={!title && !body}
                  className="button-secondary flex items-center gap-1 rounded px-2 py-1 text-xs disabled:opacity-50"
                >
                  <Eye className="h-3.5 w-3.5" />
                  预览
                </button>
                <button
                  onClick={handleFormatBody}
                  disabled={isFormatting || !body.trim()}
                  className="button-secondary flex items-center gap-1 rounded px-2 py-1 text-xs disabled:opacity-50"
                >
                  {isFormatting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                  {isFormatting ? '排版中' : '一键排版'}
                </button>
                <button
                  onClick={handleOpenAiImageDialog}
                  disabled={isGenerating}
                  className="button-secondary flex items-center gap-1 rounded px-2 py-1 text-xs disabled:opacity-50"
                >
                  <ImageIcon className="h-3.5 w-3.5" />
                  AI 配图
                </button>
                <button
                  onClick={handleAIGenerate}
                  disabled={isGenerating || !title}
                  className="flex items-center gap-1 px-3 py-1 text-xs bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  {isGenerating ? '生成中...' : 'AI 助手'}
                </button>
              </div>
            </div>
          </div>

          {/* Rich Text Editor */}
          <RichTextEditor
            content={body}
            onChange={setBody}
            platforms={platforms}
            onStats={setStats}
            onInsertImage={() => {
              // Open image manager's picker
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
              AI 助手会按该风格生成，并自动做人设化改写（受设置中心开关控制）。
            </p>
          </div>

          <div className="theme-card p-5">
            <h3 className="theme-title mb-4 font-semibold">排版模板</h3>
            <select
              value={selectedLayoutTemplateId}
              onChange={(e) => setSelectedLayoutTemplateId(e.target.value)}
              className="theme-input w-full rounded-lg px-3 py-2 text-sm"
            >
              {(templates.length > 0 ? templates : [{ id: 'standard', name: '标准蓝调' } as LayoutTemplate]).map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
            <p className="theme-muted mt-2 text-xs">
              一键排版和微信发布会使用该模板。
            </p>
          </div>

          <div className="theme-card p-5">
            <h3 className="theme-title mb-4 font-semibold">关联项目</h3>
            <div className="space-y-3">
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
              {projectId && (
                <div className="rounded-lg border p-3" style={{ borderColor: 'var(--border)', background: 'var(--surface-soft)' }}>
                  <p className="theme-muted text-xs">
                    {loadingProjectAssets ? '正在加载项目素材...' : `已找到 ${projectAssets.length} 张项目素材`}
                  </p>
                  <button
                    type="button"
                    onClick={importProjectAssets}
                    disabled={loadingProjectAssets || projectAssets.length === 0}
                    className="button-secondary mt-2 rounded px-3 py-1.5 text-xs disabled:opacity-50"
                  >
                    一键导入并插入正文
                  </button>
                </div>
              )}
            </div>
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
              notice={platforms.includes('homepage')
                ? homepageBlockReason({
                  title,
                  tags: [],
                  enabled: homepageGuard.blockParenting,
                  blockTags: parseBlockTagList(homepageGuard.blockTags),
                })
                : null}
            />

            {platforms.includes('xiaohongshu') && (
              <div className="mt-3 p-3 bg-orange-50 rounded-lg">
                <p className="text-xs text-orange-700">
                  ⚠️ 小红书限制：标题 ≤20 字，正文 ≤1000 字，需要至少 1 张图片
                </p>
              </div>
            )}

            {platforms.includes('xiaohongshu') && xiaohongshuImageCount === 0 && (
              <div className="mt-2 p-2 bg-red-50 rounded-lg">
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

          {/* Scheduled publishing */}
          <div className="theme-card p-5">
            <h3 className="theme-title mb-4 font-semibold">定时发布</h3>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="theme-input w-full rounded-lg px-3 py-2 text-sm"
            />
            {scheduledAt && (
              <p className="theme-muted mt-2 text-xs">
                内容将在 {new Date(scheduledAt).toLocaleString('zh-CN')} 自动发布
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Template Modal */}
      {showTemplates && (
        <div className="modern-overlay" onClick={() => setShowTemplates(false)}>
          <div className="modern-modal max-h-[82vh] max-w-2xl overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b flex items-center justify-between">
              <h3 className="font-semibold text-lg">选择内容模板</h3>
              <button
                onClick={() => setShowTemplates(false)}
                className="button-secondary rounded-lg p-2"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <div className="grid gap-4">
                {TEMPLATES.map((template) => (
                  <button
                    key={template.id}
                    onClick={() => applyTemplate(template)}
                    className="rounded-lg border p-4 text-left transition-colors hover:bg-sky-50"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    <h4 className="theme-title font-medium">{template.name}</h4>
                    <p className="theme-muted mt-1 text-sm">{template.title}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <ContentPreviewModal
        open={showPreview}
        onClose={() => setShowPreview(false)}
        title={title}
        body={body}
        coverImage={coverImage}
        selectedImages={selectedImages}
        platforms={platforms}
        scheduledAt={scheduledAt}
        footerMeta={[`${stats.characters} 字符`, `${stats.words} 词`]}
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

export default function NewContent() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-slate-500">正在加载编辑器…</div>}>
      <NewContentForm />
    </Suspense>
  );
}
