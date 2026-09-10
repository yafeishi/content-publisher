import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import prisma from '@/lib/prisma';

export const runtime = 'nodejs';

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads');

type RecorderMode = 'dry-run' | 'record';
type LocatorBy = 'placeholder' | 'text' | 'role' | 'css';

type RecordingStep = {
  action: 'goto' | 'click' | 'type' | 'press' | 'wait' | 'assertVisible' | 'scroll';
  by?: LocatorBy;
  value?: string;
  role?: string;
  text?: string;
  key?: string;
  ms?: number;
  y?: number;
  position?: 'top' | 'bottom';
  delayMs?: number;
  timeoutMs?: number;
  clear?: boolean;
  optional?: boolean;
  path?: string;
  url?: string;
};

type RecorderRunLog = {
  index: number;
  action: string;
  status: 'ok' | 'skipped' | 'failed';
  detail: string;
  durationMs: number;
};

type RecorderRunOutput = {
  ok: boolean;
  mode: RecorderMode;
  baseUrl: string;
  flowName: string;
  logs: RecorderRunLog[];
  rawVideo?: string;
  mp4Video?: string;
  error?: string;
};

type RecorderDraftOutput = {
  flowName: string;
  description: string;
  steps: RecordingStep[];
};

type DiscoveredInput = {
  placeholder: string;
  label: string;
  type: string;
};

type DiscoveredButton = {
  name: string;
};

type DiscoveredModule = {
  path: string;
  url: string;
  title: string;
  heading: string;
  buttonCandidates: DiscoveredButton[];
  inputCandidates: DiscoveredInput[];
  hasSearchInput: boolean;
  entryButtonName?: string;
  basePath?: string;
};

type DiscoverOutput = {
  ok: boolean;
  baseUrl: string;
  origin: string;
  modules: DiscoveredModule[];
  error?: string;
};

function ensureUploadDir() {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
}

function sanitizeFlowName(name: string): string {
  const value = (name || '').trim();
  if (!value) return '录制流程';
  return value.slice(0, 60);
}

function getDefaultAssetsSteps(modulePath = '/assets'): RecordingStep[] {
  return [
    { action: 'goto', path: modulePath },
    { action: 'wait', ms: 900 },
    { action: 'click', by: 'placeholder', value: '搜索文件名、备注、标签、项目、引用内容...' },
    { action: 'type', by: 'placeholder', value: '搜索文件名、备注、标签、项目、引用内容...', text: 'test', delayMs: 120 },
    { action: 'wait', ms: 450 },
    { action: 'press', by: 'placeholder', value: '搜索文件名、备注、标签、项目、引用内容...', key: 'Backspace' },
    { action: 'press', by: 'placeholder', value: '搜索文件名、备注、标签、项目、引用内容...', key: 'Backspace' },
    { action: 'wait', ms: 350 },
    { action: 'click', by: 'css', value: 'button[title="清空搜索"]', optional: true },
    { action: 'wait', ms: 450 },
    { action: 'click', by: 'role', role: 'button', value: '未引用', optional: true },
    { action: 'wait', ms: 500 },
    { action: 'click', by: 'role', role: 'button', value: '全部', optional: true },
    { action: 'wait', ms: 500 },
    { action: 'click', by: 'role', role: 'button', value: '全选当前结果', optional: true },
    { action: 'wait', ms: 600 },
    { action: 'click', by: 'role', role: 'button', value: '清空选择', optional: true },
    { action: 'wait', ms: 500 },
    { action: 'click', by: 'css', value: 'button[title="预览"]', optional: true },
    { action: 'wait', ms: 800 },
    { action: 'press', key: 'Escape', optional: true },
    { action: 'wait', ms: 600 },
  ];
}

function getDefaultCalendarSteps(modulePath = '/calendar'): RecordingStep[] {
  return [
    { action: 'goto', path: modulePath },
    { action: 'wait', ms: 900 },
    { action: 'assertVisible', by: 'text', value: '内容日历' },
    { action: 'click', by: 'role', role: 'button', value: '今天', optional: true },
    { action: 'wait', ms: 450 },
    { action: 'click', by: 'role', role: 'button', value: '小红书', optional: true },
    { action: 'wait', ms: 450 },
    { action: 'click', by: 'role', role: 'button', value: '全部渠道', optional: true },
    { action: 'wait', ms: 500 },
    { action: 'assertVisible', by: 'text', value: '本月统计' },
  ];
}

