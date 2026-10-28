export type WritingStylePreset =
  | 'professional-review'
  | 'friend-chat'
  | 'calm-analysis'
  | 'practical-tutorial'
  | 'storytelling';

export type WritingStyleProfile = {
  selfPositioning: string;
  signaturePhrases: string;
  bannedPhrases: string;
  personalExperience: string;
  toneNotes: string;
};

export type AppSettings = {
  aiProvider: 'claude-cli' | 'openai-compatible' | 'codex-api' | 'local-client';
  claudePath: string;
  localClientPreset: 'codex' | 'claude' | 'gemini' | 'qwen' | 'custom';
  localClientCommand: string;
  aiModel: string;
  enableXiaohongshu: boolean;
  enableWechat: boolean;
  wechatPublishMode: 'article' | 'text';
  enableMowen: boolean;
  enableObsidian: boolean;
  fallbackCoverImage: string;
  mowenDefaultPublic: boolean;
  mowenSyncImages: boolean;
  mowenRichLayout: boolean;
  obsidianVaultPath: string;
  obsidianFolder: string;
  obsidianAssetFolder: string;
  obsidianLinkStyle: 'markdown' | 'wikilink';
  obsidianOverwrite: boolean;
  enableHomepage: boolean;
  homepageRepoPath: string;
  homepageRepoRemote: string;
  homepageBranch: string;
  homepageSiteOrigin: string;
  homepagePublishMode: 'commit-push' | 'pull-request' | 'files-only';
  homepageBlockParenting: boolean;
  homepageBlockTags: string;
  homepageCredit: string;
  notifyOnSuccess: boolean;
  notifyOnFailure: boolean;
  notifyOnSchedule: boolean;
  compactEditor: boolean;
  defaultLayoutTemplateId: string;
  writingStylePreset: WritingStylePreset;
  writingStyleProfile: WritingStyleProfile;
  humanizeRewriteEnabled: boolean;
};

export const defaultAppSettings: AppSettings = {
  aiProvider: 'claude-cli',
  claudePath: 'claude',
  localClientPreset: 'codex',
  localClientCommand: 'codex',
  aiModel: 'default',
  enableXiaohongshu: true,
  enableWechat: true,
  wechatPublishMode: 'article',
  enableMowen: true,
  enableObsidian: true,
  fallbackCoverImage: '',
  mowenDefaultPublic: true,
  mowenSyncImages: true,
  mowenRichLayout: true,
  obsidianVaultPath: '',
  obsidianFolder: 'Inbox',
  obsidianAssetFolder: 'assets/content-publisher',
  obsidianLinkStyle: 'wikilink',
  obsidianOverwrite: false,
  enableHomepage: false,
  homepageRepoPath: '',
  homepageRepoRemote: 'https://github.com/yafeishi/yafeishi.github.io.git',
  homepageBranch: 'master',
  homepageSiteOrigin: 'https://danghb.cn',
  homepagePublishMode: 'commit-push',
  homepageBlockParenting: true,
  homepageBlockTags: '育儿,党哥育儿,parenting,亲子',
  homepageCredit: '同步自微信公众号「Hobson 小党」',
  notifyOnSuccess: true,
  notifyOnFailure: true,
  notifyOnSchedule: true,
  compactEditor: false,
  defaultLayoutTemplateId: 'standard',
  writingStylePreset: 'professional-review',
  writingStyleProfile: {
    selfPositioning: '一线做项目的工程实践者',
    signaturePhrases: '我这边实测；我踩过的坑是；我的建议是',
    bannedPhrases: '赋能；闭环；颠覆式；首先其次最后；综上所述',
    personalExperience: '',
    toneNotes: '少空话，多细节，像给同事复盘',
  },
  humanizeRewriteEnabled: true,
};

function sanitizeHomepageOrigin(value: unknown): string {
  if (typeof value !== 'string') return defaultAppSettings.homepageSiteOrigin;
  const trimmed = value.trim().replace(/\/+$/, '');
  if (!/^https?:\/\/[^\s/]+/i.test(trimmed)) return defaultAppSettings.homepageSiteOrigin;
  return trimmed;
}

