'use client';

import { Copy, Loader2, Sparkles, X } from 'lucide-react';
import type { AppSettings } from '@/lib/settings-schema';

type Candidate = {
  title: string;
  body: string;
  provider: string;
  stylePreset: AppSettings['writingStylePreset'];
  styleLabel: string;
};

export default function PolishCompareDialog(props: {
  open: boolean;
  loading: boolean;
  candidates: Candidate[];
  onClose: () => void;
  onApply: (candidate: Candidate) => void;
}) {
  const { open, loading, candidates, onClose, onApply } = props;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/45 p-4">
      <div className="theme-panel flex max-h-[88vh] w-full max-w-6xl flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: 'var(--border)' }}>
          <div>
            <h2 className="theme-title text-lg font-semibold">对比润色结果</h2>
            <p className="theme-muted mt-1 text-sm">
              一次生成多套不同风格的候选版本，预览后再决定应用哪一版。
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border p-2 transition-colors hover:bg-slate-50"
            style={{ borderColor: 'var(--border)' }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {loading ? (
          <div className="flex min-h-[360px] flex-col items-center justify-center gap-3">
            <Loader2 className="theme-muted h-8 w-8 animate-spin" />
            <p className="theme-title text-sm font-medium">正在生成多套润色结果...</p>
            <p className="theme-muted text-sm">默认会对比 5 种写作风格，可能需要一点时间。</p>
          </div>
        ) : (
          <div className="grid gap-4 overflow-y-auto p-5 lg:grid-cols-2">
            {candidates.map((candidate) => (
              <div
                key={candidate.stylePreset}
                className="theme-card flex min-h-[320px] flex-col overflow-hidden rounded-2xl border"
                style={{ borderColor: 'var(--border)' }}
              >
                <div className="flex items-start justify-between gap-3 border-b px-4 py-4" style={{ borderColor: 'var(--border)', background: 'var(--surface-soft)' }}>
                  <div className="min-w-0">
                    <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium tag-info">
                      <Sparkles className="h-3.5 w-3.5" />
                      {candidate.styleLabel}
                    </div>
                    <p className="theme-muted mt-2 text-xs">Provider: {candidate.provider}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onApply(candidate)}
                    className="button-primary inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium"
                  >
                    <Copy className="h-4 w-4" />
                    应用这一版
                  </button>
                </div>

                <div className="overflow-y-auto px-4 py-4">
                  <h3 className="theme-title text-base font-semibold">{candidate.title || '无标题'}</h3>
                  <div
                    className="content-preview mt-4 text-sm"
                    dangerouslySetInnerHTML={{ __html: candidate.body }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
