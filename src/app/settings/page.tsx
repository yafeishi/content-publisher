'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Bell, Bot, ChevronDown, Globe, Save, SlidersHorizontal, Sparkles, Wand2, Trash2 } from 'lucide-react';
import { AppSettings, defaultAppSettings } from '@/lib/settings-schema';
import type { LayoutTemplate, TemplateMode, TemplatePlatform } from '@/lib/layout-template-types';
import { useDialog } from '@/components/ui/dialog-center';

const SETTINGS_KEY = 'content-publisher.settings.v1';
const LOCAL_CLIENT_PRESETS: Array<{
  value: AppSettings['localClientPreset'];
  label: string;
  defaultCommand: string;
}> = [
  { value: 'codex', label: 'Codex', defaultCommand: 'codex' },
  { value: 'claude', label: 'Claude CLI', defaultCommand: 'claude -p' },
  { value: 'gemini', label: 'Gemini CLI', defaultCommand: 'gemini' },
  { value: 'qwen', label: 'Qwen CLI', defaultCommand: 'qwen' },
  { value: 'custom', label: '自定义', defaultCommand: '' },
];

const TEMPLATE_PLATFORM_OPTIONS: Array<{ value: TemplatePlatform; label: string }> = [
  { value: 'wechat', label: '微信公众号' },
  { value: 'xiaohongshu', label: '小红书' },
  { value: 'mowen', label: '墨问笔记' },
  { value: 'obsidian', label: 'Obsidian' },
];

const WRITING_STYLE_OPTIONS: Array<{ value: AppSettings['writingStylePreset']; label: string; hint: string }> = [
  { value: 'professional-review', label: '专业复盘', hint: '结构清晰，强调判断与复盘结论' },
  { value: 'friend-chat', label: '朋友聊天', hint: '更口语、更轻松，弱化官方表达' },
  { value: 'calm-analysis', label: '冷静分析', hint: '理性克制，偏证据和结论' },
  { value: 'practical-tutorial', label: '实战教程', hint: '步骤导向，可直接执行' },
  { value: 'storytelling', label: '故事叙事', hint: '场景冲突+取舍过程，增强代入感' },
];

