'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Loader2,
  Sparkles,
  Wand2,
  X,
  ZoomIn,
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  Save,
  Star,
} from 'lucide-react';
import { useDialog } from '@/components/ui/dialog-center';

interface AiGeneratedPreview {
  path: string;
  filename: string;
  size: number;
  type: 'image';
}

interface SavedAsset {
  id: string;
  path: string;
  filename: string;
}

interface AiImageInsertDialogProps {
  open: boolean;
  defaultTopic: string;
  projectId?: string | null;
  onClose: () => void;
  onInsert: (path: string, filename: string) => void;
  onSetCover: (path: string) => void;
  onAssetsSaved?: (assets: SavedAsset[]) => void;
}

type AiImageModelOption = {
  value: string;
  label: string;
};

type GenerateSpeedMode = 'fast' | 'quality';

const AI_IMAGE_MODELS: AiImageModelOption[] = [
  { value: 'codex-imagegen', label: 'Codex 内置生图（使用 Codex 额度）' },
  { value: 'minimax-image-01', label: 'MiniMax Image 01' },
  { value: 'minimax-image-01-live', label: 'MiniMax Image 01 Live' },
];

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

export default function AiImageInsertDialog({
  open,
  defaultTopic,
  projectId,
  onClose,
  onInsert,
  onSetCover,
  onAssetsSaved,
}: AiImageInsertDialogProps) {
  const { notify } = useDialog();
  const [topic, setTopic] = useState('');
  const [style, setStyle] = useState('现代简约');
  const [model, setModel] = useState(AI_IMAGE_MODELS[0].value);
  const [speedMode, setSpeedMode] = useState<GenerateSpeedMode>('fast');
  const [count, setCount] = useState(1);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [previews, setPreviews] = useState<AiGeneratedPreview[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [retainedPaths, setRetainedPaths] = useState<string[]>([]);

  const selectedPreview = useMemo(() => {
    if (selectedIndex === null) return null;
    return previews[selectedIndex] || null;
  }, [previews, selectedIndex]);

  useEffect(() => {
    if (!open) return;
    setTopic(defaultTopic);
    setError('');
    setPreviews([]);
    setSelectedIndex(null);
    setLightboxIndex(null);
    setRetainedPaths([]);
    setSpeedMode('fast');
  }, [defaultTopic, open]);

  const discardUnusedPreviews = useCallback(async (previewList: AiGeneratedPreview[], keepPaths: string[]) => {
    const discardPaths = previewList
      .map((item) => item.path)
      .filter((item) => !keepPaths.includes(item));
    if (discardPaths.length === 0) return;
    try {
      await fetch('/api/assets/ai-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'discard',
          previewPaths: discardPaths,
        }),
      });
    } catch (discardError) {
      console.error('Failed to discard unused ai previews:', discardError);
    }
  }, []);

  const handleClose = useCallback(async () => {
    if (generating || saving) return;
    await discardUnusedPreviews(previews, retainedPaths);
    onClose();
  }, [discardUnusedPreviews, generating, onClose, previews, retainedPaths, saving]);

  const closeWithRetained = useCallback(async (keepPaths: string[]) => {
    const mergedKeepPaths = Array.from(new Set([...retainedPaths, ...keepPaths]));
    setRetainedPaths(mergedKeepPaths);
    await discardUnusedPreviews(previews, mergedKeepPaths);
    onClose();
  }, [discardUnusedPreviews, onClose, previews, retainedPaths]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && lightboxIndex === null) {
        void handleClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleClose, lightboxIndex, open]);

  const handleGenerate = async () => {
    const nextTopic = topic.trim();
    if (!nextTopic) {
      setError('请输入图片描述');
      return;
    }

    setGenerating(true);
    setError('');
    try {
      if (previews.length > 0) {
        await discardUnusedPreviews(previews, retainedPaths);
      }
      const response = await fetch('/api/assets/ai-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate',
          topic: nextTopic,
          style: style.trim(),
          model,
          speedMode,
          count,
          projectId: projectId || null,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data?.error || 'AI 配图生成失败');
        return;
      }
      const nextPreviews = Array.isArray(data?.previews) ? data.previews as AiGeneratedPreview[] : [];
      if (nextPreviews.length === 0) {
        setError('生成完成，但未返回预览图');
        return;
      }
      setPreviews(nextPreviews);
      setSelectedIndex(0);
      setLightboxIndex(null);
      setRetainedPaths([]);
      notify(`已生成 ${nextPreviews.length} 张预览图`, 'success');
    } catch (generateError) {
      console.error('Failed to generate ai images in content editor:', generateError);
      setError('AI 配图生成失败，请稍后重试');
    } finally {
      setGenerating(false);
    }
  };

  const handleInsertOnly = async () => {
    if (!selectedPreview) {
      setError('请先选择一张预览图');
      return;
    }
    onInsert(selectedPreview.path, selectedPreview.filename);
    notify('已插入正文', 'success');
    await closeWithRetained([selectedPreview.path]);
  };

  const handleInsertAndSave = async () => {
    if (!selectedPreview) {
      setError('请先选择一张预览图');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/assets/ai-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save',
          topic: topic.trim(),
          style: style.trim(),
          model,
          projectId: projectId || null,
          previewPaths: [selectedPreview.path],
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data?.error || '加入素材库失败');
        return;
      }
      const savedAssets = Array.isArray(data?.assets) ? data.assets as SavedAsset[] : [];
      if (savedAssets.length === 0) {
        setError('加入素材库失败：未返回素材');
        return;
      }
      onInsert(selectedPreview.path, selectedPreview.filename);
      onAssetsSaved?.(savedAssets);
      notify('已插入正文并加入素材库', 'success');
      await closeWithRetained([selectedPreview.path]);
    } catch (saveError) {
      console.error('Failed to save ai image asset from content editor:', saveError);
      setError('加入素材库失败，请稍后重试');
    } finally {
      setSaving(false);
    }
  };

  const handleSetAsCover = async () => {
    if (!selectedPreview) {
      setError('请先选择一张预览图');
      return;
    }
    onSetCover(selectedPreview.path);
    notify('已设为封面图', 'success');
    await closeWithRetained([selectedPreview.path]);
  };

  const activeLightboxItem = lightboxIndex === null ? null : previews[lightboxIndex] || null;

  const navigateLightbox = (direction: 'prev' | 'next') => {
    if (lightboxIndex === null || previews.length === 0) return;
    const nextIndex = direction === 'next'
      ? (lightboxIndex + 1) % previews.length
      : (lightboxIndex - 1 + previews.length) % previews.length;
    setLightboxIndex(nextIndex);
  };

  if (!open) return null;

  return (
    <>
      <div className="modern-overlay z-[120]" onClick={() => { void handleClose(); }}>
        <div className="modern-modal w-full max-w-5xl p-0 overflow-hidden" onClick={(event) => event.stopPropagation()}>
          <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: 'var(--border)' }}>
            <div>
              <h3 className="theme-title text-lg font-semibold">AI 配图</h3>
              <p className="theme-muted mt-1 text-xs">先生成预览，再决定插入正文、设为封面或加入素材库。</p>
            </div>
            <button type="button" onClick={() => { void handleClose(); }} className="button-secondary rounded-lg p-2" disabled={generating || saving}>
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid gap-0 lg:grid-cols-[320px_minmax(0,1fr)]">
            <div className="border-b p-5 lg:border-b-0 lg:border-r" style={{ borderColor: 'var(--border)' }}>
              <div className="space-y-4">
                <div>
                  <label className="theme-muted mb-1 block text-xs">图片描述</label>
                  <textarea
                    value={topic}
                    onChange={(event) => setTopic(event.target.value)}
                    placeholder="描述这张图的主题、场景和重点元素"
                    rows={5}
                    className="theme-input w-full rounded-xl px-3 py-2 text-sm"
                  />
                  <p className="theme-muted mt-1 text-[11px]">默认会优先带入你当前编辑中的标题或选中文本摘要。</p>
                </div>

                <div>
                  <label className="theme-muted mb-1 block text-xs">风格</label>
                  <input
                    value={style}
                    onChange={(event) => setStyle(event.target.value)}
                    placeholder="例如：现代简约 / 科技感 / 手绘"
                    className="theme-input w-full rounded-xl px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="theme-muted mb-1 block text-xs">模型</label>
                  <select
                    value={model}
                    onChange={(event) => setModel(event.target.value)}
                    className="theme-input w-full rounded-xl px-3 py-2 text-sm"
                  >
                    {AI_IMAGE_MODELS.map((item) => (
                      <option key={item.value} value={item.value}>{item.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="theme-muted mb-1 block text-xs">生成模式</label>
                  <select
                    value={speedMode}
                    onChange={(event) => setSpeedMode(event.target.value as GenerateSpeedMode)}
                    className="theme-input w-full rounded-xl px-3 py-2 text-sm"
                  >
                    <option value="fast">极速预览（推荐，1K）</option>
                    <option value="quality">高清生成（更慢，2K）</option>
                  </select>
                </div>

                <div>
                  <label className="theme-muted mb-1 block text-xs">数量</label>
                  <select
                    value={count}
                    onChange={(event) => setCount(Number(event.target.value) || 1)}
                    className="theme-input w-full rounded-xl px-3 py-2 text-sm"
                  >
                    {[1, 2, 3, 4].map((item) => (
                      <option key={item} value={item}>{item} 张</option>
                    ))}
                  </select>
                </div>

                {error && (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
                    {error}
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={generating || saving}
                  className="button-primary flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 disabled:opacity-60"
                >
                  {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {generating ? '生成中...' : '生成预览'}
                </button>
              </div>
            </div>

            <div className="p-5">
              {previews.length === 0 ? (
                <div className="flex min-h-[420px] flex-col items-center justify-center rounded-2xl border border-dashed" style={{ borderColor: 'var(--border)', background: 'var(--surface-soft)' }}>
                  <Wand2 className="h-10 w-10 text-slate-300" />
                  <p className="theme-title mt-4 text-sm font-medium">还没有生成预览图</p>
                  <p className="theme-muted mt-1 text-xs">左侧填写描述后，先生成一版看看效果。</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="theme-title text-sm font-semibold">生成预览</h4>
                      <p className="theme-muted mt-1 text-xs">点击缩略图切换，右侧可直接执行插入动作。</p>
                    </div>
                    <span className="theme-muted text-xs">{previews.length} 张</span>
                  </div>

                  <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
                    <div className="space-y-3">
                      <button
                        type="button"
                        onClick={() => selectedIndex !== null && setLightboxIndex(selectedIndex)}
                        className="group relative block w-full overflow-hidden rounded-2xl border text-left"
                        style={{ borderColor: 'var(--border)', background: 'var(--surface-soft)' }}
                      >
                        {selectedPreview ? (
                          <>
                            <img
                              src={selectedPreview.path}
                              alt={selectedPreview.filename}
                              className="h-[320px] w-full object-cover"
                            />
                            <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
                              <ZoomIn className="h-3.5 w-3.5" />
                              查看大图
                            </span>
                          </>
                        ) : (
                          <div className="flex h-[320px] items-center justify-center">
                            <ImageIcon className="h-10 w-10 text-slate-300" />
                          </div>
                        )}
                      </button>

                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        {previews.map((item, index) => {
                          const active = index === selectedIndex;
                          return (
                            <button
                              key={item.path}
                              type="button"
                              onClick={() => setSelectedIndex(index)}
                              className={`overflow-hidden rounded-xl border text-left transition-all ${active ? 'ring-2 ring-sky-200' : ''}`}
                              style={{ borderColor: active ? 'rgb(125 211 252)' : 'var(--border)', background: 'var(--surface-soft)' }}
                            >
                              <img src={item.path} alt={item.filename} className="h-28 w-full object-cover" />
                              <div className="p-2">
                                <p className="truncate text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{item.filename}</p>
                                <p className="theme-muted mt-1 text-[11px]">{formatBytes(item.size)}</p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--surface-soft)' }}>
                      <h4 className="theme-title text-sm font-semibold">当前选择</h4>
                      {selectedPreview ? (
                        <>
                          <p className="theme-muted mt-2 truncate text-xs">{selectedPreview.filename}</p>
                          <p className="theme-muted mt-1 text-xs">{formatBytes(selectedPreview.size)}</p>
                          <p className="theme-muted mt-1 text-xs">
                            {model === 'codex-imagegen'
                              ? '当前使用 Codex 内置生图额度。'
                              : speedMode === 'fast' ? '当前为极速预览图，优先响应速度。' : '当前为高清生成图，画质更高但生成更慢。'}
                          </p>
                          <div className="mt-4 space-y-2">
                            <button
                              type="button"
                              onClick={() => { void handleInsertOnly(); }}
                              disabled={generating || saving}
                              className="button-primary flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2 disabled:opacity-60"
                            >
                              <ImageIcon className="h-4 w-4" />
                              插入正文
                            </button>
                            <button
                              type="button"
                              onClick={() => { void handleInsertAndSave(); }}
                              disabled={generating || saving}
                              className="button-secondary flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2 disabled:opacity-60"
                            >
                              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                              {saving ? '处理中...' : '插入并入素材库'}
                            </button>
                            <button
                              type="button"
                              onClick={() => { void handleSetAsCover(); }}
                              disabled={generating || saving}
                              className="button-secondary flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2 disabled:opacity-60"
                            >
                              <Star className="h-4 w-4" />
                              设为封面
                            </button>
                          </div>
                        </>
                      ) : (
                        <p className="theme-muted mt-2 text-xs">先从左侧选一张预览图。</p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {activeLightboxItem && (
        <div className="fixed inset-0 z-[130] bg-black/85" onClick={() => setLightboxIndex(null)}>
          <div className="relative flex h-full w-full items-center justify-center px-6 py-8" onClick={(event) => event.stopPropagation()}>
            {previews.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={() => navigateLightbox('prev')}
                  className="absolute left-5 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white backdrop-blur hover:bg-white/20"
                >
                  <ChevronLeft className="h-6 w-6" />
                </button>
                <button
                  type="button"
                  onClick={() => navigateLightbox('next')}
                  className="absolute right-5 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white backdrop-blur hover:bg-white/20"
                >
                  <ChevronRight className="h-6 w-6" />
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => setLightboxIndex(null)}
              className="absolute right-5 top-5 z-10 rounded-full bg-white/10 p-3 text-white backdrop-blur hover:bg-white/20"
            >
              <X className="h-5 w-5" />
            </button>
            <img src={activeLightboxItem.path} alt={activeLightboxItem.filename} className="max-h-full max-w-full rounded-2xl object-contain" />
          </div>
        </div>
      )}
    </>
  );
}
