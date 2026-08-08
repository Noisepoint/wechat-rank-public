# 公众号文章热度监测工具 - 技术开发规格文档 (SPEC)

> 本文档是AI开发的指导宪法，所有开发工作必须严格遵循本文档规范。
> 产品需求详见 [PRD.md](./PRD.md)

---

## 一、技术架构

### 1.1 技术栈
| 层级 | 技术选型 | 说明 |
|------|----------|------|
| 前端 | Next.js 16.1.6（React 19.2.3）+ TailwindCSS + shadcn/ui | App Router, 服务端渲染 |
| 后端 | Next.js API Routes | 全栈框架，无需单独后端 |
| 数据库 | Supabase (PostgreSQL) | 云数据库，免费额度足够 |
| 定时任务 | Vercel Cron / GitHub Actions | 每日定时采集 |
| 邮件服务 | Resend | 免费额度3000封/月 |
| 部署 | Vercel | 免费托管 |

### 1.2 项目结构
```
wechat-rank/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── page.tsx           # 热榜首页
│   │   ├── accounts/          # 公众号管理
│   │   │   └── page.tsx
│   │   ├── analysis/          # 标题分析
│   │   │   └── page.tsx
│   │   ├── report/            # 选题报告
│   │   │   └── page.tsx
│   │   ├── favorites/         # 收藏夹
│   │   │   └── page.tsx
│   │   ├── dashboard/         # 数据看板
│   │   │   └── page.tsx
│   │   ├── settings/          # 设置页
│   │   │   └── page.tsx
│   │   ├── layout.tsx         # 全局布局
│   │   └── api/               # API路由
│   │       ├── cron/
│   │       │   ├── collect/route.ts    # 数据采集
│   │       │   └── email/route.ts      # 邮件推送
│   │       ├── collect/
│   │       │   └── manual/route.ts     # 手动采集（立即采集全部）
│   │       ├── upstream/
│   │       │   └── wechat2rss/route.ts # 上游状态检查
│   │       ├── articles/
│   │       │   ├── route.ts            # 文章列表
│   │       │   ├── [id]/route.ts       # 文章详情
│   │       │   └── export/route.ts     # 导出CSV
│   │       ├── accounts/
│   │       │   ├── route.ts            # 账号列表/添加
│   │       │   ├── sync/route.ts       # 与 wechat2rss 对账同步
│   │       │   └── [id]/route.ts       # 删除账号
│   │       ├── favorites/
│   │       │   ├── route.ts            # 收藏列表/添加
│   │       │   └── [id]/route.ts       # 取消收藏
│   │       ├── report/route.ts         # 报告数据
│   │       ├── analysis/route.ts       # 标题分析数据
│   │       ├── dashboard/route.ts      # 看板数据
│   │       └── settings/route.ts       # 设置读写
│   ├── components/
│   │   ├── ui/                # shadcn/ui组件
│   │   └── ...
│   ├── lib/
│   │   ├── supabase.ts        # Supabase客户端
│   │   ├── wechat2rss.ts      # wechat2rss封装
│   │   ├── dajiala.ts         # 极致了API封装
│   │   ├── algorithm.ts       # 热度算法
│   │   ├── classifier.ts      # 分类器
│   │   ├── email.ts           # 邮件发送
│   │   └── utils.ts           # 工具函数
│   ├── types/
│   │   └── index.ts           # TypeScript类型定义
│   └── config/
│       ├── categories.ts      # 分类关键词配置
│       ├── presetAccounts.ts  # 预设账号列表
│       └── constants.ts       # 常量配置
├── public/
├── vercel.json
├── .env.local                 # 环境变量（不提交）
├── .env.example               # 环境变量示例
└── package.json
```

### 1.3 环境变量
```env
# .env.example

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx

# 极致了API
DAJIALA_API_KEY=xxx
DAJIALA_VERIFY_CODE=

# wechat2rss 私有部署
WECHAT2RSS_BASE_URL=http://localhost:1200
WECHAT2RSS_TOKEN=xxx

# Resend邮件
RESEND_API_KEY=re_xxx
EMAIL_TO=your@email.com

# Cron密钥（用于验证定时任务请求）
CRON_SECRET=xxx

# 手动采集密钥（生产环境用于保护“立即采集全部”按钮）
# 若未配置 MANUAL_COLLECT_SECRET，则手动采集会回退使用 CRON_SECRET
MANUAL_COLLECT_SECRET=xxx
```