function sanitizeHomepageBranch(value: unknown): string {
  if (typeof value !== 'string') return defaultAppSettings.homepageBranch;
  const trimmed = value.trim();
  if (!/^[A-Za-z0-9._/-]+$/.test(trimmed) || trimmed.includes('..') || trimmed.startsWith('/') || trimmed.endsWith('/')) {
    return defaultAppSettings.homepageBranch;
  }
  return trimmed;
}

export function sanitizeAppSettings(input: Partial<AppSettings> | null | undefined): AppSettings {
  if (!input || typeof input !== 'object') return defaultAppSettings;
  const provider = input.aiProvider;
  const localPreset = input.localClientPreset;
  const writingStylePreset = input.writingStylePreset;
  const safeProfileInput: Partial<WritingStyleProfile> = (
    input.writingStyleProfile && typeof input.writingStyleProfile === 'object'
  )
    ? input.writingStyleProfile
    : {};
  const safeProfile: WritingStyleProfile = {
    selfPositioning: typeof safeProfileInput.selfPositioning === 'string' ? safeProfileInput.selfPositioning : defaultAppSettings.writingStyleProfile.selfPositioning,
    signaturePhrases: typeof safeProfileInput.signaturePhrases === 'string' ? safeProfileInput.signaturePhrases : defaultAppSettings.writingStyleProfile.signaturePhrases,
    bannedPhrases: typeof safeProfileInput.bannedPhrases === 'string' ? safeProfileInput.bannedPhrases : defaultAppSettings.writingStyleProfile.bannedPhrases,
    personalExperience: typeof safeProfileInput.personalExperience === 'string' ? safeProfileInput.personalExperience : defaultAppSettings.writingStyleProfile.personalExperience,
    toneNotes: typeof safeProfileInput.toneNotes === 'string' ? safeProfileInput.toneNotes : defaultAppSettings.writingStyleProfile.toneNotes,
  };
  return {
    ...defaultAppSettings,
    ...input,
    aiProvider:
      provider === 'openai-compatible' || provider === 'codex-api' || provider === 'local-client'
        ? provider
        : 'claude-cli',
    localClientPreset:
      localPreset === 'codex' || localPreset === 'claude' || localPreset === 'gemini' || localPreset === 'qwen' || localPreset === 'custom'
        ? localPreset
        : 'codex',
    wechatPublishMode: input.wechatPublishMode === 'text' ? 'text' : 'article',
    fallbackCoverImage: typeof input.fallbackCoverImage === 'string' ? input.fallbackCoverImage : '',
    obsidianLinkStyle: input.obsidianLinkStyle === 'markdown' ? 'markdown' : 'wikilink',
    enableHomepage: input.enableHomepage === true,
    homepageRepoPath: typeof input.homepageRepoPath === 'string' ? input.homepageRepoPath : '',
    homepageRepoRemote: typeof input.homepageRepoRemote === 'string'
      ? input.homepageRepoRemote.trim()
      : defaultAppSettings.homepageRepoRemote,
    homepageBranch: sanitizeHomepageBranch(input.homepageBranch),
    homepageSiteOrigin: sanitizeHomepageOrigin(input.homepageSiteOrigin),
    homepagePublishMode: input.homepagePublishMode === 'pull-request' || input.homepagePublishMode === 'files-only'
      ? input.homepagePublishMode
      : 'commit-push',
    homepageBlockParenting: input.homepageBlockParenting !== false,
    homepageBlockTags: typeof input.homepageBlockTags === 'string' && input.homepageBlockTags.trim()
      ? input.homepageBlockTags
      : defaultAppSettings.homepageBlockTags,
    homepageCredit: typeof input.homepageCredit === 'string'
      ? input.homepageCredit.slice(0, 200)
      : defaultAppSettings.homepageCredit,
    defaultLayoutTemplateId: typeof input.defaultLayoutTemplateId === 'string' && input.defaultLayoutTemplateId.trim()
      ? input.defaultLayoutTemplateId.trim()
      : 'standard',
    writingStylePreset:
      writingStylePreset === 'friend-chat'
      || writingStylePreset === 'calm-analysis'
      || writingStylePreset === 'practical-tutorial'
      || writingStylePreset === 'storytelling'
        ? writingStylePreset
        : 'professional-review',
    writingStyleProfile: safeProfile,
    humanizeRewriteEnabled: input.humanizeRewriteEnabled !== false,
  };
}
