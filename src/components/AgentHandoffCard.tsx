'use client';

import Link from 'next/link';
import { Bot, ChevronDown, ChevronUp, Copy, ExternalLink, Link2 } from 'lucide-react';
import { useMemo, useState, useSyncExternalStore } from 'react';
import {
  AGENT_SUBMIT_PAGE_PATH,
  buildAgentSubmitApiUrl,
  buildAgentSubmitPageUrl,
  buildAgentSubmitPrompt,
  DEFAULT_AGENT_SUBMIT_ORIGIN,
} from '@/lib/agent-submit';

export default function AgentHandoffCard() {
  const origin = useSyncExternalStore(
    () => () => undefined,
    () => window.location.origin,
    () => DEFAULT_AGENT_SUBMIT_ORIGIN,
  );
  const [copiedType, setCopiedType] = useState<'prompt' | 'link' | null>(null);
  const [expanded, setExpanded] = useState(false);

  const pageUrl = useMemo(() => buildAgentSubmitPageUrl(origin), [origin]);
  const apiUrl = useMemo(() => buildAgentSubmitApiUrl(origin), [origin]);
  const handoffPrompt = useMemo(() => buildAgentSubmitPrompt(origin), [origin]);

  const copyText = async (value: string, type: 'prompt' | 'link') => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedType(type);
      window.setTimeout(() => setCopiedType((current) => (current === type ? null : current)), 2000);
    } catch {
      setCopiedType(null);
    }
  };

  return (
    <section className="theme-panel overflow-hidden p-0">
      <div className="p-6 md:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium tag-info">
              <Bot className="h-3.5 w-3.5" />
              给 Agent 的使用说明
            </div>
            <h2 className="theme-title mt-4 text-2xl font-semibold">把这份接入说明直接发给其他 Agent</h2>
            <p className="theme-muted mt-2 max-w-2xl text-sm leading-6">
              首页默认先收起详细说明，只保留最常用的复制和打开动作；需要时再展开看完整提示词、接入页地址和提交接口。
            </p>
          </div>

          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="inline-flex items-center gap-2 self-start rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-sky-50"
            style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            {expanded ? '收起说明' : '展开说明'}
          </button>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => copyText(handoffPrompt, 'prompt')}
            className="button-primary inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium"
          >
            <Copy className="h-4 w-4" />
            {copiedType === 'prompt' ? '说明已复制' : '复制给 Agent'}
          </button>
          <button
            type="button"
            onClick={() => copyText(pageUrl, 'link')}
            className="inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-sky-50"
            style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          >
            <Copy className="h-4 w-4" />
            {copiedType === 'link' ? '链接已复制' : '复制纯链接'}
          </button>
          <Link
            href={AGENT_SUBMIT_PAGE_PATH}
            className="inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-sky-50"
            style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          >
            <ExternalLink className="h-4 w-4" />
            打开接入页
          </Link>
        </div>

        {!expanded ? (
          <div
            className="mt-5 rounded-2xl border px-4 py-3 text-sm"
            style={{ borderColor: 'var(--border)', background: 'var(--surface-soft)' }}
          >
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className="font-medium text-sky-700">当前入口</span>
              <span className="break-all font-mono text-slate-700">{pageUrl}</span>
            </div>
          </div>
        ) : (
          <div className="mt-6 grid gap-0 overflow-hidden rounded-[28px] border lg:grid-cols-[1.15fr_0.85fr]" style={{ borderColor: 'var(--border)' }}>
            <div className="p-5 md:p-6">
              <div
                className="rounded-2xl border p-4"
                style={{ borderColor: 'var(--border)', background: 'var(--surface-soft)' }}
              >
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-sky-700">
                  <Link2 className="h-3.5 w-3.5" />
                  可直接复制给 Agent
                </div>
                <pre className="mt-3 whitespace-pre-wrap break-words font-mono text-sm leading-6 text-slate-700">
                  {handoffPrompt}
                </pre>
              </div>
            </div>

            <div
              className="flex flex-col justify-between border-t p-5 md:p-6 lg:border-l lg:border-t-0"
              style={{ borderColor: 'var(--border)', background: 'linear-gradient(180deg, rgba(14,165,233,0.08), rgba(59,130,246,0.03))' }}
            >
              <div>
                <div className="text-xs font-medium uppercase tracking-[0.18em] text-sky-700">Agent 内容接入</div>
                <div className="theme-title mt-3 text-lg font-semibold">接入页地址</div>
                <div className="mt-2 rounded-2xl border bg-white/80 p-3 font-mono text-sm text-slate-700" style={{ borderColor: 'var(--border)' }}>
                  {pageUrl}
                </div>
              </div>

              <div className="mt-5 space-y-3">
                <div className="rounded-2xl border bg-white/70 p-4" style={{ borderColor: 'var(--border)' }}>
                  <div className="theme-title text-sm font-semibold">适合的内容</div>
                  <p className="theme-muted mt-2 text-sm leading-6">
                    标题、正文、封面图、正文配图、排版模板、项目归属、发布平台。
                  </p>
                </div>
                <div className="rounded-2xl border bg-white/70 p-4" style={{ borderColor: 'var(--border)' }}>
                  <div className="theme-title text-sm font-semibold">提交接口</div>
                  <div className="mt-2 break-all font-mono text-sm text-slate-700">{apiUrl}</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
