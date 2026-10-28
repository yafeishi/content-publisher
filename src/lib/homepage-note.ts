export const DEFAULT_HOMEPAGE_BLOCK_TAGS = ['育儿', '党哥育儿', 'parenting', '亲子'];

export const LATEST_NOTES_START = '{/* content-publisher:latest-notes:start */}';
export const LATEST_NOTES_END = '{/* content-publisher:latest-notes:end */}';

export const PUBLISHED_NOTE_MARKER = 'content-publisher:published-note';

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CONTROL_TAG_PREFIXES = ['homepage-slug:', 'homepage-kicker:', 'layout-template:', 'series:'];

export type PublishedInline =
  | { type: 'text'; text: string }
  | { type: 'strong'; text: string }
  | { type: 'em'; text: string }
  | { type: 'code'; text: string }
  | { type: 'link'; text: string; href: string };

export type PublishedBlock =
  | { type: 'h2'; text: string }
  | { type: 'h3'; text: string }
  | { type: 'p'; inlines: PublishedInline[] }
  | { type: 'li'; inlines: PublishedInline[] }
  | { type: 'quote'; inlines: PublishedInline[] }
  | { type: 'code'; text: string }
  | { type: 'img'; src: string; alt: string; caption?: string }
  | { type: 'table'; caption?: string; headers: string[]; rows: string[][] };

export type PublishedNoteData = {
  title: string;
  description: string;
  canonical: string;
  date: string;
  kicker: string;
  lede: string;
  credit: string;
  blocks: PublishedBlock[];
};

export type LatestNoteEntry = {
  slug: string;
  date: string;
  title: string;
  summary: string;
  kicker: string;
};

export function parseBlockTagList(raw: string | undefined | null): string[] {
  const source = (raw || '').trim();
  if (!source) return [...DEFAULT_HOMEPAGE_BLOCK_TAGS];
  const items = source.split(/[,，\n]/).map((item) => item.trim()).filter(Boolean);
  return items.length > 0 ? items : [...DEFAULT_HOMEPAGE_BLOCK_TAGS];
}

export function homepageBlockReason(input: {
  title: string;
  tags: string[];
  enabled: boolean;
  blockTags: string[];
}): string | null {
  if (!input.enabled) return null;
  const rules = input.blockTags.map((item) => item.trim()).filter(Boolean);
  const tags = input.tags
    .map((item) => item.trim())
    .filter((item) => item && !CONTROL_TAG_PREFIXES.some((prefix) => item.toLowerCase().startsWith(prefix)));
  const title = input.title || '';
  for (const rule of rules) {
    const needle = rule.toLowerCase();
    if (title.toLowerCase().includes(needle)) {
      return `标题包含「${rule}」，默认不同步到个人主页（danghb.cn）。科技 / 出海 / 工具向内容（Hobson 小党、霍普森小岛）可以发；党哥育儿不要发到职业主页。`;
    }
    if (tags.some((tag) => tag.toLowerCase() === needle || tag.toLowerCase().includes(needle))) {
      return `标签包含「${rule}」，默认不同步到个人主页（danghb.cn）。科技 / 出海 / 工具向内容（Hobson 小党、霍普森小岛）可以发；党哥育儿不要发到职业主页。`;
    }
  }
  return null;
}

