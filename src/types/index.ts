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
