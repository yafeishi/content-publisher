import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import prisma from '@/lib/prisma';
import { generateByConfiguredProvider } from '@/lib/ai/generate';
import { getAppSettings } from '@/lib/settings';
import { buildStylePromptBlock, humanizeMarkdownIfNeeded } from '@/lib/ai/writing-style';
import type { WritingStylePreset } from '@/lib/settings-schema';

function isWritingStylePreset(value: unknown): value is WritingStylePreset {
  return value === 'professional-review'
    || value === 'friend-chat'
    || value === 'calm-analysis'
    || value === 'practical-tutorial'
    || value === 'storytelling';
}

// Read project files to understand the project
async function readProjectFiles(projectPath: string): Promise<string> {
  let projectInfo = '';

  try {
    if (projectPath.startsWith('http')) {
      return `GitHub 项目: ${projectPath}`;
    }

    if (!fs.existsSync(projectPath)) {
      return `项目路径不存在: ${projectPath}`;
    }

    const readmeFiles = ['README.md', 'readme.md', 'README.txt'];
    for (const readme of readmeFiles) {
      const readmePath = path.join(projectPath, readme);
      if (fs.existsSync(readmePath)) {
        const content = fs.readFileSync(readmePath, 'utf-8');
        projectInfo += `\n\n=== README ===\n${content.substring(0, 5000)}`;
        break;
      }
    }

    const entries = fs.readdirSync(projectPath, { withFileTypes: true });
    const dirs = entries.filter(e => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules').map(e => e.name).slice(0, 10);
    const files = entries.filter(e => e.isFile() && !e.name.startsWith('.')).map(e => e.name).slice(0, 15);

    projectInfo += `\n\n=== 项目结构 ===\n目录: ${dirs.join(', ')}\n文件: ${files.join(', ')}`;

    const packageJsonPath = path.join(projectPath, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        projectInfo += `\n\n=== package.json ===\nname: ${packageJson.name}\ndescription: ${packageJson.description || '无'}`;
      } catch {}
    }

    const mainFiles = ['main.py', 'app.py', 'index.js', 'main.js', 'src/main.ts'];
    for (const mainFile of mainFiles) {
      const mainPath = path.join(projectPath, mainFile);
      if (fs.existsSync(mainPath)) {
        const content = fs.readFileSync(mainPath, 'utf-8');
        projectInfo += `\n\n=== ${mainFile} (前 2000 字符) ===\n${content.substring(0, 2000)}`;
        break;
      }
    }

  } catch (error) {
    projectInfo += `\n\n读取项目文件出错: ${error}`;
  }

  return projectInfo;
}

export async function POST(request: NextRequest) {
  try {
    const {
      projectId,
      projectPath,
      projectName,
      projectDescription,
      scenario,
      needs,
      solution,
      highlights,
      outcomes,
      audience,
      stage,
      angle,
      angleLabel,
      stylePreset: requestedStylePreset,
    } = await request.json();

    if (!projectId || !angle) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    await prisma.log.create({
      data: {
        action: `开始分析项目: ${projectName}`,
        result: `选择角度: ${angleLabel}`,
        projectId,
      },
    });

    const projectInfo = await readProjectFiles(projectPath);

    await prisma.log.create({
      data: {
        action: '分析项目文件',
        result: `读取项目信息成功`,
        projectId,
      },
    });

    const stageMap: Record<string, string> = {
      idea: '想法验证',
      building: '开发中',
      launched: '已上线',
      iterating: '持续迭代',
    };
    const highlightsList = Array.isArray(highlights) ? highlights : [];
    const settings = await getAppSettings();
    const stylePreset: WritingStylePreset = isWritingStylePreset(requestedStylePreset)
      ? requestedStylePreset
      : settings.writingStylePreset;
    const styleBlock = buildStylePromptBlock(stylePreset, settings.writingStyleProfile);

    // Build prompt for Claude CLI
    const prompt = `你是一个技术博主，擅长用通俗易懂的语言分享技术内容。

请根据以下项目信息，生成一篇适合在小红书和微信公众号发布的文章。

项目名称: ${projectName}
项目描述: ${projectDescription || '暂无描述'}
使用场景: ${scenario || '未提供'}
解决需求/痛点: ${needs || '未提供'}
方案与实施路径: ${solution || '未提供'}
实施亮点: ${highlightsList.length > 0 ? highlightsList.join('；') : '未提供'}
阶段性结果: ${outcomes || '未提供'}
目标读者: ${audience || '泛技术读者'}
项目阶段: ${stageMap[stage] || stage || '开发中'}
内容角度: ${angleLabel}

项目信息:
${projectInfo}

要求:
1. 标题要吸引眼球（小红书风格，20字以内）
2. 内容要实用有趣，适合中文社交媒体风格
3. 字数控制在 800-1200 字
4. 必须包含这些部分：背景场景、问题定义、实施过程、亮点拆解、结果与反思
5. 可以适当使用 emoji
6. 写作时优先使用已提供的结构化项目信息，不要只写泛化模板
7. 输出格式：先输出标题（用 # 开头），然后是正文
8. 必须体现真实作者视角和取舍，不要 AI 模板腔

风格约束:
${styleBlock}

请直接输出文章内容。`;

    let content = '';
    try {
      const result = await generateByConfiguredProvider(prompt);
      content = result.content;

      await prisma.log.create({
        data: {
          action: `调用 AI Provider: ${result.provider}`,
          result: `成功生成内容，长度: ${content.length} 字符`,
          projectId,
        },
      });
    } catch (providerError: unknown) {
      console.error('AI provider error:', providerError);
      const providerErrorMsg = providerError instanceof Error ? providerError.message : String(providerError);

      await prisma.log.create({
        data: {
          action: '调用 AI Provider',
          result: `调用失败: ${providerErrorMsg}`,
          projectId,
        },
      });

      // Fallback template
      content = `# ${projectName} - ${angleLabel}

大家好！今天来聊聊 ${projectName} 这个项目！

## 项目简介

${projectDescription || '这是一个很有意思的项目。'}

## ${angleLabel}

在做这个项目的过程中，我学到了很多，分享给大家～

### 核心技术点

1. 第一个技术亮点
2. 第二个技术亮点
3. 第三个技术亮点

### 踩过的坑

开发过程中遇到了一些问题，不过都解决了...

## 总结

以上就是 ${projectName} 的分享，如果你对这个项目感兴趣，欢迎留言交流！

#${projectName} #技术分享 #编程`;
    }

    content = await humanizeMarkdownIfNeeded({
      markdown: content,
      stylePreset,
      profile: settings.writingStyleProfile,
      enabled: settings.humanizeRewriteEnabled,
    });

    await prisma.log.create({
      data: {
        action: 'AI 内容生成完成',
        result: `生成内容约 ${content.length} 字`,
        projectId,
      },
    });

    return NextResponse.json({ content });
  } catch (error) {
    console.error('Failed to generate content:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
