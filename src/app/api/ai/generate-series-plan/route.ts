import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import prisma from '@/lib/prisma';
import { generateByConfiguredProvider } from '@/lib/ai/generate';
import { getAppSettings } from '@/lib/settings';
import { buildStylePromptBlock } from '@/lib/ai/writing-style';
import type { WritingStylePreset } from '@/lib/settings-schema';

type SeriesPlanItem = {
  day: number;
  title: string;
  angle: string;
  focus: string;
  hook: string;
  tags: string[];
  suggestedCta: string;
};

function isWritingStylePreset(value: unknown): value is WritingStylePreset {
  return value === 'professional-review'
    || value === 'friend-chat'
    || value === 'calm-analysis'
    || value === 'practical-tutorial'
    || value === 'storytelling';
}

function normalizeDayCount(days: unknown): number {
  const num = Number(days);
  if (!Number.isFinite(num)) return 5;
  const rounded = Math.round(num);
  if (rounded < 3) return 3;
  if (rounded > 5) return 5;
  return rounded;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
}

function extractJsonPayload(raw: string): unknown {
  const trimmed = raw.trim();
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fencedMatch?.[1] ?? trimmed).trim();

  const attempts = new Set<string>();
  if (candidate) attempts.add(candidate);

  const objectStart = candidate.indexOf('{');
  const objectEnd = candidate.lastIndexOf('}');
  if (objectStart >= 0 && objectEnd > objectStart) {
    attempts.add(candidate.slice(objectStart, objectEnd + 1));
  }

  const arrayStart = candidate.indexOf('[');
  const arrayEnd = candidate.lastIndexOf(']');
  if (arrayStart >= 0 && arrayEnd > arrayStart) {
    attempts.add(candidate.slice(arrayStart, arrayEnd + 1));
  }

  for (const text of attempts) {
    try {
      return JSON.parse(text);
    } catch {
      // continue trying
    }
  }
  throw new Error('AI 输出不是有效 JSON');
}

function fallbackPlan(dayCount: number): { title: string; summary: string; items: SeriesPlanItem[] } {
  const defaults = [
    {
      title: '项目背景与真实问题',
      angle: 'scene',
      focus: '讲清业务场景、现有流程、痛点与目标，让读者快速进入上下文。',
      hook: '下一篇会拆解整体方案和关键取舍。',
      tags: ['项目背景', '问题定义'],
      suggestedCta: '你们团队遇到过类似问题吗？',
    },
    {
      title: '方案设计与关键取舍',
      angle: 'solution',
      focus: '解释方案结构、技术选型、为什么这么做，以及替代方案的取舍。',
      hook: '下一篇进入实施过程和关键截图。',
      tags: ['方案设计', '技术选型'],
      suggestedCta: '如果你来做，会选哪种方案？',
    },
    {
      title: '实施过程与关键亮点',
      angle: 'highlights',
      focus: '拆解实施步骤、关键难点、工程亮点和落地细节。',
      hook: '下一篇会给出成果数据和复盘总结。',
      tags: ['实施过程', '工程亮点'],
      suggestedCta: '你最关注哪一段实现细节？',
    },
    {
      title: '结果价值与数据表现',
      angle: 'results',
      focus: '展示上线效果、指标变化、业务价值和可量化收益。',
      hook: '最后一篇会总结踩坑和可复用方法。',
      tags: ['结果复盘', '价值展示'],
      suggestedCta: '你会用哪些指标衡量这类项目？',
    },
    {
      title: '项目复盘与可复用方法',
      angle: 'review',
      focus: '总结经验、踩坑、改进建议，抽象成可复用方法论。',
      hook: '连载完结，可按评论需求做番外篇。',
      tags: ['项目复盘', '方法论'],
      suggestedCta: '如果你希望我写番外篇，留言告诉我主题。',
    },
  ];

  const items: SeriesPlanItem[] = defaults.slice(0, dayCount).map((item, index) => ({
    day: index + 1,
    title: item.title,
    angle: item.angle,
    focus: item.focus,
    hook: item.hook,
    tags: item.tags,
    suggestedCta: item.suggestedCta,
  }));

  return {
    title: `${dayCount} 天项目连载计划`,
    summary: '按照“背景-方案-实施-结果-复盘”主线拆解，便于连续发布。',
    items,
  };
}

function normalizePlanItems(payload: unknown, dayCount: number): SeriesPlanItem[] {
  const sourceArray = Array.isArray(payload)
    ? payload
    : ((payload as { items?: unknown })?.items && Array.isArray((payload as { items?: unknown }).items)
      ? (payload as { items: unknown[] }).items
      : []);

  const normalized = sourceArray.slice(0, dayCount).map((item, index) => {
    const data = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    const rawDay = Number(data.day);

    return {
      day: Number.isFinite(rawDay) && rawDay > 0 ? Math.round(rawDay) : index + 1,
      title: typeof data.title === 'string' && data.title.trim() ? data.title.trim() : `第 ${index + 1} 天内容`,
      angle: typeof data.angle === 'string' && data.angle.trim() ? data.angle.trim() : 'review',
      focus: typeof data.focus === 'string' && data.focus.trim() ? data.focus.trim() : '围绕项目关键信息展开。',
      hook: typeof data.hook === 'string' && data.hook.trim() ? data.hook.trim() : '',
      tags: toStringArray(data.tags),
      suggestedCta: typeof data.suggestedCta === 'string' && data.suggestedCta.trim() ? data.suggestedCta.trim() : '',
    };
  });

  if (normalized.length === dayCount) {
    return normalized.map((item, index) => ({ ...item, day: index + 1 }));
  }

  const fallback = fallbackPlan(dayCount).items;
  const merged: SeriesPlanItem[] = [];
  for (let i = 0; i < dayCount; i += 1) {
    merged.push({
      ...(normalized[i] || fallback[i]),
      day: i + 1,
    });
  }
  return merged;
}

