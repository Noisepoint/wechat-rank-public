# WeChat Rank Public

一个只读的 AI 公众号热榜展示站。

这个仓库是公开展示版，只保留热榜浏览、筛选搜索和文章详情预览。采集、账号管理、收藏、日报、邮件、后台设置等能力不包含在本仓库中。

线上示例：

```text
https://wechat-rank-public.vercel.app
```

## 功能

- 日榜、周榜、月榜
- 综合热度、超常发挥、互动质量三种排序
- 按 AI 领域、文章类型、标题关键词、公众号名称筛选
- 查看文章详情和原文链接
- 只读访问 Supabase 数据

## 环境变量

只需要配置 Supabase 的公开读取信息：

```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_publishable_or_anon_key
```

不要在公开部署中配置 `SUPABASE_SERVICE_ROLE_KEY`。

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

项目会读取以下只读数据：

- `articles`
- `accounts`
- `settings` 中的 `algorithm.minRead`

如果使用 Supabase RLS，请给匿名角色配置必要的 `SELECT` 权限。

## 部署

推荐部署到 Vercel，并只配置上面的两个环境变量。

```bash
npm run build
```

## 说明

这个仓库不包含后台采集和管理逻辑。它适合作为公开链接或产品展示页使用，不适合作为完整后台系统直接运行。