export function resolveHomepageSlug(title: string, tags: string[], contentId: string): { slug: string } | { error: string } {
  const explicit = tags
    .map((tag) => tag.trim())
    .find((tag) => tag.toLowerCase().startsWith('homepage-slug:'));
  if (explicit) {
    const slug = explicit.slice('homepage-slug:'.length).trim().toLowerCase();
    if (!SLUG_RE.test(slug) || slug.length > 64) {
      return {
        error: `标签 homepage-slug「${slug || '空'}」无效。只允许小写字母、数字和连字符，例如 homepage-slug:hermes-ttft。`,
      };
    }
    return { slug };
  }

  const ascii = (title || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/g, '');
  if (ascii.length >= 3 && SLUG_RE.test(ascii)) return { slug: ascii };

  const suffix = (contentId || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(-8) || 'note';
  const slug = ascii ? `${ascii}-${suffix}`.replace(/-+/g, '-').replace(/^-+|-+$/g, '') : `note-${suffix}`;
  if (!SLUG_RE.test(slug)) {
    return { error: '无法从标题生成 slug。请给内容加上标签 homepage-slug:your-slug。' };
  }
  return { slug };
}

export function resolveHomepageKicker(tags: string[]): string {
  const explicit = tags
    .map((tag) => tag.trim())
    .find((tag) => tag.toLowerCase().startsWith('homepage-kicker:'));
  if (explicit) {
    const kicker = explicit.slice('homepage-kicker:'.length).trim();
    if (kicker) return kicker.slice(0, 32);
  }
  const publicTag = tags
    .map((tag) => tag.trim())
    .find((tag) => tag && !CONTROL_TAG_PREFIXES.some((prefix) => tag.toLowerCase().startsWith(prefix)) && !tag.startsWith('#'));
  return (publicTag || '笔记').replace(/^#/, '').slice(0, 32);
}

export function formatShanghaiDate(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value || '1970';
  const month = parts.find((part) => part.type === 'month')?.value || '01';
  const day = parts.find((part) => part.type === 'day')?.value || '01';
  return `${year}-${month}-${day}`;
}

export function normalizeSiteOrigin(origin: string): string {
  const trimmed = (origin || '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\/[^\s/]+/i.test(trimmed)) return 'https://danghb.cn';
  return trimmed;
}

export function homepageNoteUrl(origin: string, slug: string): string {
  return `${normalizeSiteOrigin(origin)}/notes/${slug}/`;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&');
}

export function plainText(html: string): string {
  return decodeEntities(html.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ''))
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function attr(attrs: string, name: string): string {
  const match = attrs.match(new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s"'=<>\\\`]+))`, 'i'));
  return decodeEntities(match?.[2] || match?.[3] || match?.[4] || '').trim();
}

function isSafeHref(href: string): boolean {
  if (!href) return false;
  const lowered = href.trim().toLowerCase();
  if (lowered.startsWith('javascript:') || lowered.startsWith('data:')) return false;
  return /^(https?:\/\/|mailto:|\/|#)/i.test(href.trim());
}

function pushText(inlines: PublishedInline[], raw: string) {
  const text = decodeEntities(raw).replace(/\u00a0/g, ' ');
  if (!text) return;
  if (!text.trim()) {
    const prev = inlines[inlines.length - 1];
    if (prev?.type === 'text') {
      if (!prev.text.endsWith(' ')) prev.text += ' ';
    } else if (prev) {
      inlines.push({ type: 'text', text: ' ' });
    }
    return;
  }
  const prev = inlines[inlines.length - 1];
  if (prev?.type === 'text') prev.text += text;
  else inlines.push({ type: 'text', text });
}

function htmlToInlines(fragment: string): PublishedInline[] {
  const inlines: PublishedInline[] = [];
  const re = /<(strong|b|em|i|code)\b[^>]*>([\s\S]*?)<\/\1>|<a\b([^>]*)>([\s\S]*?)<\/a>|<br\s*\/?>|<[^>]+>/gi;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(fragment))) {
    pushText(inlines, fragment.slice(last, match.index));
    const raw = match[0];
    if (/^<br/i.test(raw)) {
      pushText(inlines, '\n');
    } else if (match[1]) {
      const kind = match[1].toLowerCase();
      const text = plainText(match[2] || '');
      if (text) {
        if (kind === 'strong' || kind === 'b') inlines.push({ type: 'strong', text });
        else if (kind === 'em' || kind === 'i') inlines.push({ type: 'em', text });
        else inlines.push({ type: 'code', text });
      }
    } else if (/^<a\b/i.test(raw)) {
      const href = attr(match[3] || '', 'href');
      const text = plainText(match[4] || '') || href;
      if (text && isSafeHref(href)) inlines.push({ type: 'link', text, href });
      else if (text) pushText(inlines, text);
    }
    last = match.index + raw.length;
  }
  pushText(inlines, fragment.slice(last));
  return inlines.filter((item) => item.type !== 'text' || item.text.trim().length > 0 || item.text === ' ');
}

function inlinePlain(inlines: PublishedInline[]): string {
  return inlines.map((item) => item.text).join('').replace(/\s+/g, ' ').trim();
}

function findClosingTag(html: string, tag: string, contentStart: number): { contentEnd: number; tagEnd: number } | null {
  const openRe = new RegExp(`<${tag}\\b[^>]*>`, 'gi');
  const closeRe = new RegExp(`</${tag}\\s*>`, 'gi');
  let depth = 1;
  let cursor = contentStart;
  while (cursor < html.length) {
    openRe.lastIndex = cursor;
    closeRe.lastIndex = cursor;
    const open = openRe.exec(html);
    const close = closeRe.exec(html);
    if (!close) return null;
    if (open && open.index < close.index) {
      depth += 1;
      cursor = open.index + open[0].length;
      continue;
    }
    depth -= 1;
    if (depth === 0) return { contentEnd: close.index, tagEnd: close.index + close[0].length };
    cursor = close.index + close[0].length;
  }
  return null;
}

function parseImg(attrs: string): PublishedBlock {
  return {
    type: 'img',
    src: attr(attrs, 'src'),
    alt: attr(attrs, 'alt') || '配图',
  };
}

function splitByImages(inner: string): Array<{ html?: string; img?: PublishedBlock & { type: 'img' } }> {
  const parts: Array<{ html?: string; img?: PublishedBlock & { type: 'img' } }> = [];
  const re = /<img\b([^>]*)\/?>/gi;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(inner))) {
    parts.push({ html: inner.slice(last, match.index) });
    parts.push({ img: parseImg(match[1] || '') as PublishedBlock & { type: 'img' } });
    last = match.index + match[0].length;
  }
  parts.push({ html: inner.slice(last) });
  return parts;
}

function pushRich(blocks: PublishedBlock[], kind: 'p' | 'li' | 'quote', inner: string) {
  for (const part of splitByImages(inner)) {
    if (part.img) {
      if (part.img.src) blocks.push(part.img);
      continue;
    }
    const inlines = htmlToInlines(part.html || '');
    if (inlinePlain(inlines).length === 0) continue;
    if (kind === 'li') blocks.push({ type: 'li', inlines });
    else if (kind === 'quote') blocks.push({ type: 'quote', inlines });
    else blocks.push({ type: 'p', inlines });
  }
}

function parseTable(inner: string): PublishedBlock {
  const rowHtml = Array.from(inner.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)).map((match) => match[1] || '');
  const rows = rowHtml.map((row) => (
    Array.from(row.matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)).map((cell) => plainText(cell[1] || ''))
  )).filter((row) => row.length > 0);
  const hasHeader = /<th\b/i.test(inner);
  if (hasHeader && rows.length > 0) {
    return { type: 'table', headers: rows[0], rows: rows.slice(1) };
  }
  return { type: 'table', headers: [], rows };
}

