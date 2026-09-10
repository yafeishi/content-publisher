import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { marked } from 'marked';
import prisma from '@/lib/prisma';
import { generateByConfiguredProvider } from '@/lib/ai/generate';
import { getAppSettings } from '@/lib/settings';
import { buildStylePromptBlock, humanizeMarkdownIfNeeded } from '@/lib/ai/writing-style';
import type { WritingStylePreset } from '@/lib/settings-schema';

type SeriesPlanItemInput = {
  day?: unknown;
  title?: unknown;
  angle?: unknown;
  focus?: unknown;
  hook?: unknown;
  tags?: unknown;
  suggestedCta?: unknown;
  scheduledAt?: unknown;
};

type SeriesPlanItem = {
  day: number;
  title: string;
  angle: string;
  focus: string;
  hook: string;
  tags: string[];
  suggestedCta: string;
  scheduledAt: string | null;
};

function isWritingStylePreset(value: unknown): value is WritingStylePreset {
  return value === 'professional-review'
    || value === 'friend-chat'
    || value === 'calm-analysis'
    || value === 'practical-tutorial'
    || value === 'storytelling';
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
}

function normalizePlanItems(value: unknown): SeriesPlanItem[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item, index) => {
      const data = (item && typeof item === 'object' ? item : {}) as SeriesPlanItemInput;
      const day = Number(data.day);
      const scheduledAt = typeof data.scheduledAt === 'string' && data.scheduledAt.trim()
        ? data.scheduledAt.trim()
        : null;

      return {
        day: Number.isFinite(day) && day > 0 ? Math.round(day) : index + 1,
        title: typeof data.title === 'string' && data.title.trim() ? data.title.trim() : `第 ${index + 1} 天`,
        angle: typeof data.angle === 'string' && data.angle.trim() ? data.angle.trim() : 'review',
        focus: typeof data.focus === 'string' && data.focus.trim() ? data.focus.trim() : '围绕项目关键信息展开。',
        hook: typeof data.hook === 'string' && data.hook.trim() ? data.hook.trim() : '',
        tags: toStringArray(data.tags),
        suggestedCta: typeof data.suggestedCta === 'string' && data.suggestedCta.trim() ? data.suggestedCta.trim() : '',
        scheduledAt,
      };
    })
    .sort((a, b) => a.day - b.day)
    .map((item, index) => ({ ...item, day: index + 1 }));
}

