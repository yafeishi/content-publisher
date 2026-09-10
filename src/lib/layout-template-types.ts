export type TemplatePlatform = 'wechat' | 'xiaohongshu' | 'mowen' | 'obsidian' | 'all';
export type TemplateMode = 'strict' | 'adapt';

export type LayoutTemplateTokens = {
  accentColor: string;
  textColor: string;
  headingColor: string;
  bgColor: string;
  fontSize: number;
  lineHeight: number;
  paragraphSpacing: number;
  imageRadius: number;
  h1Size: number;
  h2Size: number;
  h3Size: number;
  quoteBg: string;
  quoteBorder: string;
  codeBg: string;
  dividerColor: string;
};

export type LayoutTemplate = {
  id: string;
  name: string;
  description: string;
  sourceType: 'system' | 'learned';
  sourceRef: string;
  platforms: TemplatePlatform[];
  mode: TemplateMode;
  createdAt: string;
  updatedAt: string;
  tokens: LayoutTemplateTokens;
};