---

## 二、数据库设计

### 2.1 数据表结构

在Supabase SQL编辑器执行以下SQL：

```sql
-- 公众号账号表
CREATE TABLE accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  wechat_id VARCHAR(100),
  biz VARCHAR(100),
  avatar_url TEXT,
  description TEXT,
  is_preset BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 文章表
CREATE TABLE articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
  title VARCHAR(500) NOT NULL,
  url TEXT NOT NULL UNIQUE,
  content TEXT,
  publish_time TIMESTAMPTZ,

  -- 互动数据
  read_count INTEGER DEFAULT 0,
  like_count INTEGER DEFAULT 0,
  wow_count INTEGER DEFAULT 0,
  share_count INTEGER DEFAULT 0,
  comment_count INTEGER DEFAULT 0,
  favorite_count INTEGER DEFAULT 0,

  -- 计算字段
  outperform_index DECIMAL(10,4) DEFAULT 0,
  engagement_score DECIMAL(10,4) DEFAULT 0,
  heat_score DECIMAL(10,4) DEFAULT 0,

  -- 分类
  ai_category VARCHAR(50),
  article_type VARCHAR(50),
  category_manual BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 收藏表
CREATE TABLE favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id UUID REFERENCES articles(id) ON DELETE CASCADE,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(article_id)
);

-- 设置表
CREATE TABLE settings (
  key VARCHAR(100) PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- API用量记录表
CREATE TABLE api_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL UNIQUE,
  call_count INTEGER DEFAULT 0,
  cost DECIMAL(10,4) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 插入默认设置
INSERT INTO settings (key, value) VALUES
('algorithm', '{"w1": 1, "w2": 2, "w3": 5, "w4": 3, "w5": 2, "minRead": 1000}'),
('email', '{"time": "08:00", "address": "", "enabled": true}'),
('cron', '{"time": "06:00"}');

-- 创建索引
CREATE INDEX idx_articles_account ON articles(account_id);
CREATE INDEX idx_articles_publish_time ON articles(publish_time DESC);
CREATE INDEX idx_articles_heat_score ON articles(heat_score DESC);
CREATE INDEX idx_articles_outperform ON articles(outperform_index DESC);
CREATE INDEX idx_articles_category ON articles(ai_category, article_type);
CREATE INDEX idx_articles_created ON articles(created_at DESC);

-- 创建更新时间触发器
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER accounts_updated_at
  BEFORE UPDATE ON accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER articles_updated_at
  BEFORE UPDATE ON articles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

---

## 三、核心模块实现

### 3.1 热度算法 (lib/algorithm.ts)

```typescript
export interface AlgorithmConfig {
  w1: number;  // 点赞权重，默认1
  w2: number;  // 在看权重，默认2
  w3: number;  // 评论权重，默认5
  w4: number;  // 收藏权重，默认3
  w5: number;  // 转发权重，默认2
  minRead: number;  // 入榜门槛，默认1000
}

export const DEFAULT_CONFIG: AlgorithmConfig = {
  w1: 1,
  w2: 2,
  w3: 5,
  w4: 3,
  w5: 2,
  minRead: 1000,
};

// 计算超常指数
export function calcOutperformIndex(
  readCount: number,
  avgReadCount: number
): number {
  if (avgReadCount <= 0) return 0;
  return Number((readCount / avgReadCount).toFixed(4));
}

// 计算互动质量分
export function calcEngagementScore(
  article: {
    like_count: number;
    wow_count: number;
    comment_count: number;
    favorite_count: number;
    share_count: number;
    read_count: number;
  },
  config: AlgorithmConfig = DEFAULT_CONFIG
): number {
  if (article.read_count <= 0) return 0;

  const weighted =
    article.like_count * config.w1 +
    article.wow_count * config.w2 +
    article.comment_count * config.w3 +
    article.favorite_count * config.w4 +
    article.share_count * config.w5;

  return Number(((weighted / article.read_count) * 1000).toFixed(4));
}

// 计算综合热度
export function calcHeatScore(
  outperformIndex: number,
  engagementScore: number
): number {
  return Number((outperformIndex * engagementScore).toFixed(4));
}

