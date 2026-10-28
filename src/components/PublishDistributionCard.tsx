'use client';

import { CheckCircle, Clock, ExternalLink, XCircle } from 'lucide-react';
import { PUBLISHING_PLATFORMS, platformLabel } from '@/lib/publishing-platforms';

export type PublishRecordItem = {
  id: string;
  platform: string;
  status: string;
  externalId: string | null;
  errorMsg: string | null;
  publishedAt: string;
};

function latestRecords(records: PublishRecordItem[]): PublishRecordItem[] {
  const seen = new Set<string>();
  const latest: PublishRecordItem[] = [];
  for (const record of records) {
    if (seen.has(record.platform)) continue;
    seen.add(record.platform);
    latest.push(record);
  }
  const rank = (platform: string) => {
    const index = PUBLISHING_PLATFORMS.findIndex((item) => item.id === platform);
    return index === -1 ? 99 : index;
  };
  return latest.sort((a, b) => rank(a.platform) - rank(b.platform));
}

function isUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

export default function PublishDistributionCard({
  records,
  loading,
}: {
  records: PublishRecordItem[];
  loading?: boolean;
}) {
  const latest = latestRecords(records);
  return (
    <div className="theme-card p-5">
      <h3 className="theme-title mb-1 font-semibold">分发状态</h3>
      <p className="theme-muted mb-4 text-xs">每个平台保留最近一次发布结果。成功时的链接或外部 ID 来自发布记录。</p>
      {loading && latest.length === 0 ? (
        <p className="theme-muted text-sm">正在读取发布记录…</p>
      ) : latest.length === 0 ? (
        <p className="theme-muted text-sm">还没有发布记录。</p>
      ) : (
        <div className="space-y-3">
          {latest.map((record) => {
            const success = record.status === 'success';
            const failed = record.status === 'failed';
            const externalId = record.externalId || '';
            return (
              <div key={record.id} className="rounded-lg p-3" style={{ background: 'var(--surface-soft)' }}>
                <div className="flex items-start gap-3">
                  {success ? (
                    <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-green-500" />
                  ) : failed ? (
                    <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
                  ) : (
                    <Clock className="mt-0.5 h-5 w-5 shrink-0 text-yellow-500" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <div className="theme-title text-sm font-medium">{platformLabel(record.platform)}</div>
                      <div className={`text-xs ${success ? 'text-emerald-600' : failed ? 'text-red-600' : 'theme-muted'}`}>
                        {success ? '发布成功' : failed ? '发布失败' : record.status || '未知'}
                      </div>
                    </div>
                    <div className="theme-muted mt-1 text-xs">
                      {record.publishedAt ? new Date(record.publishedAt).toLocaleString() : ''}
                    </div>
                    {externalId && isUrl(externalId) && (
                      <a
                        href={externalId}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-flex max-w-full items-center gap-1 break-all text-xs text-sky-700"
                      >
                        <ExternalLink className="h-3 w-3 shrink-0" />
                        {externalId}
                      </a>
                    )}
                    {externalId && !isUrl(externalId) && (
                      <p className="theme-muted mt-1 break-all text-xs">外部 ID：{externalId}</p>
                    )}
                    {record.errorMsg && (
                      <p className="mt-1 text-xs text-red-600">{record.errorMsg}</p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
