import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import prisma from '@/lib/prisma';
import { marked } from 'marked';
import { getAppSettings } from '@/lib/settings';
import { applyLayoutTemplateToHtml, getLayoutTemplateById, parseTemplateIdFromTags } from '@/lib/layout-templates';
import { ensureXiaohongshuMcpAvailable } from '@/lib/xiaohongshu-mcp';

const execAsync = promisify(exec);
const BUN_BIN = process.env.BUN_BIN || 'bun';
const MOWEN_API_KEY = process.env.MOWEN_API_KEY || '';
const MOWEN_ENDPOINT_BASE = 'https://open.mowen.cn/api/open/mcp/v1/note';
const FREEIMAGE_API_KEY = process.env.FREEIMAGE_API_KEY || '';
let wechatTokenCache: { token: string; expiresAt: number } | null = null;

function getPlatformLabel(platform: string): string {
  if (platform === 'xiaohongshu') return '小红书';
  if (platform === 'wechat') return '微信公众号';
  if (platform === 'mowen') return '墨问笔记';
  if (platform === 'obsidian') return 'Obsidian';
  return platform;
}

// Helper: call MCP tool via HTTP (Streamable HTTP + Session)
async function callMcpTool(toolName: string, args: any): Promise<{ success: boolean; result: any; error?: string }> {
  const MCP_URL = process.env.MCP_URL || 'http://localhost:18060/mcp';

  try {
    const availability = await ensureXiaohongshuMcpAvailable(MCP_URL);
    if (!availability.ok) {
      return {
        success: false,
        result: null,
        error: availability.error || '小红书 MCP 不可用',
      };
    }

    // 1. Initialize and get Session ID
    const initResp = await fetch(MCP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'content-publisher', version: '1.0' }
        }
      }),
    });

    const sessionId = initResp.headers.get('mcp-session-id');
    if (!sessionId) {
      return { success: false, result: null, error: 'MCP 服务未返回 Session ID，请确认服务正在运行' };
    }

    // 2. Send initialized notification
    await fetch(MCP_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Mcp-Session-Id': sessionId,
      },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
    });

    // 3. Call tool
    const toolResp = await fetch(MCP_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Mcp-Session-Id': sessionId,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: toolName, arguments: args }
      }),
    });

    const toolResult = await toolResp.json() as any;

    // Parse MCP result
    if (toolResult.error) {
      return {
        success: false,
        result: toolResult,
        error: `MCP 错误: ${toolResult.error.message || JSON.stringify(toolResult.error)}`
      };
    }

    const contents = toolResult.result?.content || [];
    const textContent = contents
      .filter((c: any) => c.type === 'text')
      .map((c: any) => c.text)
      .join('\n');

    const lowerText = textContent.toLowerCase();
    const hasSuccessHint =
      textContent.includes('发布成功')
      || textContent.includes('内容发布成功')
      || textContent.includes('成功发布')
      || textContent.includes('已发布')
      || lowerText.includes('publish success')
      || lowerText.includes('published successfully');
    const hasHardErrorHint =
      textContent.includes('❌')
      || textContent.includes('发布失败')
      || /(^|\s)error[:：]\s*(?!null|nil|none|0\b)/i.test(textContent);

    // Avoid false negatives: some successful outputs may include "error: nil/null".
    if (!hasSuccessHint && hasHardErrorHint) {
      return { success: false, result: textContent, error: textContent };
    }

    return { success: true, result: textContent };
  } catch (error: any) {
    if (error.code === 'ECONNREFUSED' || error.cause?.code === 'ECONNREFUSED') {
      return {
        success: false,
        result: null,
        error: '小红书 MCP 无法连接，且自动拉起失败。'
      };
    }
    return { success: false, result: null, error: 'MCP 调用失败: ' + String(error) };
  }
}

