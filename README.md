# WeChat Rank Public

一个只读的 AI 公众号热榜展示站，用来展示 AI 领域公众号文章的热度、互动和超常发挥情况。

这个仓库是公开展示版，只保留热榜浏览、筛选搜索和文章详情预览。采集、账号管理、收藏、日报、邮件、后台设置、数据源和生产后台代码不包含在本仓库中。

## 直接访问

如果只是想查看线上热榜，直接打开：

```text
https://wechat-rank-public.vercel.app
```

## 功能

- 日榜、周榜、月榜
- 综合热度、超常发挥、互动质量三种排序
- 按 AI 领域、文章类型、标题关键词、公众号名称筛选
- 查看文章详情和原文链接
- 只读访问 Supabase 数据

## 自行部署是什么意思

自行部署是指：你可以把这个公开前台部署成自己的一个网站。

但这个仓库只提供展示层，不提供数据采集后台，也不提供任何现成数据。你需要自己准备一个兼容的数据源，否则网站没有热榜内容可展示。

适合自行部署的人：

- 已经有自己的 Supabase 项目
- 已经有 `articles`、`accounts`、`settings` 等兼容表结构
- 已经有自己的数据采集或导入流程
- 只需要一个只读前台展示这些数据

不适合的情况：

- 期望这个仓库自动采集公众号数据
- 期望拿到完整后台系统
- 期望连接作者的生产数据库

## 不包含什么

- 不包含公众号采集逻辑
- 不包含账号管理后台
- 不包含收藏、日报、邮件发送
- 不包含后台设置页面
- 不包含 `service role` 高权限数据库访问
- 不包含作者的 Supabase 数据和环境变量

## 环境变量

只有自行部署时才需要配置环境变量。普通访问线上示例不需要配置任何东西。

自行部署需要配置 Supabase 的公开读取信息：

```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_publishable_or_anon_key
```

不要在公开部署中配置 `SUPABASE_SERVICE_ROLE_KEY`。

如果使用 Vercel，建议只给 Production 和 Preview 配置上面两个变量。

## 本地运行

```bash
npm install
npm run dev
```

打开：

```text
http://localhost:3000
```

## 数据要求

自行部署时，项目会读取以下只读数据：

- `articles`
- `accounts`
- `settings` 中的 `algorithm.minRead`

如果使用 Supabase RLS，请给匿名角色配置必要的 `SELECT` 权限。

核心字段包括：

- `articles.title`
- `articles.url`
- `articles.content`
- `articles.publish_time`
- `articles.read_count`
- `articles.like_count`
- `articles.wow_count`
- `articles.share_count`
- `articles.comment_count`
- `articles.favorite_count`
- `articles.outperform_index`
- `articles.engagement_score`
- `articles.heat_score`
- `articles.ai_category`
- `articles.article_type`
- `accounts.name`
- `accounts.avatar_url`
- `accounts.description`

## 部署

推荐部署到 Vercel，并只配置上面的两个环境变量。

```bash
npm run build
```

## 说明

这个仓库不包含后台采集和管理逻辑。它适合作为公开链接或产品展示页使用，不适合作为完整后台系统直接运行。

## License

MIT
