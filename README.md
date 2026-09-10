# Content Publisher

面向个人创作者的本地内容工作台：管理选题、素材、草稿与发布记录，并通过可选集成把内容同步到小红书、微信公众号、墨问和 Obsidian。

## 功能

- 内容、项目、素材和发布日历管理
- 富文本编辑、排版模板与多平台预览
- AI 生成、润色和系列内容规划
- 小红书 MCP、微信公众号、墨问及 Obsidian 集成
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

完整示例见 `.env.example`。不要提交 `.env`、Cookie、浏览器配置、数据库、上传素材或运行日志。

### 小红书 MCP

仓库中的辅助脚本预期本机已安装 `xiaohongshu-mcp`、`jq` 和 `rg`：

```bash
XHS_MCP_BIN=/path/to/xiaohongshu-mcp ./scripts/start-xiaohongshu-mcp.sh
```

macOS 用户也可以运行 `./scripts/install-xiaohongshu-mcp-launchd.sh` 创建当前用户的 LaunchAgent。

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
