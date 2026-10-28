import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  PUBLISHED_NOTE_MARKER,
  buildPublishedNote,
  formatShanghaiDate,
  homepageBlockReason,
  homepageNoteUrl,
  parseBlockTagList,
  renderNotePageSource,
  renderPublishedNoteComponent,
  resolveHomepageKicker,
  resolveHomepageSlug,
  summaryFromNote,
  upsertHomepageLatestNote,
  type PublishedBlock,
} from '@/lib/homepage-note';

export type HomepagePublishMode = 'commit-push' | 'pull-request' | 'files-only';

export type HomepagePublishSettings = {
  enableHomepage: boolean;
  homepageRepoPath: string;
  homepageRepoRemote: string;
  homepageBranch: string;
  homepageSiteOrigin: string;
  homepagePublishMode: HomepagePublishMode;
  homepageBlockParenting: boolean;
  homepageBlockTags: string;
  homepageCredit: string;
};

export type HomepagePublishResult = {
  success: boolean;
  result?: {
    externalId?: string;
    pagePath?: string;
    prUrl?: string;
    commit?: string;
  };
  error?: string;
  warning?: string;
};

const NOTES_DIR = 'app/(zh)/notes';
const PUBLIC_NOTES_DIR = 'public/notes';
const HOME_VIEW = 'app/views/HomeView.tsx';
const HEADER_PATH = 'app/components/Header.tsx';
const COMPONENT_PATH = 'app/components/PublishedNote.tsx';
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|svg)$/i;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

type GitResult = { code: number; stdout: string; stderr: string; error?: NodeJS.ErrnoException };

function resolveRepoPath(settings: HomepagePublishSettings): string {
  const override = process.env.HOMEPAGE_REPO_PATH || '';
  return path.resolve((override || settings.homepageRepoPath || '').trim());
}

function resolveInside(repo: string, rel: string): string {
  const normalized = rel.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized || normalized.split('/').includes('..')) {
    throw new Error(`路径不安全: ${rel}`);
  }
  const abs = path.resolve(repo, normalized);
  const root = path.resolve(repo);
  if (abs !== root && !abs.startsWith(`${root}${path.sep}`)) {
    throw new Error(`路径越界: ${rel}`);
  }
  return abs;
}

function runGit(cwd: string, args: string[], secrets: string[] = []): Promise<GitResult> {
  return new Promise((resolve) => {
    execFile(
      'git',
      args,
      {
        cwd,
        timeout: 120000,
        maxBuffer: 2_000_000,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      },
      (error, stdout, stderr) => {
        const err = error as NodeJS.ErrnoException | null;
        const code = typeof err?.code === 'number' ? err.code : error ? 1 : 0;
        resolve({
          code,
          stdout: redact(String(stdout || ''), secrets),
          stderr: redact(String(stderr || ''), secrets),
          error: err || undefined,
        });
      },
    );
  });
}

function redact(text: string, secrets: string[]): string {
  let output = text;
  for (const secret of secrets) {
    if (secret) output = output.split(secret).join('[redacted]');
  }
  return output;
}

function gitFailure(result: GitResult, label: string): string {
  if (result.error?.code === 'ENOENT') return '本机没有 git，无法提交个人主页笔记。';
  const detail = `${result.stderr || result.stdout || result.error?.message || ''}`.trim();
  return detail ? `${label}: ${detail.slice(0, 400)}` : label;
}

