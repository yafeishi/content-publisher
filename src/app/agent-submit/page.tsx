import AgentSubmitQuickCopy from '@/components/AgentSubmitQuickCopy';

const samplePayload = `{
  "title": "某次 Agent 会话总结",
  "markdown": "# 结论\\n\\n这是其他 agent 的总结正文。\\n\\n![界面截图](https://example.com/demo.png)\\n\\n## 下一步\\n\\n- 补测试\\n- 发草稿",
  "coverImage": "https://example.com/cover.png",
  "images": [
    "https://example.com/step-1.png",
    {
      "path": "/absolute/path/to/local-image.png",
      "alt": "本地图"
    }
  ],
  "templateId": "standard",
  "tags": ["agent-summary", "weekly-review"],
  "platforms": ["wechat", "mowen", "obsidian"],
  "projectId": "your-project-id",
  "status": "draft",
  "source": {
    "agent": "codex",
    "sessionId": "thread-123",
    "threadUrl": "https://example.com/thread/123",
    "note": "来自另一个会话的阶段总结"
  },
  "options": {
    "prependCoverToBody": false,
    "appendImagesToBody": true
  }
}`;

const curlExample = `curl -sS -X POST http://localhost:13847/api/agent-submit \\
  -H 'Content-Type: application/json' \\
  -d '${samplePayload.replace(/\n/g, "\\n").replace(/'/g, `'\"'\"'`)}'`;

const supportedFields = [
  ['title', '必填，文章标题'],
  ['markdown', '推荐，其他 agent 直接传 Markdown'],
  ['body', '可选，支持 HTML / 纯文本'],
  ['bodyFormat', 'html | markdown | plain'],
  ['coverImage', '封面图。支持远程 URL、本地绝对路径、/uploads 路径、dataUrl'],
  ['images', '附加图片数组。可自动入库，并按需追加到正文'],
  ['templateId', '排版模板，如 standard / clean-notes / impact-mag'],
  ['tags', '标签数组或 JSON 字符串'],
  ['platforms', '目标平台数组或 JSON 字符串'],
  ['projectId', '关联项目 ID'],
  ['status', 'draft / published / scheduled'],
  ['scheduledAt', '定时发布时间 ISO 字符串'],
  ['publishedAt', '已发布时间 ISO 字符串'],
  ['source', '来源信息：agent、sessionId、threadUrl、note'],
  ['options.prependCoverToBody', '是否把封面图插到正文顶部'],
  ['options.appendImagesToBody', '是否把 images 中未出现的图自动追加到正文'],
];

export default function AgentSubmitPage() {
  return (
    <div className="space-y-6">
      <section className="theme-panel p-6 md:p-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium tag-info">
              Agent Content Bridge
            </div>
            <h1 className="page-title mt-4">Agent 内容接入说明</h1>
            <p className="page-subtitle max-w-3xl">
              把这个页面 URL 直接发给其他 agent 即可。它们按这里的协议向 <code>/api/agent-submit</code> 发一次 POST，
              就能把标题、正文、排版、封面图、正文图片、项目归属和发布平台信息一次性写进本系统。
            </p>
          </div>
          <div className="theme-card rounded-2xl px-4 py-3 text-sm">
            <div className="theme-muted">提交接口</div>
            <div className="mt-1 font-mono text-sm text-slate-800">POST /api/agent-submit</div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="theme-card p-6">
          <h2 className="text-xl font-semibold theme-title">适合直接发给其他 Agent 的一句话</h2>
          <p className="mt-3 text-sm theme-muted leading-6">
            如果你只是想快速把入口丢给另一个 Agent，不需要转述整套规则，直接复制右边这段短提示词就够了。
          </p>
        </div>
        <AgentSubmitQuickCopy />
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="theme-card p-6">
          <h2 className="text-xl font-semibold theme-title">支持提交的内容</h2>
          <div className="mt-4 overflow-hidden rounded-2xl border" style={{ borderColor: 'var(--border)' }}>
            <table className="min-w-full text-sm">
              <thead style={{ background: 'var(--surface-soft)' }}>
                <tr>
                  <th className="px-4 py-3 text-left font-semibold theme-title">字段</th>
                  <th className="px-4 py-3 text-left font-semibold theme-title">说明</th>
                </tr>
              </thead>
              <tbody>
                {supportedFields.map(([field, desc]) => (
                  <tr key={field} className="border-t" style={{ borderColor: 'var(--border)' }}>
                    <td className="px-4 py-3 align-top font-mono text-sky-700">{field}</td>
                    <td className="px-4 py-3 theme-muted">{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-6">
          <div className="theme-card p-6">
            <h2 className="text-xl font-semibold theme-title">最推荐的接入方式</h2>
            <ul className="mt-4 space-y-3 text-sm theme-muted">
              <li>1. 优先直接传 <code>markdown</code>，系统会自动转成可编辑 HTML。</li>
              <li>2. 标题、正文、封面图、正文配图、排版模板、项目归属、目标平台尽量一次带全。</li>
              <li>3. 图片优先传远程 URL 或本地绝对路径，系统会自动转存到素材库。</li>
              <li>4. 如果只是封面图，不想进正文，就只传 <code>coverImage</code>。</li>
              <li>5. 如果想把附加图片自动补到正文末尾，设置 <code>options.appendImagesToBody=true</code>。</li>
            </ul>
          </div>

          <div className="theme-card p-6">
            <h2 className="text-xl font-semibold theme-title">返回结果</h2>
            <p className="mt-3 text-sm theme-muted">
              接口会返回新建内容的 <code>content.id</code>，以及本次自动转存后的封面图和正文图片路径。
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="theme-card p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold theme-title">JSON 示例</h2>
            <span className="rounded-full px-3 py-1 text-xs font-medium tag-success">可直接复制</span>
          </div>
          <pre className="mt-4 overflow-x-auto rounded-2xl p-4 text-xs leading-6" style={{ background: 'var(--surface-soft)', color: 'var(--text-secondary)' }}>
            {samplePayload}
          </pre>
        </div>

        <div className="theme-card p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold theme-title">cURL 示例</h2>
            <span className="rounded-full px-3 py-1 text-xs font-medium tag-info">本机直调</span>
          </div>
          <pre className="mt-4 overflow-x-auto rounded-2xl p-4 text-xs leading-6" style={{ background: 'var(--surface-soft)', color: 'var(--text-secondary)' }}>
            {curlExample}
          </pre>
        </div>
      </section>
    </div>
  );
}
