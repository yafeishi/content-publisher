'use client';

import Link from 'next/link';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Search,
  Image as ImageIcon,
  Upload,
  Grid,
  List,
  Trash2,
  Check,
  Wand2,
  ClipboardPaste,
  ZoomIn,
  X,
  ChevronLeft,
  ChevronRight,
  Copy,
  Pencil,
  CheckCheck,
  FolderOpen,
  Filter,
  ArrowUpDown,
  Layers,
  Tag,
  Link2,
  AlertTriangle,
} from 'lucide-react';

interface AssetRefContent {
  id: string;
  title: string;
  updatedAt: string;
}

interface Asset {
  id: string;
  filename: string;
  path: string;
  type: 'image' | 'video';
  size: number | null;
  description: string | null;
  createdAt: string;
  projectId: string | null;
  projectName?: string | null;
  tags?: string;
  referencedByCount?: number;
  referencedContents?: AssetRefContent[];
}

interface Project {
  id: string;
  name: string;
}

interface AiGeneratedPreview {
  path: string;
  filename: string;
  size: number;
  type: 'image';
}

type RecorderStep = {
  action: 'goto' | 'click' | 'type' | 'press' | 'wait' | 'assertVisible' | 'scroll';
  by?: 'placeholder' | 'text' | 'role' | 'css';
  value?: string;
  role?: string;
  text?: string;
  key?: string;
  ms?: number;
  y?: number;
  position?: 'top' | 'bottom';
  delayMs?: number;
  timeoutMs?: number;
  clear?: boolean;
  optional?: boolean;
  path?: string;
  url?: string;
};

type RecorderRunLog = {
  index: number;
  action: string;
  status: 'ok' | 'skipped' | 'failed';
  detail: string;
  durationMs: number;
};

interface DiscoveredInputCandidate {
  placeholder: string;
  label: string;
  type: string;
}

interface DiscoveredButtonCandidate {
  name: string;
}

interface DiscoveredModule {
  path: string;
  url: string;
  title: string;
  heading: string;
  buttonCandidates: DiscoveredButtonCandidate[];
  inputCandidates: DiscoveredInputCandidate[];
  hasSearchInput: boolean;
  entryButtonName?: string;
  basePath?: string;
}

type RecorderDraftMode = 'wizard' | 'teaching' | 'expert';
type WizardGoal = 'search' | 'navigation' | 'form' | 'scroll';
type AiImageModelOption = {
  value: string;
  label: string;
};
type GenerateSpeedMode = 'fast' | 'quality';
type SortBy = 'newest' | 'oldest' | 'size_desc' | 'size_asc' | 'name_asc' | 'name_desc' | 'usage_desc';
type TypeFilter = 'all' | 'image' | 'video';
type SizeFilter = 'all' | 'large_5mb' | 'large_20mb';
type GroupBy = 'none' | 'month' | 'type' | 'size' | 'project' | 'usage';
type CleanupFilter = 'none' | 'largest' | 'unused' | 'no_desc' | 'no_tag' | 'no_project';

const LARGE_5MB = 5 * 1024 * 1024;
const LARGE_20MB = 20 * 1024 * 1024;
const RECORDER_PREFS_KEY = 'assets.recorder.v1';
const AI_IMAGE_MODELS: AiImageModelOption[] = [
  { value: 'codex-imagegen', label: 'Codex 内置生图（使用 Codex 额度）' },
  { value: 'minimax-image-01', label: 'MiniMax Image 01' },
  { value: 'minimax-image-01-live', label: 'MiniMax Image 01 Live' },
];

function parseTags(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  } catch {
    return [];
  }
}

