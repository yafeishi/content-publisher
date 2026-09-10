'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Folder, GitBranch, Save } from 'lucide-react';

export default function NewProject() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [path, setPath] = useState('');
  const [description, setDescription] = useState('');
  const [scenario, setScenario] = useState('');
  const [needs, setNeeds] = useState('');
  const [solution, setSolution] = useState('');
  const [highlights, setHighlights] = useState('');
  const [outcomes, setOutcomes] = useState('');
  const [audience, setAudience] = useState('');
  const [stage, setStage] = useState<'idea' | 'building' | 'launched' | 'iterating'>('building');
  const [type, setType] = useState<'local' | 'github'>('local');
  const [techStack, setTechStack] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (!name || !path) return;

    setIsSaving(true);
    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          path,
          description,
          scenario,
          needs,
          solution,
          highlights: JSON.stringify(highlights.split('\n').map(t => t.trim()).filter(Boolean)),
          outcomes,
          audience,
          stage,
          type,
          techStack: JSON.stringify(techStack.split(',').map(t => t.trim()).filter(Boolean)),
        }),
      });

      if (response.ok) {
        router.push('/projects');
      }
    } catch (error) {
      console.error('Failed to save:', error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="theme-panel flex items-center gap-4 p-6">
        <button
          onClick={() => router.back()}
          className="button-secondary rounded-lg p-2"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="page-title">添加项目</h1>
          <p className="page-subtitle">添加一个项目以便生成内容</p>
        </div>
      </div>

      <div className="max-w-2xl">
        <div className="theme-card space-y-6 p-6">
          <div>
            <label className="mb-2 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
              项目类型
            </label>
            <div className="flex gap-4">
              <button
                onClick={() => setType('local')}
                className={`flex flex-1 items-center justify-center gap-2 rounded-lg border p-4 transition-colors ${
                  type === 'local'
                    ? 'tag-info border-sky-300'
                    : 'hover:bg-slate-50'
                }`}
                style={type === 'local' ? undefined : { borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
              >
                <Folder className="h-5 w-5" />
                本地项目
              </button>
              <button
                onClick={() => setType('github')}
                className={`flex flex-1 items-center justify-center gap-2 rounded-lg border p-4 transition-colors ${
                  type === 'github'
                    ? 'tag-info border-sky-300'
                    : 'hover:bg-slate-50'
                }`}
                style={type === 'github' ? undefined : { borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
              >
                <GitBranch className="h-5 w-5" />
                GitHub 仓库
              </button>
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
              项目名称 *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="输入项目名称"
              className="theme-input w-full rounded-xl px-4 py-2"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
              {type === 'local' ? '项目路径 *' : 'GitHub 仓库 URL *'}
            </label>
            <input
              type="text"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder={type === 'local' ? '/Users/xxx/project' : 'https://github.com/username/repo'}
              className="theme-input w-full rounded-xl px-4 py-2"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
              项目描述
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="简单描述这个项目"
              rows={3}
              className="theme-input w-full resize-none rounded-xl px-4 py-2"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
              使用场景
            </label>
            <textarea
              value={scenario}
              onChange={(e) => setScenario(e.target.value)}
              placeholder="这个项目典型在什么业务/工作场景下被使用？"
              rows={2}
              className="theme-input w-full resize-none rounded-xl px-4 py-2"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
              解决的需求/痛点
            </label>
            <textarea
              value={needs}
              onChange={(e) => setNeeds(e.target.value)}
              placeholder="用户原来遇到了什么问题？为什么必须做这个项目？"
              rows={3}
              className="theme-input w-full resize-none rounded-xl px-4 py-2"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
              方案与实施路径
            </label>
            <textarea
              value={solution}
              onChange={(e) => setSolution(e.target.value)}
              placeholder="你们采用了什么方案？按什么步骤落地？"
              rows={3}
              className="theme-input w-full resize-none rounded-xl px-4 py-2"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
              实施亮点（每行一条）
            </label>
            <textarea
              value={highlights}
              onChange={(e) => setHighlights(e.target.value)}
              placeholder={`例如：\n首屏性能从 4.2s 优化到 1.6s\n构建统一组件库提升迭代效率`}
              rows={4}
              className="theme-input w-full resize-none rounded-xl px-4 py-2"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
              阶段性结果
            </label>
            <textarea
              value={outcomes}
              onChange={(e) => setOutcomes(e.target.value)}
              placeholder="上线效果、效率提升、业务指标变化等"
              rows={2}
              className="theme-input w-full resize-none rounded-xl px-4 py-2"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                目标读者
              </label>
              <input
                type="text"
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                placeholder="比如：前端工程师 / 产品经理 / 创业团队"
                className="theme-input w-full rounded-xl px-4 py-2"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                当前阶段
              </label>
              <select
                value={stage}
                onChange={(e) => setStage(e.target.value as 'idea' | 'building' | 'launched' | 'iterating')}
                className="theme-input w-full rounded-xl px-4 py-2"
              >
                <option value="idea">想法验证</option>
                <option value="building">开发中</option>
                <option value="launched">已上线</option>
                <option value="iterating">持续迭代</option>
              </select>
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
              技术栈
            </label>
            <input
              type="text"
              value={techStack}
              onChange={(e) => setTechStack(e.target.value)}
              placeholder="React, TypeScript, Node.js (用逗号分隔)"
              className="theme-input w-full rounded-xl px-4 py-2"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              onClick={() => router.back()}
              className="button-secondary rounded-xl px-4 py-2"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving || !name || !path}
              className="button-primary flex items-center gap-2 rounded-xl px-4 py-2 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {isSaving ? '保存中...' : '保存项目'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