function getDefaultStepsByModulePath(modulePath: string): RecordingStep[] {
  const normalized = (modulePath || '/').toLowerCase();
  if (normalized.startsWith('/calendar')) {
    return getDefaultCalendarSteps(modulePath);
  }
  if (normalized.startsWith('/assets')) {
    return getDefaultAssetsSteps(modulePath);
  }
  return [
    { action: 'goto', path: modulePath || '/' },
    { action: 'wait', ms: 900 },
  ];
}

function parseStdoutJson<T>(stdout: string): T {
  const trimmed = stdout.trim();
  if (!trimmed) {
    throw new Error('命令输出为空');
  }
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    const first = trimmed.indexOf('{');
    const last = trimmed.lastIndexOf('}');
    if (first < 0 || last <= first) {
      throw new Error(`未找到有效 JSON 输出: ${trimmed.slice(-400)}`);
    }
    return JSON.parse(trimmed.slice(first, last + 1)) as T;
  }
}

function detectSearchInput(module: DiscoveredModule): DiscoveredInput | null {
  return (
    module.inputCandidates.find((item) =>
      /search|搜索|查找|filter|筛选/i.test(`${item.placeholder} ${item.label}`)
    ) || module.inputCandidates[0] || null
  );
}

function detectSearchButton(module: DiscoveredModule): DiscoveredButton | null {
  return (
    module.buttonCandidates.find((item) => /搜索|查找|查询|search|filter/i.test(item.name)) ||
    module.buttonCandidates[0] ||
    null
  );
}

function normalizeButtonName(value: string): string {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function isUnsafeButtonName(value: string): boolean {
  const name = normalizeButtonName(value);
  if (!name) return true;
  if (/^[\d\s<>«»◀▶←→+\-×]+$/.test(name)) return true;
  return /删除|移除|清空|重置|发布|保存|提交|确认|上传|下载|导出|退出|登出|注销|停止|运行|执行|录制|付款|支付|发送邮件|保存配置/i.test(name);
}

function dedupeButtonNames(input: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const raw of input) {
    const name = normalizeButtonName(raw);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    output.push(name);
  }
  return output;
}

function pickPreferredButtons(params: {
  moduleInfo?: DiscoveredModule | null;
  includePatterns: RegExp[];
  limit?: number;
  excludes?: string[];
}): string[] {
  const moduleInfo = params.moduleInfo;
  if (!moduleInfo?.buttonCandidates?.length) return [];
  const limit = Math.max(1, params.limit || 4);
  const excludes = new Set((params.excludes || []).map((item) => normalizeButtonName(item)));

  const all = dedupeButtonNames(
    moduleInfo.buttonCandidates
      .map((item) => item.name)
      .filter((name) => !isUnsafeButtonName(name))
      .filter((name) => !excludes.has(normalizeButtonName(name)))
  ).slice(0, 30);

  const picked: string[] = [];
  for (const pattern of params.includePatterns) {
    for (const name of all) {
      if (picked.length >= limit) break;
      if (picked.includes(name)) continue;
      if (!pattern.test(name)) continue;
      picked.push(name);
    }
    if (picked.length >= limit) break;
  }

  if (picked.length < limit) {
    for (const name of all) {
      if (picked.length >= limit) break;
      if (picked.includes(name)) continue;
      picked.push(name);
    }
  }

  return picked.slice(0, limit);
}

