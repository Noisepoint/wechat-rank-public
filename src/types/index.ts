// 公众号账号
export interface Account {
  id: string;
  name: string;
  wechat_id: string | null;
  biz: string | null;
  avatar_url: string | null;
  description: string | null;
  is_preset: boolean;
  created_at: string;
  updated_at: string;
}

// 文章
export interface Article {
  id: string;
  account_id: string;
  title: string;
  url: string;
  content: string | null;
  publish_time: string | null;

  // 互动数据
  read_count: number;
  like_count: number;
  wow_count: number;
  share_count: number;
  comment_count: number;
  favorite_count: number;

  // 计算字段
  outperform_index: number;
  engagement_score: number;
  heat_score: number;

  // 分类
  ai_category: string | null;
  article_type: string | null;
  category_manual: boolean;

  created_at: string;
  updated_at: string;

  // 关联数据（查询时join）
  account?: Account;
  is_favorited?: boolean;
}

// 收藏
export interface Favorite {
  id: string;
  article_id: string;
  note: string | null;
  created_at: string;
  article?: Article;
}

// 设置
export interface Settings {
  algorithm: AlgorithmConfig;
  email: EmailConfig;
  cron: CronConfig;
}

export interface AlgorithmConfig {
  w1: number;  // 点赞权重
  w2: number;  // 在看权重
  w3: number;  // 评论权重
  w4: number;  // 收藏权重
  w5: number;  // 转发权重
  minRead: number;  // 入榜门槛
}

export interface EmailConfig {
  time: string;
  address: string;
  enabled: boolean;
}

export interface CronConfig {
  time: string;
}

// API用量
export interface ApiUsage {
  id: string;
  date: string;
  call_count: number;
  cost: number;
  created_at: string;
}

// 榜单类型
export type RankType = 'outperform' | 'engagement' | 'heat';
export type PeriodType = 'day' | 'week' | 'month';

// API响应
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