function parseInto(html: string, blocks: PublishedBlock[], warnings: string[]) {
  const re = /<(h[1-3]|p|ul|ol|li|blockquote|pre|table|figure|img|div)\b([^>]*)>/gi;
  let cursor = 0;
  while (cursor < html.length) {
    re.lastIndex = cursor;
    const match = re.exec(html);
    if (!match) break;
    const tag = match[1].toLowerCase();
    const attrs = match[2] || '';
    const openEnd = re.lastIndex;
    if (tag === 'img' || /\/\s*$/.test(attrs.trim())) {
      if (tag === 'img') {
        const image = parseImg(attrs);
        if (image.type === 'img' && image.src) blocks.push(image);
      }
      cursor = openEnd;
      continue;
    }
    const close = findClosingTag(html, tag, openEnd);
    if (!close) {
      cursor = openEnd;
      continue;
    }
    const inner = html.slice(openEnd, close.contentEnd);
    cursor = close.tagEnd;
    if (tag === 'div' || tag === 'ul' || tag === 'ol') {
      parseInto(inner, blocks, warnings);
      continue;
    }
    if (tag === 'figure') {
      const before = blocks.length;
      parseInto(inner, blocks, warnings);
      const captionMatch = inner.match(/<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/i);
      const caption = captionMatch ? plainText(captionMatch[1] || '') : '';
      if (caption) {
        for (let index = blocks.length - 1; index >= before; index -= 1) {
          const block = blocks[index];
          if (block.type === 'img' && !block.caption) {
            block.caption = caption;
            break;
          }
        }
      }
      continue;
    }
    if (tag === 'h1' || tag === 'h2' || tag === 'h3') {
      const text = plainText(inner);
      if (!text) continue;
      blocks.push({ type: tag === 'h1' ? 'h2' : tag, text });
      continue;
    }
    if (tag === 'p') {
      pushRich(blocks, 'p', inner);
      continue;
    }
    if (tag === 'li') {
      pushRich(blocks, 'li', inner);
      continue;
    }
    if (tag === 'blockquote') {
      pushRich(blocks, 'quote', inner);
      continue;
    }
    if (tag === 'pre') {
      const text = decodeEntities(inner.replace(/<[^>]+>/g, '')).replace(/^\n/, '').replace(/\n$/, '');
      if (text.trim()) blocks.push({ type: 'code', text });
      continue;
    }
    if (tag === 'table') {
      if (/<img\b/i.test(inner)) warnings.push('表格里的图片没有单独导出，请把图片放在表格外面。');
      const table = parseTable(inner);
      if (table.type === 'table' && (table.headers.length > 0 || table.rows.length > 0)) blocks.push(table);
    }
  }
}

