'use client';

import { Copy, Link2 } from 'lucide-react';
import { useMemo, useState, useSyncExternalStore } from 'react';
import {
  buildAgentSubmitPageUrl,
  buildAgentSubmitShortPrompt,
  DEFAULT_AGENT_SUBMIT_ORIGIN,
} from '@/lib/agent-submit';

export default function AgentSubmitQuickCopy() {
  const origin = useSyncExternalStore(
    () => () => undefined,
    () => window.location.origin,
    () => DEFAULT_AGENT_SUBMIT_ORIGIN,
  );
  const [copiedType, setCopiedType] = useState<'prompt' | 'link' | null>(null);

  const pageUrl = useMemo(() => buildAgentSubmitPageUrl(origin), [origin]);
  const shortPrompt = useMemo(() => buildAgentSubmitShortPrompt(origin), [origin]);

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
    <div className="theme-card rounded-2xl p-5">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-sky-700">
        <Link2 className="h-3.5 w-3.5" />
        可直接转发给 Agent
      </div>
      <p className="theme-title mt-3 text-sm font-semibold">短提示词</p>
      <pre
        className="mt-3 whitespace-pre-wrap break-words rounded-2xl p-4 font-mono text-xs leading-6"
        style={{ background: 'var(--surface-soft)', color: 'var(--text-secondary)' }}
      >
        {shortPrompt}
      </pre>
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => copyText(shortPrompt, 'prompt')}
          className="button-primary inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium"
        >
          <Copy className="h-4 w-4" />
          {copiedType === 'prompt' ? '短提示词已复制' : '复制短提示词'}
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
      </div>
    </div>
  );
}
