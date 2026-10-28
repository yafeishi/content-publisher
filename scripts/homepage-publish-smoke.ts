import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { publishHomepageNote, type HomepagePublishSettings } from '../src/lib/homepage-publish';
import {
  parseHomepageHtml,
  resolveHomepageSlug,
  upsertHomepageLatestNote,
} from '../src/lib/homepage-note';

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function git(cwd: string, args: string[]) {
  execFileSync('git', ['-c', 'user.name=smoke', '-c', 'user.email=smoke@example.com', ...args], {
    cwd,
    stdio: 'pipe',
  });
}

delete process.env.HOMEPAGE_REPO_PATH;
delete process.env.HOMEPAGE_GITHUB_TOKEN;

const slug = resolveHomepageSlug('GPT-6 四档怎么选？', [], 'cuid12345678');
assert('slug' in slug && slug.slug === 'gpt-6', `expected gpt-6, got ${JSON.stringify(slug)}`);

const explicit = resolveHomepageSlug('任意标题', ['homepage-slug:hermes-ttft'], 'x');
assert('slug' in explicit && explicit.slug === 'hermes-ttft', 'explicit slug should win');

const invalid = resolveHomepageSlug('标题', ['homepage-slug:Not Valid'], 'x');
assert('error' in invalid, 'invalid slug should fail');

const parsed = parseHomepageHtml('<script>alert(1)</script><p>昨晚在 <strong>Mac Mini</strong> 上。</p><img src="/uploads/chart.png" alt="图"><p>▲ 图注</p>');
assert(!JSON.stringify(parsed).includes('alert(1)'), 'script should be stripped');
assert(parsed.blocks.some((block) => block.type === 'img' && block.caption === '▲ 图注'), 'caption should attach to the image');
assert(parsed.blocks.some((block) => block.type === 'p' && block.inlines.some((item) => item.type === 'strong' && item.text === 'Mac Mini')), 'strong text should survive');

let home = `<section><h2>最新文章</h2><div className="work-list"><article>手写</article></div></section>`;
home = upsertHomepageLatestNote(home, {
  slug: 'first-note',
  date: '2026-10-28',
  title: '标题含 } 花括号',
  summary: '摘要',
  kicker: '笔记',
});
home = upsertHomepageLatestNote(home, {
  slug: 'second-note',
  date: '2026-10-28',
  title: '第二篇',
  summary: '后写的在前',
  kicker: '笔记',
});
home = upsertHomepageLatestNote(home, {
  slug: 'first-note',
  date: '2026-10-29',
  title: '第一篇更新',
  summary: '同一 slug 不重复',
  kicker: '笔记',
});
assert(home.includes('手写'), 'hand-written article should stay');
assert(home.includes('第一篇更新') && !home.includes('标题含 } 花括号'), 'same slug should be replaced');
assert(home.indexOf('first-note') < home.indexOf('second-note'), 'updated note should move to the front');
assert((home.match(/data-publisher-slug="first-note"/g) || []).length === 1, 'slug should appear once');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'homepage-smoke-'));
const repo = path.join(root, 'homepage');
const bare = path.join(root, 'origin.git');
const project = path.join(root, 'publisher');
fs.mkdirSync(path.join(repo, 'app/views'), { recursive: true });
fs.mkdirSync(path.join(repo, 'app/components'), { recursive: true });
fs.mkdirSync(path.join(project, 'public/uploads'), { recursive: true });
fs.writeFileSync(path.join(repo, 'app/components/Header.tsx'), 'export function Header(){return null}\n');
fs.writeFileSync(
  path.join(repo, 'app/views/HomeView.tsx'),
  'export function HomeView(){return (<section><h2>最新文章</h2><div className="work-list"><article className="work-item">手写笔记</article></div></section>)}\n',
);
fs.writeFileSync(
  path.join(project, 'public/uploads/chart.png'),
  Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'),
);
execFileSync('git', ['init', '-b', 'master'], { cwd: repo, stdio: 'pipe' });
git(repo, ['add', '.']);
git(repo, ['commit', '-m', 'init']);
execFileSync('git', ['init', '--bare', '-b', 'master', bare], { stdio: 'pipe' });

const settings = (mode: HomepagePublishSettings['homepagePublishMode']): HomepagePublishSettings => ({
  enableHomepage: true,
  homepageRepoPath: repo,
  homepageRepoRemote: bare,
  homepageBranch: 'master',
  homepageSiteOrigin: 'https://danghb.cn',
  homepagePublishMode: mode,
  homepageBlockParenting: true,
  homepageBlockTags: '育儿,党哥育儿,parenting,亲子',
  homepageCredit: '同步自微信公众号「Hobson 小党」',
});