// 计算账号近14天篇均阅读
export function calcAvgReadCount(articles: { read_count: number }[]): number {
  if (articles.length === 0) return 0;
  const total = articles.reduce((sum, a) => sum + a.read_count, 0);
  return Math.round(total / articles.length);
}
```

### 3.2 分类器 (lib/classifier.ts)

```typescript
// AI细分领域关键词
const AI_CATEGORIES: Record<string, string[]> = {
  'AI写作': ['写作', '文案', 'copywriting', '写文章', '爆文', '文字'],
  'AI绘画/设计': ['绘画', 'Midjourney', 'MJ', 'SD', 'Stable Diffusion', '画图', '设计', 'DALL-E', '图片生成', '生图', '作图'],
  'AI编程': ['编程', 'Cursor', 'Copilot', '代码', '开发', '程序员', '编码', 'coding'],
  'AI办公/效率': ['办公', '效率', 'PPT', 'Excel', '自动化', '提效', '工作流', 'workflow'],
  'AI视频/音频': ['视频', '音频', 'Sora', '剪辑', '配音', 'TTS', '语音', '音乐'],
  'AI对话/聊天': ['ChatGPT', 'Claude', '对话', '聊天', 'GPT', '大模型', 'LLM', 'Gemini', 'Kimi', '豆包'],
};

// 文章类型关键词
const ARTICLE_TYPES: Record<string, string[]> = {
  '教程/攻略': ['教程', '攻略', '怎么', '如何', '手把手', '保姆级', '入门', '教你', '学会'],
  '工具推荐/测评': ['推荐', '测评', '盘点', '合集', '必备', '神器', '工具', '款', '个'],
  '行业资讯/新闻': ['发布', '官宣', '重磅', '最新', '刚刚', '突发', '上线', '更新'],
  '观点评论/分析': ['观点', '分析', '看法', '思考', '为什么', '深度', '解读', '趋势'],
  '案例拆解': ['案例', '拆解', '复盘', '实战', '实操', '赚钱', '变现'],
};

export function classify(title: string, content?: string): {
  aiCategory: string;
  articleType: string;
} {
  const text = (title + ' ' + (content || '')).toLowerCase();

  let aiCategory = '其他';
  let articleType = '其他';

  // 匹配AI领域
  for (const [category, keywords] of Object.entries(AI_CATEGORIES)) {
    if (keywords.some(kw => text.toLowerCase().includes(kw.toLowerCase()))) {
      aiCategory = category;
      break;
    }
  }

  // 匹配文章类型
  for (const [type, keywords] of Object.entries(ARTICLE_TYPES)) {
    if (keywords.some(kw => text.toLowerCase().includes(kw.toLowerCase()))) {
      articleType = type;
      break;
    }
  }

  return { aiCategory, articleType };
}

export { AI_CATEGORIES, ARTICLE_TYPES };
```

### 3.3 极致了API封装 (lib/dajiala.ts)

```typescript
const BASE_URL = 'https://www.dajiala.com/fbmain/monitor/v3';

interface DajialaResponse<T> {
  code: number;
  msg: string;
  data: T;
  cost_money?: number;
  remain_money?: number;
}

// Pro接口返回的完整互动数据
interface ReadZanProData {
  read: number;        // 阅读数
  zan: number;         // 点赞数
  looking: number;     // 在看数
  share_num: number;   // 转发数
  collect_num: number; // 收藏数
  comment_count: number; // 评论数（-1表示未开通评论）
}

// 获取文章完整互动数据（使用Pro接口，按次计费）
export async function getArticleStats(url: string): Promise<{
  read_count: number;
  like_count: number;
  wow_count: number;
  share_count: number;
  favorite_count: number;
  comment_count: number;
} | null> {
  try {
    const res = await fetch(`${BASE_URL}/read_zan_pro`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        key: process.env.DAJIALA_API_KEY,
        verifycode: process.env.DAJIALA_VERIFY_CODE || '',
      }),
    });

    const data: DajialaResponse<ReadZanProData> = await res.json();

    if (data.code !== 0) {
      console.error('极致了API错误:', data.msg);
      return null;
    }

    return {
      read_count: data.data.read,
      like_count: data.data.zan,
      wow_count: data.data.looking,
      share_count: data.data.share_num,
      favorite_count: data.data.collect_num,
      comment_count: data.data.comment_count === -1 ? 0 : data.data.comment_count,
    };
  } catch (error) {
    console.error('极致了API调用失败:', error);
    return null;
  }
}