function buildWizardSteps(params: {
  modulePath: string;
  goal: string;
  moduleInfo?: DiscoveredModule | null;
}): RecordingStep[] {
  const { modulePath, moduleInfo } = params;
  const goal = params.goal || 'search';
  const startPath = moduleInfo?.basePath || modulePath || '/';
  const steps: RecordingStep[] = [
    { action: 'goto', path: startPath },
    { action: 'wait', ms: 900 },
  ];

  if (moduleInfo?.entryButtonName) {
    steps.push({
      action: 'click',
      by: 'role',
      role: 'button',
      value: moduleInfo.entryButtonName,
      optional: true,
    });
    steps.push({ action: 'wait', ms: 550 });
  }

  const heading = moduleInfo?.heading || moduleInfo?.title || '';
  if (heading) {
    steps.push({ action: 'assertVisible', by: 'text', value: heading });
  }

  if (goal === 'scroll') {
    steps.push({ action: 'scroll', y: 900, ms: 500 });
    steps.push({ action: 'scroll', position: 'bottom', ms: 700 });
    steps.push({ action: 'scroll', position: 'top', ms: 500 });
    return steps;
  }

  if (goal === 'navigation') {
    const navButtons = pickPreferredButtons({
      moduleInfo,
      includePatterns: [
        /时间线|数据洞察|历史记录|设置|概览|详情|列表|菜单|导航|tab|view|panel/i,
        /前一天|后一天|上一|下一|今天|本周|本月/i,
      ],
      excludes: [moduleInfo?.entryButtonName || ''],
      limit: 4,
    });
    if (navButtons.length > 0) {
      for (const name of navButtons) {
        steps.push({ action: 'click', by: 'role', role: 'button', value: name, optional: true });
        steps.push({ action: 'wait', ms: 350 });
      }
    } else {
      steps.push({ action: 'wait', ms: 600 });
    }
    return steps;
  }

  if (goal === 'form') {
    const firstInput = moduleInfo?.inputCandidates?.[0];
    if (firstInput?.placeholder) {
      steps.push({ action: 'click', by: 'placeholder', value: firstInput.placeholder, optional: true });
      steps.push({
        action: 'type',
        by: 'placeholder',
        value: firstInput.placeholder,
        text: '测试输入',
        delayMs: 80,
        optional: true,
      });
    }
    const submitBtn = moduleInfo?.buttonCandidates?.find((item) => /提交|保存|确认|submit|save/i.test(item.name));
    if (submitBtn) {
      steps.push({ action: 'click', by: 'role', role: 'button', value: submitBtn.name, optional: true });
    }
    steps.push({ action: 'wait', ms: 450 });
    return steps;
  }

  const searchInput = moduleInfo ? detectSearchInput(moduleInfo) : null;
  const searchButton = moduleInfo ? detectSearchButton(moduleInfo) : null;
  const isTimelineModule = /时间线/i.test(moduleInfo?.entryButtonName || moduleInfo?.heading || '');
  if (searchInput?.placeholder) {
    steps.push({ action: 'click', by: 'placeholder', value: searchInput.placeholder, optional: true });
    steps.push({
      action: 'type',
      by: 'placeholder',
      value: searchInput.placeholder,
      text: 'test',
      delayMs: 120,
      optional: true,
    });
  }
  if (searchButton?.name) {
    steps.push({ action: 'click', by: 'role', role: 'button', value: searchButton.name, optional: true });
  } else {
    steps.push({ action: 'press', key: 'Enter', optional: true });
  }
  steps.push({ action: 'wait', ms: 500 });

  const extraButtons = pickPreferredButtons({
    moduleInfo,
    includePatterns: isTimelineModule
      ? [
          /前一天|后一天|今天|昨日|明日|本周|本月/i,
          /筛选|全部|搜索|刷新|展开|收起/i,
          /时间线|数据洞察|历史记录|设置/i,
        ]
      : [
          /上一|下一|前一|后一|今天|本周|本月/i,
          /筛选|全部|搜索|刷新|展开|收起|查看|详情/i,
          /时间线|数据洞察|历史记录|设置|菜单|导航|tab|view/i,
        ],
    excludes: [moduleInfo?.entryButtonName || '', searchButton?.name || ''],
    limit: isTimelineModule ? 5 : 3,
  });

  for (const name of extraButtons) {
    steps.push({ action: 'click', by: 'role', role: 'button', value: name, optional: true });
    steps.push({ action: 'wait', ms: 320 });
  }

  // Add viewport movement to produce smoother demo and cover lazy sections.
  steps.push({ action: 'scroll', y: 900, ms: 450, optional: true });
  steps.push({ action: 'scroll', position: 'top', ms: 420, optional: true });
  return steps;
}

function buildTeachingSteps(modulePath: string, instructions: string): RecordingStep[] {
  const steps: RecordingStep[] = [
    { action: 'goto', path: modulePath || '/' },
    { action: 'wait', ms: 800 },
  ];

  const lines = instructions
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const waitMatch = line.match(/(?:等待|wait)\s*(\d+)/i);
    if (waitMatch) {
      steps.push({ action: 'wait', ms: Number(waitMatch[1]) || 500 });
      continue;
    }

    const inputMatch = line.match(/(?:在)?(.+?)(?:输入|填入)\s*[:：]?\s*(.+)/i);
    if (inputMatch) {
      const target = inputMatch[1].trim();
      const text = inputMatch[2].trim();
      steps.push({
        action: 'type',
        by: 'placeholder',
        value: target,
        text,
        delayMs: 80,
        optional: true,
      });
      continue;
    }

    const clickMatch = line.match(/(?:点击|click)\s+(.+)/i);
    if (clickMatch) {
      steps.push({
        action: 'click',
        by: 'role',
        role: 'button',
        value: clickMatch[1].trim(),
        optional: true,
      });
      continue;
    }

    const pressMatch = line.match(/(?:按下|press)\s+(.+)/i);
    if (pressMatch) {
      steps.push({ action: 'press', key: pressMatch[1].trim(), optional: true });
      continue;
    }

    if (/滚动到底|scroll.*bottom/i.test(line)) {
      steps.push({ action: 'scroll', position: 'bottom', ms: 600 });
      continue;
    }

    if (/滚动到顶|scroll.*top/i.test(line)) {
      steps.push({ action: 'scroll', position: 'top', ms: 600 });
      continue;
    }

    const scrollMatch = line.match(/(?:滚动|scroll)\s*(\d+)/i);
    if (scrollMatch) {
      steps.push({ action: 'scroll', y: Number(scrollMatch[1]) || 700, ms: 500 });
      continue;
    }

    const assertMatch = line.match(/(?:校验|断言|assert)\s+(.+)/i);
    if (assertMatch) {
      steps.push({ action: 'assertVisible', by: 'text', value: assertMatch[1].trim() });
      continue;
    }
  }

  return steps;
}