function attachCaptionParagraphs(blocks: PublishedBlock[]): PublishedBlock[] {
  const next: PublishedBlock[] = [];
  for (const block of blocks) {
    if (block.type === 'p') {
      const text = inlinePlain(block.inlines);
      const prev = next[next.length - 1];
      if (text.startsWith('▲') && prev?.type === 'img' && !prev.caption) {
        prev.caption = text;
        continue;
      }
    }
    next.push(block);
  }
  return next;
}

export function parseHomepageHtml(html: string): { blocks: PublishedBlock[]; warnings: string[] } {
  const warnings: string[] = [];
  const cleaned = (html || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
  const blocks: PublishedBlock[] = [];
  parseInto(cleaned, blocks, warnings);
  return { blocks: attachCaptionParagraphs(blocks), warnings };
}

function clip(text: string, max: number): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max).trim()}…`;
}

export function buildPublishedNote(input: {
  title: string;
  html: string;
  slug: string;
  date: string;
  kicker: string;
  credit: string;
  origin: string;
}): { note: PublishedNoteData; warnings: string[] } {
  const parsed = parseHomepageHtml(input.html);
  const title = (input.title || '').trim() || '未命名笔记';
  let blocks = parsed.blocks;
  if (blocks[0]?.type === 'h2' && blocks[0].text === title) blocks = blocks.slice(1);
  const firstParagraph = blocks.find((block) => block.type === 'p');
  const lede = firstParagraph && firstParagraph.type === 'p'
    ? clip(inlinePlain(firstParagraph.inlines), 220)
    : clip(plainText(input.html), 220);
  const creditBase = (input.credit || '').trim() || '同步自 content-publisher';
  const credit = creditBase.includes(input.date) ? creditBase : `${creditBase} · ${input.date}`;
  return {
    warnings: parsed.warnings,
    note: {
      title,
      description: clip(lede || title, 160),
      canonical: homepageNoteUrl(input.origin, input.slug),
      date: input.date,
      kicker: (input.kicker || '笔记').trim() || '笔记',
      lede,
      credit,
      blocks,
    },
  };
}

export function renderPublishedNoteComponent(): string {
  return `// ${PUBLISHED_NOTE_MARKER}
import type { ReactNode } from "react";
import Link from "next/link";
import { Header } from "./Header";

export type PublishedInline =
  | { type: "text"; text: string }
  | { type: "strong"; text: string }
  | { type: "em"; text: string }
  | { type: "code"; text: string }
  | { type: "link"; text: string; href: string };