async function main() {
const blocked = await publishHomepageNote({
  contentId: 'parent-1',
  title: '党哥育儿：今晚的睡眠',
  bodyHtml: '<p>记录一下。</p>',
  tags: ['育儿'],
  images: [],
  projectRoot: project,
  settings: settings('files-only'),
});
assert(blocked.success === false && blocked.error?.includes('党哥育儿'), `parenting should be blocked, got ${blocked.error}`);
assert(!fs.existsSync(path.join(repo, 'app/(zh)/notes')), 'blocked content must not create a note');

const html = [
  '<script>alert(1)</script>',
  '<h2>怎么测</h2>',
  '<p>昨晚在 <strong>Mac Mini</strong> 上跑。</p>',
  '<ul><li>样本一</li><li>样本二</li></ul>',
  '<img src="/uploads/chart.png" alt="中位图">',
  '<p>▲ 六模型中位</p>',
  '<table><thead><tr><th>模型</th><th>秒</th></tr></thead><tbody><tr><td>MiniMax</td><td>0.89</td></tr></tbody></table>',
].join('');

const first = await publishHomepageNote({
  contentId: 'note-1',
  title: '【实测】Hermes 里 6 个模型',
  bodyHtml: html,
  tags: ['homepage-slug:hermes-ttft', 'homepage-kicker:Hermes / TTFT', 'layout-template:standard'],
  images: [],
  projectRoot: project,
  settings: settings('files-only'),
});
assert(first.success, first.error || 'files-only publish failed');
assert(first.result?.externalId === 'https://danghb.cn/notes/hermes-ttft/', `unexpected url ${first.result?.externalId}`);
const pagePath = path.join(repo, 'app/(zh)/notes/hermes-ttft/page.tsx');
const page = fs.readFileSync(pagePath, 'utf8');
assert(page.includes('https://danghb.cn/notes/hermes-ttft/'), 'page should store the canonical url');
assert(page.includes('/notes/hermes-ttft/chart.png'), 'local image should be copied onto the note path');
assert(page.includes('Mac Mini') && !page.includes('alert(1)'), 'body should keep text and drop scripts');
assert(fs.existsSync(path.join(repo, 'public/notes/hermes-ttft/chart.png')), 'image file should be copied');
const homeAfter = fs.readFileSync(path.join(repo, 'app/views/HomeView.tsx'), 'utf8');
assert(homeAfter.includes('/notes/hermes-ttft') && homeAfter.includes('手写笔记'), 'homepage list should include the new note and the old one');
assert(fs.readFileSync(path.join(repo, 'app/components/PublishedNote.tsx'), 'utf8').includes('content-publisher:published-note'), 'renderer component should be installed');

const updated = await publishHomepageNote({
  contentId: 'note-1',
  title: '【实测】Hermes 更新',
  bodyHtml: '<p>更新后的第一段，用来确认同一 slug 会覆盖。</p>',
  tags: ['homepage-slug:hermes-ttft'],
  images: [],
  projectRoot: project,
  settings: settings('files-only'),
});
assert(updated.success, updated.error || 'update failed');
const homeUpdated = fs.readFileSync(path.join(repo, 'app/views/HomeView.tsx'), 'utf8');
assert(homeUpdated.includes('【实测】Hermes 更新'), 'home list should show the updated title');
assert((homeUpdated.match(/data-publisher-slug="hermes-ttft"/g) || []).length === 1, 'slug card should not be duplicated');

git(repo, ['checkout', '-b', 'wip']);
const wrongBranch = await publishHomepageNote({
  contentId: 'note-2',
  title: '另一篇',
  bodyHtml: '<p>不应该在错误分支上发布。</p>',
  tags: ['homepage-slug:other-note'],
  images: [],
  projectRoot: project,
  settings: settings('commit-push'),
});
assert(wrongBranch.success === false && wrongBranch.error?.includes('wip'), `wrong branch should fail, got ${wrongBranch.error}`);
assert(!fs.existsSync(path.join(repo, 'app/(zh)/notes/other-note/page.tsx')), 'wrong branch must not write the note');
git(repo, ['checkout', 'master']);

const pushed = await publishHomepageNote({
  contentId: 'note-1',
  title: '【实测】Hermes 更新',
  bodyHtml: '<p>更新后的第一段，用来确认同一 slug 会覆盖。</p>',
  tags: ['homepage-slug:hermes-ttft'],
  images: [],
  projectRoot: project,
  settings: settings('commit-push'),
});
assert(pushed.success, pushed.error || 'commit-push failed');
assert(pushed.result?.externalId === 'https://danghb.cn/notes/hermes-ttft/', 'pushed record should keep the public url');

const checked = path.join(root, 'checked-out');
execFileSync('git', ['clone', bare, checked], { stdio: 'pipe' });
assert(
  fs.existsSync(path.join(checked, 'app/(zh)/notes/hermes-ttft/page.tsx')),
  'bare remote should contain the published note',
);
assert(
  fs.readFileSync(path.join(checked, 'app/views/HomeView.tsx'), 'utf8').includes('/notes/hermes-ttft'),
  'pushed home view should list the note',
);

console.log('homepage publish smoke passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