function buildDraft(body: Record<string, unknown>): RecorderDraftOutput {
  const modulePath =
    typeof body.modulePath === 'string' && body.modulePath.trim().length > 0
      ? body.modulePath.trim()
      : '/assets';
  const goal =
    typeof body.goal === 'string' && body.goal.trim().length > 0
      ? body.goal.trim()
      : '验证页面关键交互并生成可回放演示视频';
  const flowName = sanitizeFlowName(
    typeof body.flowName === 'string' ? body.flowName : `流程草案-${modulePath}`
  );

  return {
    flowName,
    description: `目标：${goal}`,
    steps: getDefaultStepsByModulePath(modulePath),
  };
}

function parseJsonFromStdout(stdout: string): RecorderRunOutput {
  return parseStdoutJson<RecorderRunOutput>(stdout);
}

async function runDiscover(baseUrl: string, maxModules = 12): Promise<DiscoverOutput> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/discover-interactive-target.mjs'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DISCOVER_JSON: JSON.stringify({
          baseUrl,
          maxModules,
        }),
      },
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (err) => reject(err));
    child.on('close', (code) => {
      try {
        const parsed = parseStdoutJson<DiscoverOutput>(stdout || stderr);
        if (code !== 0 || !parsed.ok) {
          reject(new Error(parsed.error || `探索命令失败(code=${code})`));
          return;
        }
        resolve(parsed);
      } catch (error) {
        reject(
          new Error(
            `探索命令失败(code=${code}): ${(error as Error).message}\nSTDERR: ${stderr.slice(-500)}`
          )
        );
      }
    });
  });
}

