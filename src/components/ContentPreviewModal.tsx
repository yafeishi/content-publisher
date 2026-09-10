'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

type PreviewTheme = 'standard' | 'magazine' | 'minimal' | 'contrast';

interface ContentPreviewModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  body: string;
  coverImage?: string | null;
  selectedImages?: string[];
  platforms?: string[];
  scheduledAt?: string;
  footerMeta?: string[];
}

const PREVIEW_THEME_KEY = 'content.preview.theme.v1';

const PREVIEW_THEMES: Array<{ id: PreviewTheme; label: string }> = [
  { id: 'standard', label: '标准' },
  { id: 'magazine', label: '杂志' },
  { id: 'minimal', label: '极简' },
  { id: 'contrast', label: '高对比' },
];

function getPlatformDisplayName(platform: string) {
  if (platform === 'xiaohongshu') return '小红书';
  if (platform === 'wechat') return '微信公众号';
  if (platform === 'mowen') return '墨问笔记';
  if (platform === 'obsidian') return 'Obsidian';
  return platform;
}

function isVideoPath(assetPath: string) {
  return /\.(mp4|mov|webm|m4v|avi)$/i.test(assetPath);
}

export default function ContentPreviewModal({
  open,
  onClose,
  title,
  body,
  coverImage,
  selectedImages = [],
  platforms = [],
  scheduledAt,
  footerMeta = [],
}: ContentPreviewModalProps) {
  const [theme, setTheme] = useState<PreviewTheme>('standard');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(PREVIEW_THEME_KEY, theme);
  }, [theme]);

  if (!open) return null;

  return (
    <div className="modern-overlay" onClick={onClose}>
      <div className="modern-modal max-h-[86vh] max-w-3xl overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b flex items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-lg">内容预览</h3>
            <p className="theme-muted text-xs mt-1">可切换预览风格，检查排版与阅读效果</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 rounded-lg border p-1" style={{ borderColor: 'var(--border)' }}>
              {PREVIEW_THEMES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTheme(item.id)}
                  className={`rounded-md px-2.5 py-1 text-xs transition-colors ${theme === item.id ? 'bg-blue-600 text-white' : 'theme-muted hover:bg-slate-100 hover:text-slate-800'}`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <button onClick={onClose} className="button-secondary rounded-lg p-2">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {coverImage && (
            isVideoPath(coverImage) ? (
              <video src={coverImage} controls className="w-full max-h-72 rounded-xl mb-5 bg-black object-contain" />
            ) : (
              <img
                src={coverImage}
                alt="封面"
                className="w-full max-h-72 object-cover rounded-xl mb-5"
              />
            )
          )}

          <div className={`content-preview content-preview-${theme}`}>
            <h1 className="content-preview-main-title">{title || '无标题'}</h1>
            <div
              dangerouslySetInnerHTML={{ __html: body || '<p class="text-gray-400">暂无内容</p>' }}
            />
          </div>

          {selectedImages.length > 0 && (
            <div className="mt-6 pt-4 border-t border-gray-100">
              <p className="text-sm font-medium text-gray-700 mb-3">
                素材 ({selectedImages.length})
              </p>
              <div className="grid grid-cols-3 gap-2">
                {selectedImages.map((img, i) => (
                  isVideoPath(img) ? (
                    <video
                      key={`${img}-${i}`}
                      src={img}
                      controls
                      className="w-full aspect-square object-cover rounded-lg bg-black"
                    />
                  ) : (
                    <img
                      key={`${img}-${i}`}
                      src={img}
                      alt=""
                      className="w-full aspect-square object-cover rounded-lg"
                    />
                  )
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="border-t p-4" style={{ borderColor: 'var(--border)', background: 'var(--surface-soft)' }}>
          <div className="theme-muted flex flex-wrap items-center gap-4 text-sm">
            <span>
              平台: {platforms.length > 0 ? platforms.map(getPlatformDisplayName).join(', ') : '未选择'}
            </span>
            {scheduledAt && (
              <span>定时: {new Date(scheduledAt).toLocaleString('zh-CN')}</span>
            )}
            {footerMeta.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