function parseOptionalDate(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function extractTitle(markdown: string, fallbackTitle: string): string {
  const titleMatch = markdown.match(/^\s*#\s+(.+)$/m);
  if (!titleMatch?.[1]) return fallbackTitle;
  return titleMatch[1].replace(/[#*_`]/g, '').trim() || fallbackTitle;
}

function buildFallbackMarkdown(projectName: string, item: SeriesPlanItem, isLast: boolean): string {
  const nextHint = isLast ? '本系列到这里就完结了。' : (item.hook || '下一篇继续拆解更多细节。');
  const cta = item.suggestedCta || '欢迎在评论区交流你的看法。';

  return `# ${item.title}\n\n## 背景\n${projectName} 的连载第 ${item.day} 天，围绕本日主题展开。\n\n## 重点\n${item.focus}\n\n## 关键结论\n- 把复杂问题拆成可执行步骤\n- 关注可复用的方法和经验\n- 用结果指标验证方案有效性\n\n## 小结\n${nextHint}\n\n${cta}`;
}

async function readProjectFiles(projectPath: string): Promise<string> {
  let projectInfo = '';

  try {
    if (!projectPath) return '未提供本地路径';
    if (projectPath.startsWith('http')) return `GitHub 项目: ${projectPath}`;
    if (!fs.existsSync(projectPath)) return `项目路径不存在: ${projectPath}`;

    const readmeFiles = ['README.md', 'readme.md', 'README.txt'];
    for (const readme of readmeFiles) {
      const readmePath = path.join(projectPath, readme);
      if (!fs.existsSync(readmePath)) continue;
      const content = fs.readFileSync(readmePath, 'utf-8');
      projectInfo += `\n\n=== README ===\n${content.substring(0, 5000)}`;
      break;
    }

    const entries = fs.readdirSync(projectPath, { withFileTypes: true });
    const dirs = entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules')
      .map((entry) => entry.name)
      .slice(0, 12);
    const files = entries
      .filter((entry) => entry.isFile() && !entry.name.startsWith('.'))
      .map((entry) => entry.name)
      .slice(0, 18);

    projectInfo += `\n\n=== 项目结构 ===\n目录: ${dirs.join(', ')}\n文件: ${files.join(', ')}`;

    const packageJsonPath = path.join(projectPath, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8')) as { name?: string; description?: string };
        projectInfo += `\n\n=== package.json ===\nname: ${pkg.name || 'unknown'}\ndescription: ${pkg.description || '无'}`;
      } catch {
        // ignore parse errors
      }
    }
  } catch (error) {
    projectInfo += `\n\n读取项目文件出错: ${String(error)}`;
  }

  return projectInfo;
}

function buildTags(item: SeriesPlanItem, seriesTitle: string): string[] {
  const merged = new Set<string>([
    '项目连载',
    `连载第${item.day}天`,
    `series:${seriesTitle}`,
    ...item.tags,
  ]);
  return Array.from(merged);
}

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as Record<string, unknown>;

    const projectId = typeof payload.projectId === 'string' ? payload.projectId.trim() : '';
    const projectName = typeof payload.projectName === 'string' ? payload.projectName.trim() : '未命名项目';
    const projectDescription = typeof payload.projectDescription === 'string' ? payload.projectDescription : '';
    const projectPath = typeof payload.projectPath === 'string' ? payload.projectPath : '';
    const scenario = typeof payload.scenario === 'string' ? payload.scenario : '';
    const needs = typeof payload.needs === 'string' ? payload.needs : '';
    const solution = typeof payload.solution === 'string' ? payload.solution : '';
    const highlights = toStringArray(payload.highlights);
    const outcomes = typeof payload.outcomes === 'string' ? payload.outcomes : '';
    const audience = typeof payload.audience === 'string' ? payload.audience : '';
    const stage = typeof payload.stage === 'string' ? payload.stage : '';
    const seriesTitle = typeof payload.seriesTitle === 'string' && payload.seriesTitle.trim()
      ? payload.seriesTitle.trim()
      : `${projectName} 连载`;
    const saveStatus = payload.saveStatus === 'scheduled' ? 'scheduled' : 'draft';
    const platforms = Array.isArray(payload.platforms)
      ? payload.platforms.filter((item): item is string => typeof item === 'string')
      : [];
    const planItems = normalizePlanItems(payload.planItems);
    const requestedStylePreset = payload.stylePreset;

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
    }
    if (planItems.length === 0) {
      return NextResponse.json({ error: 'planItems is required' }, { status: 400 });
    }

    const settings = await getAppSettings();
    const stylePreset: WritingStylePreset = isWritingStylePreset(requestedStylePreset)
      ? requestedStylePreset
      : settings.writingStylePreset;
    const styleBlock = buildStylePromptBlock(stylePreset, settings.writingStyleProfile);

    const stageMap: Record<string, string> = {
      idea: '想法验证',
      building: '开发中',
      launched: '已上线',
      iterating: '持续迭代',
    };

    await prisma.log.create({
      data: {
        action: `开始批量生成连载: ${seriesTitle}`,
        result: `共 ${planItems.length} 篇, status=${saveStatus}`,
        projectId,
      },
    });

    const projectInfo = await readProjectFiles(projectPath);

    const created: Array<{ id: string; day: number; title: string; scheduledAt: string | null; status: string }> = [];
    const failed: Array<{ day: number; title: string; error: string }> = [];

    for (const item of planItems) {
      const isLast = item.day === planItems.length;
      let markdown = '';
      let provider = 'fallback';

      const prompt = `你是中文技术内容作者。请为“项目连载”写第 ${item.day} 天文章。\n\n连载总标题: ${seriesTitle}\n第 ${item.day} 天标题: ${item.title}\n写作角度: ${item.angle}\n今日重点: ${item.focus}\n下一篇预告: ${item.hook || '无'}\n互动引导: ${item.suggestedCta || '无'}\n\n项目名称: ${projectName}\n项目描述: ${projectDescription || '暂无描述'}\n使用场景: ${scenario || '未提供'}\n解决需求/痛点: ${needs || '未提供'}\n方案与实施路径: ${solution || '未提供'}\n实施亮点: ${highlights.length > 0 ? highlights.join('；') : '未提供'}\n阶段性结果: ${outcomes || '未提供'}\n目标读者: ${audience || '泛技术读者'}\n项目阶段: ${stageMap[stage] || stage || '开发中'}\n\n项目信息:\n${projectInfo}\n\n写作要求:\n1. 输出 Markdown，第一行必须是 H1 标题。\n2. 字数 700-1100 中文字。\n3. 包含四段结构：背景场景、关键实践、亮点/经验、结论。\n4. 结尾必须有互动引导。\n5. ${isLast ? '这是最后一篇，不要再写“下一篇预告”。' : '结尾增加一句“下一篇预告”，与 hook 一致。'}\n6. 避免空泛模板，优先使用给定项目信息。\n7. 必须符合风格约束，减少 AI 模板腔。\n\n风格约束:\n${styleBlock}\n\n请直接输出 Markdown 正文。`;

      try {
        const result = await generateByConfiguredProvider(prompt);
        markdown = result.content;
        provider = result.provider;
      } catch (error) {
        markdown = buildFallbackMarkdown(projectName, item, isLast);
        provider = 'fallback';
        await prisma.log.create({
          data: {
            action: `连载第 ${item.day} 篇生成失败，使用兜底`,
            result: String(error),
            projectId,
          },
        });
      }

      markdown = await humanizeMarkdownIfNeeded({
        markdown,
        stylePreset,
        profile: settings.writingStyleProfile,
        enabled: settings.humanizeRewriteEnabled,
      });

      try {
        const html = await marked.parse(markdown);
        const title = extractTitle(markdown, `${seriesTitle} · 第 ${item.day} 天`);
        const tags = buildTags(item, seriesTitle);
        const scheduledDate = parseOptionalDate(item.scheduledAt);

        const content = await prisma.content.create({
          data: {
            title,
            body: html,
            status: saveStatus,
            platforms: JSON.stringify(platforms),
            scheduledAt: saveStatus === 'scheduled' ? scheduledDate : null,
            projectId,
            tags: JSON.stringify(tags),
          },
        });

        created.push({
          id: content.id,
          day: item.day,
          title: content.title,
          status: content.status,
          scheduledAt: content.scheduledAt ? content.scheduledAt.toISOString() : null,
        });

        await prisma.log.create({
          data: {
            action: `连载第 ${item.day} 篇已生成`,
            result: `provider=${provider}; contentId=${content.id}`,
            projectId,
            contentId: content.id,
          },
        });
      } catch (error) {
        failed.push({
          day: item.day,
          title: item.title,
          error: String(error),
        });
      }
    }

    await prisma.log.create({
      data: {
        action: '连载批量生成完成',
        result: `成功 ${created.length} 篇，失败 ${failed.length} 篇`,
        projectId,
      },
    });

    return NextResponse.json({
      success: failed.length === 0,
      createdCount: created.length,
      failedCount: failed.length,
      created,
      failed,
    });
  } catch (error) {
    console.error('Failed to generate series content:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