export default function AssetsPage() {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [assets, setAssets] = useState<Asset[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [pasteHint, setPasteHint] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [dryRunning, setDryRunning] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [recorderMode, setRecorderMode] = useState<RecorderDraftMode>('wizard');
  const [recorderBaseUrl, setRecorderBaseUrl] = useState('');
  const [recorderModulePath, setRecorderModulePath] = useState('/assets');
  const [recorderGoal, setRecorderGoal] = useState('验证页面搜索、筛选、预览等关键交互');
  const [wizardGoal, setWizardGoal] = useState<WizardGoal>('search');
  const [recorderFlowName, setRecorderFlowName] = useState('素材库测试流程');
  const [recorderScriptText, setRecorderScriptText] = useState('');
  const [teachingInstructions, setTeachingInstructions] = useState(
    '点击 素材库\n在 搜索文件名、备注、标签、项目、引用内容... 输入 test\n按下 Enter\n等待 600\n点击 清空搜索\n校验 素材库'
  );
  const [recorderLogs, setRecorderLogs] = useState<RecorderRunLog[]>([]);
  const [discoveredModules, setDiscoveredModules] = useState<DiscoveredModule[]>([]);

  const [sortBy, setSortBy] = useState<SortBy>('newest');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [sizeFilter, setSizeFilter] = useState<SizeFilter>('all');
  const [groupBy, setGroupBy] = useState<GroupBy>('none');
  const [cleanupFilter, setCleanupFilter] = useState<CleanupFilter>('none');

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkTag, setBulkTag] = useState('');
  const [bulkProjectId, setBulkProjectId] = useState('');

  // Lightbox
  const [previewAsset, setPreviewAsset] = useState<Asset | null>(null);
  const [previewIndex, setPreviewIndex] = useState(0);

  // Inline description editing
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [openReferenceAssetId, setOpenReferenceAssetId] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    confirmText: string;
    onConfirm: (() => Promise<void>) | null;
  }>({
    open: false,
    title: '',
    description: '',
    confirmText: '确定',
    onConfirm: null,
  });
  const [confirming, setConfirming] = useState(false);
  const [showAiGenerateDialog, setShowAiGenerateDialog] = useState(false);
  const [aiTopic, setAiTopic] = useState('');
  const [aiStyle, setAiStyle] = useState('现代简约');
  const [aiModel, setAiModel] = useState(AI_IMAGE_MODELS[0].value);
  const [aiSpeedMode, setAiSpeedMode] = useState<GenerateSpeedMode>('fast');
  const [aiCount, setAiCount] = useState(1);
  const [aiProjectId, setAiProjectId] = useState('');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiSavingGenerated, setAiSavingGenerated] = useState(false);
  const [aiGenerateError, setAiGenerateError] = useState('');
  const [aiGeneratedPreviews, setAiGeneratedPreviews] = useState<AiGeneratedPreview[]>([]);
  const [aiPreviewIndex, setAiPreviewIndex] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    setToast({ type, message });
  }, []);

  const isEditableTarget = useCallback((target: EventTarget | null) => {
    const el = target as HTMLElement | null;
    if (!el) return false;
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return true;
    if (el.isContentEditable) return true;
    return Boolean(el.closest('input, textarea, [contenteditable="true"]'));
  }, []);

  const fetchAssets = useCallback(async () => {
    try {
      const res = await fetch('/api/assets');
      const data = await res.json();
      setAssets(data.assets || []);
    } catch (error) {
      console.error('Failed to fetch assets:', error);
      showToast('error', '素材加载失败');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch('/api/projects');
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data)) {
        setProjects(data.map((p) => ({ id: p.id, name: p.name })));
      }
    } catch (error) {
      console.error('Failed to fetch projects:', error);
    }
  }, []);

  useEffect(() => {
    fetchAssets();
    fetchProjects();
  }, [fetchAssets, fetchProjects]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const fallbackBaseUrl = window.location.origin || 'http://127.0.0.1:13847';
    try {
      const raw = window.localStorage.getItem(RECORDER_PREFS_KEY);
      if (!raw) {
        setRecorderBaseUrl(fallbackBaseUrl);
        return;
      }
      const parsed = JSON.parse(raw) as {
        baseUrl?: string;
        modulePath?: string;
        flowName?: string;
        goal?: string;
        scriptText?: string;
        mode?: RecorderDraftMode;
        wizardGoal?: WizardGoal;
        teachingInstructions?: string;
      };
      setRecorderBaseUrl(parsed.baseUrl || fallbackBaseUrl);
      if (parsed.modulePath) setRecorderModulePath(parsed.modulePath);
      if (parsed.flowName) setRecorderFlowName(parsed.flowName);
      if (parsed.goal) setRecorderGoal(parsed.goal);
      if (parsed.scriptText) setRecorderScriptText(parsed.scriptText);
      if (parsed.mode) setRecorderMode(parsed.mode);
      if (parsed.wizardGoal) setWizardGoal(parsed.wizardGoal);
      if (parsed.teachingInstructions) setTeachingInstructions(parsed.teachingInstructions);
    } catch {
      setRecorderBaseUrl(fallbackBaseUrl);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(
      RECORDER_PREFS_KEY,
      JSON.stringify({
        baseUrl: recorderBaseUrl,
        modulePath: recorderModulePath,
        flowName: recorderFlowName,
        goal: recorderGoal,
        scriptText: recorderScriptText,
        mode: recorderMode,
        wizardGoal,
        teachingInstructions,
      })
    );
  }, [
    recorderBaseUrl,
    recorderModulePath,
    recorderFlowName,
    recorderGoal,
    recorderScriptText,
    recorderMode,
    wizardGoal,
    teachingInstructions,
  ]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 1800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest('[data-reference-panel]')) {
        setOpenReferenceAssetId(null);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenReferenceAssetId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleEscape);
    };
  }, []);

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (isEditableTarget(e.target)) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      const imageFiles: File[] = [];
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) imageFiles.push(new File([file], `paste-${Date.now()}.png`, { type: file.type }));
        }
      }
      if (imageFiles.length > 0) {
        e.preventDefault();
        uploadFiles(imageFiles);
      }
    };

    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditableTarget]);

  useEffect(() => {
    if (!previewAsset) return;
    const previewableAssets = assets;
    const handleKey = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;
      if (e.key === 'Escape') {
        setPreviewAsset(null);
        return;
      }
      if (previewableAssets.length === 0) return;
      if (e.key === 'ArrowRight') {
        const next = (previewIndex + 1) % previewableAssets.length;
        setPreviewIndex(next);
        setPreviewAsset(previewableAssets[next]);
      }
      if (e.key === 'ArrowLeft') {
        const prev = (previewIndex - 1 + previewableAssets.length) % previewableAssets.length;
        setPreviewIndex(prev);
        setPreviewAsset(previewableAssets[prev]);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [previewAsset, previewIndex, isEditableTarget, assets]);

  const uploadFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    setUploading(true);
    setPasteHint(true);
    try {
      let successCount = 0;
      let failCount = 0;
      for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch('/api/assets', { method: 'POST', body: formData });
        if (res.ok) {
          const data = await res.json();
          setAssets((prev) => [data.asset, ...prev]);
          successCount += 1;
        } else {
          failCount += 1;
        }
      }
      if (successCount > 0) showToast('success', `已上传 ${successCount} 个素材`);
      if (failCount > 0) showToast('error', `${failCount} 个素材上传失败`);
    } catch (error) {
      console.error('Failed to upload:', error);
      showToast('error', '上传失败，请重试');
    } finally {
      setUploading(false);
      setTimeout(() => setPasteHint(false), 2000);
      if (fileInputRef.current) fileInputRef.current.value = '';
      fetchAssets();
    }
  }, [fetchAssets, showToast]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    await uploadFiles(Array.from(files));
  };

  const openAiGenerateDialog = () => {
    setAiProjectId(bulkProjectId || '');
    setAiSpeedMode('fast');
    setAiGenerateError('');
    setAiGeneratedPreviews([]);
    setAiPreviewIndex(null);
    setShowAiGenerateDialog(true);
  };

  const discardAiGeneratedPreviews = useCallback(async () => {
    if (aiGeneratedPreviews.length === 0) return;
    try {
      await fetch('/api/assets/ai-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'discard',
          previewPaths: aiGeneratedPreviews.map((item) => item.path),
        }),
      });
    } catch (error) {
      console.error('Failed to discard ai preview files:', error);
    }
  }, [aiGeneratedPreviews]);

  const closeAiGenerateDialog = useCallback(async () => {
    if (aiGenerating || aiSavingGenerated) return;
    await discardAiGeneratedPreviews();
    setAiGeneratedPreviews([]);
    setAiPreviewIndex(null);
    setAiGenerateError('');
    setShowAiGenerateDialog(false);
  }, [aiGenerating, aiSavingGenerated, discardAiGeneratedPreviews]);

  const handleGenerateAiImages = async () => {
    const topic = aiTopic.trim();
    if (!topic) {
      setAiGenerateError('请输入图片主题');
      return;
    }
    setAiGenerating(true);
    setAiGenerateError('');
    try {
      if (aiGeneratedPreviews.length > 0) {
        await discardAiGeneratedPreviews();
        setAiGeneratedPreviews([]);
      }
      const res = await fetch('/api/assets/ai-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate',
          topic,
          style: aiStyle.trim(),
          model: aiModel,
          speedMode: aiSpeedMode,
          count: aiCount,
          projectId: aiProjectId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAiGenerateError(data?.error || 'AI 生成失败');
        return;
      }
      const generatedPreviews = Array.isArray(data?.previews) ? data.previews as AiGeneratedPreview[] : [];
      if (generatedPreviews.length === 0) {
        setAiGenerateError('生成完成，但未返回图片');
        return;
      }
      setAiGeneratedPreviews(generatedPreviews);
      showToast('success', `AI 已生成 ${generatedPreviews.length} 张预览图`);
    } catch (error) {
      console.error('Failed to generate ai assets:', error);
      setAiGenerateError('AI 生成失败，请稍后重试');
    } finally {
      setAiGenerating(false);
    }
  };

  const handleSaveAiGeneratedImages = async () => {
    const topic = aiTopic.trim();
    if (!topic) {
      setAiGenerateError('请输入图片主题');
      return;
    }
    if (aiGeneratedPreviews.length === 0) {
      setAiGenerateError('请先生成预览图');
      return;
    }
    setAiSavingGenerated(true);
    setAiGenerateError('');
    try {
      const res = await fetch('/api/assets/ai-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save',
          topic,
          style: aiStyle.trim(),
          model: aiModel,
          projectId: aiProjectId || null,
          previewPaths: aiGeneratedPreviews.map((item) => item.path),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAiGenerateError(data?.error || '入素材库失败');
        return;
      }
      const generatedAssets = Array.isArray(data?.assets) ? data.assets : [];
      if (generatedAssets.length === 0) {
        setAiGenerateError('入素材库失败：未返回素材');
        return;
      }
      setAssets((prev) => [...generatedAssets, ...prev]);
      showToast('success', `已加入素材库 ${generatedAssets.length} 张图片`);
      setAiGeneratedPreviews([]);
      setAiPreviewIndex(null);
      setShowAiGenerateDialog(false);
      setAiTopic('');
      setAiStyle('现代简约');
      setAiCount(1);
      setAiGenerateError('');
    } catch (error) {
      console.error('Failed to save ai assets:', error);
      setAiGenerateError('入素材库失败，请稍后重试');
    } finally {
      setAiSavingGenerated(false);
    }
  };

  const navigateAiPreview = (direction: 'prev' | 'next') => {
    if (aiGeneratedPreviews.length === 0 || aiPreviewIndex === null) return;
    const next = direction === 'next'
      ? (aiPreviewIndex + 1) % aiGeneratedPreviews.length
      : (aiPreviewIndex - 1 + aiGeneratedPreviews.length) % aiGeneratedPreviews.length;
    setAiPreviewIndex(next);
  };

  const parseRecorderSteps = (): RecorderStep[] | null => {
    const raw = recorderScriptText.trim();
    if (!raw) return null;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        showToast('error', '脚本格式错误：必须是步骤数组(JSON)');
        return null;
      }
      const steps = parsed.filter((item): item is RecorderStep => {
        if (!item || typeof item !== 'object') return false;
        return typeof (item as { action?: unknown }).action === 'string';
      });
      if (steps.length === 0) {
        showToast('error', '脚本为空：至少包含一个步骤');
        return null;
      }
      return steps;
    } catch {
      showToast('error', '脚本 JSON 解析失败，请检查格式');
      return null;
    }
  };

  const activeDiscoveredModule = useMemo(() => {
    if (discoveredModules.length === 0) return null;
    return (
      discoveredModules.find((item) => item.path === recorderModulePath)
      || discoveredModules.find((item) => item.path.startsWith(recorderModulePath))
      || discoveredModules.find((item) => recorderModulePath.startsWith(item.path))
      || null
    );
  }, [discoveredModules, recorderModulePath]);

  const handleDiscoverModules = async () => {
    setDiscovering(true);
    try {
      const res = await fetch('/api/recordings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'discover',
          baseUrl: recorderBaseUrl || (window.location.origin || 'http://127.0.0.1:13847'),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.discovered) {
        showToast('error', data?.error || '模块扫描失败');
        return;
      }
      const modules = Array.isArray(data.discovered.modules)
        ? (data.discovered.modules as DiscoveredModule[])
        : [];
      setDiscoveredModules(modules);
      if (modules.length === 0) {
        showToast('error', '未发现可用模块，请检查地址是否可访问');
        return;
      }
      const currentExists = modules.some((item) => item.path === recorderModulePath);
      if (!currentExists) {
        setRecorderModulePath(modules[0].path);
      }
      showToast('success', `模块扫描完成，共发现 ${modules.length} 个页面`);
    } catch (error) {
      console.error('Failed to discover modules:', error);
      showToast('error', '模块扫描失败，请稍后重试');
    } finally {
      setDiscovering(false);
    }
  };

  const handleGenerateRecorderDraft = async () => {
    if (recorderMode === 'teaching' && !teachingInstructions.trim()) {
      showToast('error', '请先填写教学步骤');
      return;
    }
    setDrafting(true);
    try {
      const baseUrl = recorderBaseUrl || (window.location.origin || 'http://127.0.0.1:13847');
      const action = recorderMode === 'wizard'
        ? 'generate-wizard-draft'
        : recorderMode === 'teaching'
          ? 'generate-teaching-draft'
          : 'generate-draft';
      const res = await fetch('/api/recordings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          module: 'assets',
          baseUrl,
          modulePath: recorderModulePath,
          goal: recorderMode === 'wizard' ? wizardGoal : recorderGoal,
          instructions: teachingInstructions,
          flowName: recorderFlowName,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.draft) {
        showToast('error', data?.error || '生成脚本草案失败');
        return;
      }
      if (Array.isArray(data?.discovered?.modules)) {
        setDiscoveredModules(data.discovered.modules as DiscoveredModule[]);
      }
      setRecorderFlowName(data.draft.flowName || recorderFlowName);
      setRecorderScriptText(JSON.stringify(data.draft.steps || [], null, 2));
      setRecorderLogs([]);
      showToast(
        'success',
        recorderMode === 'wizard'
          ? '已生成向导草案，请确认后执行'
          : recorderMode === 'teaching'
            ? '已生成教学草案，请确认后执行'
            : '已生成脚本草案，请确认后执行'
      );
    } catch (error) {
      console.error('Failed to generate recorder draft:', error);
      showToast('error', '生成草案失败，请重试');
    } finally {
      setDrafting(false);
    }
  };

  const runRecorderFlow = async (mode: 'dry-run' | 'record', forceDefault = false) => {
    if (mode === 'dry-run') setDryRunning(true);
    if (mode === 'record') setRecording(true);
    try {
      const baseUrl = recorderBaseUrl || window.location.origin || 'http://127.0.0.1:13847';
      const steps = forceDefault ? undefined : parseRecorderSteps() || undefined;
      if (!forceDefault && !steps) return;

      const res = await fetch('/api/recordings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          module: 'assets',
          baseUrl,
          modulePath: recorderModulePath,
          flowName: recorderFlowName,
          steps,
          saveToAssets: mode === 'record',
          projectId: bulkProjectId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast('error', data?.error || `${mode === 'dry-run' ? 'Dry-run' : '录制'}失败`);
        return;
      }
      if (Array.isArray(data?.run?.logs)) {
        setRecorderLogs(data.run.logs as RecorderRunLog[]);
      }

      if (mode === 'record') {
        if (data?.asset) {
          setAssets((prev) => [data.asset as Asset, ...prev]);
        } else {
          await fetchAssets();
        }
        // Ensure the newly created video is visible in the current list
        setSearchQuery('');
        setTypeFilter('all');
        setSizeFilter('all');
        setCleanupFilter('none');
        showToast('success', '录制完成，视频已自动加入素材库');
      } else {
        showToast('success', 'Dry-run 验证完成，可继续正式录制');
      }
    } catch (error) {
      console.error('Failed to run recorder flow:', error);
      showToast('error', mode === 'dry-run' ? 'Dry-run 执行失败' : '录制失败，请稍后重试');
    } finally {
      if (mode === 'dry-run') setDryRunning(false);
      if (mode === 'record') setRecording(false);
    }
  };

  const handleRecordAssetsFlow = async () => {
    const hasScript = recorderScriptText.trim().length > 0;
    await runRecorderFlow('record', !hasScript);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/') || f.type.startsWith('video/'));
    if (files.length > 0) uploadFiles(files);
  };

  const openConfirm = (options: {
    title: string;
    description: string;
    confirmText?: string;
    onConfirm: () => Promise<void>;
  }) => {
    setConfirmDialog({
      open: true,
      title: options.title,
      description: options.description,
      confirmText: options.confirmText || '确定',
      onConfirm: options.onConfirm,
    });
  };

  const closeConfirm = () => {
    if (confirming) return;
    setConfirmDialog((prev) => ({ ...prev, open: false }));
  };

  const handleConfirm = async () => {
    if (!confirmDialog.onConfirm || confirming) return;
    setConfirming(true);
    try {
      await confirmDialog.onConfirm();
      setConfirmDialog((prev) => ({ ...prev, open: false }));
    } finally {
      setConfirming(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/assets?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        setAssets((prev) => prev.filter((a) => a.id !== id));
        setSelectedIds((prev) => prev.filter((v) => v !== id));
        if (previewAsset?.id === id) setPreviewAsset(null);
        showToast('success', '已删除素材');
      } else {
        showToast('error', '删除失败');
      }
    } catch (error) {
      console.error(error);
      showToast('error', '删除失败');
    }
  };

  const requestDelete = (id: string, closePreview = false) => {
    openConfirm({
      title: '删除素材',
      description: '删除后无法恢复。确定要删除这个素材吗？',
      confirmText: '删除',
      onConfirm: async () => {
        await handleDelete(id);
        if (closePreview) setPreviewAsset(null);
      },
    });
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    try {
      const res = await fetch('/api/assets', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds }),
      });
      if (res.ok) {
        showToast('success', `已删除 ${selectedIds.length} 个素材`);
        setSelectedIds([]);
        fetchAssets();
      } else {
        showToast('error', '批量删除失败');
      }
    } catch (error) {
      console.error(error);
      showToast('error', '批量删除失败');
    }
  };

  const requestBulkDelete = () => {
    if (selectedIds.length === 0) return;
    openConfirm({
      title: '批量删除素材',
      description: `你将删除选中的 ${selectedIds.length} 个素材，删除后无法恢复。`,
      confirmText: '批量删除',
      onConfirm: handleBulkDelete,
    });
  };

  const handleBulkAddTag = async () => {
    const nextTag = bulkTag.trim();
    if (!nextTag || selectedIds.length === 0) return;
    try {
      const res = await fetch('/api/assets', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds, addTag: nextTag }),
      });
      if (res.ok) {
        showToast('success', '批量标签已更新');
        setBulkTag('');
        fetchAssets();
      } else {
        showToast('error', '批量标签更新失败');
      }
    } catch (error) {
      console.error(error);
      showToast('error', '批量标签更新失败');
    }
  };

  const handleBulkAssignProject = async () => {
    if (selectedIds.length === 0) return;
    try {
      const res = await fetch('/api/assets', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds, projectId: bulkProjectId || null }),
      });
      if (res.ok) {
        showToast('success', bulkProjectId ? '已批量归属项目' : '已批量清空项目');
        fetchAssets();
      } else {
        showToast('error', '批量项目更新失败');
      }
    } catch (error) {
      console.error(error);
      showToast('error', '批量项目更新失败');
    }
  };

  const startEdit = (asset: Asset) => {
    setEditingId(asset.id);
    setEditingValue(asset.description || '');
  };

  const saveDescription = async (id: string) => {
    if (savingId === id) return;
    setSavingId(id);
    try {
      const res = await fetch(`/api/assets?id=${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: editingValue.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setAssets((prev) => prev.map((a) => (a.id === id ? { ...a, description: data.asset.description } : a)));
        if (previewAsset?.id === id) {
          setPreviewAsset((prev) => (prev ? { ...prev, description: data.asset.description } : prev));
        }
      }
    } catch (error) {
      console.error(error);
      showToast('error', '保存备注失败');
    } finally {
      setSavingId(null);
      setEditingId(null);
    }
  };

  const cancelEdit = () => setEditingId(null);

  const copyUrl = async (path: string) => {
    try {
      await navigator.clipboard.writeText(window.location.origin + path);
      showToast('success', '链接已复制');
    } catch {
      showToast('error', '复制失败，请检查浏览器权限');
    }
  };

  const selectAsset = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]));
  };

  const selectAllDisplayed = () => {
    const ids = displayedAssets.map((a) => a.id);
    setSelectedIds(ids);
  };

  const clearSelection = () => setSelectedIds([]);

  const filteredAssets = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let next = assets.filter((a) => {
      const tags = parseTags(a.tags).join(' ').toLowerCase();
      const refTitles = (a.referencedContents || []).map((ref) => ref.title).join(' ').toLowerCase();
      const projectName = (a.projectName || '').toLowerCase();
      const hitSearch = !q
        || a.filename.toLowerCase().includes(q)
        || (a.description || '').toLowerCase().includes(q)
        || tags.includes(q)
        || projectName.includes(q)
        || refTitles.includes(q);
      if (!hitSearch) return false;

      if (typeFilter !== 'all' && a.type !== typeFilter) return false;

      const size = a.size || 0;
      if (sizeFilter === 'large_5mb' && size < LARGE_5MB) return false;
      if (sizeFilter === 'large_20mb' && size < LARGE_20MB) return false;

      if (cleanupFilter === 'largest' && size < LARGE_20MB) return false;
      if (cleanupFilter === 'unused' && (a.referencedByCount || 0) > 0) return false;
      if (cleanupFilter === 'no_desc' && (a.description || '').trim().length > 0) return false;
      if (cleanupFilter === 'no_project' && a.projectId) return false;
      if (cleanupFilter === 'no_tag' && parseTags(a.tags).length > 0) return false;

      return true;
    });

    next = [...next].sort((a, b) => {
      const sa = a.size || 0;
      const sb = b.size || 0;
      const ua = a.referencedByCount || 0;
      const ub = b.referencedByCount || 0;
      switch (sortBy) {
        case 'oldest':
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case 'size_desc':
          return sb - sa;
        case 'size_asc':
          return sa - sb;
        case 'name_asc':
          return a.filename.localeCompare(b.filename, 'zh-CN');
        case 'name_desc':
          return b.filename.localeCompare(a.filename, 'zh-CN');
        case 'usage_desc':
          return ub - ua;
        case 'newest':
        default:
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });

    return next;
  }, [assets, searchQuery, typeFilter, sizeFilter, cleanupFilter, sortBy]);

  const groupedAssets = useMemo(() => {
    if (groupBy === 'none') {
      return [{ key: 'all', label: '全部素材', items: filteredAssets }];
    }

    const groups: Record<string, Asset[]> = {};
    const labelByKey: Record<string, string> = {};

    const sizeGroup = (size: number) => {
      if (size >= LARGE_20MB) return 'size_20';
      if (size >= LARGE_5MB) return 'size_5_20';
      if (size >= 1024 * 1024) return 'size_1_5';
      return 'size_small';
    };

    for (const asset of filteredAssets) {
      let key = 'other';
      let label = '其他';

      if (groupBy === 'month') {
        const d = new Date(asset.createdAt);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        key = `${y}-${m}`;
        label = `${y}年${m}月`;
      } else if (groupBy === 'type') {
        key = asset.type;
        label = asset.type === 'image' ? '图片' : '视频';
      } else if (groupBy === 'size') {
        key = sizeGroup(asset.size || 0);
        label = key === 'size_20' ? '超大文件 (>20MB)'
          : key === 'size_5_20' ? '大文件 (5-20MB)'
            : key === 'size_1_5' ? '中等文件 (1-5MB)'
              : '小文件 (<1MB)';
      } else if (groupBy === 'project') {
        key = asset.projectId || 'no_project';
        label = asset.projectName || '未归属项目';
      } else if (groupBy === 'usage') {
        key = (asset.referencedByCount || 0) > 0 ? 'used' : 'unused';
        label = key === 'used' ? '已被内容引用' : '未被引用';
      }

      if (!groups[key]) groups[key] = [];
      groups[key].push(asset);
      labelByKey[key] = label;
    }

    return Object.entries(groups)
      .map(([key, items]) => ({ key, label: labelByKey[key] || key, items }))
      .sort((a, b) => b.items.length - a.items.length);
  }, [filteredAssets, groupBy]);

  const displayedAssets = filteredAssets;
  const previewableAssets = displayedAssets;

  const totalStats = useMemo(() => {
    const totalCount = assets.length;
    const totalSize = assets.reduce((sum, a) => sum + (a.size || 0), 0);
    const imageSize = assets.filter((a) => a.type === 'image').reduce((sum, a) => sum + (a.size || 0), 0);
    const videoSize = assets.filter((a) => a.type === 'video').reduce((sum, a) => sum + (a.size || 0), 0);
    const unusedCount = assets.filter((a) => (a.referencedByCount || 0) === 0).length;
    const largeCount = assets.filter((a) => (a.size || 0) >= LARGE_5MB).length;
    return { totalCount, totalSize, imageSize, videoSize, unusedCount, largeCount };
  }, [assets]);

  const formatSize = (bytes: number | null | undefined) => {
    const value = bytes || 0;
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
    return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const openPreview = (asset: Asset) => {
    const idx = previewableAssets.findIndex((a) => a.id === asset.id);
    setPreviewIndex(idx >= 0 ? idx : 0);
    setPreviewAsset(asset);
  };

  const navigatePreview = (direction: 'prev' | 'next') => {
    if (previewableAssets.length === 0) return;
    const next = direction === 'next'
      ? (previewIndex + 1) % previewableAssets.length
      : (previewIndex - 1 + previewableAssets.length) % previewableAssets.length;
    setPreviewIndex(next);
    setPreviewAsset(previewableAssets[next]);
  };

  const renderDescEditor = (asset: Asset, compact = false) => {
    const isEditing = editingId === asset.id;
    const isSaving = savingId === asset.id;

    if (isEditing) {
      return (
        <div className="flex flex-col gap-1" onClick={(e) => e.stopPropagation()}>
          <textarea
            autoFocus
            value={editingValue}
            onChange={(e) => setEditingValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                saveDescription(asset.id);
              }
              if (e.key === 'Escape') cancelEdit();
            }}
            placeholder="输入备注说明，便于后续搜索..."
            rows={compact ? 2 : 3}
            className={`w-full text-xs border border-blue-300 rounded-md px-2 py-1.5 resize-none focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white ${compact ? '' : 'text-sm'}`}
          />
          <div className="flex items-center gap-1 justify-end">
            <span className="text-[10px] theme-muted mr-auto">Enter 保存 · Esc 取消</span>
            <button type="button" onClick={cancelEdit} className="px-2 py-0.5 text-xs theme-muted hover:bg-gray-100 rounded">取消</button>
            <button
              type="button"
              onClick={() => saveDescription(asset.id)}
              disabled={isSaving}
              className="px-2 py-0.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1"
            >
              {isSaving ? '保存中' : <><CheckCheck className="h-3 w-3" />保存</>}
            </button>
          </div>
        </div>
      );
    }

    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          startEdit(asset);
        }}
        className={`group/desc w-full text-left flex items-start gap-1 rounded-md px-1.5 py-1 hover:bg-sky-50/70 dark:hover:bg-slate-800/60 transition-colors ${compact ? '' : 'mt-1'}`}
        title="点击编辑备注"
      >
        {asset.description ? (
          <span className={`theme-muted leading-snug flex-1 ${compact ? 'text-[10px]' : 'text-xs'}`}>{asset.description}</span>
        ) : (
          <span className={`text-gray-300 italic flex-1 ${compact ? 'text-[10px]' : 'text-xs'}`}>点击添加备注...</span>
        )}
        <Pencil className="h-3 w-3 text-gray-300 group-hover/desc:text-slate-500 flex-shrink-0 mt-0.5 transition-colors" />
      </button>
    );
  };

  const renderReferencePanel = (asset: Asset, compact = false) => {
    const refs = asset.referencedContents || [];
    const count = asset.referencedByCount || 0;
    const isOpen = openReferenceAssetId === asset.id;

    if (count === 0) {
      return (
        <span className={`text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 ${compact ? '' : 'inline-flex'}`}>
          引用 0 篇
        </span>
      );
    }

    return (
      <div
        className="relative"
        data-reference-panel
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => setOpenReferenceAssetId((prev) => (prev === asset.id ? null : asset.id))}
          className={`cursor-pointer text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 ${compact ? '' : 'inline-flex'} items-center gap-1`}
        >
          <Link2 className="h-3 w-3" />
          引用 {count} 篇
        </button>
        {isOpen && (
          <div
            className="modern-popover absolute left-0 top-6 z-30 w-72 max-h-52 overflow-y-auto p-2"
            style={{ borderColor: 'var(--border)' }}
          >
            <p className="px-1 pb-1 text-[10px] font-medium theme-muted">被以下内容引用</p>
            <div className="space-y-1">
              {refs.map((ref) => (
                <Link
                  key={ref.id}
                  href={`/content/${ref.id}`}
                  className="block rounded-lg px-2 py-1.5 text-xs transition-colors hover:bg-slate-100"
                  onClick={() => setOpenReferenceAssetId(null)}
                >
                  <p className="truncate theme-title">{ref.title || '无标题'}</p>
                  <p className="mt-0.5 text-[10px] theme-muted">
                    更新于 {new Date(ref.updatedAt).toLocaleDateString('zh-CN')}
                  </p>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderAssetCard = (asset: Asset) => {
    const isSelected = selectedIds.includes(asset.id);
    const tags = parseTags(asset.tags);
    return (
      <div key={asset.id} className={`group flex flex-col rounded-xl border transition-all bg-gray-50 overflow-visible ${isSelected ? 'border-blue-400 ring-1 ring-blue-200' : 'border-gray-100 hover:border-gray-200'}`}>
        <div className="relative overflow-hidden rounded-t-xl">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              selectAsset(asset.id);
            }}
            className={`absolute left-2 top-2 z-10 rounded-md p-1.5 ${isSelected ? 'bg-blue-600 text-white' : 'bg-white/90 text-gray-700 hover:bg-white'}`}
            title="选择"
          >
            <Check className="h-3.5 w-3.5" />
          </button>

          {asset.type === 'image' ? (
            <img
              src={`${window.location.origin}${asset.path}`}
              alt={asset.filename}
              className="w-full aspect-video object-cover cursor-pointer"
              onClick={() => openPreview(asset)}
              onError={(e) => {
                e.currentTarget.src = asset.path;
              }}
            />
          ) : (
            <button
              type="button"
              onClick={() => openPreview(asset)}
              className="w-full aspect-video bg-gray-200 flex items-center justify-center hover:bg-gray-300 transition-colors"
              title="预览视频"
            >
              <VideoIcon className="h-8 w-8 theme-muted" />
            </button>
          )}

          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/35 transition-all flex items-center justify-center gap-1.5 opacity-0 group-hover:opacity-100">
            <button type="button" onClick={() => openPreview(asset)} className="p-1.5 bg-white/90 rounded-lg text-gray-800 hover:bg-white shadow-sm" title="预览">
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
            <button type="button" onClick={(e) => { e.stopPropagation(); copyUrl(asset.path); }} className="p-1.5 bg-white/90 rounded-lg text-gray-800 hover:bg-white shadow-sm" title="复制链接">
              <Copy className="h-3.5 w-3.5" />
            </button>
            <button type="button" onClick={(e) => { e.stopPropagation(); startEdit(asset); }} className="p-1.5 bg-white/90 rounded-lg text-gray-800 hover:bg-white shadow-sm" title="编辑备注">
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button type="button" onClick={(e) => { e.stopPropagation(); requestDelete(asset.id); }} className="p-1.5 bg-red-500/90 rounded-lg text-white hover:bg-red-600 shadow-sm" title="删除">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="px-2 pt-2 pb-2">
          <p className="text-xs font-medium text-gray-700 truncate" title={asset.filename}>{asset.filename}</p>
          <div className="mt-1 flex items-center gap-2 text-[10px] theme-muted">
            <span>{formatSize(asset.size)}</span>
            <span>·</span>
            <span>{new Date(asset.createdAt).toLocaleDateString('zh-CN')}</span>
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-1">
            {renderReferencePanel(asset, true)}
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{asset.projectName || '未归属项目'}</span>
            {tags.slice(0, 2).map((t) => (
              <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">#{t}</span>
            ))}
          </div>

          {renderDescEditor(asset, true)}
        </div>
      </div>
    );
  };

  const renderAssetRow = (asset: Asset) => {
    const isSelected = selectedIds.includes(asset.id);
    const tags = parseTags(asset.tags);
    return (
      <div key={asset.id} className={`p-4 flex items-start gap-4 transition-colors ${isSelected ? 'bg-blue-50/60' : 'hover:bg-sky-50/70 dark:hover:bg-slate-800/60'}`}>
        <button
          type="button"
          onClick={() => selectAsset(asset.id)}
          className={`mt-1 rounded-md p-1.5 ${isSelected ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          title="选择"
        >
          <Check className="h-3.5 w-3.5" />
        </button>

        {asset.type === 'image' ? (
          <img
            src={`${window.location.origin}${asset.path}`}
            alt={asset.filename}
            className="w-20 h-20 object-cover rounded-lg cursor-pointer hover:opacity-80 transition-opacity flex-shrink-0"
            onClick={() => openPreview(asset)}
            onError={(e) => {
              e.currentTarget.src = asset.path;
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => openPreview(asset)}
            className="w-20 h-20 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0 hover:bg-gray-200 transition-colors"
            title="预览视频"
          >
            <VideoIcon className="h-6 w-6 theme-muted" />
          </button>
        )}

        <div className="flex-1 min-w-0">
          <p className="font-medium theme-title truncate">{asset.filename}</p>
          <p className="text-sm theme-muted mb-2">{formatSize(asset.size)} · {new Date(asset.createdAt).toLocaleDateString('zh-CN')} · {asset.projectName || '未归属项目'}</p>
          <div className="mb-2">{renderReferencePanel(asset)}</div>
          {tags.length > 0 && (
            <div className="mb-2 flex flex-wrap items-center gap-1">
              {tags.slice(0, 4).map((t) => (
                <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">#{t}</span>
              ))}
            </div>
          )}
          {renderDescEditor(asset)}
        </div>

        <div className="flex items-center gap-1 flex-shrink-0 pt-1">
          <button type="button" onClick={() => openPreview(asset)} className="p-2 theme-muted hover:text-gray-700 hover:bg-gray-100 rounded-lg" title="预览"><ZoomIn className="h-4 w-4" /></button>
          <button type="button" onClick={() => copyUrl(asset.path)} className="p-2 theme-muted hover:text-gray-700 hover:bg-gray-100 rounded-lg" title="复制链接"><Copy className="h-4 w-4" /></button>
          <button type="button" onClick={() => requestDelete(asset.id)} className="p-2 theme-muted hover:text-red-500 hover:bg-red-50 rounded-lg" title="删除"><Trash2 className="h-4 w-4" /></button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {toast && (
        <div className={`fixed right-6 top-20 z-[10000] rounded-lg px-3 py-2 text-sm text-white shadow-lg ${toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'}`}>
          {toast.message}
        </div>
      )}

      <div className="theme-panel flex items-center justify-between p-6">
        <div>
          <h1 className="page-title">素材库</h1>
          <p className="page-subtitle">支持排序、分组、批量治理与引用关系分析</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openAiGenerateDialog}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg hover:opacity-90 transition-opacity"
          >
            <Wand2 className="h-4 w-4" />AI 生成配图
          </button>
          <button
            type="button"
            onClick={handleRecordAssetsFlow}
            disabled={recording || uploading}
            className="button-secondary flex items-center gap-2 rounded-lg px-4 py-2 transition-colors disabled:opacity-50"
            title="自动执行素材库关键操作并录制成视频"
          >
            <VideoIcon className="h-4 w-4" />
            {recording ? '录制中...' : '录制测试视频'}
          </button>
          <input ref={fileInputRef} type="file" accept="image/*,video/*" multiple onChange={handleUpload} className="hidden" />
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading || recording} className="button-primary flex items-center gap-2 rounded-lg px-4 py-2 transition-colors disabled:opacity-50">
            <Upload className="h-4 w-4" />{uploading ? '上传中...' : '上传素材'}
          </button>
        </div>
      </div>

      <div className="theme-card p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="theme-title text-base font-semibold">交互录制工作台</h2>
            <p className="theme-muted text-xs mt-1">先生成草案脚本，再 dry-run 验证，确认后正式录制入素材库</p>
          </div>
          <span className="text-xs px-2 py-1 rounded bg-amber-50 text-amber-700 border border-amber-200 inline-flex items-center gap-1">
            <AlertTriangle className="h-3.5 w-3.5" />
            先验证后录制
          </span>
        </div>

        <div className="rounded-lg border p-3 space-y-3" style={{ borderColor: 'var(--border)' }}>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setRecorderMode('wizard')}
              className={`rounded-lg px-3 py-1.5 text-xs transition-colors ${recorderMode === 'wizard' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
            >
              向导模式
            </button>
            <button
              type="button"
              onClick={() => setRecorderMode('teaching')}
              className={`rounded-lg px-3 py-1.5 text-xs transition-colors ${recorderMode === 'teaching' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
            >
              教学模式
            </button>
            <button
              type="button"
              onClick={() => setRecorderMode('expert')}
              className={`rounded-lg px-3 py-1.5 text-xs transition-colors ${recorderMode === 'expert' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
            >
              专家模式
            </button>
          </div>
          <p className="text-xs theme-muted">
            {recorderMode === 'wizard' && '向导模式：先扫描页面，再按目标自动生成步骤。'}
            {recorderMode === 'teaching' && '教学模式：用自然语言描述操作步骤，系统自动转成脚本。'}
            {recorderMode === 'expert' && '专家模式：基于模块与目标生成基础脚本，你可手动精修 JSON。'}
          </p>

          {recorderMode === 'wizard' && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleDiscoverModules}
                  disabled={discovering || drafting || dryRunning || recording}
                  className="button-secondary rounded-lg px-3 py-2 text-sm disabled:opacity-50"
                >
                  {discovering ? '扫描中...' : '扫描可录制模块'}
                </button>
                <span className="text-xs theme-muted">
                  已发现 {discoveredModules.length} 个模块
                </span>
              </div>
              {discoveredModules.length > 0 && (
                <label className="text-xs theme-muted block">
                  发现的模块
                  <select
                    value={recorderModulePath}
                    onChange={(e) => setRecorderModulePath(e.target.value)}
                    className="theme-input mt-1 w-full rounded-lg px-3 py-2 text-sm"
                  >
                    {discoveredModules.map((module) => (
                      <option key={module.path} value={module.path}>
                        {module.entryButtonName ? `[模块] ${module.entryButtonName}` : module.path}
                        {module.heading ? ` · ${module.heading}` : ''}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {activeDiscoveredModule && (
                <div className="rounded-md bg-slate-50 px-3 py-2 text-xs theme-muted">
                  <span className="theme-title">{activeDiscoveredModule.heading || activeDiscoveredModule.title || activeDiscoveredModule.path}</span>
                  <span> · 输入控件 {activeDiscoveredModule.inputCandidates.length}</span>
                  <span> · 按钮 {activeDiscoveredModule.buttonCandidates.length}</span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="text-xs theme-muted">
            Base URL
            <input
              value={recorderBaseUrl}
              onChange={(e) => setRecorderBaseUrl(e.target.value)}
              className="theme-input mt-1 w-full rounded-lg px-3 py-2 text-sm"
              placeholder="http://127.0.0.1:13847"
            />
          </label>
          <label className="text-xs theme-muted">
            模块路径
            <input
              value={recorderModulePath}
              onChange={(e) => setRecorderModulePath(e.target.value)}
              className="theme-input mt-1 w-full rounded-lg px-3 py-2 text-sm"
              placeholder="/assets"
            />
          </label>
          <label className="text-xs theme-muted">
            流程名称
            <input
              value={recorderFlowName}
              onChange={(e) => setRecorderFlowName(e.target.value)}
              className="theme-input mt-1 w-full rounded-lg px-3 py-2 text-sm"
              placeholder="素材库测试流程"
            />
          </label>
          {recorderMode === 'expert' && (
            <label className="text-xs theme-muted">
              测试目标
              <input
                value={recorderGoal}
                onChange={(e) => setRecorderGoal(e.target.value)}
                className="theme-input mt-1 w-full rounded-lg px-3 py-2 text-sm"
                placeholder="验证搜索、筛选、预览..."
              />
            </label>
          )}
          {recorderMode === 'wizard' && (
            <label className="text-xs theme-muted">
              向导目标
              <select
                value={wizardGoal}
                onChange={(e) => setWizardGoal(e.target.value as WizardGoal)}
                className="theme-input mt-1 w-full rounded-lg px-3 py-2 text-sm"
              >
                <option value="search">搜索/筛选</option>
                <option value="navigation">菜单/导航</option>
                <option value="form">表单输入</option>
                <option value="scroll">滚动演示</option>
              </select>
            </label>
          )}
          {recorderMode === 'teaching' && (
            <div className="xl:col-span-2">
              <label className="text-xs theme-muted block">
                教学步骤（每行一条）
                <textarea
                  value={teachingInstructions}
                  onChange={(e) => setTeachingInstructions(e.target.value)}
                  rows={4}
                  className="theme-input mt-1 w-full rounded-lg px-3 py-2 text-xs font-mono"
                  placeholder={'点击 搜索\n在 关键词 输入 测试\n按下 Enter\n等待 600\n校验 列表'}
                />
              </label>
            </div>
          )}
        </div>

        <div>
          <p className="text-xs theme-muted mb-1.5">脚本草案（JSON steps，可手工修正）</p>
          <textarea
            value={recorderScriptText}
            onChange={(e) => setRecorderScriptText(e.target.value)}
            className="theme-input w-full rounded-lg p-3 text-xs font-mono"
            rows={10}
            placeholder={
              recorderMode === 'wizard'
                ? '先扫描模块，再点击“生成向导草案”'
                : recorderMode === 'teaching'
                  ? '先写教学步骤，再点击“生成教学草案”'
                  : '点击“生成脚本草案”后，在这里确认和修改步骤'
            }
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleGenerateRecorderDraft}
            disabled={drafting || recording || dryRunning || (recorderMode === 'teaching' && !teachingInstructions.trim())}
            className="button-secondary rounded-lg px-3 py-2 text-sm disabled:opacity-50"
          >
            {drafting
              ? '生成中...'
              : recorderMode === 'wizard'
                ? '1) 生成向导草案'
                : recorderMode === 'teaching'
                  ? '1) 生成教学草案'
                  : '1) 生成脚本草案'}
          </button>
          <button
            type="button"
            onClick={() => runRecorderFlow('dry-run')}
            disabled={dryRunning || recording || drafting || !recorderScriptText.trim()}
            className="button-secondary rounded-lg px-3 py-2 text-sm disabled:opacity-50"
          >
            {dryRunning ? '验证中...' : '2) Dry-run 验证'}
          </button>
          <button
            type="button"
            onClick={() => runRecorderFlow('record')}
            disabled={recording || dryRunning || drafting || !recorderScriptText.trim()}
            className="button-primary rounded-lg px-3 py-2 text-sm disabled:opacity-50"
          >
            {recording ? '录制中...' : '3) 正式录制并入库'}
          </button>
        </div>

        {recorderLogs.length > 0 && (
          <div className="rounded-lg border p-3 space-y-2" style={{ borderColor: 'var(--border)' }}>
            <p className="text-xs theme-muted">最近一次执行日志</p>
            <div className="max-h-52 overflow-y-auto space-y-1">
              {recorderLogs.map((log) => (
                <div key={`${log.index}-${log.action}-${log.durationMs}`} className="text-xs flex items-start gap-2">
                  <span className={`mt-0.5 h-2 w-2 rounded-full ${log.status === 'ok' ? 'bg-emerald-500' : log.status === 'skipped' ? 'bg-amber-500' : 'bg-red-500'}`} />
                  <span className="theme-title min-w-[92px]">{log.index}. {log.action}</span>
                  <span className="theme-muted flex-1 break-all">{log.detail}</span>
                  <span className="theme-muted">{log.durationMs}ms</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="素材总数" value={`${totalStats.totalCount}`} />
        <StatCard label="总占用" value={formatSize(totalStats.totalSize)} />
        <StatCard label="图片占用" value={formatSize(totalStats.imageSize)} />
        <StatCard label="视频占用" value={formatSize(totalStats.videoSize)} />
        <StatCard label="大文件(>5MB)" value={`${totalStats.largeCount}`} />
        <StatCard label="未引用" value={`${totalStats.unusedCount}`} />
      </div>

      <div
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        className={`relative flex items-center justify-center gap-4 px-6 py-4 rounded-xl border-2 border-dashed transition-all cursor-default select-none ${dragOver ? 'border-blue-400 bg-blue-50 scale-[1.01]' : pasteHint ? 'border-green-400 bg-green-50' : 'border-gray-200 bg-gray-50 hover:border-gray-300'}`}
      >
        {pasteHint ? (
          <><Check className="h-5 w-5 text-green-500 flex-shrink-0" /><p className="text-sm font-medium text-green-700">图片上传成功！</p></>
        ) : dragOver ? (
          <><Upload className="h-5 w-5 text-blue-500 flex-shrink-0" /><p className="text-sm font-medium text-blue-700">松开鼠标即可上传</p></>
        ) : (
          <>
            <ClipboardPaste className="h-5 w-5 theme-muted flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-gray-600">
                <kbd className="px-1.5 py-0.5 text-xs font-mono bg-white border border-gray-300 rounded shadow-sm">⌘V</kbd>
                {' '}粘贴截图 · 拖拽文件 · 或{' '}
                <button type="button" onClick={() => fileInputRef.current?.click()} className="text-blue-600 hover:underline">点击选择文件</button>
              </p>
              <p className="text-xs theme-muted mt-0.5">在任意位置按 ⌘V / Ctrl+V 即可粘贴 · 上传后可添加备注与标签</p>
            </div>
          </>
        )}
        {uploading && (
          <div className="absolute right-4 flex items-center gap-2 text-blue-600 text-sm">
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>
            上传中...
          </div>
        )}
      </div>

      <div className="theme-card">
        <div className="p-4 border-b border-gray-200 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full max-w-md">
              <Search className="theme-muted absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="搜索文件名、备注、标签、项目、引用内容..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Escape') setSearchQuery('');
                }}
                className="theme-input w-full rounded-lg py-2 pl-10 pr-10 text-sm"
              />
              {searchQuery && (
                <button type="button" onClick={() => { setSearchQuery(''); searchInputRef.current?.focus(); }} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 theme-muted hover:bg-slate-100 hover:text-slate-700" title="清空搜索">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-slate-100 text-slate-600"><Filter className="h-3.5 w-3.5" />筛选</span>
              <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as TypeFilter)} className="theme-input rounded-lg px-2 py-1.5 text-sm">
                <option value="all">全部类型</option>
                <option value="image">仅图片</option>
                <option value="video">仅视频</option>
              </select>
              <select value={sizeFilter} onChange={(e) => setSizeFilter(e.target.value as SizeFilter)} className="theme-input rounded-lg px-2 py-1.5 text-sm">
                <option value="all">全部大小</option>
                <option value="large_5mb">大于 5MB</option>
                <option value="large_20mb">大于 20MB</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-slate-100 text-slate-600"><ArrowUpDown className="h-3.5 w-3.5" />排序</span>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortBy)} className="theme-input rounded-lg px-2 py-1.5 text-sm">
                <option value="newest">最新上传</option>
                <option value="oldest">最早上传</option>
                <option value="size_desc">大小从大到小</option>
                <option value="size_asc">大小从小到大</option>
                <option value="name_asc">名称 A-Z</option>
                <option value="name_desc">名称 Z-A</option>
                <option value="usage_desc">引用次数高优先</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-slate-100 text-slate-600"><Layers className="h-3.5 w-3.5" />分组</span>
              <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)} className="theme-input rounded-lg px-2 py-1.5 text-sm">
                <option value="none">不分组</option>
                <option value="month">按月份</option>
                <option value="type">按类型</option>
                <option value="size">按大小区间</option>
                <option value="project">按项目</option>
                <option value="usage">按引用状态</option>
              </select>
            </div>

            <div className="ml-auto flex items-center gap-2">
              <button type="button" onClick={() => setViewMode('grid')} className={`p-2 rounded-lg ${viewMode === 'grid' ? 'bg-gray-100 theme-title' : 'theme-muted'}`}><Grid className="h-5 w-5" /></button>
              <button type="button" onClick={() => setViewMode('list')} className={`p-2 rounded-lg ${viewMode === 'list' ? 'bg-gray-100 theme-title' : 'theme-muted'}`}><List className="h-5 w-5" /></button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-amber-50 text-amber-700"><Link2 className="h-3.5 w-3.5" />清理助手</span>
            <button type="button" onClick={() => setCleanupFilter('none')} className={`px-2.5 py-1 text-xs rounded ${cleanupFilter === 'none' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>全部</button>
            <button type="button" onClick={() => setCleanupFilter('largest')} className={`px-2.5 py-1 text-xs rounded ${cleanupFilter === 'largest' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>超大文件</button>
            <button type="button" onClick={() => setCleanupFilter('unused')} className={`px-2.5 py-1 text-xs rounded ${cleanupFilter === 'unused' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>未引用</button>
            <button type="button" onClick={() => setCleanupFilter('no_desc')} className={`px-2.5 py-1 text-xs rounded ${cleanupFilter === 'no_desc' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>无备注</button>
            <button type="button" onClick={() => setCleanupFilter('no_tag')} className={`px-2.5 py-1 text-xs rounded ${cleanupFilter === 'no_tag' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>无标签</button>
            <button type="button" onClick={() => setCleanupFilter('no_project')} className={`px-2.5 py-1 text-xs rounded ${cleanupFilter === 'no_project' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>未归属项目</button>

            <span className="ml-auto text-sm theme-muted">当前结果 {displayedAssets.length} 个素材</span>
          </div>

          {selectedIds.length > 0 && (
            <div className="rounded-lg border border-blue-200 bg-blue-50/70 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-blue-700">已选择 {selectedIds.length} 项</span>
                <button type="button" onClick={selectAllDisplayed} className="text-xs px-2 py-1 rounded bg-white text-slate-700 hover:bg-slate-100">全选当前结果</button>
                <button type="button" onClick={clearSelection} className="text-xs px-2 py-1 rounded bg-white text-slate-700 hover:bg-slate-100">清空选择</button>
                <button type="button" onClick={requestBulkDelete} className="text-xs px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700">批量删除</button>

                <div className="ml-2 flex items-center gap-1">
                  <Tag className="h-3.5 w-3.5 text-blue-700" />
                  <input value={bulkTag} onChange={(e) => setBulkTag(e.target.value)} placeholder="批量添加标签" className="theme-input h-8 rounded px-2 text-xs w-32" />
                  <button type="button" onClick={handleBulkAddTag} className="text-xs px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700">添加</button>
                </div>

                <div className="ml-2 flex items-center gap-1">
                  <FolderOpen className="h-3.5 w-3.5 text-blue-700" />
                  <select value={bulkProjectId} onChange={(e) => setBulkProjectId(e.target.value)} className="theme-input h-8 rounded px-2 text-xs w-40">
                    <option value="">未归属项目</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  <button type="button" onClick={handleBulkAssignProject} className="text-xs px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700">应用</button>
                </div>
              </div>
            </div>
          )}
        </div>

        {loading ? (
          <div className="text-center py-12"><p className="theme-muted">加载中...</p></div>
        ) : displayedAssets.length === 0 ? (
          <div className="text-center py-12">
            <ImageIcon className="h-12 w-12 mx-auto mb-4 text-gray-300" />
            <p className="theme-muted mb-2">未找到符合条件的素材</p>
            <p className="theme-muted text-xs mb-4">试试调整搜索词、筛选条件或清理助手</p>
            <button type="button" onClick={() => { setSearchQuery(''); setTypeFilter('all'); setSizeFilter('all'); setCleanupFilter('none'); }} className="button-primary inline-flex items-center gap-2 rounded-lg px-4 py-2">
              <X className="h-4 w-4" />重置筛选
            </button>
          </div>
        ) : (
          <div className="p-4 space-y-5">
            {groupedAssets.map((group) => (
              <section key={group.key}>
                {groupBy !== 'none' && (
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="theme-title text-sm font-semibold">{group.label}</h3>
                    <span className="text-xs theme-muted">{group.items.length} 项</span>
                  </div>
                )}

                {viewMode === 'grid' ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                    {group.items.map(renderAssetCard)}
                  </div>
                ) : (
                  <div className="divide-y rounded-lg border border-gray-100 overflow-hidden">
                    {group.items.map(renderAssetRow)}
                  </div>
                )}
              </section>
            ))}
          </div>
        )}
      </div>

      {showAiGenerateDialog && (
        <div className="modern-overlay z-[10005]" onClick={() => { void closeAiGenerateDialog(); }}>
          <div className="modern-modal w-full max-w-xl p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="theme-title text-lg font-semibold">AI 生成配图</h3>
                <p className="theme-muted mt-1 text-xs">先生成预览图，确认满意后再加入素材库。</p>
              </div>
              <button
                type="button"
                onClick={() => { void closeAiGenerateDialog(); }}
                disabled={aiGenerating || aiSavingGenerated}
                className="button-secondary rounded-lg p-2 disabled:opacity-50"
                title="关闭"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <label className="block text-xs theme-muted">
                主题描述
                <textarea
                  value={aiTopic}
                  onChange={(e) => setAiTopic(e.target.value)}
                  rows={3}
                  className="theme-input mt-1 w-full rounded-lg px-3 py-2 text-sm"
                  placeholder="例如：深色科技风的多平台内容运营工作台，3D 质感"
                />
              </label>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="block text-xs theme-muted">
                  风格
                  <input
                    value={aiStyle}
                    onChange={(e) => setAiStyle(e.target.value)}
                    className="theme-input mt-1 w-full rounded-lg px-3 py-2 text-sm"
                    placeholder="现代简约 / 科技插画 / 赛博风"
                  />
                </label>

                <label className="block text-xs theme-muted">
                  模型
                  <select
                    value={aiModel}
                    onChange={(e) => setAiModel(e.target.value)}
                    className="theme-input mt-1 w-full rounded-lg px-3 py-2 text-sm"
                  >
                    {AI_IMAGE_MODELS.map((model) => (
                      <option key={model.value} value={model.value}>{model.label}</option>
                    ))}
                  </select>
                </label>

                <label className="block text-xs theme-muted">
                  生成模式
                  <select
                    value={aiSpeedMode}
                    onChange={(e) => setAiSpeedMode(e.target.value as GenerateSpeedMode)}
                    className="theme-input mt-1 w-full rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="fast">极速预览（推荐，1K）</option>
                    <option value="quality">高清生成（更慢，2K）</option>
                  </select>
                </label>

                <label className="block text-xs theme-muted">
                  生成数量
                  <select
                    value={aiCount}
                    onChange={(e) => setAiCount(Number(e.target.value))}
                    className="theme-input mt-1 w-full rounded-lg px-3 py-2 text-sm"
                  >
                    <option value={1}>1 张</option>
                    <option value={2}>2 张</option>
                    <option value={3}>3 张</option>
                    <option value={4}>4 张</option>
                  </select>
                </label>

                <label className="block text-xs theme-muted">
                  归属项目（可选）
                  <select
                    value={aiProjectId}
                    onChange={(e) => setAiProjectId(e.target.value)}
                    className="theme-input mt-1 w-full rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="">未归属项目</option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>{project.name}</option>
                    ))}
                  </select>
                </label>
              </div>

              <p className="theme-muted text-xs">
                只保留 Codex 内置生图和 MiniMax 两个渠道；不会自动切换到 Gemini、infsh 或其他额外付费模型。
              </p>
              <p className="theme-muted text-xs">
                `极速预览` 会优先响应速度；如果你是做封面或要精细纹理，再切到 `高清生成`。
              </p>
              {aiGenerateError && (
                <p className="text-xs text-red-600 rounded-md bg-red-50 border border-red-200 px-2 py-1.5">
                  {aiGenerateError}
                </p>
              )}

              {aiGeneratedPreviews.length > 0 && (
                <div className="rounded-xl border p-3" style={{ borderColor: 'var(--border)', background: 'var(--surface-soft)' }}>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>生成预览</p>
                    <span className="theme-muted text-xs">{aiGeneratedPreviews.length} 张</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {aiGeneratedPreviews.map((item, index) => (
                      <div key={item.path} className="overflow-hidden rounded-lg border" style={{ borderColor: 'var(--border)' }}>
                        <button
                          type="button"
                          onClick={() => setAiPreviewIndex(index)}
                          className="block w-full"
                          title="点击放大预览"
                        >
                        <img
                          src={item.path}
                          alt={item.filename}
                          className="h-32 w-full object-cover cursor-zoom-in"
                        />
                        </button>
                        <div className="p-2">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{item.filename}</p>
                            <button
                              type="button"
                              onClick={() => setAiPreviewIndex(index)}
                              className="ml-auto rounded p-1 theme-muted hover:bg-gray-100"
                              title="放大预览"
                            >
                              <ZoomIn className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <p className="theme-muted mt-1 text-[11px]">{formatSize(item.size)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => { void closeAiGenerateDialog(); }}
                disabled={aiGenerating || aiSavingGenerated}
                className="button-secondary rounded-lg px-3 py-2 text-sm disabled:opacity-50"
              >
                {aiGeneratedPreviews.length > 0 ? '放弃预览' : '取消'}
              </button>
              {aiGeneratedPreviews.length > 0 && (
                <button
                  type="button"
                  onClick={handleSaveAiGeneratedImages}
                  disabled={aiGenerating || aiSavingGenerated}
                  className="button-primary rounded-lg px-3 py-2 text-sm disabled:opacity-50"
                >
                  {aiSavingGenerated ? '入库中...' : '加入素材库'}
                </button>
              )}
              <button
                type="button"
                onClick={handleGenerateAiImages}
                disabled={aiGenerating || aiSavingGenerated}
                className="button-primary rounded-lg px-3 py-2 text-sm disabled:opacity-50"
              >
                {aiGenerating ? '生成中...' : aiGeneratedPreviews.length > 0 ? '重新生成' : '开始生成'}
              </button>
            </div>
          </div>
        </div>
      )}

      {aiPreviewIndex !== null && aiGeneratedPreviews[aiPreviewIndex] && (
        <div
          className="fixed inset-0 z-[10015] flex items-center justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.92)' }}
          onClick={() => setAiPreviewIndex(null)}
        >
          <button
            type="button"
            onClick={() => setAiPreviewIndex(null)}
            className="absolute top-4 right-4 p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-full transition-colors z-10"
          >
            <X className="h-6 w-6" />
          </button>
          <div className="absolute top-4 left-1/2 -translate-x-1/2 text-white/60 text-sm">
            {aiPreviewIndex + 1} / {aiGeneratedPreviews.length}
          </div>

          {aiGeneratedPreviews.length > 1 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); navigateAiPreview('prev'); }}
              className="absolute left-4 top-1/2 -translate-y-1/2 p-3 text-white/70 hover:text-white hover:bg-white/10 rounded-full transition-colors z-10"
            >
              <ChevronLeft className="h-8 w-8" />
            </button>
          )}

          <div className="max-w-[92vw] max-h-[84vh] flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
            <img
              src={aiGeneratedPreviews[aiPreviewIndex].path}
              alt={aiGeneratedPreviews[aiPreviewIndex].filename}
              className="max-w-full max-h-[84vh] object-contain rounded-lg shadow-2xl"
              style={{ animation: 'fadeInScale 0.2s ease' }}
            />
          </div>

          {aiGeneratedPreviews.length > 1 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); navigateAiPreview('next'); }}
              className="absolute right-4 top-1/2 -translate-y-1/2 p-3 text-white/70 hover:text-white hover:bg-white/10 rounded-full transition-colors z-10"
            >
              <ChevronRight className="h-8 w-8" />
            </button>
          )}

          <div
            className="absolute bottom-0 left-0 right-0 px-6 py-4"
            style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.75), transparent)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-white font-medium truncate">{aiGeneratedPreviews[aiPreviewIndex].filename}</p>
            <p className="text-white/50 text-sm">{formatSize(aiGeneratedPreviews[aiPreviewIndex].size)}</p>
          </div>
        </div>
      )}

      {previewAsset && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.92)' }} onClick={() => setPreviewAsset(null)}>
          <button type="button" onClick={() => setPreviewAsset(null)} className="absolute top-4 right-4 p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-full transition-colors z-10"><X className="h-6 w-6" /></button>
          <div className="absolute top-4 left-1/2 -translate-x-1/2 text-white/60 text-sm">{previewIndex + 1} / {previewableAssets.length}</div>

          {previewableAssets.length > 1 && (
            <button type="button" onClick={(e) => { e.stopPropagation(); navigatePreview('prev'); }} className="absolute left-4 top-1/2 -translate-y-1/2 p-3 text-white/70 hover:text-white hover:bg-white/10 rounded-full transition-colors z-10"><ChevronLeft className="h-8 w-8" /></button>
          )}

          <div className="max-w-[90vw] max-h-[80vh] flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
            {previewAsset.type === 'image' ? (
              <img
                key={previewAsset.id}
                src={`${window.location.origin}${previewAsset.path}`}
                alt={previewAsset.filename}
                className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl"
                style={{ animation: 'fadeInScale 0.2s ease' }}
                onError={(e) => { e.currentTarget.src = previewAsset.path; }}
              />
            ) : (
              <video
                key={previewAsset.id}
                src={`${window.location.origin}${previewAsset.path}`}
                className="max-w-full max-h-[80vh] rounded-lg shadow-2xl bg-black"
                controls
                autoPlay
                preload="metadata"
                style={{ animation: 'fadeInScale 0.2s ease' }}
                onError={(e) => {
                  const el = e.currentTarget;
                  if (el.src !== previewAsset.path) {
                    el.src = previewAsset.path;
                  }
                }}
              />
            )}
          </div>

          {previewableAssets.length > 1 && (
            <button type="button" onClick={(e) => { e.stopPropagation(); navigatePreview('next'); }} className="absolute right-4 top-1/2 -translate-y-1/2 p-3 text-white/70 hover:text-white hover:bg-white/10 rounded-full transition-colors z-10"><ChevronRight className="h-8 w-8" /></button>
          )}

          <div className="absolute bottom-0 left-0 right-0 px-6 py-4 flex items-end justify-between gap-4" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.75), transparent)' }} onClick={(e) => e.stopPropagation()}>
            <div className="flex-1 min-w-0">
              <p className="text-white font-medium truncate">{previewAsset.filename}</p>
              <p className="text-white/50 text-sm">{formatSize(previewAsset.size)} · {new Date(previewAsset.createdAt).toLocaleDateString('zh-CN')} · 引用 {(previewAsset.referencedByCount || 0)} 篇</p>
              <div className="mt-2">
                {renderReferencePanel(previewAsset)}
              </div>
              <div className="mt-2 max-w-lg">
                {renderDescEditor(previewAsset)}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button type="button" onClick={() => copyUrl(previewAsset.path)} className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-sm rounded-lg transition-colors"><Copy className="h-3.5 w-3.5" />复制链接</button>
              <button type="button" onClick={() => requestDelete(previewAsset.id, true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/70 hover:bg-red-500 text-white text-sm rounded-lg transition-colors"><Trash2 className="h-3.5 w-3.5" />删除</button>
            </div>
          </div>
        </div>
      )}

      {confirmDialog.open && (
        <div className="modern-overlay z-[10020]" onClick={closeConfirm}>
          <div className="modern-modal w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-full bg-red-100 text-red-600">
                <AlertTriangle className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="theme-title text-base font-semibold">{confirmDialog.title}</p>
                <p className="theme-muted mt-1 text-sm">{confirmDialog.description}</p>
              </div>
            </div>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button type="button" onClick={closeConfirm} className="button-secondary rounded-lg px-3 py-2 text-sm" disabled={confirming}>
                取消
              </button>
              <button type="button" onClick={handleConfirm} className="rounded-lg bg-red-600 px-3 py-2 text-sm text-white hover:bg-red-700 disabled:opacity-60" disabled={confirming}>
                {confirming ? '处理中...' : confirmDialog.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        @keyframes fadeInScale {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="theme-card p-3">
      <p className="text-[11px] theme-muted">{label}</p>
      <p className="mt-1 text-sm font-semibold theme-title">{value}</p>
    </div>
  );
}

function VideoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  );
}
