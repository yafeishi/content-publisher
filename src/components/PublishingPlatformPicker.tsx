'use client';

import { PUBLISHING_PLATFORMS } from '@/lib/publishing-platforms';

export type PlatformHealthResult = {
  ok: boolean;
  status: 'success' | 'warning' | 'failed';
  message: string;
};

export default function PublishingPlatformPicker({
  platforms,
  onToggle,
  health,
  notice,
}: {
  platforms: string[];
  onToggle: (platform: string) => void;
  health?: Record<string, PlatformHealthResult>;
  notice?: string | null;
}) {
  return (
    <div className="space-y-3">
      {PUBLISHING_PLATFORMS.map((platform) => {
        const item = health?.[platform.id];
        return (
          <label key={platform.id} className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={platforms.includes(platform.id)}
              onChange={() => onToggle(platform.id)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{platform.label}</span>
            {item && (
              <span className={`ml-auto max-w-[16rem] text-right text-xs ${item.status === 'success'
                ? 'text-emerald-600'
                : item.status === 'warning'
                  ? 'text-amber-600'
                  : 'text-red-600'
                }`}
              >
                {item.message}
              </span>
            )}
          </label>
        );
      })}
      {notice && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{notice}</p>
      )}
    </div>
  );
}