export type PublishedBlock =
  | { type: "h2"; text: string }
  | { type: "h3"; text: string }
  | { type: "p"; inlines: PublishedInline[] }
  | { type: "li"; inlines: PublishedInline[] }
  | { type: "quote"; inlines: PublishedInline[] }
  | { type: "code"; text: string }
  | { type: "img"; src: string; alt: string; caption?: string }
  | { type: "table"; caption?: string; headers: string[]; rows: string[][] };

export type PublishedNoteData = {
  title: string;
  description: string;
  canonical: string;
  date: string;
  kicker: string;
  lede: string;
  credit: string;
  blocks: PublishedBlock[];
};

function InlineText({ inlines }: { inlines: PublishedInline[] }) {
  return (
    <>
      {inlines.map((item, index) => {
        if (item.type === "strong") return <strong key={index}>{item.text}</strong>;
        if (item.type === "em") return <em key={index}>{item.text}</em>;
        if (item.type === "code") return <code key={index}>{item.text}</code>;
        if (item.type === "link") {
          const external = /^https?:\\/\\//i.test(item.href);
          return (
            <a key={index} href={item.href} {...(external ? { target: "_blank", rel: "noreferrer" } : {})}>
              {item.text}
            </a>
          );
        }
        const lines = item.text.split("\\n");
        return (
          <span key={index}>
            {lines.map((line, lineIndex) => (
              <span key={lineIndex}>
                {lineIndex > 0 ? <br /> : null}
                {line}
              </span>
            ))}
          </span>
        );
      })}
    </>
  );
}