async function currentBranch(repo: string): Promise<string> {
  const result = await runGit(repo, ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (result.code !== 0) return '';
  return result.stdout.trim();
}

export async function inspectHomepageRepo(settings: HomepagePublishSettings): Promise<{
  ok: boolean;
  status: 'success' | 'warning' | 'failed';
  message: string;
}> {
  const repo = resolveRepoPath(settings);
  if (!settings.homepageRepoPath && !process.env.HOMEPAGE_REPO_PATH) {
    return { ok: false, status: 'failed', message: '未配置个人主页仓库路径。' };
  }
  if (!fs.existsSync(repo) || !fs.statSync(repo).isDirectory()) {
    return { ok: false, status: 'failed', message: '仓库路径不存在或不是目录。' };
  }

  const git = await runGit(repo, ['rev-parse', '--is-inside-work-tree']);
  if (git.code !== 0 || git.stdout.trim() !== 'true') {
    return { ok: false, status: 'failed', message: '该路径不是 git 仓库。danghb.cn 笔记来自静态站点仓库，不是单独的写入 API。' };
  }

  const missing: string[] = [];
  if (!fs.existsSync(resolveInside(repo, HOME_VIEW))) missing.push(HOME_VIEW);
  if (!fs.existsSync(resolveInside(repo, HEADER_PATH))) missing.push(HEADER_PATH);
  if (missing.length > 0) {
    return {
      ok: false,
      status: 'failed',
      message: `不像 danghb.cn 站点仓库，缺少 ${missing.join('、')}。线上仓库是 github.com/yafeishi/yafeishi.github.io。`,
    };
  }

  const branch = await currentBranch(repo);
  const expected = settings.homepageBranch || 'master';
  const notes: string[] = [];
  let status: 'success' | 'warning' = 'success';
  if (!settings.enableHomepage) {
    status = 'warning';
    notes.push('设置里尚未启用');
  }
  if (branch && branch !== expected && settings.homepagePublishMode !== 'files-only') {
    status = 'warning';
    notes.push(`当前分支是 ${branch}，发布要求 ${expected}`);
  }
  if (settings.homepagePublishMode === 'commit-push' && !process.env.HOMEPAGE_GITHUB_TOKEN) {
    status = 'warning';
    notes.push('未设置 HOMEPAGE_GITHUB_TOKEN，推送时使用本机 git 凭据');
  }
  const modeLabel = settings.homepagePublishMode === 'pull-request'
    ? '将开 Pull Request，不直接更新线上'
    : settings.homepagePublishMode === 'files-only'
      ? '只写本地文件，不推送'
      : `推送到 ${expected} 后由 GitHub Pages 发布`;
  const summary = notes.length > 0 ? `${notes.join('；')}。` : '仓库结构匹配，可以发布。';
  return {
    ok: true,
    status,
    message: `${summary}${modeLabel}。笔记页是 app/(zh)/notes/<slug>/page.tsx。`,
  };
}

function safeImageName(src: string, index: number): string {
  const base = path.basename(src.split('?')[0] || `image-${index}`).toLowerCase();
  const cleaned = base.replace(/[^a-z0-9.]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  const ext = IMAGE_EXT.test(cleaned) ? path.extname(cleaned) : '.png';
  const stem = path.basename(cleaned, path.extname(cleaned)).slice(0, 40) || `image-${index + 1}`;
  return `${stem}${ext}`;
}

function resolveLocalImage(src: string, projectRoot: string): string | null {
  if (!src || /^https?:\/\//i.test(src) || src.startsWith('data:')) return null;
  if (src.startsWith('/notes/')) return null;
  let abs = '';
  if (src.startsWith('/')) {
    const rel = src.replace(/^\/+/, '');
    if (rel.split('/').includes('..')) return null;
    abs = path.resolve(projectRoot, 'public', rel);
  } else if (path.isAbsolute(src)) {
    abs = path.resolve(src);
  } else {
    if (src.split('/').includes('..')) return null;
    abs = path.resolve(projectRoot, src);
  }
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return null;
  if (!IMAGE_EXT.test(abs)) return null;
  return abs;
}

async function downloadRemoteImage(src: string): Promise<{ ok: true; bytes: Buffer; ext: string } | { ok: false; error: string }> {
  if (!/^https:\/\//i.test(src)) return { ok: false, error: '只下载 https 图片' };
  try {
    const response = await fetch(src, { redirect: 'follow', signal: AbortSignal.timeout(15000) });
    if (!response.ok) return { ok: false, error: `HTTP ${response.status}` };
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) {
      return { ok: false, error: '图片为空或超过 8MB' };
    }
    const type = response.headers.get('content-type') || '';
    const extFromType: Record<string, string> = {
      'image/png': '.png',
      'image/jpeg': '.jpg',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'image/svg+xml': '.svg',
      'image/bmp': '.bmp',
    };
    const ext = extFromType[type.split(';')[0].trim().toLowerCase()] || (IMAGE_EXT.test(src) ? path.extname(src.split('?')[0]).toLowerCase() : '');
    if (!ext) return { ok: false, error: '响应不是图片' };
    return { ok: true, bytes, ext };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function materializeImages(input: {
  blocks: PublishedBlock[];
  coverImage?: string;
  projectRoot: string;
  publicDir: string;
  slug: string;
}): Promise<{ blocks: PublishedBlock[]; warnings: string[] }> {
  const warnings: string[] = [];
  const used = new Set<string>();
  fs.mkdirSync(input.publicDir, { recursive: true });

  const assignName = (src: string, index: number, extHint?: string) => {
    let name = safeImageName(extHint ? `${src}${extHint}` : src, index);
    if (extHint && !name.endsWith(extHint)) {
      name = `${path.basename(name, path.extname(name))}${extHint}`;
    }
    let candidate = name;
    let n = 2;
    while (used.has(candidate)) {
      const ext = path.extname(name) || '.png';
      const stem = path.basename(name, ext);
      candidate = `${stem}-${n}${ext}`;
      n += 1;
    }
    used.add(candidate);
    return candidate;
  };

  const rewrite = async (src: string, index: number): Promise<string> => {
    if (!src) return src;
    if (src.startsWith(`/notes/${input.slug}/`)) return src;
    if (src.startsWith('data:')) {
      warnings.push('跳过了 data URL 图片。');
      return src;
    }
    const local = resolveLocalImage(src, input.projectRoot);
    if (local) {
      const name = assignName(local, index);
      fs.copyFileSync(local, path.join(input.publicDir, name));
      return `/notes/${input.slug}/${name}`;
    }
    if (/^https?:\/\//i.test(src)) {
      const downloaded = await downloadRemoteImage(src);
      if (!downloaded.ok) {
        warnings.push(`远程图片未下载，页面仍引用原地址（${downloaded.error}）。`);
        return src;
      }
      const name = assignName(src, index, downloaded.ext);
      fs.writeFileSync(path.join(input.publicDir, name), downloaded.bytes);
      return `/notes/${input.slug}/${name}`;
    }
    warnings.push(`找不到图片，已跳过：${src}`);
    return '';
  };

  const blocks: PublishedBlock[] = [];
  let index = 0;
  for (const block of input.blocks) {
    if (block.type !== 'img') {
      blocks.push(block);
      continue;
    }
    const src = await rewrite(block.src, index);
    index += 1;
    if (!src) continue;
    blocks.push({ ...block, src });
  }

  if (input.coverImage && !blocks.some((block) => block.type === 'img' && block.src.includes(path.basename(input.coverImage || '')))) {
    const src = await rewrite(input.coverImage, index);
    if (src) blocks.unshift({ type: 'img', src, alt: '封面', caption: '▲ 封面' });
  }
  return { blocks, warnings };
}

async function ensurePublishedNoteComponent(repo: string): Promise<string | undefined> {
  const target = resolveInside(repo, COMPONENT_PATH);
  const source = renderPublishedNoteComponent();
  if (!fs.existsSync(target)) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, source, 'utf8');
    return undefined;
  }
  const current = fs.readFileSync(target, 'utf8');
  if (current.includes(PUBLISHED_NOTE_MARKER)) {
    if (current !== source) fs.writeFileSync(target, source, 'utf8');
    return undefined;
  }
  return '已保留仓库里手写的 PublishedNote.tsx。若构建失败，请确认它导出 PublishedNote。';
}

async function commitPaths(repo: string, paths: string[], message: string, secrets: string[]): Promise<{ ok: boolean; commit?: string; error?: string; unchanged?: boolean }> {
  const add = await runGit(repo, ['add', '--', ...paths], secrets);
  if (add.code !== 0) return { ok: false, error: gitFailure(add, 'git add 失败') };
  const cached = await runGit(repo, ['diff', '--cached', '--name-only'], secrets);
  if (cached.code !== 0) return { ok: false, error: gitFailure(cached, '无法检查暂存区') };
  if (!cached.stdout.trim()) return { ok: true, unchanged: true };
  const name = process.env.HOMEPAGE_GIT_NAME || 'content-publisher';
  const email = process.env.HOMEPAGE_GIT_EMAIL || 'content-publisher@localhost';
  const commit = await runGit(repo, ['-c', `user.name=${name}`, '-c', `user.email=${email}`, 'commit', '-m', message], secrets);
  if (commit.code !== 0) return { ok: false, error: gitFailure(commit, 'git commit 失败') };
  const sha = await runGit(repo, ['rev-parse', '--short', 'HEAD'], secrets);
  return { ok: true, commit: sha.stdout.trim() };
}

function pushRemote(remote: string, token: string): { remote: string; secrets: string[] } {
  if (token && /^https:\/\//i.test(remote)) {
    const authed = remote.replace(/^https:\/\//i, `https://x-access-token:${encodeURIComponent(token)}@`);
    return { remote: authed, secrets: [token, encodeURIComponent(token)] };
  }
  return { remote, secrets: token ? [token] : [] };
}

async function pushHead(repo: string, remote: string, branch: string, secrets: string[], forceWithLease = false): Promise<{ ok: boolean; error?: string }> {
  const args = ['push', remote, `HEAD:${branch}`];
  if (forceWithLease) args.splice(1, 0, '--force-with-lease');
  const pushed = await runGit(repo, args, secrets);
  if (pushed.code !== 0) return { ok: false, error: gitFailure(pushed, 'git push 失败') };
  return { ok: true };
}

async function createPullRequest(input: {
  repo: string;
  remote: string;
  base: string;
  branch: string;
  title: string;
  body: string;
  secrets: string[];
}): Promise<{ ok: boolean; url?: string; error?: string }> {
  const repoName = input.remote.match(/github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?$/i);
  const repoArg = repoName ? `${repoName[1]}/${repoName[2]}` : '';
  const args = ['pr', 'create', '--base', input.base, '--head', input.branch, '--title', input.title, '--body', input.body];
  if (repoArg) args.push('--repo', repoArg);
  const result = await new Promise<GitResult>((resolve) => {
    execFile('gh', args, {
      cwd: input.repo,
      timeout: 120000,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    }, (error, stdout, stderr) => {
      const err = error as NodeJS.ErrnoException | null;
      resolve({
        code: typeof err?.code === 'number' ? err.code : error ? 1 : 0,
        stdout: redact(String(stdout || ''), input.secrets),
        stderr: redact(String(stderr || ''), input.secrets),
        error: err || undefined,
      });
    });
  });
  if (result.error?.code === 'ENOENT') {
    return { ok: false, error: '未安装 GitHub CLI（gh），无法开 Pull Request。可改用 commit-push 或 files-only。' };
  }
  if (result.code !== 0) {
    const detail = `${result.stderr || result.stdout}`.trim();
    if (/already exists/i.test(detail)) {
      const viewArgs = ['pr', 'view', input.branch, '--json', 'url', '--jq', '.url'];
      if (repoArg) viewArgs.push('--repo', repoArg);
      const view = await new Promise<GitResult>((resolve) => {
        execFile('gh', viewArgs, { cwd: input.repo, timeout: 60000 }, (error, stdout, stderr) => {
          const err = error as NodeJS.ErrnoException | null;
          resolve({
            code: error ? 1 : 0,
            stdout: String(stdout || ''),
            stderr: String(stderr || ''),
            error: err || undefined,
          });
        });
      });
      const url = view.stdout.trim();
      if (view.code === 0 && url) return { ok: true, url };
    }
    return { ok: false, error: `创建 Pull Request 失败: ${detail.slice(0, 400) || 'gh pr create 失败'}` };
  }
  const url = result.stdout.trim().split('\n').filter((line) => line.startsWith('http')).pop() || result.stdout.trim();
  return { ok: true, url };
}

export async function publishHomepageNote(input: {
  contentId: string;
  title: string;
  bodyHtml: string;
  tags: string[];
  images: string[];
  coverImage?: string;
  projectRoot: string;
  settings: HomepagePublishSettings;
  now?: Date;
}): Promise<HomepagePublishResult> {
  try {
    const settings = input.settings;
    if (!settings.enableHomepage) {
      return { success: false, error: '个人主页发布未启用。请在设置里打开「个人主页(danghb.cn)」。' };
    }
    const blocked = homepageBlockReason({
      title: input.title,
      tags: input.tags,
      enabled: settings.homepageBlockParenting,
      blockTags: parseBlockTagList(settings.homepageBlockTags),
    });
    if (blocked) return { success: false, error: blocked };

    const slugResult = resolveHomepageSlug(input.title, input.tags, input.contentId);
    if ('error' in slugResult) return { success: false, error: slugResult.error };
    const slug = slugResult.slug;
    const repo = resolveRepoPath(settings);
    if (!settings.homepageRepoPath && !process.env.HOMEPAGE_REPO_PATH) {
      return { success: false, error: '未配置个人主页仓库路径。请填写本机 yafeishi/yafeishi.github.io 的克隆目录（文件夹有时叫 hobson-homepage 或 danghb-homepage）。' };
    }
    if (!fs.existsSync(repo) || !fs.statSync(repo).isDirectory()) {
      return { success: false, error: `个人主页仓库不存在: ${repo}` };
    }
    const homeViewPath = resolveInside(repo, HOME_VIEW);
    if (!fs.existsSync(homeViewPath)) {
      return { success: false, error: `仓库里没有 ${HOME_VIEW}。danghb.cn 用的是静态 Next 站点，不是独立笔记 API。` };
    }

    const mode = settings.homepagePublishMode || 'commit-push';
    const branch = settings.homepageBranch || 'master';
    const head = await currentBranch(repo);
    if (mode !== 'files-only' && head !== branch) {
      return {
        success: false,
        error: `个人主页仓库当前在「${head || '未知分支'}」，${mode === 'pull-request' ? '开 PR' : '推送'} 需要先位于「${branch}」，避免把别的提交推到 danghb.cn。只写文件可用 files-only。`,
      };
    }

    const date = formatShanghaiDate(input.now || new Date());
    const built = buildPublishedNote({
      title: input.title,
      html: input.bodyHtml,
      slug,
      date,
      kicker: resolveHomepageKicker(input.tags),
      credit: settings.homepageCredit,
      origin: settings.homepageSiteOrigin,
    });
    if (!built.note.lede && built.note.blocks.every((block) => block.type !== 'img')) {
      return { success: false, error: '正文是空的，无法生成个人主页笔记。' };
    }
    const publicDir = resolveInside(repo, `${PUBLIC_NOTES_DIR}/${slug}`);
    const images = await materializeImages({
      blocks: built.note.blocks,
      coverImage: input.coverImage || input.images.find((item) => IMAGE_EXT.test(item || '')),
      projectRoot: input.projectRoot,
      publicDir,
      slug,
    });
    built.note.blocks = images.blocks;

    const noteDir = resolveInside(repo, `${NOTES_DIR}/${slug}`);
    fs.mkdirSync(noteDir, { recursive: true });
    const pagePath = path.join(noteDir, 'page.tsx');
    fs.writeFileSync(pagePath, renderNotePageSource(built.note), 'utf8');
    const componentWarning = await ensurePublishedNoteComponent(repo);
    const homeSource = fs.readFileSync(homeViewPath, 'utf8');
    const nextHome = upsertHomepageLatestNote(homeSource, {
      slug,
      date,
      title: built.note.title,
      summary: summaryFromNote(built.note),
      kicker: built.note.kicker,
    });
    fs.writeFileSync(homeViewPath, nextHome, 'utf8');

    const publicUrl = homepageNoteUrl(settings.homepageSiteOrigin, slug);
    const warnings = [...built.warnings, ...images.warnings];
    if (componentWarning) warnings.push(componentWarning);
    const relativePaths = [
      path.relative(repo, pagePath),
      path.relative(repo, publicDir),
      path.relative(repo, homeViewPath),
      COMPONENT_PATH,
    ];

    if (mode === 'files-only') {
      return {
        success: true,
        result: { externalId: publicUrl, pagePath },
        warning: ['只写入了本地仓库，还没有推送，线上地址暂时不会更新。', ...warnings].filter(Boolean).join('；'),
      };
    }

    const token = process.env.HOMEPAGE_GITHUB_TOKEN || '';
    const configuredRemote = (settings.homepageRepoRemote || '').trim();
    const origin = await runGit(repo, ['remote', 'get-url', 'origin']);
    const remote = configuredRemote || origin.stdout.trim() || 'origin';
    const authed = pushRemote(remote, token);
    const message = `notes: publish ${slug}`;

    if (mode === 'pull-request') {
      const prBranch = `notes/${slug}`;
      const checkout = await runGit(repo, ['checkout', '-B', prBranch], authed.secrets);
      if (checkout.code !== 0) return { success: false, error: gitFailure(checkout, '无法创建笔记分支') };
      try {
        const committed = await commitPaths(repo, relativePaths, message, authed.secrets);
        if (!committed.ok) return { success: false, error: committed.error };
        let pushed = await pushHead(repo, authed.remote, prBranch, authed.secrets, false);
        if (!pushed.ok) pushed = await pushHead(repo, authed.remote, prBranch, authed.secrets, true);
        if (!pushed.ok) return { success: false, error: pushed.error };
        const pr = await createPullRequest({
          repo,
          remote,
          base: branch,
          branch: prBranch,
          title: `notes: ${built.note.title}`,
          body: `由 content-publisher 生成。\n\n预计公开地址：${publicUrl}\n\n合并到 \`${branch}\` 后，GitHub Pages 才会更新 danghb.cn。`,
          secrets: authed.secrets,
        });
        if (!pr.ok) return { success: false, error: pr.error, result: { externalId: publicUrl, pagePath, commit: committed.commit } };
        warnings.push('已打开 Pull Request。合并前线上地址还不可用。');
        return {
          success: true,
          result: { externalId: publicUrl, pagePath, prUrl: pr.url, commit: committed.commit },
          warning: warnings.join('；') || undefined,
        };
      } finally {
        await runGit(repo, ['checkout', branch], authed.secrets);
      }
    }

    const committed = await commitPaths(repo, relativePaths, message, authed.secrets);
    if (!committed.ok) return { success: false, error: committed.error };
    const pushed = await pushHead(repo, authed.remote, branch, authed.secrets);
    if (!pushed.ok) return { success: false, error: pushed.error };
    if (committed.unchanged) warnings.push('笔记文件没有变化，已确认远端分支包含当前提交。');
    else warnings.push(`已推送到 ${branch}。GitHub Pages 完成后可通过公开地址访问。`);
    return {
      success: true,
      result: { externalId: publicUrl, pagePath, commit: committed.commit },
      warning: warnings.filter(Boolean).join('；') || undefined,
    };
  } catch (error) {
    return { success: false, error: `个人主页发布失败: ${error instanceof Error ? error.message : String(error)}` };
  }
}