async function runRecorder(params: {
  mode: RecorderMode;
  baseUrl: string;
  flowName: string;
  steps: RecordingStep[];
}): Promise<RecorderRunOutput> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/record-interactive-flow.mjs'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        MODE: params.mode,
        FLOW_JSON: JSON.stringify({
          baseUrl: params.baseUrl,
          flowName: params.flowName,
          steps: params.steps,
        }),
      },
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (err) => reject(err));
    child.on('close', (code) => {
      try {
        const parsed = parseJsonFromStdout(stdout || stderr);
        if (code !== 0 || !parsed.ok) {
          reject(new Error(parsed.error || `录制命令失败(code=${code})`));
          return;
        }
        resolve(parsed);
      } catch (error) {
        reject(
          new Error(
            `录制命令失败(code=${code}): ${(error as Error).message}\nSTDERR: ${stderr.slice(-500)}`
          )
        );
      }
    });
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const action = typeof body.action === 'string' ? body.action : 'run';

    if (action === 'discover') {
      let baseUrl = typeof body.baseUrl === 'string' ? body.baseUrl.trim() : '';
      if (!baseUrl) {
        const host = request.headers.get('host') || '127.0.0.1:13847';
        baseUrl = `http://${host}`;
      }
      if (!/^https?:\/\//i.test(baseUrl)) {
        return NextResponse.json({ error: 'baseUrl 必须是 http(s) 地址' }, { status: 400 });
      }
      const discovered = await runDiscover(baseUrl, 12);
      return NextResponse.json({
        success: true,
        discovered,
      });
    }

    if (action === 'generate-draft') {
      const draft = buildDraft(body);
      return NextResponse.json({
        success: true,
        draft,
      });
    }

    if (action === 'generate-wizard-draft') {
      let baseUrl = typeof body.baseUrl === 'string' ? body.baseUrl.trim() : '';
      if (!baseUrl) {
        const host = request.headers.get('host') || '127.0.0.1:13847';
        baseUrl = `http://${host}`;
      }
      if (!/^https?:\/\//i.test(baseUrl)) {
        return NextResponse.json({ error: 'baseUrl 必须是 http(s) 地址' }, { status: 400 });
      }
      const modulePath =
        typeof body.modulePath === 'string' && body.modulePath.trim().length > 0
          ? body.modulePath.trim()
          : '/';
      const goal =
        typeof body.goal === 'string' && body.goal.trim().length > 0
          ? body.goal.trim()
          : 'search';
      const flowName = sanitizeFlowName(
        typeof body.flowName === 'string' ? body.flowName : `向导流程-${modulePath}`
      );

      const discovered = await runDiscover(baseUrl, 12);
      const moduleInfo =
        discovered.modules.find((item) => item.path === modulePath) ||
        discovered.modules.find((item) => item.path.startsWith(modulePath)) ||
        null;

      const draft: RecorderDraftOutput = {
        flowName,
        description: `向导目标：${goal}`,
        steps: buildWizardSteps({
          modulePath,
          goal,
          moduleInfo,
        }),
      };
      return NextResponse.json({
        success: true,
        draft,
        moduleInfo,
      });
    }

    if (action === 'generate-teaching-draft') {
      const modulePath =
        typeof body.modulePath === 'string' && body.modulePath.trim().length > 0
          ? body.modulePath.trim()
          : '/';
      const flowName = sanitizeFlowName(
        typeof body.flowName === 'string' ? body.flowName : `教学流程-${modulePath}`
      );
      const instructions =
        typeof body.instructions === 'string' ? body.instructions : '';
      const draft: RecorderDraftOutput = {
        flowName,
        description: '教学模式：根据自然语言步骤生成脚本',
        steps: buildTeachingSteps(modulePath, instructions),
      };
      return NextResponse.json({
        success: true,
        draft,
      });
    }

    const mode: RecorderMode = body.mode === 'dry-run' ? 'dry-run' : 'record';
    const projectId =
      typeof body.projectId === 'string' && body.projectId.trim().length > 0
        ? body.projectId.trim()
        : null;
    const saveToAssets = body.saveToAssets !== false;

    let baseUrl = typeof body.baseUrl === 'string' ? body.baseUrl.trim() : '';
    if (!baseUrl) {
      const host = request.headers.get('host') || '127.0.0.1:13847';
      baseUrl = `http://${host}`;
    }
    if (!/^https?:\/\//i.test(baseUrl)) {
      return NextResponse.json({ error: 'baseUrl 必须是 http(s) 地址' }, { status: 400 });
    }

    const flowName = sanitizeFlowName(
      typeof body.flowName === 'string' ? body.flowName : '交互录制流程'
    );
    const modulePath =
      typeof body.modulePath === 'string' && body.modulePath.trim().length > 0
        ? body.modulePath.trim()
        : '/assets';
    const rawSteps = Array.isArray(body.steps) ? (body.steps as RecordingStep[]) : [];
    const steps = rawSteps.length > 0 ? rawSteps : getDefaultStepsByModulePath(modulePath);

    const run = await runRecorder({
      mode,
      baseUrl,
      flowName,
      steps,
    });

    let asset: Record<string, unknown> | null = null;
    if (mode === 'record' && saveToAssets) {
      const sourceFile = run.mp4Video;
      if (!sourceFile || !fs.existsSync(sourceFile)) {
        return NextResponse.json(
          { error: `录制完成但未找到视频文件: ${sourceFile || 'unknown'}` },
          { status: 500 }
        );
      }

      ensureUploadDir();
      const ext = path.extname(sourceFile) || '.mp4';
      const outputFilename = `${Date.now()}-record-flow${ext}`;
      const targetPath = path.join(UPLOAD_DIR, outputFilename);
      fs.copyFileSync(sourceFile, targetPath);
      const stat = fs.statSync(targetPath);

      asset = await prisma.asset.create({
        data: {
          filename: `${flowName}-${path.basename(sourceFile)}`,
          path: `/uploads/${outputFilename}`,
          type: 'video',
          size: stat.size,
          projectId,
          description: `自动录制：${flowName}`,
          tags: JSON.stringify(['自动录制', '测试视频', '交互脚本']),
        },
      });
    }

    return NextResponse.json({
      success: true,
      mode,
      run,
      asset,
    });
  } catch (error) {
    console.error('Failed to run recording:', error);
    return NextResponse.json(
      { error: `录制失败: ${String(error)}` },
      { status: 500 }
    );
  }
}