async function readProjectFiles(projectPath: string): Promise<string> {
  let projectInfo = '';

  try {
    if (!projectPath) {
      return '未提供本地路径';
    }
    if (projectPath.startsWith('http')) {
      return `GitHub 项目: ${projectPath}`;
    }
    if (!fs.existsSync(projectPath)) {
      return `项目路径不存在: ${projectPath}`;
    }

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

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as Record<string, unknown>;

    const projectId = typeof payload.projectId === 'string' ? payload.projectId : '';
    const projectName = typeof payload.projectName === 'string' ? payload.projectName : '未命名项目';
    const projectDescription = typeof payload.projectDescription === 'string' ? payload.projectDescription : '';
    const projectPath = typeof payload.projectPath === 'string' ? payload.projectPath : '';
    const scenario = typeof payload.scenario === 'string' ? payload.scenario : '';
    const needs = typeof payload.needs === 'string' ? payload.needs : '';
    const solution = typeof payload.solution === 'string' ? payload.solution : '';
    const highlights = toStringArray(payload.highlights);
    const outcomes = typeof payload.outcomes === 'string' ? payload.outcomes : '';
    const audience = typeof payload.audience === 'string' ? payload.audience : '';
    const stage = typeof payload.stage === 'string' ? payload.stage : '';
    const days = normalizeDayCount(payload.days);
    const requestedStylePreset = payload.stylePreset;

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
    }

    const settings = await getAppSettings();
    const stylePreset: WritingStylePreset = isWritingStylePreset(requestedStylePreset)
      ? requestedStylePreset
      : settings.writingStylePreset;
    const styleBlock = buildStylePromptBlock(stylePreset, settings.writingStyleProfile);

    await prisma.log.create({
      data: {
        action: `生成连载规划: ${projectName}`,
        result: `规划天数: ${days} 天`,
        projectId,
      },
    });

    const projectInfo = await readProjectFiles(projectPath);
    const stageMap: Record<string, string> = {
      idea: '想法验证',
      building: '开发中',
      launched: '已上线',
      iterating: '持续迭代',
    };

    const prompt = `你是中文技术内容策划编辑。请把一个项目拆分成 ${days} 天连载计划。

项目名称: ${projectName}
项目描述: ${projectDescription || '暂无描述'}
使用场景: ${scenario || '未提供'}
解决需求/痛点: ${needs || '未提供'}
方案与实施路径: ${solution || '未提供'}
实施亮点: ${highlights.length > 0 ? highlights.join('；') : '未提供'}
阶段性结果: ${outcomes || '未提供'}
目标读者: ${audience || '泛技术读者'}
项目阶段: ${stageMap[stage] || stage || '开发中'}

补充项目信息:
${projectInfo}

输出要求:
1. 必须覆盖“背景/需求、方案、实施、结果、复盘”主线。
2. 每天主题不能重复，且要有递进关系。
3. 每天给出一个清晰的 focus（可直接写正文）。
4. hook 字段要体现下一篇预告。
5. 仅输出 JSON，不要输出 markdown 或解释。
6. 标题和 focus 的语言风格要符合下述风格约束。

风格约束:
${styleBlock}

JSON 格式必须严格如下:
{
  "seriesTitle": "连载总标题",
  "summary": "连载总说明，60字以内",
  "items": [
    {
      "day": 1,
      "title": "第1天标题",
      "angle": "scene|solution|highlights|results|review",
      "focus": "当天写作重点",
      "hook": "衔接下一篇的预告",
      "tags": ["标签1", "标签2"],
      "suggestedCta": "互动引导"
    }
  ]
}

注意: items 数量必须等于 ${days}。`;

    let provider = 'fallback';
    let plan = fallbackPlan(days);

    try {
      const result = await generateByConfiguredProvider(prompt);
      provider = result.provider;
      const parsed = extractJsonPayload(result.content);
      const parsedObject = (parsed && typeof parsed === 'object' ? parsed : {}) as Record<string, unknown>;

      const seriesTitle = typeof parsedObject.seriesTitle === 'string' && parsedObject.seriesTitle.trim()
        ? parsedObject.seriesTitle.trim()
        : plan.title;
      const summary = typeof parsedObject.summary === 'string' && parsedObject.summary.trim()
        ? parsedObject.summary.trim()
        : plan.summary;
      const items = normalizePlanItems(parsedObject, days);

      plan = {
        title: seriesTitle,
        summary,
        items,
      };
    } catch (error) {
      await prisma.log.create({
        data: {
          action: '连载规划 AI 解析失败，使用兜底规划',
          result: String(error),
          projectId,
        },
      });
    }

    await prisma.log.create({
      data: {
        action: '连载规划完成',
        result: `Provider: ${provider}; 生成 ${plan.items.length} 天`,
        projectId,
      },
    });

    return NextResponse.json({
      success: true,
      provider,
      seriesTitle: plan.title,
      summary: plan.summary,
      items: plan.items,
    });
  } catch (error) {
    console.error('Failed to generate series plan:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