// 记录API调用
export async function recordApiUsage(
  supabase: any,
  callCount: number = 1,
  // 单次调用成本请按实际单价配置；本文档为脱敏版，不披露具体金额
  costPerCall: number = 0
) {
  const today = new Date().toISOString().split('T')[0];

  await supabase.rpc('increment_api_usage', {
    p_date: today,
    p_count: callCount,
    p_cost: callCount * costPerCall,
  });
}
```

### 3.4 wechat2rss封装 (lib/wechat2rss.ts)

```typescript
const BASE_URL = process.env.WECHAT2RSS_BASE_URL || 'http://localhost:1200';
const TOKEN = process.env.WECHAT2RSS_TOKEN || '';

interface Wechat2RssArticle {
  biz_id: number;
  biz_name: string;
  title: string;
  desc: string;
  created: string;
  content?: string;
}

interface Wechat2RssAccount {
  id: number;
  name: string;
  link: string;
}

// 查询文章列表
export async function queryArticles(params: {
  bid?: string;
  after?: string;
  content?: boolean;
}): Promise<Wechat2RssArticle[]> {
  try {
    const searchParams = new URLSearchParams({ k: TOKEN });
    if (params.bid) searchParams.append('bid', params.bid);
    if (params.after) searchParams.append('after', params.after);
    if (params.content !== undefined) {
      searchParams.append('content', params.content ? '1' : '0');
    }

    const res = await fetch(`${BASE_URL}/api/query?${searchParams}`);
    const data = await res.json();

    if (data.err) {
      console.error('wechat2rss错误:', data.err);
      return [];
    }

    return data.data || [];
  } catch (error) {
    console.error('wechat2rss调用失败:', error);
    return [];
  }
}

// 获取已订阅公众号列表
export async function getAccountList(
  page: number = 1,
  size: number = 100
): Promise<{ accounts: Wechat2RssAccount[]; total: number }> {
  try {
    const res = await fetch(
      `${BASE_URL}/list?k=${TOKEN}&page=${page}&size=${size}`
    );
    const data = await res.json();

    if (data.err) {
      console.error('wechat2rss错误:', data.err);
      return { accounts: [], total: 0 };
    }

    return {
      accounts: data.data || [],
      total: data.meta?.total || 0,
    };
  } catch (error) {
    console.error('wechat2rss调用失败:', error);
    return { accounts: [], total: 0 };
  }
}

// 添加公众号订阅
export async function addAccount(id: string): Promise<string | null> {
  try {
    const res = await fetch(`${BASE_URL}/add/${id}?k=${TOKEN}`);
    const data = await res.json();

    if (data.err) {
      console.error('wechat2rss错误:', data.err);
      return null;
    }

    return data.data; // 返回订阅地址
  } catch (error) {
    console.error('wechat2rss调用失败:', error);
    return null;
  }
}

// 通过文章链接添加公众号订阅
export async function addAccountByUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(
      `${BASE_URL}/addurl?k=${TOKEN}&url=${encodeURIComponent(url)}`
    );
    const data = await res.json();

    if (data.err) {
      console.error('wechat2rss错误:', data.err);
      return null;
    }

    return data.data;
  } catch (error) {
    console.error('wechat2rss调用失败:', error);
    return null;
  }
}

// 删除公众号订阅
export async function deleteAccount(id: string): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/del/${id}?k=${TOKEN}`);
    const data = await res.json();
    return !data.err;
  } catch (error) {
    console.error('wechat2rss调用失败:', error);
    return false;
  }
}
```

### 3.5 Supabase RPC函数

在Supabase SQL编辑器添加：

```sql
-- API用量累加函数
CREATE OR REPLACE FUNCTION increment_api_usage(
  p_date DATE,
  p_count INTEGER,
  p_cost DECIMAL
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO api_usage (date, call_count, cost)
  VALUES (p_date, p_count, p_cost)
  ON CONFLICT (date)
  DO UPDATE SET
    call_count = api_usage.call_count + p_count,
    cost = api_usage.cost + p_cost;
END;
$$ LANGUAGE plpgsql;
```

---

## 四、API接口设计

### 4.1 文章相关

#### GET /api/articles
获取文章列表