export function PublishedNote({ note }: { note: PublishedNoteData }) {
  const nodes: ReactNode[] = [];
  let index = 0;
  while (index < note.blocks.length) {
    const block = note.blocks[index];
    if (block.type === "li") {
      const items: Array<PublishedBlock & { type: "li" }> = [];
      while (index < note.blocks.length && note.blocks[index].type === "li") {
        items.push(note.blocks[index] as PublishedBlock & { type: "li" });
        index += 1;
      }
      nodes.push(
        <div className="work-list" key={\`list-\${index}\`}>
          {items.map((item, itemIndex) => (
            <article className="work-item" key={itemIndex}>
              <p className="work-year">{String(itemIndex + 1).padStart(2, "0")}</p>
              <div>
                <p>
                  <InlineText inlines={item.inlines} />
                </p>
              </div>
            </article>
          ))}
        </div>
      );
      continue;
    }
    if (block.type === "h2" || block.type === "h3") {
      const Tag = block.type;
      nodes.push(<Tag key={index}>{block.text}</Tag>);
    } else if (block.type === "p") {
      nodes.push(
        <p key={index}>
          <InlineText inlines={block.inlines} />
        </p>
      );
    } else if (block.type === "quote") {
      nodes.push(
        <blockquote className="note-item" key={index}>
          <p>
            <InlineText inlines={block.inlines} />
          </p>
        </blockquote>
      );
    } else if (block.type === "code") {
      nodes.push(
        <pre key={index}>
          <code>{block.text}</code>
        </pre>
      );
    } else if (block.type === "img") {
      nodes.push(
        <figure className="note-figure" key={index}>
          <img src={block.src} alt={block.alt} />
          {block.caption ? <figcaption>{block.caption}</figcaption> : null}
        </figure>
      );
    } else if (block.type === "table") {
      nodes.push(
        <div className="note-table-wrap" key={index}>
          <table className="note-table">
            {block.caption ? <caption>{block.caption}</caption> : null}
            {block.headers.length > 0 ? (
              <thead>
                <tr>
                  {block.headers.map((header, headerIndex) => (
                    <th key={headerIndex}>{header}</th>
                  ))}
                </tr>
              </thead>
            ) : null}
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    index += 1;
  }

  return (
    <>
      <Header lang="zh" current="/" />
      <main id="main">
        <section className="shell hero">
          <p className="hero-spine">调研笔记 · {note.date}</p>
          <div>
            <p className="kicker">{note.kicker}</p>
            <h1>{note.title}</h1>
            {note.lede ? <p className="lede">{note.lede}</p> : null}
          </div>
        </section>
        <section className="shell section">
          <div className="prose">{nodes}</div>
          <p className="source-line">{note.credit}</p>
          <p>
            <Link className="btn ghost" href="/">
              返回主页
            </Link>
          </p>
        </section>
      </main>
    </>
  );
}
`;
}

export function renderNotePageSource(note: PublishedNoteData): string {
  return `import type { Metadata } from "next";
import { PublishedNote, type PublishedNoteData } from "../../../components/PublishedNote";

const note = ${JSON.stringify(note, null, 2)} satisfies PublishedNoteData;

export const metadata: Metadata = {
  title: note.title.includes("Hobson") ? note.title : \`\${note.title} — Hobson\`,
  description: note.description,
  alternates: { canonical: note.canonical },
};

export default function Page() {
  return <PublishedNote note={note} />;
}
`;
}

function renderLatestArticle(entry: LatestNoteEntry): string {
  const month = entry.date.slice(0, 7);
  return `              <article className="work-item" data-publisher-slug=${JSON.stringify(entry.slug)}>
                <p className="work-year">{${JSON.stringify(month)}}</p>
                <div>
                  <h3>
                    <Link href=${JSON.stringify(`/notes/${entry.slug}`)}>{${JSON.stringify(entry.title)}}</Link>
                  </h3>
                  <p>{${JSON.stringify(entry.summary)}}</p>
                </div>
                <p className="work-tag">{${JSON.stringify(entry.kicker)}}</p>
              </article>`;
}

const LATEST_NOTES_DATA = 'content-publisher:latest-notes-data:';

function encodeEntries(entries: LatestNoteEntry[]): string {
  const bytes = new TextEncoder().encode(JSON.stringify(entries));
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function decodeEntries(payload: string): LatestNoteEntry[] {
  try {
    const binary = atob(payload.trim());
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as LatestNoteEntry[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => Boolean(item) && typeof item.slug === 'string' && typeof item.title === 'string');
  } catch {
    return [];
  }
}

function renderManagedNotes(entries: LatestNoteEntry[]): string {
  const articles = entries.map((item) => renderLatestArticle(item)).join('\n');
  return `${LATEST_NOTES_START}
              {/* ${LATEST_NOTES_DATA}${encodeEntries(entries)} */}
${articles}
              ${LATEST_NOTES_END}
`;
}

export function upsertHomepageLatestNote(source: string, entry: LatestNoteEntry, maxNotes = 8): string {
  if (source.includes(LATEST_NOTES_START) && source.includes(LATEST_NOTES_END)) {
    const start = source.indexOf(LATEST_NOTES_START);
    const end = source.indexOf(LATEST_NOTES_END);
    if (end < start) throw new Error('HomeView.tsx 里的最新文章标记不完整。');
    const existingBlock = source.slice(start, end);
    const dataMatch = existingBlock.match(/content-publisher:latest-notes-data:([A-Za-z0-9+/=]+)/);
    const existing = dataMatch ? decodeEntries(dataMatch[1]) : [];
    const next = [entry, ...existing.filter((item) => item.slug !== entry.slug)].slice(0, maxNotes);
    return `${source.slice(0, start)}${renderManagedNotes(next)}${source.slice(end + LATEST_NOTES_END.length)}`;
  }

  const heading = source.indexOf('>最新文章<');
  if (heading < 0) {
    throw new Error('HomeView.tsx 里没有「最新文章」区块，无法把笔记列到主页。');
  }
  const listStart = source.indexOf('<div className="work-list">', heading);
  if (listStart < 0) {
    throw new Error('「最新文章」下面没有 work-list，无法插入笔记入口。');
  }
  const insertAt = listStart + '<div className="work-list">'.length;
  return `${source.slice(0, insertAt)}\n              ${renderManagedNotes([entry])}${source.slice(insertAt)}`;
}

export function summaryFromNote(note: PublishedNoteData): string {
  return clip(note.lede || note.description || note.title, 90);
}