export default function SettingsPage() {
  const [imageAssets, setImageAssets] = useState<Array<{ id: string; path: string; filename: string }>>([]);
  const [loadingImageAssets, setLoadingImageAssets] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(defaultAppSettings);
  const [initialSettings, setInitialSettings] = useState<AppSettings>(defaultAppSettings);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [testingAi, setTestingAi] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [templates, setTemplates] = useState<LayoutTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [learningTemplate, setLearningTemplate] = useState(false);
  const [deletingTemplateId, setDeletingTemplateId] = useState<string | null>(null);
  const [learnSourceUrl, setLearnSourceUrl] = useState('');
  const [learnSourceText, setLearnSourceText] = useState('');
  const [learnTemplateName, setLearnTemplateName] = useState('');
  const [learnMode, setLearnMode] = useState<TemplateMode>('adapt');
  const [learnPlatforms, setLearnPlatforms] = useState<TemplatePlatform[]>(['wechat']);
  const [checkingWechatNetwork, setCheckingWechatNetwork] = useState(false);
  const [wechatNetworkInfo, setWechatNetworkInfo] = useState<{
    ok: boolean;
    ip?: string;
    source?: string;
    hint?: string;
    checkedAt?: string;
    error?: string;
  } | null>(null);
  const [testingWechatApi, setTestingWechatApi] = useState(false);
  const [wechatApiProbe, setWechatApiProbe] = useState<{
    ok: boolean;
    currentIp?: string;
    error?: string;
    rawError?: string;
    checkedAt?: string;
    message?: string;
  } | null>(null);
  const { notify } = useDialog();

  useEffect(() => {
    const load = async () => {
      let localFallback = defaultAppSettings;
      try {
        const raw = localStorage.getItem(SETTINGS_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<AppSettings>;
          localFallback = { ...defaultAppSettings, ...parsed };
        }
      } catch {
        localFallback = defaultAppSettings;
      }

      try {
        const resp = await fetch('/api/settings');
        if (resp.ok) {
          const serverSettings = (await resp.json()) as AppSettings;
          const merged = { ...defaultAppSettings, ...serverSettings };
          setSettings(merged);
          setInitialSettings(merged);
          localStorage.setItem(SETTINGS_KEY, JSON.stringify(merged));
        } else {
          setSettings(localFallback);
          setInitialSettings(localFallback);
        }
      } catch {
        setSettings(localFallback);
        setInitialSettings(localFallback);
      } finally {
        setLoaded(true);
      }
    };

    load();
  }, []);

  const loadTemplates = async () => {
    setLoadingTemplates(true);
    try {
      const resp = await fetch('/api/templates');
      if (!resp.ok) throw new Error('加载模板失败');
      const data = await resp.json() as { templates?: LayoutTemplate[] };
      setTemplates(Array.isArray(data.templates) ? data.templates : []);
    } catch (error) {
      notify(error instanceof Error ? error.message : '加载模板失败', 'error');
    } finally {
      setLoadingTemplates(false);
    }
  };

  useEffect(() => {
    loadTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const loadAssets = async () => {
      setLoadingImageAssets(true);
      try {
        const resp = await fetch('/api/assets');
        if (!resp.ok) return;
        const data = await resp.json() as { assets?: Array<{ id: string; path: string; filename: string; type: string }> };
        const images = (data.assets || []).filter((item) => item.type === 'image');
        setImageAssets(images.map((item) => ({ id: item.id, path: item.path, filename: item.filename })));
      } catch {
        // keep empty list, user can still input manually
      } finally {
        setLoadingImageAssets(false);
      }
    };
    loadAssets();
  }, []);

  const isDirty = useMemo(() => {
    if (!loaded) return false;
    return JSON.stringify(settings) !== JSON.stringify(initialSettings);
  }, [settings, loaded, initialSettings]);

  const update = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      const resp = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (!resp.ok) throw new Error('保存失败');
      const saved = (await resp.json()) as AppSettings;
      setSettings(saved);
      setInitialSettings(saved);
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(saved));
      setSavedAt(new Date());
    } catch {
      notify('保存失败，请检查服务状态后重试', 'error');
    } finally {
      setSaving(false);
    }
  };

  const resetDefaults = () => {
    setSettings(defaultAppSettings);
  };

  const toggleLearnPlatform = (platform: TemplatePlatform) => {
    setLearnPlatforms((prev) => {
      if (prev.includes(platform)) {
        const next = prev.filter((item) => item !== platform);
        return next.length > 0 ? next : ['wechat'];
      }
      return [...prev, platform];
    });
  };

  const learnTemplate = async () => {
    if (!learnSourceUrl.trim() && !learnSourceText.trim()) {
      notify('请至少输入模板链接或模板文本', 'error');
      return;
    }
    setLearningTemplate(true);
    try {
      const resp = await fetch('/api/templates/learn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceUrl: learnSourceUrl.trim(),
          sourceText: learnSourceText.trim(),
          preferredName: learnTemplateName.trim(),
          mode: learnMode,
          platforms: learnPlatforms,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || '模板学习失败');
      notify(`模板学习成功：${data?.template?.name || '新模板'}`, 'success');
      setLearnSourceText('');
      setLearnSourceUrl('');
      setLearnTemplateName('');
      await loadTemplates();
    } catch (error) {
      notify(error instanceof Error ? error.message : '模板学习失败', 'error');
    } finally {
      setLearningTemplate(false);
    }
  };

  const setDefaultTemplate = (templateId: string) => {
    update('defaultLayoutTemplateId', templateId);
  };

  const deleteTemplate = async (templateId: string) => {
    setDeletingTemplateId(templateId);
    try {
      const resp = await fetch('/api/templates', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: templateId }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data?.error || '删除模板失败');
      notify('模板已删除', 'success');
      if (settings.defaultLayoutTemplateId === templateId) {
        update('defaultLayoutTemplateId', 'standard');
      }
      await loadTemplates();
    } catch (error) {
      notify(error instanceof Error ? error.message : '删除模板失败', 'error');
    } finally {
      setDeletingTemplateId(null);
    }
  };

  const testConnection = async () => {
    setTestingAi(true);
    setTestResult(null);
    try {
      const resp = await fetch('/api/ai/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aiProvider: settings.aiProvider,
          aiModel: settings.aiModel,
          claudePath: settings.claudePath,
          localClientPreset: settings.localClientPreset,
          localClientCommand: settings.localClientCommand,
        }),
      });
      const data = await resp.json();
      if (resp.ok && data?.ok) {
        const msg = `连接成功（${data.provider}）${data.preview ? `：${data.preview}` : ''}`;
        setTestResult({ ok: true, message: msg });
        notify('AI 连接测试成功', 'success');
      } else {
        const msg = data?.error || '连接失败';
        setTestResult({ ok: false, message: msg });
        notify(msg, 'error');
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : '连接测试失败';
      setTestResult({ ok: false, message: msg });
      notify(msg, 'error');
    } finally {
      setTestingAi(false);
    }
  };

  const checkWechatNetwork = async () => {
    setCheckingWechatNetwork(true);
    try {
      const resp = await fetch('/api/settings/wechat-network', { cache: 'no-store' });
      const data = await resp.json() as {
        ok: boolean;
        ip?: string;
        source?: string;
        hint?: string;
        checkedAt?: string;
        error?: string;
      };
      setWechatNetworkInfo(data);
      if (resp.ok && data.ok) {
        notify(`当前出口 IP：${data.ip}`, 'success');
      } else {
        notify(data.error || '出口 IP 检测失败', 'error');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '出口 IP 检测失败';
      setWechatNetworkInfo({ ok: false, error: message });
      notify(message, 'error');
    } finally {
      setCheckingWechatNetwork(false);
    }
  };

  const testWechatApi = async () => {
    setTestingWechatApi(true);
    try {
      const resp = await fetch('/api/settings/wechat-network', {
        method: 'POST',
        cache: 'no-store',
      });
      const data = await resp.json() as {
        ok: boolean;
        currentIp?: string;
        error?: string;
        rawError?: string;
        checkedAt?: string;
        message?: string;
      };
      setWechatApiProbe(data);
      if (resp.ok && data.ok) {
        notify(data.message || '微信 API 鉴权成功', 'success');
      } else {
        notify(data.message || data.error || '微信 API 鉴权失败', 'error');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '微信 API 鉴权失败';
      setWechatApiProbe({ ok: false, error: message, message });
      notify(message, 'error');
    } finally {
      setTestingWechatApi(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="theme-panel p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="page-title">设置中心</h1>
            <p className="page-subtitle">集中配置 AI 生成、发布策略与提醒体验</p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className={`rounded-full px-2.5 py-1 font-medium ${isDirty ? 'tag-warning' : 'tag-success'}`}>
              {isDirty ? '有未保存修改' : '已同步'}
            </span>
            {savedAt && <span className="theme-muted">最近保存 {savedAt.toLocaleTimeString()}</span>}
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <CollapsibleSection
          title="AI 生成"
          icon={<Bot className="h-5 w-5 text-sky-600" />}
          defaultOpen={false}
        >
          <div className="space-y-4">
            <label className="block">
              <span className="mb-2 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>提供方</span>
              <select
                value={settings.aiProvider}
                onChange={(e) => update('aiProvider', e.target.value as AppSettings['aiProvider'])}
                className="theme-input w-full rounded-xl px-3 py-2 text-sm"
              >
                <option value="claude-cli">Claude CLI</option>
                <option value="local-client">本地客户端（Codex/其他）</option>
                <option value="codex-api">Codex API</option>
                <option value="openai-compatible">OpenAI Compatible</option>
              </select>
            </label>

            {settings.aiProvider === 'local-client' && (
              <label className="block">
                <span className="mb-2 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                  客户端预设
                </span>
                <select
                  value={settings.localClientPreset}
                  onChange={(e) => {
                    const preset = e.target.value as AppSettings['localClientPreset'];
                    update('localClientPreset', preset);
                    const matched = LOCAL_CLIENT_PRESETS.find((item) => item.value === preset);
                    if (matched && matched.defaultCommand) {
                      update('localClientCommand', matched.defaultCommand);
                    }
                  }}
                  className="theme-input w-full rounded-xl px-3 py-2 text-sm"
                >
                  {LOCAL_CLIENT_PRESETS.map((preset) => (
                    <option key={preset.value} value={preset.value}>
                      {preset.label}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className="block">
              <span className="mb-2 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                {settings.aiProvider === 'local-client' ? '本地客户端命令' : 'Claude 命令路径'}
              </span>
              <input
                value={settings.aiProvider === 'local-client' ? settings.localClientCommand : settings.claudePath}
                onChange={(e) => {
                  if (settings.aiProvider === 'local-client') {
                    update('localClientCommand', e.target.value);
                  } else {
                    update('claudePath', e.target.value);
                  }
                }}
                className="theme-input w-full rounded-xl px-3 py-2 text-sm"
                placeholder={settings.aiProvider === 'local-client' ? 'codex' : 'claude'}
              />
              {settings.aiProvider === 'local-client' && (
                <p className="theme-muted mt-1 text-xs">
                  支持模板变量：`{'{prompt}'}`、`{'{model}'}`。若不写 `{'{prompt}'}`，系统会自动通过 stdin 传入提示词。
                </p>
              )}
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>默认模型</span>
              <input
                value={settings.aiModel}
                onChange={(e) => update('aiModel', e.target.value)}
                className="theme-input w-full rounded-xl px-3 py-2 text-sm"
                placeholder="default"
              />
            </label>

            <div className="rounded-xl border p-3" style={{ borderColor: 'var(--border)', background: 'var(--surface-soft)' }}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>连接测试</p>
                <button
                  type="button"
                  onClick={testConnection}
                  disabled={testingAi}
                  className="button-secondary rounded-lg px-3 py-1.5 text-sm disabled:opacity-60"
                >
                  {testingAi ? '测试中...' : '测试连接'}
                </button>
              </div>
              <p className="theme-muted mt-1 text-xs">
                使用当前表单配置进行测试，无需先保存设置。
              </p>
              {testResult && (
                <p className={`mt-2 text-xs ${testResult.ok ? 'text-emerald-600' : 'text-red-600'}`}>
                  {testResult.message}
                </p>
              )}
            </div>
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          title="发布平台"
          icon={<Globe className="h-5 w-5 text-sky-600" />}
          defaultOpen={false}
        >
          <div className="space-y-3">
            <ToggleRow label="小红书" checked={settings.enableXiaohongshu} onChange={(v) => update('enableXiaohongshu', v)} />
            <ToggleRow label="微信公众号" checked={settings.enableWechat} onChange={(v) => update('enableWechat', v)} />
            <ToggleRow label="墨问笔记" checked={settings.enableMowen} onChange={(v) => update('enableMowen', v)} />
            <ToggleRow label="Obsidian 本地发布" checked={settings.enableObsidian} onChange={(v) => update('enableObsidian', v)} />
          </div>
          <div className="mt-4 rounded-xl border p-3" style={{ borderColor: 'var(--border)', background: 'var(--surface-soft)' }}>
            <label className="block">
              <span className="mb-2 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>微信公众号发布模式</span>
              <select
                value={settings.wechatPublishMode}
                onChange={(e) => update('wechatPublishMode', e.target.value as AppSettings['wechatPublishMode'])}
                className="theme-input w-full rounded-xl px-3 py-2 text-sm"
              >
                <option value="article">图文文章（默认）</option>
                <option value="text">纯文字（API）</option>
              </select>
            </label>
            <p className="theme-muted mt-2 text-xs">
              图文与纯文字均走 API 发布。纯文字会提取正文文本并发布到草稿箱；两种模式都需要封面图（可使用兜底封面）。
            </p>
          </div>
          <div className="mt-4 rounded-xl border p-3" style={{ borderColor: 'var(--border)', background: 'var(--surface-soft)' }}>
            <label className="block">
              <span className="mb-2 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>微信公众号兜底封面图</span>
              <select
                value={settings.fallbackCoverImage}
                onChange={(e) => update('fallbackCoverImage', e.target.value)}
                className="theme-input w-full rounded-xl px-3 py-2 text-sm"
              >
                <option value="">
                  {loadingImageAssets ? '素材加载中...' : '不指定（无兜底）'}
                </option>
                {imageAssets.map((asset) => (
                  <option key={asset.id} value={asset.path}>
                    {asset.filename}
                  </option>
                ))}
              </select>
            </label>
            <p className="theme-muted mt-2 text-xs">
              严格模式：仅用于微信公众号图文文章封面兜底；不会再随机使用 uploads 第一张图。小红书仍要求内容本身带图。
            </p>
            {settings.fallbackCoverImage && (
              <div className="mt-2">
                <img
                  src={settings.fallbackCoverImage}
                  alt="fallback-cover"
                  className="h-20 w-20 rounded-lg object-cover border"
                  style={{ borderColor: 'var(--border)' }}
                />
                <p className="theme-muted mt-1 break-all text-xs">{settings.fallbackCoverImage}</p>
              </div>
            )}
          </div>
          <div className="mt-4 rounded-xl border p-3" style={{ borderColor: 'var(--border)', background: 'var(--surface-soft)' }}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>微信 API 网络环境检查</p>
                <p className="theme-muted mt-1 text-xs">
                  用于排查 `40164 invalid ip`。更换网络、代理或服务器环境后，建议先检查一次。
                </p>
              </div>
              <button
                type="button"
                onClick={checkWechatNetwork}
                disabled={checkingWechatNetwork}
                className="button-secondary rounded-lg px-3 py-1.5 text-sm disabled:opacity-60"
              >
                {checkingWechatNetwork ? '检查中...' : wechatNetworkInfo ? '刷新 IP' : '检查当前 IP'}
              </button>
            </div>
            {wechatNetworkInfo && (
              <div className="mt-3 rounded-lg border p-3" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
                {wechatNetworkInfo.ok ? (
                  <>
                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      当前出口 IP：{wechatNetworkInfo.ip}
                    </p>
                    <p className="theme-muted mt-1 text-xs">
                      来源：{wechatNetworkInfo.source || 'unknown'}
                      {wechatNetworkInfo.checkedAt ? ` · 检查时间 ${new Date(wechatNetworkInfo.checkedAt).toLocaleString()}` : ''}
                    </p>
                    <p className="mt-2 text-xs text-amber-700">
                      {wechatNetworkInfo.hint}
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-red-600">
                    {wechatNetworkInfo.error || '出口 IP 检测失败'}
                  </p>
                )}
              </div>
            )}
          </div>
          <div className="mt-4 rounded-xl border p-3" style={{ borderColor: 'var(--border)', background: 'var(--surface-soft)' }}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>测试微信 API 可用性</p>
                <p className="theme-muted mt-1 text-xs">
                  仅测试 `access_token` 鉴权，不会创建草稿。可直接判断当前环境是否已被微信白名单放行。
                </p>
              </div>
              <button
                type="button"
                onClick={testWechatApi}
                disabled={testingWechatApi}
                className="button-secondary rounded-lg px-3 py-1.5 text-sm disabled:opacity-60"
              >
                {testingWechatApi ? '测试中...' : '测试微信 API'}
              </button>
            </div>
            {wechatApiProbe && (
              <div className="mt-3 rounded-lg border p-3" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
                {wechatApiProbe.ok ? (
                  <>
                    <p className="text-sm font-medium text-emerald-600">
                      {wechatApiProbe.message || '微信 API 鉴权成功'}
                    </p>
                    {wechatApiProbe.checkedAt && (
                      <p className="theme-muted mt-1 text-xs">
                        测试时间 {new Date(wechatApiProbe.checkedAt).toLocaleString()}
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium text-red-600">
                      {wechatApiProbe.message || wechatApiProbe.error || '微信 API 鉴权失败'}
                    </p>
                    {wechatApiProbe.currentIp && (
                      <p className="mt-1 text-xs text-amber-700">
                        微信返回的当前出口 IP：{wechatApiProbe.currentIp}
                      </p>
                    )}
                    {wechatApiProbe.checkedAt && (
                      <p className="theme-muted mt-1 text-xs">
                        测试时间 {new Date(wechatApiProbe.checkedAt).toLocaleString()}
                      </p>
                    )}
                    {wechatApiProbe.rawError && (
                      <p className="theme-muted mt-2 break-all text-xs">
                        原始返回：{wechatApiProbe.rawError}
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          title="墨问发布策略"
          icon={<Sparkles className="h-5 w-5 text-sky-600" />}
          defaultOpen={false}
        >
          <div className="space-y-3">
            <ToggleRow
              label="默认公开权限"
              hint="发布后尝试强制设置为公开"
              checked={settings.mowenDefaultPublic}
              onChange={(v) => update('mowenDefaultPublic', v)}
            />
            <ToggleRow
              label="自动同步正文图片"
              hint="将编辑器图片一并上传到墨问"
              checked={settings.mowenSyncImages}
              onChange={(v) => update('mowenSyncImages', v)}
            />
            <ToggleRow
              label="使用增强排版"
              hint="段落、强调、列表按结构输出"
              checked={settings.mowenRichLayout}
              onChange={(v) => update('mowenRichLayout', v)}
            />
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          title="Obsidian 发布策略"
          icon={<Sparkles className="h-5 w-5 text-sky-600" />}
          defaultOpen={false}
        >
          <div className="space-y-4">
            <label className="block">
              <span className="mb-2 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Vault 路径</span>
              <input
                value={settings.obsidianVaultPath}
                onChange={(e) => update('obsidianVaultPath', e.target.value)}
                className="theme-input w-full rounded-xl px-3 py-2 text-sm"
                placeholder="/Users/yourname/Documents/ObsidianVault"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>默认笔记目录</span>
              <input
                value={settings.obsidianFolder}
                onChange={(e) => update('obsidianFolder', e.target.value)}
                className="theme-input w-full rounded-xl px-3 py-2 text-sm"
                placeholder="Inbox"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>素材目录</span>
              <input
                value={settings.obsidianAssetFolder}
                onChange={(e) => update('obsidianAssetFolder', e.target.value)}
                className="theme-input w-full rounded-xl px-3 py-2 text-sm"
                placeholder="assets/content-publisher"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>图片链接格式</span>
              <select
                value={settings.obsidianLinkStyle}
                onChange={(e) => update('obsidianLinkStyle', e.target.value as AppSettings['obsidianLinkStyle'])}
                className="theme-input w-full rounded-xl px-3 py-2 text-sm"
              >
                <option value="wikilink">Obsidian WikiLink (![[image.png]])</option>
                <option value="markdown">Markdown (![](path))</option>
              </select>
            </label>
            <ToggleRow
              label="同名覆盖"
              hint="开启后发布同名笔记会覆盖旧文件"
              checked={settings.obsidianOverwrite}
              onChange={(v) => update('obsidianOverwrite', v)}
            />
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          title="写作风格中心"
          icon={<Sparkles className="h-5 w-5 text-sky-600" />}
          defaultOpen={false}
        >
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div className="space-y-4">
              <label className="block">
                <span className="mb-2 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>默认风格</span>
                <select
                  value={settings.writingStylePreset}
                  onChange={(e) => update('writingStylePreset', e.target.value as AppSettings['writingStylePreset'])}
                  className="theme-input w-full rounded-xl px-3 py-2 text-sm"
                >
                  {WRITING_STYLE_OPTIONS.map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </select>
                <p className="theme-muted mt-1 text-xs">
                  {WRITING_STYLE_OPTIONS.find((item) => item.value === settings.writingStylePreset)?.hint}
                </p>
              </label>

              <ToggleRow
                label="生成后自动人设化改写"
                hint="二次改写会保留原意，降低 AI 模板腔"
                checked={settings.humanizeRewriteEnabled}
                onChange={(v) => update('humanizeRewriteEnabled', v)}
              />

              <label className="block">
                <span className="mb-2 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>作者自我定位</span>
                <input
                  value={settings.writingStyleProfile.selfPositioning}
                  onChange={(e) => update('writingStyleProfile', { ...settings.writingStyleProfile, selfPositioning: e.target.value })}
                  className="theme-input w-full rounded-xl px-3 py-2 text-sm"
                  placeholder="例如：做过多个 ToB 项目的一线工程负责人"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>语气备注</span>
                <input
                  value={settings.writingStyleProfile.toneNotes}
                  onChange={(e) => update('writingStyleProfile', { ...settings.writingStyleProfile, toneNotes: e.target.value })}
                  className="theme-input w-full rounded-xl px-3 py-2 text-sm"
                  placeholder="例如：像给同事复盘，少空话，多细节"
                />
              </label>
            </div>

            <div className="space-y-4">
              <label className="block">
                <span className="mb-2 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>习惯表达（逗号/分号分隔）</span>
                <textarea
                  value={settings.writingStyleProfile.signaturePhrases}
                  onChange={(e) => update('writingStyleProfile', { ...settings.writingStyleProfile, signaturePhrases: e.target.value })}
                  rows={3}
                  className="theme-input w-full resize-none rounded-xl px-3 py-2 text-sm"
                  placeholder="例如：我这边实测；我踩过的坑是；我的建议是"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>禁用词/禁用句式</span>
                <textarea
                  value={settings.writingStyleProfile.bannedPhrases}
                  onChange={(e) => update('writingStyleProfile', { ...settings.writingStyleProfile, bannedPhrases: e.target.value })}
                  rows={3}
                  className="theme-input w-full resize-none rounded-xl px-3 py-2 text-sm"
                  placeholder="例如：赋能；闭环；首先其次最后；综上所述"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>个人经历素材</span>
                <textarea
                  value={settings.writingStyleProfile.personalExperience}
                  onChange={(e) => update('writingStyleProfile', { ...settings.writingStyleProfile, personalExperience: e.target.value })}
                  rows={5}
                  className="theme-input w-full resize-none rounded-xl px-3 py-2 text-sm"
                  placeholder="填写可复用的真实经历、项目背景和取舍案例，生成时会优先吸收"
                />
              </label>
            </div>
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          title="模板学习中心"
          icon={<Wand2 className="h-5 w-5 text-sky-600" />}
          defaultOpen={false}
        >
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div className="space-y-3 rounded-xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--surface-soft)' }}>
              <label className="block">
                <span className="mb-2 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>模板来源链接</span>
                <input
                  value={learnSourceUrl}
                  onChange={(e) => setLearnSourceUrl(e.target.value)}
                  className="theme-input w-full rounded-xl px-3 py-2 text-sm"
                  placeholder="https://mp.weixin.qq.com/..."
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>补充文本/样式描述</span>
                <textarea
                  value={learnSourceText}
                  onChange={(e) => setLearnSourceText(e.target.value)}
                  rows={4}
                  className="theme-input w-full resize-none rounded-xl px-3 py-2 text-sm"
                  placeholder="可粘贴模板正文、HTML片段或你希望保留的风格特征"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>模板名称（可选）</span>
                <input
                  value={learnTemplateName}
                  onChange={(e) => setLearnTemplateName(e.target.value)}
                  className="theme-input w-full rounded-xl px-3 py-2 text-sm"
                  placeholder="例如：公众号教程蓝白风"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>学习模式</span>
                <select
                  value={learnMode}
                  onChange={(e) => setLearnMode(e.target.value as TemplateMode)}
                  className="theme-input w-full rounded-xl px-3 py-2 text-sm"
                >
                  <option value="adapt">风格迁移（推荐）</option>
                  <option value="strict">严格还原</option>
                </select>
              </label>
              <div>
                <span className="mb-2 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>目标平台</span>
                <div className="grid grid-cols-2 gap-2">
                  {TEMPLATE_PLATFORM_OPTIONS.map((item) => (
                    <label key={item.value} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={learnPlatforms.includes(item.value)}
                        onChange={() => toggleLearnPlatform(item.value)}
                        className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                      />
                      <span style={{ color: 'var(--text-secondary)' }}>{item.label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <button
                type="button"
                onClick={learnTemplate}
                disabled={learningTemplate}
                className="button-primary w-full rounded-xl px-4 py-2 text-sm disabled:opacity-60"
              >
                {learningTemplate ? '学习中...' : '开始学习并入库'}
              </button>
            </div>

            <div className="space-y-3">
              <label className="block">
                <span className="mb-2 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>默认排版模板</span>
                <select
                  value={settings.defaultLayoutTemplateId}
                  onChange={(e) => update('defaultLayoutTemplateId', e.target.value)}
                  className="theme-input w-full rounded-xl px-3 py-2 text-sm"
                >
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>{template.name}</option>
                  ))}
                </select>
              </label>

              <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                {loadingTemplates ? (
                  <p className="theme-muted text-sm">模板加载中...</p>
                ) : templates.length === 0 ? (
                  <p className="theme-muted text-sm">还没有可用模板</p>
                ) : (
                  templates.map((template) => (
                    <div key={template.id} className="rounded-xl border p-3" style={{ borderColor: 'var(--border)' }}>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>{template.name}</p>
                          <p className="theme-muted mt-1 text-xs">{template.description}</p>
                          <p className="theme-muted mt-1 text-[11px]">
                            {template.sourceType === 'system' ? '系统模板' : '学习模板'} · {template.platforms.join('/')}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setDefaultTemplate(template.id)}
                            className={`rounded-md px-2 py-1 text-xs ${settings.defaultLayoutTemplateId === template.id ? 'tag-success' : 'button-secondary'}`}
                          >
                            默认
                          </button>
                          {template.sourceType === 'learned' && (
                            <button
                              type="button"
                              onClick={() => deleteTemplate(template.id)}
                              disabled={deletingTemplateId === template.id}
                              className="button-secondary rounded-md p-1.5 text-red-600 disabled:opacity-60"
                              title="删除模板"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          title="通知与体验"
          icon={<Bell className="h-5 w-5 text-sky-600" />}
          defaultOpen={false}
        >
          <div className="space-y-3">
            <ToggleRow label="发布成功通知" checked={settings.notifyOnSuccess} onChange={(v) => update('notifyOnSuccess', v)} />
            <ToggleRow label="发布失败通知" checked={settings.notifyOnFailure} onChange={(v) => update('notifyOnFailure', v)} />
            <ToggleRow label="定时发布提醒" checked={settings.notifyOnSchedule} onChange={(v) => update('notifyOnSchedule', v)} />
            <ToggleRow label="紧凑编辑器" checked={settings.compactEditor} onChange={(v) => update('compactEditor', v)} />
          </div>
        </CollapsibleSection>
      </div>

      <div className="theme-panel sticky bottom-4 z-20 flex items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-2 text-sm theme-muted">
          <SlidersHorizontal className="h-4 w-4" />
          设置已持久化到服务端，同时保留浏览器本地缓存
        </div>
        <div className="flex items-center gap-2">
          <button onClick={resetDefaults} className="button-secondary rounded-xl px-4 py-2 text-sm">恢复默认</button>
          <button
            onClick={saveSettings}
            disabled={!isDirty || saving}
            className="button-primary inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {saving ? '保存中...' : '保存设置'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border px-3 py-2.5" style={{ borderColor: 'var(--border)' }}>
      <div>
        <div className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>{label}</div>
        {hint ? <div className="theme-muted text-xs mt-0.5">{hint}</div> : null}
      </div>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
      />
    </label>
  );
}

function CollapsibleSection({
  title,
  icon,
  children,
  defaultOpen = false,
  className = '',
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  return (
    <details
      open={defaultOpen}
      className={`theme-card p-6 group ${className}`.trim()}
    >
      <summary className="mb-4 flex cursor-pointer list-none items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {icon}
          <h2 className="theme-title text-lg font-semibold">{title}</h2>
        </div>
        <ChevronDown className="h-4 w-4 text-slate-400 transition-transform group-open:rotate-180" />
      </summary>
      {children}
    </details>
  );
}