**Query参数：**
| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| period | string | 否 | day | day/week/month |
| rankType | string | 否 | heat | outperform/engagement/heat |
| category | string | 否 | - | AI细分领域筛选 |
| type | string | 否 | - | 文章类型筛选 |
| keyword | string | 否 | - | 关键词搜索（标题） |
| account | string | 否 | - | 账号名搜索 |
| sort | string | 否 | desc | asc/desc |
| page | number | 否 | 1 | 页码 |
| limit | number | 否 | 20 | 每页数量 |

**响应示例：**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "uuid",
        "title": "文章标题",
        "url": "https://mp.weixin.qq.com/...",
        "accountName": "公众号名称",
        "accountId": "uuid",
        "publishTime": "2024-01-31T08:00:00Z",
        "readCount": 10000,
        "likeCount": 100,
        "wowCount": 50,
        "commentCount": 20,
        "favoriteCount": 30,
        "outperformIndex": 5.2,
        "engagementScore": 18.5,
        "heatScore": 96.2,
        "aiCategory": "AI写作",
        "articleType": "教程/攻略",
        "isFavorited": false
      }
    ],
    "total": 100,
    "page": 1,
    "limit": 20,
    "totalPages": 5
  }
}
```

#### GET /api/articles/[id]
获取文章详情（含正文）

#### GET /api/articles/export
导出文章列表为CSV

### 4.2 账号相关

#### GET /api/accounts
获取公众号列表

#### POST /api/accounts
添加公众号（只需文章链接，自动识别公众号名称）
```json
{
  "url": "任意一篇文章链接"
}
```
- 系统自动调用 wechat2rss 订阅该公众号
- 自动从文章中提取公众号名称
- 添加成功后自动触发历史数据采集

#### POST /api/accounts/sync
从 wechat2rss 同步账号（页面加载时自动调用）
- 自动拉取 wechat2rss 已订阅的公众号列表
- 对比本地数据库，新增未同步的账号
- 用于对账兜底：当 wechat2rss 后台已有订阅但工具未记录时，可一键补齐；日常新增/删除建议在工具侧操作

#### DELETE /api/accounts/[id]
删除公众号

### 4.3 收藏相关

#### GET /api/favorites
获取收藏列表

#### POST /api/favorites
添加收藏
```json
{
  "articleId": "uuid",
  "note": "备注（可选）"
}
```

#### DELETE /api/favorites/[id]
取消收藏

### 4.4 定时任务

#### POST /api/cron/collect
触发数据采集
- Header: `Authorization: Bearer {CRON_SECRET}`
- 采集逻辑：每次采集会回看最近7天文章列表防漏补；同时仅刷新最近7天文章的互动数据（减少成本/降低风控概率）
- “最近7天”口径（自然日，口径C）：从**今天往前推7天的00:00**开始（服务端时区），终点为当前时刻

#### POST /api/cron/email
触发邮件推送
- Header: `Authorization: Bearer {CRON_SECRET}`
- 邮件筛选门槛：读取 `settings.algorithm.minRead`（与热榜一致），未配置则默认 1000

#### POST /api/collect/manual
触发“立即采集全部”（手动采集入口）
- 生产环境校验管理员密钥：优先 `MANUAL_COLLECT_SECRET`，未配置则回退 `CRON_SECRET`
- Header: `x-collect-token: {MANUAL_COLLECT_SECRET}`（或 Body: `{"token":"..."}`）
- 本地开发环境通常无需填写密钥

#### POST /api/email/manual
触发“立即发送测试邮件”（手动邮件入口）
- 生产环境校验管理员密钥：优先 `MANUAL_COLLECT_SECRET`，未配置则回退 `CRON_SECRET`
- Header: `x-collect-token: {MANUAL_COLLECT_SECRET}`（或 Body: `{"token":"..."}`）
- 本地开发环境通常无需填写密钥
- 内部由服务端携带 `CRON_SECRET` 调用 `/api/cron/email`，避免在前端暴露密钥

#### GET /api/upstream/wechat2rss
检查 wechat2rss 上游可用性（用于风控/登录失效兜底提示）
- 返回：`healthy`、`riskLikely`、`message`、`checkedAt`

### 4.5 其他

#### GET /api/report?period=day|week
获取选题分析报告数据

#### GET /api/analysis?period=day|week|month
获取标题分析数据
- 只分析入榜文章（符合阅读量门槛），与热榜数据范围一致

#### GET /api/dashboard
获取看板数据

#### GET /api/settings
获取设置

#### PUT /api/settings
更新设置

---

## 五、开发任务拆分

### Phase 1: 基础架构搭建
| ID | 任务 | 验收标准 |
|----|------|----------|
| 1.1 | 创建Next.js项目 | 项目初始化，配置TailwindCSS和shadcn/ui |
| 1.2 | 配置Supabase | 数据库表创建完成，连接测试通过 |
| 1.3 | 配置环境变量 | .env.local配置完成，各服务可访问 |
| 1.4 | 创建基础布局 | Navbar、页面骨架完成 |

### Phase 2: 数据采集模块
| ID | 任务 | 验收标准 |
|----|------|----------|
| 2.1 | 极致了API封装 | 能获取文章列表和互动数据 |
| 2.2 | wechat2rss对接 | 能获取公众号RSS |
| 2.3 | 数据采集流程 | 完整采集流程可运行，数据入库 |
| 2.4 | 增量采集+周期更新 | 新文章入库，7天内旧文章每日更新数据 |
| 2.5 | API用量记录 | 每次调用记录到api_usage表 |
| 2.6 | 定时任务配置 | vercel.json配置cron，每日执行 |

### Phase 3: 热榜核心功能
| ID | 任务 | 验收标准 |
|----|------|----------|
| 3.1 | 热度算法实现 | 三个指数计算正确 |
| 3.2 | 分类器实现 | 自动分类准确率>70% |
| 3.3 | 文章列表API | 支持分页、筛选、排序、搜索 |
| 3.4 | 热榜首页UI | 列表展示，切换功能正常 |
| 3.5 | 文章预览弹窗 | 点击标题弹窗显示正文 |
| 3.6 | 导出CSV功能 | 导出数据完整正确 |

### Phase 4: 账号管理
| ID | 任务 | 验收标准 |
|----|------|----------|
| 4.1 | 账号列表页 | 展示所有账号 |
| 4.2 | 添加账号 | 添加后自动采集历史数据 |
| 4.3 | 删除账号 | 删除账号及关联文章 |
| 4.4 | 预设账号导入 | 批量导入预设列表 |

### Phase 5: 分类与筛选
| ID | 任务 | 验收标准 |
|----|------|----------|
| 5.1 | 筛选组件 | 下拉选择器联动正常 |
| 5.2 | 手动修正分类 | 可修改文章分类 |

### Phase 6: 选题报告
| ID | 任务 | 验收标准 |
|----|------|----------|
| 6.1 | 报告数据聚合 | 各模块数据计算正确 |
| 6.2 | 报告页面UI | 卡片布局，数据清晰 |
| 6.3 | 日报/周报切换 | 切换后数据正确 |

### Phase 7: 邮件推送
| ID | 任务 | 验收标准 |
|----|------|----------|
| 7.1 | Resend配置 | 邮件发送成功 |
| 7.2 | 邮件模板 | Top10摘要模板 |
| 7.3 | 爆文提醒 | 超常指数>阈值时触发 |
| 7.4 | 定时推送 | 按配置时间推送 |

### Phase 8: 增强功能
| ID | 任务 | 验收标准 |
|----|------|----------|
| 8.1 | 标题分析-词云 | 词云展示正常 |
| 8.2 | 标题分析-套路 | 套路排行展示 |
| 8.3 | 收藏夹功能 | 收藏/取消/备注完整 |
| 8.4 | 数据看板 | 统计卡片和图表展示 |
| 8.5 | 设置页 | 所有配置可编辑保存 |

---

## 六、验收标准清单

### 6.1 数据采集
- [ ] 极致了API能正常获取互动数据
- [ ] 数据完整存入数据库（所有字段）
- [ ] 新文章正确入库，不重复插入
- [ ] 7天内旧文章每日自动更新互动数据（保证周榜准确）
- [ ] 每次采集会回看最近7天文章列表，自动补齐漏文（手动采集/定时采集一致）
- [ ] 转发数（share_count）可采集、入库并用于热度算法/列表展示/CSV导出
- [ ] 定时任务每日自动执行
- [ ] API用量正确记录

### 6.2 热榜功能
- [ ] 日榜/周榜/月榜数据时间范围正确
- [ ] 超常榜/互动榜/综合榜排序正确
- [ ] 分类筛选生效
- [ ] 关键词搜索生效（标题模糊匹配）
- [ ] 账号搜索生效
- [ ] 升序/倒序切换生效
- [ ] 分页正常工作
- [ ] CSV导出数据完整
- [ ] 正文预览弹窗正常加载

### 6.3 账号管理
- [ ] 账号列表正确展示
- [ ] 添加账号成功，触发历史数据采集
- [ ] 删除账号成功，关联数据级联删除
- [ ] 预设账号可一键导入

### 6.4 报告功能
- [ ] 日报数据聚合正确
- [ ] 周报数据聚合正确
- [ ] 各模块展示完整
- [ ] 趋势对比正确

### 6.5 邮件推送
- [ ] 邮件能正常发送到配置邮箱
- [ ] Top10热文摘要内容正确
- [ ] 爆文提醒阈值判断正确
- [ ] 定时推送时间准确

### 6.6 设置功能
- [ ] 算法参数可配置并立即生效
- [ ] 邮件配置可保存
- [ ] 采集/推送时间可保存（记录用；线上触发时间以 vercel.json 为准）

---

## 七、外部服务配置指南

### 7.1 Supabase配置
1. 创建项目：https://supabase.com/dashboard
2. 获取URL和Key：Settings → API
3. 执行SQL创建表结构

### 7.2 极致了API配置
1. 注册：https://www.dajiala.com/
2. 充值获取API Key
3. API文档：https://s.apifox.cn/410674f9-f451-4b4f-957a-5f54f243bc83

### 7.3 Resend配置
1. 注册：https://resend.com/
2. 创建API Key
3. 验证发送域名（可选）

### 7.4 Vercel部署
1. 连接GitHub仓库
2. 配置环境变量
3. 配置Cron（vercel.json）：
```json
{
  "crons": [
    {
      "path": "/api/cron/collect",
      "schedule": "0 1 * * *"
    },
    {
      "path": "/api/cron/email",
      "schedule": "0 12 * * *"
    }
  ]
}
```
说明：Vercel Cron 的 `schedule` 通常按 UTC 执行。若你希望按北京时间运行，需要自行换算（例如北京 09:00 → UTC 01:00）。

---

## 八、注意事项

### 8.1 API调用优化
- 新文章增量采集，7天内旧文章每日更新数据
- 失败重试最多3次，间隔递增
- 记录每次调用到api_usage表

### 8.2 错误处理
- API调用失败要有降级方案
- 用户操作要有Toast错误提示
- 定时任务失败要记录日志

### 8.3 性能优化
- 列表使用分页，默认20条
- 数据库查询使用索引字段
- 正文内容懒加载（点击时获取）

### 8.4 安全
- 环境变量不提交到代码库
- Cron接口验证CRON_SECRET
- Supabase启用RLS（可选）

---

## 附录A：预设公众号名单

> 不预设账号，用户上线后在管理页自行添加。

```typescript
// config/presetAccounts.ts
export const PRESET_ACCOUNTS: { name: string; wechat_id: string }[] = [];
// 用户可在公众号管理页随时添加/删除账号
```

---

## 更新日志

| 版本 | 日期 | 更新内容 |
|------|------|----------|
| v1.0 | 2025-01-31 | 初始版本 |
| v1.1 | 2025-01-31 | 更新极致了API为Pro版；新增wechat2rss封装；明确数据采集流程 |
| v1.2 | 2025-02-03 | 添加公众号简化为只需链接；新增wechat2rss双向同步；标题分析限定为入榜文章 |
| v1.3 | 2026-02-05 | 明确以工具后台为准维护公众号；新增手动采集入口与上游状态检查；补充手动采集密钥与对账同步说明；同步实际目录结构与版本信息 |
| v1.4 | 2026-02-05 | 采集防漏补（回看近7天补齐漏文）；新增转发字段并纳入算法/展示/导出；修复热榜页回车搜索；导出CSV格式优化（个别浏览器下载文件名/打开体验可能仍需排查） |
| v1.5 | 2026-02-05 | “最近7天”口径统一为自然日口径C（起点=今天往前推7天00:00），用于采集/周榜范围一致 |
| v1.6 | 2026-02-06 | Vercel Cron 触发时间更新（采集/邮件）；邮件筛选门槛改为读取算法配置 minRead；新增手动发送测试邮件入口；补充 UTC 换算说明 |
