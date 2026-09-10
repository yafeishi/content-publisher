export const AGENT_SUBMIT_PAGE_PATH = '/agent-submit';
export const AGENT_SUBMIT_API_PATH = '/api/agent-submit';
export const DEFAULT_AGENT_SUBMIT_ORIGIN = 'http://localhost:13847';

export function buildAgentSubmitPageUrl(origin: string) {
  return `${origin}${AGENT_SUBMIT_PAGE_PATH}`;
}

export function buildAgentSubmitApiUrl(origin: string) {
  return `${origin}${AGENT_SUBMIT_API_PATH}`;
}

export function buildAgentSubmitPrompt(origin: string) {
  const pageUrl = buildAgentSubmitPageUrl(origin);
  const apiUrl = buildAgentSubmitApiUrl(origin);

  return [
    '请先打开这份 Agent 内容接入说明：',
    pageUrl,
    '',
    '然后按页面里的协议，把整理好的内容写回系统。',
    '',
    '提交要求：',
    `1. 使用 POST ${apiUrl}。`,
    '2. 优先直接传 markdown。',
    '3. 尽量一次带上 title、正文、封面图、正文图片、排版模板、项目归属、目标平台。',
    '4. 如果图片要进入正文，就把图片放进 markdown，或者传 images 并开启 appendImagesToBody。',
  ].join('\n');
}

export function buildAgentSubmitShortPrompt(origin: string) {
  const pageUrl = buildAgentSubmitPageUrl(origin);
  return `请按这份说明把整理好的内容写回系统：${pageUrl}`;
}