// Publish to Xiaohongshu via MCP publish_content tool
async function publishToXiaohongshu(
  title: string,
  content: string,
  images: string[],
  tags: string[],
  coverImage?: string
): Promise<{ success: boolean; result: any; error?: string }> {
  try {
    // 1. Best-effort login precheck. Do not hard block on precheck uncertainty.
    console.log('[小红书] Checking login status...');
    const loginCheck = await callMcpTool('check_login_status', {});
    if (loginCheck.success && loginCheck.result) {
      const statusText = String(loginCheck.result);
      if (statusText.includes('未登录') || statusText.includes('❌')) {
        return {
          success: false,
          result: null,
          error: '小红书未登录。请先在终端运行以下命令扫码登录：\nbash ~/.agents/skills/xiaohongshu/scripts/login.sh'
        };
      }
    } else {
      console.warn('[小红书] 登录预检失败，继续尝试发布，由发布接口给出最终结果。', loginCheck.error || '');
    }

    // 2. Extract inline images from content
    const projectRoot = process.cwd();
    const resolvedImages: string[] = [];

    // Helper: resolve a URL path (/uploads/xxx) to absolute filesystem path
    const resolveToAbsPath = (urlPath: string): string | null => {
      if (urlPath.startsWith('/uploads/')) {
        return path.join(projectRoot, 'public', urlPath);
      } else if (urlPath.startsWith('/')) {
        return path.join(projectRoot, 'public', urlPath);
      } else if (!urlPath.startsWith('http')) {
        return path.resolve(projectRoot, urlPath);
      }
      return null; // http URLs can't be resolved locally
    };

    // Priority 1: Cover image first
    if (coverImage) {
      const coverPath = resolveToAbsPath(coverImage);
      if (coverPath && fs.existsSync(coverPath) && !resolvedImages.includes(coverPath)) {
        resolvedImages.push(coverPath);
        console.log('[小红书] Cover image added:', coverPath);
      }
    }

    // Priority 2: Images from the ImageManager (selectedImages array)
    for (const img of images) {
      if (img.startsWith('http')) continue; // skip remote URLs
      const absPath = resolveToAbsPath(img);
      if (absPath && fs.existsSync(absPath) && !resolvedImages.includes(absPath)) {
        resolvedImages.push(absPath);
        console.log('[小红书] ImageManager image resolved:', absPath);
      }
    }

    // Priority 3: Extract inline images embedded in the HTML body
    const imgRegex = /<img[^>]+src=["'](\/uploads\/[^"']+)["'][^>]*>/gi;
    let match;
    while ((match = imgRegex.exec(content)) !== null) {
      const src = match[1];
      const absPath = resolveToAbsPath(src);
      if (absPath && fs.existsSync(absPath) && !resolvedImages.includes(absPath)) {
        resolvedImages.push(absPath);
        console.log('[小红书] Extracted inline image:', absPath);
      }
    }

    // 3. Normalize content (handle legacy Markdown-in-paragraph format)
    const normalizedContent = await normalizeHtmlContent(content);

    // 4. Convert normalized HTML to plain text (小红书 only accepts clean text without markup)
    const plainText = stripHtml(normalizedContent);

    const normalizedTags = (tags || [])
      .map((tag) => String(tag || '').trim())
      .filter(Boolean)
      .filter((tag) => !tag.startsWith('layout-template:') && !tag.startsWith('series:'))
      .map((tag) => tag.replace(/^#/, '').trim())
      .filter(Boolean)
      .slice(0, 8);

    // 5. Truncate to 小红书 limits (reserve space for tags because MCP may append them into content input)
    const finalTitle = title.substring(0, 20);
    const tagReserve = normalizedTags.reduce((sum, tag) => sum + tag.length + 2, 0); // "#标签" + separator
    const contentBudget = Math.max(200, 980 - tagReserve); // keep safety margin
    const finalContent = plainText.substring(0, contentBudget);

    console.log('[小红书] Plain text content preview:', finalContent.substring(0, 200));

    // 小红书严格模式：必须使用当前内容里的图片，不允许随机兜底
    if (resolvedImages.length === 0) {
      return {
        success: false,
        result: null,
        error: '小红书发布需要至少 1 张图片。请在图片管理中添加图片后再发布。'
      };
    }

    console.log(`[小红书] Publishing: title="${finalTitle}", content length=${finalContent.length}, images=${resolvedImages.length}, tags=${normalizedTags.length}`);

    // 6. Call MCP publish_content
    const publishArgs: any = {
      title: finalTitle,
      content: finalContent,
      images: resolvedImages,
    };
    if (normalizedTags.length > 0) {
      publishArgs.tags = normalizedTags;
    }

    const result = await callMcpTool('publish_content', publishArgs);

    if (result.success) {
      console.log('[小红书] Published successfully:', result.result);
    } else {
      console.error('[小红书] Publish failed:', result.error);
    }

    return result;
  } catch (error) {
    console.error('[小红书] Error:', error);
    return { success: false, result: null, error: '小红书发布失败: ' + String(error) };
  }
}

// Detect if content is legacy format: Markdown text wrapped in a single large <p> tag
// This happens when old content was stored as raw Markdown but Tiptap wrapped it in <p>
function looksLikeMarkdownInParagraph(html: string): boolean {
  // Check if it's basically one big <p> wrapping markdown-looking text
  const stripped = html.trim();
  if (!stripped.startsWith('<p>')) return false;
  if (/<img[\s>]/i.test(stripped)) return false;
  const paragraphCount = (stripped.match(/<p[^>]*>/gi) || []).length;
  if (paragraphCount > 1) return false;
  // Count how many block-level HTML tags exist (real Tiptap HTML has many)
  const blockTags = (stripped.match(/<(h[1-6]|ul|ol|li|blockquote|pre|hr|table)/gi) || []).length;
  if (blockTags > 2) return false; // already proper HTML
  // Check for markdown indicators inside the paragraph
  const inner = stripped.replace(/<\/?p[^>]*>/gi, '').trim();
  if (!inner.includes('\n')) return false;
  const hasMarkdown = /^#{1,6}\s/m.test(inner) ||
    /\n#{1,6}\s/.test(inner) ||
    /\n---/.test(inner) ||
    /```[\s\S]+```/.test(inner) ||
    /^\d+\.\s/m.test(inner);
  return hasMarkdown;
}

// Normalize content: if it's Markdown-in-paragraph format, re-parse through marked to get proper HTML
async function normalizeHtmlContent(content: string): Promise<string> {
  if (looksLikeMarkdownInParagraph(content)) {
    console.log('[Normalize] Detected legacy Markdown-in-paragraph format, re-parsing...');
    const inner = content
      .replace(/^<p[^>]*>/i, '')
      .replace(/<\/p>\s*<p>\s*<\/p>\s*<img[^>]+>\s*<p>\s*<\/p>\s*$/i, '')
      .replace(/<\/p>$/i, '');
    const pureText = inner
      .replace(/<img[^>]+>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"');

    // Restore newlines before block-level markdown markers
    const rebuilt = pureText
      .replace(/\s+(#{1,6})\s+/g, '\n\n$1 ')
      .replace(/\s+---\s+/g, '\n\n---\n\n')
      .replace(/\s+(\d+\.\s)/g, '\n$1')
      .replace(/\s*(```)/g, '\n$1')
      .replace(/(```)\s*/g, '$1\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    const parsed = await marked.parse(rebuilt);
    console.log('[Normalize] Re-parsed HTML preview:', parsed.substring(0, 150));
    return parsed;
  }
  return content;
}

// Strip HTML tags to extract plain text
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n')
    .replace(/<\/ul>|<\/ol>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<hr\s*\/?>/gi, '\n---\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function escapeHtmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Convert HTML to simple Markdown for the wechat script
function htmlToMarkdown(html: string): string {
  let md = html;
  // Convert headings
  md = md.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n');
  md = md.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n');
  md = md.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n');
  // Convert bold and italic
  md = md.replace(/<strong>(.*?)<\/strong>/gi, '**$1**');
  md = md.replace(/<b>(.*?)<\/b>/gi, '**$1**');
  md = md.replace(/<em>(.*?)<\/em>/gi, '*$1*');
  md = md.replace(/<i>(.*?)<\/i>/gi, '*$1*');
  md = md.replace(/<s>(.*?)<\/s>/gi, '~~$1~~');
  // Convert links
  md = md.replace(/<a[^>]+href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)');
  // Convert images
  md = md.replace(/<img[^>]+src="([^"]*)"[^>]*alt="([^"]*)"[^>]*\/?>/gi, '![$2]($1)');
  md = md.replace(/<img[^>]+src="([^"]*)"[^>]*\/?>/gi, '![]($1)');
  // Convert lists
  md = md.replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n');
  md = md.replace(/<\/?(ul|ol)[^>]*>/gi, '\n');
  // Convert blockquote
  md = md.replace(/<blockquote[^>]*>(.*?)<\/blockquote>/gi, '> $1\n\n');
  // Convert code blocks
  md = md.replace(/<pre><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, '```\n$1\n```\n\n');
  md = md.replace(/<code>(.*?)<\/code>/gi, '`$1`');
  // Convert hr
  md = md.replace(/<hr\s*\/?>/gi, '\n---\n\n');
  // Convert paragraphs and line breaks
  md = md.replace(/<\/p>/gi, '\n\n');
  md = md.replace(/<br\s*\/?>/gi, '\n');
  // Strip remaining HTML tags
  md = md.replace(/<[^>]+>/g, '');
  // Decode HTML entities
  md = md.replace(/&nbsp;/g, ' ');
  md = md.replace(/&amp;/g, '&');
  md = md.replace(/&lt;/g, '<');
  md = md.replace(/&gt;/g, '>');
  md = md.replace(/&quot;/g, '"');
  // Clean up extra newlines
  md = md.replace(/\n{3,}/g, '\n\n');
  return md.trim();
}

function sanitizeFileSegment(name: string): string {
  return (name || '')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function ensureInsideVault(vaultPath: string, subPath: string): string {
  const normalizedSubPath = (subPath || '')
    .replace(/^\/+/, '')
    .replace(/\\/g, '/');
  const target = path.resolve(vaultPath, normalizedSubPath);
  const normalizedVault = path.resolve(vaultPath);
  if (!target.startsWith(normalizedVault)) {
    return normalizedVault;
  }
  return target;
}

function buildFrontmatter(title: string, tagsList: string[]): string {
  const escapedTitle = (title || '未命名内容').replace(/"/g, '\\"');
  const safeTags = (tagsList || []).filter(Boolean).map((tag) => `  - ${String(tag).trim()}`);
  const now = new Date().toISOString();
  return [
    '---',
    `title: "${escapedTitle}"`,
    `created: ${now}`,
    `updated: ${now}`,
    'source: content-publisher',
    'platform: obsidian',
    'tags:',
    ...(safeTags.length > 0 ? safeTags : ['  - content-publisher']),
    '---',
    '',
  ].join('\n');
}

async function copyToObsidianAssets(
  markdown: string,
  htmlContent: string,
  selectedImages: string[],
  coverImage: string | undefined,
  vaultPath: string,
  assetFolder: string,
  linkStyle: 'markdown' | 'wikilink'
): Promise<{ markdown: string; copied: string[]; warnings: string[] }> {
  const projectRoot = process.cwd();
  const warnings: string[] = [];
  const copied: string[] = [];

  const htmlImagePaths: string[] = [];
  const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  let htmlMatch;
  while ((htmlMatch = imgRegex.exec(htmlContent)) !== null) {
    htmlImagePaths.push(htmlMatch[1]);
  }

  const candidates = [coverImage || '', ...selectedImages, ...htmlImagePaths]
    .filter(Boolean)
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .filter((v) => !v.startsWith('http'));

  if (candidates.length === 0) {
    return { markdown, copied, warnings };
  }

  const assetsDir = ensureInsideVault(vaultPath, assetFolder);
  fs.mkdirSync(assetsDir, { recursive: true });

  let resultMarkdown = markdown;
  const appendedLinks: string[] = [];

  for (const src of candidates) {
    const absPath = resolveLocalAssetPath(src, projectRoot);
    if (!absPath || !fs.existsSync(absPath)) {
      warnings.push(`图片不存在，已跳过: ${src}`);
      continue;
    }
    const ext = path.extname(absPath) || '.png';
    const base = sanitizeFileSegment(path.basename(absPath, ext)) || `image-${Date.now()}`;
    let targetName = `${base}${ext}`;
    let targetPath = path.join(assetsDir, targetName);
    let idx = 1;
    while (fs.existsSync(targetPath)) {
      targetName = `${base}-${idx}${ext}`;
      targetPath = path.join(assetsDir, targetName);
      idx += 1;
    }
    fs.copyFileSync(absPath, targetPath);
    copied.push(targetPath);

    const escapedSrc = src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (linkStyle === 'wikilink') {
      const nextLink = `![[${targetName}]]`;
      resultMarkdown = resultMarkdown.replace(
        new RegExp(`!\\[[^\\]]*\\]\\(${escapedSrc}\\)`, 'g'),
        nextLink
      );
      if (!resultMarkdown.includes(nextLink)) {
        appendedLinks.push(nextLink);
      }
    } else {
      const relativePath = path.posix.join(assetFolder.replace(/\\/g, '/'), targetName);
      const nextLink = `![](${relativePath})`;
      resultMarkdown = resultMarkdown.replace(
        new RegExp(`!\\[[^\\]]*\\]\\(${escapedSrc}\\)`, 'g'),
        nextLink
      );
      if (!resultMarkdown.includes(nextLink)) {
        appendedLinks.push(nextLink);
      }
    }
  }

  if (appendedLinks.length > 0) {
    resultMarkdown = `${resultMarkdown.trimEnd()}\n\n${appendedLinks.join('\n')}\n`;
  }

  return { markdown: resultMarkdown, copied, warnings };
}

async function publishToObsidian(
  title: string,
  content: string,
  selectedImages: string[],
  tagsList: string[],
  coverImage?: string
): Promise<{ success: boolean; result: any; error?: string; warning?: string }> {
  try {
    const settings = await getAppSettings();
    if (!settings.enableObsidian) {
      return { success: false, result: null, error: 'Obsidian 发布未启用，请先在设置中开启。' };
    }
    if (!settings.obsidianVaultPath) {
      return { success: false, result: null, error: '未配置 Obsidian Vault 路径，请先在设置中填写。' };
    }

    const vaultPath = path.resolve(settings.obsidianVaultPath);
    if (!fs.existsSync(vaultPath) || !fs.statSync(vaultPath).isDirectory()) {
      return { success: false, result: null, error: `Vault 路径不存在或不可用: ${vaultPath}` };
    }

    const normalizedHtml = await normalizeHtmlContent(content);
    const initialMarkdown = htmlToMarkdown(normalizedHtml);
    const targetFolder = ensureInsideVault(vaultPath, settings.obsidianFolder || 'Inbox');
    fs.mkdirSync(targetFolder, { recursive: true });

    const copiedResult = await copyToObsidianAssets(
      initialMarkdown,
      normalizedHtml,
      selectedImages,
      coverImage,
      vaultPath,
      settings.obsidianAssetFolder || 'assets/content-publisher',
      settings.obsidianLinkStyle || 'wikilink'
    );

    const safeTitle = sanitizeFileSegment(title) || '未命名内容';
    let notePath = path.join(targetFolder, `${safeTitle}.md`);
    if (!settings.obsidianOverwrite) {
      let i = 1;
      while (fs.existsSync(notePath)) {
        notePath = path.join(targetFolder, `${safeTitle}-${i}.md`);
        i += 1;
      }
    }

    const frontmatter = buildFrontmatter(title, tagsList);
    const finalMarkdown = `${frontmatter}${copiedResult.markdown}\n`;
    fs.writeFileSync(notePath, finalMarkdown, 'utf-8');

    return {
      success: true,
      result: {
        externalId: notePath,
        filePath: notePath,
        imageCount: copiedResult.copied.length,
      },
      warning: copiedResult.warnings.length > 0 ? copiedResult.warnings.join('；') : undefined,
    };
  } catch (error) {
    return {
      success: false,
      result: null,
      error: `Obsidian 发布失败: ${String(error)}`,
    };
  }
}

// Publish to WeChat using API method (recommended, faster, more reliable)
async function publishToWechatAPI(
  title: string,
  content: string,
  imagesList: string[],
  templateId?: string,
  coverImage?: string,
  fallbackCoverImage?: string
): Promise<{ success: boolean; result: any; error?: string }> {
  const SKILL_DIR = process.env.WECHAT_SKILL_DIR || path.join(process.env.HOME || '', '.claude/skills/baoyu-post-to-wechat');
  const scriptPath = path.join(SKILL_DIR, 'scripts/wechat-api.ts');

  if (!fs.existsSync(scriptPath)) {
    return { success: false, result: null, error: `微信发布脚本不存在: ${scriptPath}` };
  }

  const tempDir = '/tmp';
  const tempFile = path.join(tempDir, `wechat-post-${Date.now()}.html`);

  try {
    const projectRoot = process.cwd();

    // Normalize content: handle legacy Markdown-in-paragraph format
    // If content is raw Markdown wrapped in <p>, re-parse through marked to get proper HTML struture
    const rawHtml = await normalizeHtmlContent(content);
    console.log('[WeChat API] Normalized HTML preview:', rawHtml.substring(0, 200));

    // Helper: convert URL path to absolute filesystem path
    const urlToAbsPath = (urlPath: string): string | null => {
      if (urlPath.startsWith('/uploads/')) {
        return path.join(projectRoot, 'public', urlPath);
      } else if (urlPath.startsWith('/') && !urlPath.startsWith('//')) {
        return path.join(projectRoot, 'public', urlPath);
      }
      return null;
    };

    // Resolve inline /uploads/ image paths in the HTML to absolute paths
    // This regex handles both: src="/uploads/...", src='/uploads/...'
    let processedContent = rawHtml.replace(
      /(<img[^>]*\ssrc=["'])(\/[^"']+)(["'][^>]*>)/gi,
      (matchStr, prefix, urlPath, suffix) => {
        if (!urlPath.startsWith('/uploads/')) return matchStr;
        const absPath = urlToAbsPath(urlPath);
        if (absPath && fs.existsSync(absPath)) {
          console.log('[WeChat API] Resolved inline img:', urlPath, '->', absPath);
          return `${prefix}${absPath}${suffix}`;
        }
        return matchStr;
      }
    );

    // Append ImageManager images (that are not already in the HTML) as absolute paths
    for (const imgUrl of imagesList) {
      if (imgUrl.startsWith('http')) continue; // skip external URLs
      if (coverImage && imgUrl === coverImage) {
        // Keep cover as article cover only. Do not auto-append it into the body.
        continue;
      }
      const absPath = urlToAbsPath(imgUrl);
      if (!absPath || !fs.existsSync(absPath)) {
        console.log('[WeChat API] Skipping non-existent image:', imgUrl);
        continue;
      }
      // Check if this image (by absolute path OR original URL) is already in the content
      if (!processedContent.includes(absPath) && !processedContent.includes(imgUrl)) {
        processedContent += `\n<p style="text-align: center;"><img src="${absPath}" alt="" style="max-width: 100%; border-radius: 8px; margin: 16px auto;" /></p>\n`;
        console.log('[WeChat API] Appended ImageManager image:', absPath);
      }
    }

    const layoutTemplate =
      (await getLayoutTemplateById(templateId)) ||
      (await getLayoutTemplateById('standard'));
    const inlineStyledContent = layoutTemplate
      ? applyLayoutTemplateToHtml(processedContent, layoutTemplate)
      : processedContent;

    // Only set body because wechat-api drops `<head>` totally
    const styledHtmlContent = `<div>${inlineStyledContent}</div>`;

    fs.writeFileSync(tempFile, styledHtmlContent, 'utf-8');

    console.log('[WeChat API] Temp Styled HTML file created:', tempFile);
    console.log('[WeChat API] Content length:', styledHtmlContent.length);

    // Resolve cover image path
    let coverPath = '';
    if (coverImage) {
      if (coverImage.startsWith('/uploads/')) {
        coverPath = path.join(projectRoot, 'public', coverImage);
      } else if (coverImage.startsWith('/')) {
        coverPath = coverImage;
      } else {
        coverPath = path.resolve(coverImage);
      }
    }

    if ((!coverPath || !fs.existsSync(coverPath)) && fallbackCoverImage) {
      if (fallbackCoverImage.startsWith('/uploads/')) {
        coverPath = path.join(projectRoot, 'public', fallbackCoverImage);
      } else if (fallbackCoverImage.startsWith('/')) {
        coverPath = path.join(projectRoot, 'public', fallbackCoverImage);
      } else if (!fallbackCoverImage.startsWith('http')) {
        coverPath = path.resolve(projectRoot, fallbackCoverImage);
      }
      if (coverPath && fs.existsSync(coverPath)) {
        console.log('[WeChat API] Using configured fallback cover:', coverPath);
      }
    }

    // 严格模式：不再自动从 uploads 里取第一张图，避免误发封面
    if (!coverPath || !fs.existsSync(coverPath)) {
      return {
        success: false,
        result: null,
        error: '微信公众号文章需要封面图。请在编辑器中设置封面，或在设置中心配置“微信公众号兜底封面图”。'
      };
    }

    const escapedTitle = title.replace(/"/g, '\\"');
    // Using HTML file directly and no --theme, avoiding the marked.js bug
    const cmd = `"${BUN_BIN}" "${scriptPath}" "${tempFile}" --title "${escapedTitle}" --cover "${coverPath}"`;
    console.log('[WeChat API] Running command:', cmd);

    const { stdout, stderr } = await execAsync(cmd, {
      timeout: 120000,
      env: {
        ...process.env,
        HOME: process.env.HOME || process.cwd(),
      },
    });

    const output = stdout + (stderr || '');
    console.log('[WeChat API] Output:', output);

    // Detect success
    if (output.includes('media_id') || output.includes('Published successfully')) {
      // Extract media_id from output
      const mediaIdMatch = output.match(/media_id['":\s]+([a-zA-Z0-9_-]+)/);
      return {
        success: true,
        result: {
          output,
          media_id: mediaIdMatch ? mediaIdMatch[1] : undefined,
          message: '文章已成功发布到微信公众号草稿箱'
        },
      };
    }

    // Detect known errors
    if (output.includes('WECHAT_APP_ID') || output.includes('credentials')) {
      return {
        success: false,
        result: output,
        error: '微信 API 凭据未配置。请在 ~/.baoyu-skills/.env 中设置 WECHAT_APP_ID 和 WECHAT_APP_SECRET'
      };
    }

    if (output.includes('access_token') && output.includes('error')) {
      return {
        success: false,
        result: output,
        error: '微信 Access Token 获取失败，请检查 APP_ID 和 APP_SECRET 是否正确'
      };
    }

    if (output.includes('cover image') || output.includes('No cover')) {
      return {
        success: false,
        result: output,
        error: '微信公众号文章需要封面图。请上传图片并设为封面。'
      };
    }

    // Generic error
    return { success: false, result: output, error: '发布失败: ' + output.substring(0, 200) };
  } catch (e: any) {
    const commandOutput = [e?.stdout, e?.stderr].filter(Boolean).join('\n').trim();
    console.error('[WeChat API] Error:', commandOutput || e.message || e);

    const invalidIpMatch = commandOutput.match(/invalid ip\s+([^\s,]+)/i);
    if (invalidIpMatch) {
      return {
        success: false,
        result: commandOutput || e.message || String(e),
        error: `微信公众号发布失败：当前服务器出口 IP ${invalidIpMatch[1]} 未加入微信公众平台 IP 白名单，请到微信公众平台后台补充后重试。`
      };
    }

    if (/Access token error/i.test(commandOutput)) {
      return {
        success: false,
        result: commandOutput || e.message || String(e),
        error: `微信公众号发布失败：${commandOutput.split('\n').slice(-1)[0] || 'Access Token 获取失败'}`
      };
    }

    return {
      success: false,
      result: commandOutput || e.message || String(e),
      error: '微信公众号发布失败: ' + (commandOutput || e.message || String(e)).substring(0, 300)
    };
  } finally {
    // Clean up temp file
    try {
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    } catch { }
  }
}

// Publish pure text content to WeChat draft via API
async function publishToWechatText(
  title: string,
  content: string,
  templateId?: string,
  coverImage?: string,
  fallbackCoverImage?: string
): Promise<{ success: boolean; result: any; error?: string }> {
  try {
    const normalized = await normalizeHtmlContent(content);
    const plainText = stripHtml(normalized).trim();
    if (!plainText) {
      return {
        success: false,
        result: null,
        error: '正文为空，无法执行微信公众号纯文字发布'
      };
    }

    const paragraphs = plainText
      .split(/\n{2,}/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => `<p>${escapeHtmlText(line).replace(/\n/g, '<br />')}</p>`)
      .join('\n');
    const textOnlyHtml = `<div>${paragraphs}</div>`;

    const apiResult = await publishToWechatAPI(
      title,
      textOnlyHtml,
      [],
      templateId,
      coverImage,
      fallbackCoverImage
    );
    if (apiResult.success) {
      return {
        success: true,
        result: {
          ...(apiResult.result || {}),
          message: '纯文字内容已通过 API 发布到微信公众号草稿箱'
        }
      };
    }

    const apiError = apiResult.error || '微信公众号纯文字 API 发布失败';
    if (apiError.includes('封面图')) {
      return {
        success: false,
        result: apiResult.result,
        error: '纯文字 API 发布也需要封面图。请在编辑器设置封面，或在设置中心配置“微信公众号兜底封面图”。'
      };
    }
    return { success: false, result: apiResult.result, error: apiError };
  } catch (e: any) {
    return {
      success: false,
      result: e.stdout || e.message || String(e),
      error: '微信公众号纯文字 API 发布失败: ' + (e.stderr || e.message || String(e))
    };
  }
}

// Legacy browser publish implementation (kept for compatibility, not used in current flow)
async function publishToWechatBrowser(title: string, content: string): Promise<{ success: boolean; result: any; error?: string }> {
  const SKILL_DIR = process.env.WECHAT_SKILL_DIR || path.join(process.env.HOME || '', '.claude/skills/baoyu-post-to-wechat');
  const scriptPath = path.join(SKILL_DIR, 'scripts/wechat-article.ts');

  if (!fs.existsSync(scriptPath)) {
    return {
      success: false,
      result: null,
      error: `微信发布脚本不存在: ${scriptPath}`
    };
  }

  // Create temp markdown file
  const tempDir = '/tmp';
  const tempFile = path.join(tempDir, `wechat-browser-${Date.now()}.md`);

  try {
    const isHtml = content.includes('<') && content.includes('>');
    const markdownContent = isHtml ? htmlToMarkdown(content) : content;

    const fullContent = `---\ntitle: "${title.replace(/"/g, '\\"')}"\n---\n\n${markdownContent}`;
    fs.writeFileSync(tempFile, fullContent, 'utf-8');

    const cmd = `"${BUN_BIN}" "${scriptPath}" --markdown "${tempFile}" --title "${title.replace(/"/g, '\\"')}" --submit 2>&1`;
    console.log('[WeChat Browser] Running command:', cmd);

    const { stdout, stderr } = await execAsync(cmd, {
      timeout: 180000,
      env: {
        ...process.env,
        HOME: process.env.HOME || process.cwd(),
      },
    });

    const output = stdout + (stderr || '');
    console.log('[WeChat Browser] Output:', output);

    if (output.includes('success') || output.includes('成功') || output.includes('已发布') || output.includes('Draft saved')) {
      return { success: true, result: output };
    }

    if (output.includes('error') || output.includes('错误') || output.includes('fail')) {
      return { success: false, result: output, error: '浏览器方式发布失败' };
    }

    return { success: true, result: output || '发布请求已发送' };
  } catch (e: any) {
    return {
      success: false,
      result: e.stdout || e.message || String(e),
      error: '微信公众号浏览器方式发布失败: ' + (e.stderr || e.message || String(e))
    };
  } finally {
    try {
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    } catch { }
  }
}

// Main WeChat publish function: API only (no browser fallback)
async function publishToWechat(
  title: string,
  content: string,
  imagesList: string[],
  templateId?: string,
  coverImage?: string,
  fallbackCoverImage?: string,
  publishMode: 'article' | 'text' = 'article'
): Promise<{ success: boolean; result: any; error?: string }> {
  console.log('[WeChat] Starting publish. Mode:', publishMode, 'Title:', title, 'Content length:', content.length);

  if (publishMode === 'text') {
    return publishToWechatText(title, content, templateId, coverImage, fallbackCoverImage);
  }

  // API method only
  const apiResult = await publishToWechatAPI(title, content, imagesList, templateId, coverImage, fallbackCoverImage);
  if (apiResult.success) {
    console.log('[WeChat] API method succeeded');
    return apiResult;
  }

  console.log('[WeChat] API method failed:', apiResult.error);
  return {
    success: false,
    result: apiResult.result,
    error: `微信公众号 API 发布失败: ${apiResult.error || '未知错误'}`
  };
}

async function callMowenTool(
  mowenEndpoint: string,
  name: string,
  args: Record<string, unknown>,
  id = 1
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const payload = {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: { name, arguments: args },
      id,
    };

    const resp = await fetch(mowenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await resp.json().catch(() => null);

    if (!resp.ok) {
      return { success: false, error: `HTTP ${resp.status}`, data };
    }
    if (data?.error) {
      return {
        success: false,
        error: data.error?.message || JSON.stringify(data.error),
        data,
      };
    }
    return { success: true, data };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

function extractMowenText(data: any): string {
  const items = data?.result?.content || [];
  return items
    .filter((c: any) => c?.type === 'text')
    .map((c: any) => c?.text || '')
    .join('\n')
    .trim();
}

function resolveLocalAssetPath(imagePath: string, projectRoot: string): string | null {
  if (!imagePath) return null;
  if (imagePath.startsWith('/uploads/')) return path.join(projectRoot, 'public', imagePath);
  if (imagePath.startsWith('/') && !imagePath.startsWith('//')) return path.join(projectRoot, 'public', imagePath);
  if (imagePath.startsWith('http')) return null;
  return path.resolve(projectRoot, imagePath);
}

async function uploadLocalImageToFreeImage(filePath: string): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    if (!FREEIMAGE_API_KEY) {
      return { success: false, error: '未配置 FREEIMAGE_API_KEY，无法上传到 FreeImage。' };
    }
    if (!fs.existsSync(filePath)) {
      return { success: false, error: `图片不存在: ${filePath}` };
    }
    const fileBuffer = fs.readFileSync(filePath);
    const filename = path.basename(filePath);
    const ext = path.extname(filename).toLowerCase();
    const mimeMap: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.bmp': 'image/bmp',
    };
    const mimeType = mimeMap[ext] || 'application/octet-stream';
    const blob = new Blob([fileBuffer], { type: mimeType });
    const form = new FormData();
    form.append('key', FREEIMAGE_API_KEY);
    form.append('source', blob, filename);
    form.append('format', 'json');

    const resp = await fetch('https://freeimage.host/api/1/upload', {
      method: 'POST',
      body: form,
    });
    const data = await resp.json().catch(() => null);
    const url = data?.image?.url;
    if (!resp.ok || !url) {
      return {
        success: false,
        error: `上传图床失败: ${data?.error?.message || data?.status_txt || '未知错误'}`,
      };
    }
    return { success: true, url };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

async function uploadLocalImageToZeroX0(filePath: string): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    if (!fs.existsSync(filePath)) {
      return { success: false, error: `图片不存在: ${filePath}` };
    }
    const fileBuffer = fs.readFileSync(filePath);
    const filename = path.basename(filePath);
    const ext = path.extname(filename).toLowerCase();
    const mimeMap: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.bmp': 'image/bmp',
    };
    const mimeType = mimeMap[ext] || 'application/octet-stream';
    const blob = new Blob([fileBuffer], { type: mimeType });
    const form = new FormData();
    form.append('file', blob, filename);

    const resp = await fetch('https://0x0.st', {
      method: 'POST',
      body: form,
    });
    const text = (await resp.text()).trim();
    if (!resp.ok || !/^https?:\/\/\S+/i.test(text)) {
      return { success: false, error: `上传 0x0 失败: ${text || `HTTP ${resp.status}`}` };
    }
    return { success: true, url: text };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

async function uploadLocalImageToCatbox(filePath: string): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    if (!fs.existsSync(filePath)) {
      return { success: false, error: `图片不存在: ${filePath}` };
    }
    const fileBuffer = fs.readFileSync(filePath);
    const filename = path.basename(filePath);
    const ext = path.extname(filename).toLowerCase();
    const mimeMap: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.bmp': 'image/bmp',
    };
    const mimeType = mimeMap[ext] || 'application/octet-stream';
    const blob = new Blob([fileBuffer], { type: mimeType });
    const form = new FormData();
    form.append('reqtype', 'fileupload');
    form.append('fileToUpload', blob, filename);

    const resp = await fetch('https://catbox.moe/user/api.php', {
      method: 'POST',
      body: form,
    });
    const text = (await resp.text()).trim();
    if (!resp.ok || !/^https?:\/\/\S+/i.test(text)) {
      return { success: false, error: `上传 catbox 失败: ${text || `HTTP ${resp.status}`}` };
    }
    return { success: true, url: text };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

function loadEnvFileSimple(envPath: string): Record<string, string> {
  const env: Record<string, string> = {};
  if (!fs.existsSync(envPath)) return env;
  const content = fs.readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function getWechatApiCredentials(): { appId: string; appSecret: string } | null {
  const cwdEnv = loadEnvFileSimple(path.join(process.cwd(), '.baoyu-skills', '.env'));
  const homeEnv = loadEnvFileSimple(path.join(process.env.HOME || '', '.baoyu-skills', '.env'));
  const appId = process.env.WECHAT_APP_ID || cwdEnv.WECHAT_APP_ID || homeEnv.WECHAT_APP_ID;
  const appSecret = process.env.WECHAT_APP_SECRET || cwdEnv.WECHAT_APP_SECRET || homeEnv.WECHAT_APP_SECRET;
  if (!appId || !appSecret) return null;
  return { appId, appSecret };
}

async function fetchWechatAccessToken(appId: string, appSecret: string): Promise<string> {
  const now = Date.now();
  if (wechatTokenCache && wechatTokenCache.expiresAt - 60_000 > now) {
    return wechatTokenCache.token;
  }
  const tokenUrl = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(appId)}&secret=${encodeURIComponent(appSecret)}`;
  const resp = await fetch(tokenUrl);
  const data = await resp.json().catch(() => ({})) as { access_token?: string; expires_in?: number; errcode?: number; errmsg?: string };
  if (!resp.ok || !data.access_token) {
    throw new Error(`微信 access_token 获取失败: ${data.errmsg || `HTTP ${resp.status}`}`);
  }
  const ttl = typeof data.expires_in === 'number' && data.expires_in > 0 ? data.expires_in : 3600;
  wechatTokenCache = {
    token: data.access_token,
    expiresAt: now + ttl * 1000,
  };
  return data.access_token;
}

async function uploadLocalImageToWechatCdn(filePath: string): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    if (!fs.existsSync(filePath)) return { success: false, error: `图片不存在: ${filePath}` };
    const creds = getWechatApiCredentials();
    if (!creds) return { success: false, error: '未配置微信 API 凭据（WECHAT_APP_ID/WECHAT_APP_SECRET）' };

    const accessToken = await fetchWechatAccessToken(creds.appId, creds.appSecret);
    const filename = path.basename(filePath);
    const ext = path.extname(filename).toLowerCase();
    const mimeMap: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.bmp': 'image/bmp',
    };
    const mimeType = mimeMap[ext] || 'image/jpeg';
    const fileBuffer = fs.readFileSync(filePath);
    if (fileBuffer.length === 0) return { success: false, error: '本地图片为空文件' };
    const blob = new Blob([fileBuffer], { type: mimeType });
    const form = new FormData();
    form.append('media', blob, filename);

    const url = `https://api.weixin.qq.com/cgi-bin/material/add_material?access_token=${encodeURIComponent(accessToken)}&type=image`;
    const resp = await fetch(url, { method: 'POST', body: form });
    const data = await resp.json().catch(() => ({})) as { url?: string; errcode?: number; errmsg?: string };
    if (!resp.ok || data.errcode) {
      return { success: false, error: `微信素材上传失败: ${data.errmsg || `HTTP ${resp.status}`}` };
    }
    if (!data.url) return { success: false, error: '微信素材上传未返回可访问 URL' };
    return { success: true, url: data.url.replace(/^http:\/\//i, 'https://') };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

function cleanInlineMarkdown(text: string): string {
  return text
    .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/~~(.*?)~~/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function paragraphNode(text: string, opts?: { bold?: boolean; highlight?: boolean }) {
  const marks = [];
  if (opts?.bold) marks.push({ type: 'bold' });
  if (opts?.highlight) marks.push({ type: 'highlight' });
  return {
    type: 'paragraph',
    content: [
      marks.length > 0
        ? { type: 'text', text, marks }
        : { type: 'text', text },
    ],
  };
}

function spacerParagraphNode() {
  return { type: 'paragraph' };
}

function decodeBasicEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function extractHtmlTextSegments(text: string): string[] {
  return decodeBasicEntities(
    String(text || '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]+>/g, '')
  )
    .split(/\n+/)
    .map((item) => item.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function pushSpacer(nodes: Array<{ type: string }>) {
  const last = nodes[nodes.length - 1];
  if (!last || last.type !== 'paragraph' || 'content' in last) {
    nodes.push(spacerParagraphNode());
  }
}

function findImageUuidBySrc(src: string, imageUuidBySrc: Map<string, string>): string | undefined {
  if (!src) return undefined;
  if (imageUuidBySrc.has(src)) return imageUuidBySrc.get(src);

  const basename = path.basename(src.split('?')[0] || src);
  if (!basename) return undefined;
  for (const [key, uuid] of imageUuidBySrc.entries()) {
    const keyBase = path.basename((key || '').split('?')[0] || key);
    if (keyBase && keyBase === basename) return uuid;
  }
  return undefined;
}

function buildMowenDocFromHtml(
  title: string,
  html: string,
  imageUuidBySrc: Map<string, string>,
  uploadedImageUuids: string[]
) {
  const nodes: any[] = [];
  const usedUuids = new Set<string>();
  nodes.push(paragraphNode(title || '无标题', { bold: true }));
  pushSpacer(nodes);

  const blockRegex = /<(h[1-3]|p|li)\b[^>]*>([\s\S]*?)<\/\1>|<img\b[^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = blockRegex.exec(html)) !== null) {
    const full = match[0] || '';
    const tag = (match[1] || '').toLowerCase();
    const inner = match[2] || '';

    if (full.toLowerCase().startsWith('<img')) {
      const srcMatch = full.match(/src=["']([^"']+)["']/i);
      const src = srcMatch?.[1] || '';
      const uuid = findImageUuidBySrc(src, imageUuidBySrc);
      if (uuid && !usedUuids.has(uuid)) {
        pushSpacer(nodes);
        nodes.push({ type: 'image', attrs: { uuid, align: 'center', alt: '配图' } });
        pushSpacer(nodes);
        usedUuids.add(uuid);
      }
      continue;
    }

    const segments = extractHtmlTextSegments(inner);
    if (segments.length === 0) {
      pushSpacer(nodes);
      continue;
    }

    if (tag === 'h1' || tag === 'h2' || tag === 'h3') {
      const level = Number(tag.slice(1));
      for (const segment of segments) {
        nodes.push(paragraphNode(segment, { bold: true, highlight: level <= 2 }));
      }
      pushSpacer(nodes);
      continue;
    }
    if (tag === 'li') {
      for (const segment of segments) {
        nodes.push(paragraphNode(`• ${segment}`));
      }
      continue;
    }
    for (const segment of segments) {
      nodes.push(paragraphNode(segment));
    }
    pushSpacer(nodes);
  }

  const remaining = uploadedImageUuids.filter((uuid) => !usedUuids.has(uuid));
  if (remaining.length > 0) {
    pushSpacer(nodes);
    for (const uuid of remaining) {
      nodes.push({ type: 'image', attrs: { uuid, align: 'center', alt: '配图' } });
      pushSpacer(nodes);
    }
  }

  return { type: 'doc', content: nodes };
}

function buildMowenDocFromMarkdown(title: string, markdown: string, imageUuids: string[]) {
  const lines = markdown.replace(/\r/g, '').split('\n');
  const nodes: any[] = [];
  const imageQueue = [...imageUuids];
  nodes.push(paragraphNode(title || '无标题', { bold: true }));
  pushSpacer(nodes);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      pushSpacer(nodes);
      continue;
    }

    const imageMatches = Array.from(line.matchAll(/!\[[^\]]*]\(([^)]+)\)/g));
    if (imageMatches.length > 0) {
      for (let i = 0; i < imageMatches.length; i += 1) {
        const uuid = imageQueue.shift();
        if (!uuid) continue;
        nodes.push({
          type: 'image',
          attrs: { uuid, align: 'center', alt: '配图' },
        });
        pushSpacer(nodes);
      }
      const lineWithoutImages = line.replace(/!\[[^\]]*]\(([^)]+)\)/g, '').trim();
      if (lineWithoutImages) {
        const text = cleanInlineMarkdown(lineWithoutImages.replace(/\*\*/g, '').replace(/__/g, '').replace(/\*/g, ''));
        if (text) nodes.push(paragraphNode(text));
      }
      pushSpacer(nodes);
      continue;
    }

    const headingMatch = line.match(/^(#{1,3})\s+(.*)$/);
    if (headingMatch) {
      const headingText = cleanInlineMarkdown(headingMatch[2]);
      if (headingText) {
        nodes.push(paragraphNode(headingText, { bold: true, highlight: headingMatch[1].length <= 2 }));
      }
      pushSpacer(nodes);
      continue;
    }

    const bulletMatch = line.match(/^[-*]\s+(.*)$/);
    if (bulletMatch) {
      const itemText = cleanInlineMarkdown(bulletMatch[1]);
      if (itemText) {
        nodes.push(paragraphNode(`• ${itemText}`));
      }
      continue;
    }

    const orderedMatch = line.match(/^\d+\.\s+(.*)$/);
    if (orderedMatch) {
      const itemText = cleanInlineMarkdown(orderedMatch[1]);
      if (itemText) {
        nodes.push(paragraphNode(`• ${itemText}`));
      }
      continue;
    }

    const text = cleanInlineMarkdown(line.replace(/\*\*/g, '').replace(/__/g, '').replace(/\*/g, ''));
    if (text) {
      nodes.push(paragraphNode(text));
      pushSpacer(nodes);
    }
  }

  if (imageQueue.length > 0) {
    pushSpacer(nodes);
    for (const uuid of imageQueue) {
      nodes.push({
        type: 'image',
        attrs: { uuid, align: 'center', alt: '配图' },
      });
      pushSpacer(nodes);
    }
  }

  return { type: 'doc', content: nodes };
}

// Publish to Mowen Note via MCP Open API
async function publishToMowen(
  title: string,
  content: string,
  imagesList: string[],
  tagsList: string[],
  coverImage?: string
): Promise<{ success: boolean; result: any; error?: string; warning?: string }> {
  try {
    if (!MOWEN_API_KEY) {
      return { success: false, result: null, error: '未配置 MOWEN_API_KEY。' };
    }
    const appSettings = await getAppSettings();
    if (!appSettings.enableMowen) {
      return { success: false, result: null, error: '墨问发布未启用，请先在设置中开启。' };
    }

    const mowenEndpoint = `${MOWEN_ENDPOINT_BASE}?key=${encodeURIComponent(MOWEN_API_KEY)}`;
    const projectRoot = process.cwd();
    const warnings: string[] = [];

    // Normalize HTML and keep structure.
    const normalized = await normalizeHtmlContent(content);
    const markdown = appSettings.mowenRichLayout
      ? htmlToMarkdown(normalized)
      : stripHtml(normalized);

    // Upload images: local file -> freeimage URL -> Mowen UploadViaURL -> uuid
    // Keep inline order first so final rich doc can preserve mixed text-image flow.
    const htmlInlineImages: string[] = [];
    const inlineRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
    let inlineMatch: RegExpExecArray | null;
    while ((inlineMatch = inlineRegex.exec(normalized)) !== null) {
      const src = (inlineMatch[1] || '').trim();
      if (src) htmlInlineImages.push(src);
    }
    const imageLike = appSettings.mowenSyncImages
      ? [...htmlInlineImages, ...imagesList.filter((item) => !coverImage || item !== coverImage)]
      : [];
    const imageCandidates = imageLike
      .filter(Boolean)
      .filter((v, i, arr) => arr.indexOf(v) === i)
      .slice(0, 9);
    const orderedImages = imageCandidates.filter((item) => /\.(png|jpg|jpeg|gif|webp|bmp)$/i.test(item));
    const skippedMedia = imageCandidates.filter((item) => !/\.(png|jpg|jpeg|gif|webp|bmp)$/i.test(item));
    if (skippedMedia.length > 0) {
      warnings.push(`已跳过 ${skippedMedia.length} 个非图片素材（当前墨问发布仅自动上传图片/GIF）。`);
    }
    const imageUuids: string[] = [];
    const imageUuidBySrc = new Map<string, string>();
    const htmlHasImage = /<img\b/i.test(normalized);

    for (const imagePath of orderedImages) {
      const absPath = resolveLocalAssetPath(imagePath, projectRoot);
      if (!absPath) continue;
      const candidateUrlResults = await Promise.all([
        uploadLocalImageToWechatCdn(absPath),
        uploadLocalImageToFreeImage(absPath),
        uploadLocalImageToZeroX0(absPath),
        uploadLocalImageToCatbox(absPath),
      ]);
      const candidateUrls = candidateUrlResults
        .filter((item) => item.success && item.url)
        .map((item) => item.url as string);
      if (candidateUrls.length === 0) {
        const err = candidateUrlResults.map((item) => item.error).filter(Boolean).join(' | ');
        warnings.push(`图片上传失败: ${path.basename(absPath)} (${err || '未知错误'})`);
        continue;
      }

      let accepted = false;
      for (const url of candidateUrls) {
        const uploadResult = await callMowenTool(
          mowenEndpoint,
          'UploadViaURL',
          { url, file_type: 1, file_name: path.basename(absPath) },
          100 + imageUuids.length
        );
        if (!uploadResult.success || !uploadResult.data) {
          continue;
        }

        const text = extractMowenText(uploadResult.data);
        const uuidMatch = text.match(/[A-Za-z0-9_-]+(?:-TMP)?/);
        const uuid = uuidMatch?.[0] || text;
        if (!uuid) continue;

        imageUuids.push(uuid);
        imageUuidBySrc.set(imagePath, uuid);
        accepted = true;
        break;
      }
      if (!accepted) {
        warnings.push(`墨问图片接入失败: ${path.basename(absPath)} (多图床重试后仍失败)`);
      }
    }

    if (appSettings.mowenSyncImages && htmlHasImage && imageUuids.length === 0) {
      return {
        success: false,
        result: null,
        error: `墨问发布失败: 正文包含图片，但图片上传全部失败。${warnings.join('；')}`,
      };
    }

    const doc = appSettings.mowenRichLayout
      ? buildMowenDocFromHtml(title, normalized, imageUuidBySrc, imageUuids)
      : buildMowenDocFromMarkdown(title, markdown, imageUuids);
    const settings = JSON.stringify({
      auto_publish: true,
      is_private: !appSettings.mowenDefaultPublic,
      tags: (tagsList || []).slice(0, 10),
    });

    const createResult = await callMowenTool(
      mowenEndpoint,
      'CreateRichNote',
      { body: JSON.stringify(doc), settings },
      1
    );

    if (!createResult.success || !createResult.data) {
      return {
        success: false,
        result: createResult.data || null,
        error: `墨问发布失败: ${createResult.error || '未知错误'}`,
      };
    }

    const externalId = extractMowenText(createResult.data);

    // Best-effort enforce public visibility (API fields are not fully documented).
    if (externalId && appSettings.mowenDefaultPublic) {
      const settingCandidates = [
        { section: 'privacy', settings: JSON.stringify({ is_private: false }) },
        { section: 'permission', settings: JSON.stringify({ is_private: false }) },
        { section: 'publish', settings: JSON.stringify({ visibility: 'public' }) },
      ];

      let visibilityUpdated = false;
      for (const candidate of settingCandidates) {
        const changed = await callMowenTool(
          mowenEndpoint,
          'ChangeNoteSettings',
          { note_id: externalId, ...candidate },
          200
        );
        if (changed.success) {
          visibilityUpdated = true;
          break;
        }
      }
      if (!visibilityUpdated) {
        warnings.push('无法确认已强制设置为公开，请在墨问中检查隐私设置。');
      }
    }

    return {
      success: true,
      result: {
        ...createResult.data,
        externalId,
        imageCount: imageUuids.length,
      },
      warning: warnings.length > 0 ? warnings.join('；') : undefined,
    };
  } catch (error) {
    return {
      success: false,
      result: null,
      error: `墨问发布失败: ${String(error)}`,
    };
  }
}

function preflightPlatformPublish(input: {
  platform: string;
  title: string;
  bodyHtml: string;
  imageOnlyList: string[];
  appSettings: Awaited<ReturnType<typeof getAppSettings>>;
  fallbackCover?: string;
  imageCover?: string;
  tagsList: string[];
}): string | null {
  const { platform, title, bodyHtml, imageOnlyList, appSettings, fallbackCover, imageCover, tagsList } = input;
  if (platform === 'xiaohongshu') {
    if (!title.trim()) return '标题为空，无法发布到小红书。';
    if (imageOnlyList.length === 0 && !imageCover) return '小红书发布需要至少 1 张图片。';
    const plainText = stripHtml(bodyHtml);
    const normalizedTags = (tagsList || [])
      .map((tag) => String(tag || '').trim())
      .filter(Boolean)
      .filter((tag) => !tag.startsWith('layout-template:') && !tag.startsWith('series:'))
      .map((tag) => tag.replace(/^#/, '').trim())
      .filter(Boolean)
      .slice(0, 8);
    const tagReserve = normalizedTags.reduce((sum, tag) => sum + tag.length + 2, 0);
    const budget = Math.max(200, 980 - tagReserve);
    if (!plainText.trim()) return '正文为空，无法发布到小红书。';
    if (title.length > 20) return `小红书标题超限（${title.length}/20）。`;
    if (plainText.length > budget) {
      return `小红书正文过长（${plainText.length}），超出当前可用预算 ${budget}（已预留标签长度）。`;
    }
  }

  if (platform === 'wechat') {
    const hasCover = Boolean(imageCover || fallbackCover);
    if (appSettings.enableWechat && !hasCover) {
      return '微信公众号发布需要封面图。请设置封面图或在设置中心配置兜底封面。';
    }
  }

  return null;
}

function extractHtmlImagePaths(html: string): string[] {
  const imagePaths: string[] = [];
  const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  let match: RegExpExecArray | null = null;
  while ((match = imgRegex.exec(html)) !== null) {
    if (match[1]) imagePaths.push(match[1]);
  }
  return imagePaths;
}

function pickWechatDefaultCover(input: {
  coverImage?: string;
  fallbackCover?: string;
  imageOnlyList: string[];
  bodyHtml: string;
}): string | undefined {
  const { coverImage, fallbackCover, imageOnlyList, bodyHtml } = input;
  const htmlImagePaths = extractHtmlImagePaths(bodyHtml).filter((item) => /\.(png|jpg|jpeg|gif|webp|bmp)$/i.test(item || ''));
  return coverImage || imageOnlyList[0] || htmlImagePaths[0] || fallbackCover;
}

export async function POST(request: NextRequest) {
  try {
    const { contentId, platforms } = await request.json();

    if (!contentId || !platforms || platforms.length === 0) {
      return NextResponse.json({ error: 'Missing contentId or platforms' }, { status: 400 });
    }

    // Get content
    const content = await prisma.content.findUnique({
      where: { id: contentId },
    });

    if (!content) {
      return NextResponse.json({ error: 'Content not found' }, { status: 404 });
    }

    const results: Record<string, {
      success: boolean;
      result?: any;
      error?: string;
      warning?: string;
      message: string;
    }> = {};
    const appSettings = await getAppSettings();

    // Parse images and tags from content record
    let imagesList: string[] = [];
    let tagsList: string[] = [];
    try { imagesList = JSON.parse(content.images || '[]'); } catch { }
    try { tagsList = JSON.parse(content.tags || '[]'); } catch { }
    const layoutTemplateId = parseTemplateIdFromTags(tagsList);
    const isImageAssetPath = (assetPath: string) => /\.(png|jpg|jpeg|gif|webp|bmp)$/i.test(assetPath || '');
    const imageOnlyList = imagesList.filter(isImageAssetPath);
    const imageCover = content.coverImage && isImageAssetPath(content.coverImage) ? content.coverImage : undefined;
    const fallbackCover = isImageAssetPath(appSettings.fallbackCoverImage || '')
      ? appSettings.fallbackCoverImage
      : undefined;
    const resolvedWechatCover = pickWechatDefaultCover({
      coverImage: imageCover,
      fallbackCover,
      imageOnlyList,
      bodyHtml: content.body,
    });

    const publishOnePlatform = async (platform: string) => {
      let result: {
        success: boolean;
        result?: any;
        error?: string;
        warning?: string;
      };

      const preflightError = preflightPlatformPublish({
        platform,
        title: content.title,
        bodyHtml: content.body,
        imageOnlyList,
        appSettings,
        fallbackCover,
        imageCover: platform === 'wechat' ? resolvedWechatCover : imageCover,
        tagsList,
      });
      if (preflightError) {
        result = { success: false, error: `发布前校验未通过: ${preflightError}` };
      } else

      if (platform === 'xiaohongshu') {
        result = await publishToXiaohongshu(
          content.title,
          content.body,
          imageOnlyList,
          tagsList,
          imageCover
        );
      } else if (platform === 'wechat') {
        result = await publishToWechat(
          content.title,
          content.body,
          imageOnlyList,
          layoutTemplateId || undefined,
          resolvedWechatCover,
          fallbackCover,
          appSettings.wechatPublishMode || 'article'
        );
      } else if (platform === 'mowen') {
        result = await publishToMowen(
          content.title,
          content.body,
          imagesList,
          tagsList,
          content.coverImage || undefined
        );
      } else if (platform === 'obsidian') {
        result = await publishToObsidian(
          content.title,
          content.body,
          imagesList,
          tagsList,
          content.coverImage || undefined
        );
      } else {
        result = { success: false, error: `Unknown platform: ${platform}` };
      }

      // Save publish record
      await prisma.publishRecord.create({
        data: {
          contentId,
          platform,
          status: result.success ? 'success' : 'failed',
          externalId: result?.result?.externalId || null,
          errorMsg: result.error || null,
        },
      });

      // Add log
      await prisma.log.create({
        data: {
          action: `发布到 ${getPlatformLabel(platform)}`,
          result: result.success
            ? (result.warning ? `发布成功（${result.warning}）` : '发布成功')
            : (result.error || '发布失败'),
          contentId,
        },
      });

      const platformLabel = getPlatformLabel(platform);

      results[platform] = {
        ...result,
        message: result.success
          ? (result.warning
            ? `${platformLabel}发布成功（${result.warning}）`
            : `${platformLabel}发布成功`)
          : `${platformLabel}发布失败：${result.error || '未知错误'}`,
      };
    };

    await Promise.all(platforms.map((platform: string) => publishOnePlatform(platform)));

    const hasSuccess = Object.values(results).some((item: any) => item?.success);
    if (hasSuccess) {
      await prisma.content.update({
        where: { id: contentId },
        data: {
          status: 'published',
          publishedAt: new Date(),
        },
      });
    }

    return NextResponse.json({ results });
  } catch (error) {
    console.error('Failed to publish:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
