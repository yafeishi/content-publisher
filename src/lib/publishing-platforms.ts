export const PUBLISHING_PLATFORMS = [
  { id: 'xiaohongshu', label: '小红书', shortLabel: '小红书' },
  { id: 'wechat', label: '微信公众号', shortLabel: '微信' },
  { id: 'mowen', label: '墨问笔记', shortLabel: '墨问' },
  { id: 'obsidian', label: 'Obsidian', shortLabel: 'Obsidian' },
  { id: 'homepage', label: '个人主页(danghb.cn)', shortLabel: '个人主页' },
] as const;

export type PublishingPlatformId = (typeof PUBLISHING_PLATFORMS)[number]['id'];

export const PUBLISHING_PLATFORM_IDS: PublishingPlatformId[] = PUBLISHING_PLATFORMS.map((item) => item.id);

export function platformLabel(platform: string, variant: 'full' | 'short' = 'full'): string {
  const found = PUBLISHING_PLATFORMS.find((item) => item.id === platform);
  if (!found) return platform;
  return variant === 'short' ? found.shortLabel : found.label;
}
