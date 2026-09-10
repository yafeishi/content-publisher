import type { WritingStylePreset, WritingStyleProfile } from '@/lib/settings-schema';
import { generateByConfiguredProvider } from '@/lib/ai/generate';

export const STYLE_LABEL_MAP: Record<WritingStylePreset, string> = {
  'professional-review': '专业复盘',
  'friend-chat': '朋友聊天',
  'calm-analysis': '冷静分析',
  'practical-tutorial': '实战教程',
  storytelling: '故事感叙事',
};

const STYLE_RULE_MAP: Record<WritingStylePreset, string> = {
  'professional-review': [
    '语气专业但不过度书面，偏项目复盘口吻。',
    '每段必须有具体事实或判断，不要空泛总结。',
    '适当出现“我这边实测/我当时的取舍”这类第一人称表达。',
  ].join('\n'),
  'friend-chat': [
    '语气像和朋友交流，句子更短，允许自然口语。',
    '避免官方腔，不要“首先其次最后”套路结构。',
    '可以适当带情绪词，但不要过度夸张。',
  ].join('\n'),
  'calm-analysis': [
    '语气克制、理性，结论明确。',
    '更多“问题-证据-判断”，少煽动性表述。',
    '减少 emoji 和夸张词。',
  ].join('\n'),
  'practical-tutorial': [
    '像做实战教程，强调步骤和可执行性。',
    '每个关键点都要写出动作或验证方式。',
    '避免概念堆砌，优先“怎么做”。',
  ].join('\n'),
  storytelling: [
    '用故事化推进，先给场景和冲突，再给解决。',
    '保持真实感，包含转折与取舍。',
    '避免鸡汤式结尾，结论要落到行动建议。',
  ].join('\n'),
};

function compactText(value: string): string {
  return String(value || '').trim().replace(/\n{3,}/g, '\n\n');
}

function toShortList(value: string, limit = 8): string[] {
  return compactText(value)
    .split(/[\n；;，,]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, limit);
}

export function buildStylePromptBlock(stylePreset: WritingStylePreset, profile: WritingStyleProfile): string {
  const signature = toShortList(profile.signaturePhrases, 8);
  const banned = toShortList(profile.bannedPhrases, 10);

  const lines = [
    `写作风格: ${STYLE_LABEL_MAP[stylePreset]}`,
    STYLE_RULE_MAP[stylePreset],
    `作者人设: ${compactText(profile.selfPositioning) || '一线实践者'}`,
    `语气备注: ${compactText(profile.toneNotes) || '自然、有信息量、少模板腔'}`,
  ];

  if (profile.personalExperience.trim()) {
    lines.push(`可引用的个人经历线索: ${compactText(profile.personalExperience)}`);
  }

  if (signature.length > 0) {
    lines.push(`优先使用表达（自然融入，不必全部使用）: ${signature.join('；')}`);
  }

  if (banned.length > 0) {
    lines.push(`禁用词或禁用句式: ${banned.join('；')}`);
  }

  lines.push('必须避免明显 AI 套路感：避免“本文将/首先其次最后/综上所述”模板句。');
  lines.push('必须包含至少 2 句第一人称真实判断或真实取舍描述。');

  return lines.join('\n');
}

function extractMarkdownBody(raw: string): { title: string; body: string } {
  const text = compactText(raw);
  const match = text.match(/^\s*#\s+(.+)$/m);
  if (!match) return { title: '', body: text };

  const title = match[1].trim();
  const body = text
    .replace(/^\s*#\s+.+$/m, '')
    .trim();
  return { title, body };
}

export async function humanizeMarkdownIfNeeded(input: {
  markdown: string;
  stylePreset: WritingStylePreset;
  profile: WritingStyleProfile;
  enabled: boolean;
}): Promise<string> {
  if (!input.enabled) return input.markdown;

  const original = compactText(input.markdown);
  if (!original) return original;

  const prompt = `你是中文内容编辑，请将下方文章改写得更像真人作者，而不是 AI 模板文。\n\n要求:\n1. 保持原主题和事实，不要改动核心信息。\n2. 保持标题存在（H1）。\n3. 保留结构层级，但句子改得更自然。\n4. 删除空泛套话，增加真实感和取舍感。\n5. 输出仍为 Markdown。\n\n风格约束:\n${buildStylePromptBlock(input.stylePreset, input.profile)}\n\n原文:\n${original}`;

  try {
    const result = await generateByConfiguredProvider(prompt);
    const polished = compactText(result.content);
    if (!polished) return original;

    const originalParts = extractMarkdownBody(original);
    const polishedParts = extractMarkdownBody(polished);

    if (!polishedParts.body || polishedParts.body.length < Math.max(80, originalParts.body.length * 0.35)) {
      return original;
    }

    if (polishedParts.title) return polished;
    if (originalParts.title) {
      return `# ${originalParts.title}\n\n${polishedParts.body}`;
    }
    return polished;
  } catch {
    return original;
  }
}
