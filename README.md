# Content Publisher

面向个人创作者的本地内容工作台：管理选题、素材、草稿与发布记录，并通过可选集成把内容同步到小红书、微信公众号、墨问、Obsidian 和个人主页 danghb.cn。

## 功能

- 内容、项目、素材和发布日历管理
- 富文本编辑、排版模板与多平台预览
- AI 生成、润色和系列内容规划
- 小红书 MCP、微信公众号、墨问、Obsidian 及 danghb.cn 个人主页集成
- 本地 SQLite 存储和平台健康检查
- Agent 内容提交与自动化录制接口

## 技术栈

- Next.js 16、React 19、TypeScript
- Prisma 5、SQLite
- TipTap、Tailwind CSS、Radix UI

## 快速开始

### 环境要求

- Node.js 20+
- npm 10+

### 安装

```bash
git clone <your-repository-url>
cd content-publisher
npm ci
cp .env.example .env
npx prisma generate
npx prisma db push
npm run dev
```

打开 <http://localhost:13847>。

基础内容管理只需要 `DATABASE_URL`。各发布平台和 AI 能力都是可选的；请在 `.env` 中配置相应变量，并在应用设置页启用。

## 配置

| 变量 | 用途 | 是否必需 |
| --- | --- | --- |
| `DATABASE_URL` | Prisma SQLite 地址 | 是 |
| `OPENAI_API_KEY`、`OPENAI_BASE_URL` | OpenAI 兼容模型 | 否 |
| `CODEX_BIN`、`BUN_BIN` | 本地客户端和脚本命令 | 否 |
| `MCP_URL` | 小红书 MCP 地址 | 否 |
| `MOWEN_API_KEY` | 墨问发布 | 否 |
| `FREEIMAGE_API_KEY` | 墨问本地图片中转 | 否 |
| `WECHAT_APP_ID`、`WECHAT_APP_SECRET` | 微信公众号发布 | 否 |
| `HOMEPAGE_REPO_PATH` | 个人主页仓库路径，覆盖设置页 | 否 |
| `HOMEPAGE_GITHUB_TOKEN` | 推送 danghb.cn 仓库的 token，不要写入仓库 | 否 |
| `HOMEPAGE_GIT_NAME`、`HOMEPAGE_GIT_EMAIL` | 个人主页笔记的 git 提交身份 | 否 |

完整示例见 `.env.example`。不要提交 `.env`、Cookie、浏览器配置、数据库、上传素材或运行日志。

### 小红书 MCP

仓库中的辅助脚本预期本机已安装 `xiaohongshu-mcp`、`jq` 和 `rg`：

```bash
XHS_MCP_BIN=/path/to/xiaohongshu-mcp ./scripts/start-xiaohongshu-mcp.sh
```

macOS 用户也可以运行 `./scripts/install-xiaohongshu-mcp-launchd.sh` 创建当前用户的 LaunchAgent。

### 个人主页（danghb.cn）

笔记发布进静态站点仓库 [yafeishi/yafeishi.github.io](https://github.com/yafeishi/yafeishi.github.io)，不是 danghb.cn 的独立写入 API。仓库名 `hobson-homepage` 并不存在；本机目录有时仍叫 `hobson-homepage` 或 `danghb-homepage`。

启用步骤：

1. 克隆该仓库，在设置里打开「个人主页(danghb.cn)」，填本地路径。默认分支是 `master`，GitHub Pages 会在推送后执行 `next export`。
2. 需要自动推送时设置 `HOMEPAGE_GITHUB_TOKEN`（contents 写权限）。留空则使用本机 git 凭据。不要把 token 写进设置或提交到 git。
3. 发布方式可选：提交并推送、只开 Pull Request，或只写本地文件。
4. 给笔记加标签 `homepage-slug:hermes-ttft` 指定地址。没有该标签时，用标题里的英文和数字生成 slug。
5. 科技 / 出海 / 工具内容（Hobson 小党、霍普森小岛）可以同步。标题或标签命中「育儿 / 党哥育儿 / parenting / 亲子」时默认拒绝，避免育儿内容进入职业主页。
6. 成功后发布记录里的外部 ID 是 `https://danghb.cn/notes/<slug>/`。内容详情的「分发状态」会列出每个平台最近一次成功或失败。

本地冒烟：`npm run test:homepage`。它只用临时 git 仓库，不会推送到 danghb.cn。

## 常用命令

```bash
npm run dev       # 开发服务器，端口 13847
npm run build     # 生产构建
npm run start     # 启动生产服务
npm run lint      # 代码检查
```

## 安全边界

这是面向可信本机环境的单用户工具，目前没有内置登录、权限隔离或多租户安全设计。不要直接暴露到公网。数据库可能保存平台设置、发布内容和本地文件路径，应作为敏感数据处理。详见 `SECURITY.md`。

## 参与贡献

欢迎提交 Issue 和 Pull Request。提交前请运行 `npm run lint` 与 `npm run build`，并确认变更中不含密钥、Cookie、数据库或个人内容。

## 许可证

MIT，详见 `LICENSE`。
