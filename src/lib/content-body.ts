const EDITOR_IMAGE_CLASS = 'rounded-lg max-w-full mx-auto my-4';

export function parseImagesJson(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  try {
    const arr = JSON.parse(value);
    return Array.isArray(arr) ? arr.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

export function extractImagePathsFromHtml(html: string): string[] {
  if (!html) return [];
  const found = new Set<string>();
  const regex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    const src = (match[1] || '').trim();
    if (!src) continue;

    if (src.startsWith('/')) {
      found.add(src);
      continue;
    }
    const localMatch = src.match(/^https?:\/\/[^/]+(\/uploads\/[^?#]+)/i);
    if (localMatch?.[1]) {
      found.add(localMatch[1]);
    }
  }
  return Array.from(found);
}

export function mergeImagePaths(...groups: string[][]): string[] {
  const merged = new Set<string>();
  for (const group of groups) {
    for (const path of group) {
      if (path && typeof path === 'string') merged.add(path);
    }
  }
  return Array.from(merged);
}

function buildEditorImageHtml(src: string, alt = 'image') {
  const safeSrc = src.replace(/"/g, '&quot;');
  const safeAlt = alt.replace(/"/g, '&quot;');
  return `<img class="${EDITOR_IMAGE_CLASS}" src="${safeSrc}" alt="${safeAlt}">`;
}

function splitNarrativeParagraphs(text: string): string[] {
  const normalized = text
    .replace(/\s*(折腾了一个月之后)/g, '\n\n$1')
    .replace(/\s*(如果大家感兴趣)/g, '\n\n$1')
    .replace(/\s*(后续)/g, '\n\n$1')
    .replace(/\s*(目前我和爱人)/g, '\n\n$1')
    .replace(/\s*(我们还把)/g, '\n\n$1')
    .replace(/\s*(不管是)/g, '\n\n$1');

  return normalized
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function findNarrativeSplitIndex(text: string): number {
  const markers = [
    '折腾了一个月之后',
    '如果大家感兴趣',
    '后续',
    '目前我和爱人',
    '我们还把',
    '不管是',
  ];

  const indexes = markers
    .map((marker) => text.indexOf(marker))
    .filter((index) => index >= 0);

  return indexes.length > 0 ? Math.min(...indexes) : -1;
}

function repairCollapsedParagraphHtml(html: string): string | null {
  const trimmed = html.trim();
  const singleParagraphMatch = trimmed.match(/^<p[^>]*>([\s\S]*)<\/p>\s*$/i);
  if (!singleParagraphMatch) return null;

  const inner = singleParagraphMatch[1].trim();
  if (/<(img|h[1-6]|ul|ol|li|blockquote|pre|hr|table)\b/i.test(inner)) {
    return null;
  }

  const listMatches = Array.from(
    inner.matchAll(/(\d+)\.\s*<strong>([\s\S]*?)<\/strong>：([\s\S]*?)(?=(?:\d+\.\s*<strong>)|$)/g)
  );

  if (listMatches.length < 2) {
    return null;
  }

  const introIndex = inner.indexOf(listMatches[0][0]);
  const intro = introIndex > 0 ? inner.slice(0, introIndex).trim() : '';

  let trailingNarrative = '';
  const listItems = listMatches.map((match, index) => {
    let description = (match[3] || '').trim();
    if (index === listMatches.length - 1) {
      const splitIndex = findNarrativeSplitIndex(description);
      if (splitIndex > 0) {
        trailingNarrative = description.slice(splitIndex).trim();
        description = description.slice(0, splitIndex).trim();
      }
    }
    return `<li><p><strong>${match[2].trim()}</strong>：${description}</p></li>`;
  });

  const sections: string[] = [];
  if (intro) {
    sections.push(`<p>${intro}</p>`);
  }
  sections.push(`<ol>${listItems.join('')}</ol>`);

  if (trailingNarrative) {
    sections.push(...splitNarrativeParagraphs(trailingNarrative).map((item) => `<p>${item}</p>`));
  }

  return sections.join('');
}

export function normalizeStoredBody(
  body: string,
  storedImages: string[] = [],
  coverImage: string | null = null
): string {
  let nextBody = body || '';
  const repairedBody = repairCollapsedParagraphHtml(nextBody);

  if (repairedBody) {
    nextBody = repairedBody;
  }

  if (repairedBody && !/<img\b/i.test(nextBody)) {
    const leadImage = coverImage || storedImages[0];
    if (leadImage) {
      nextBody = `${buildEditorImageHtml(leadImage, 'cover')}${nextBody}`;
    }
  }

  return nextBody;
}
