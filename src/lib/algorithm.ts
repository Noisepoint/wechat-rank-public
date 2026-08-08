import type { AlgorithmConfig } from '@/types';

export const DEFAULT_CONFIG: AlgorithmConfig = {
  w1: 1,   // 点赞权重
  w2: 2,   // 在看权重
  w3: 5,   // 评论权重
  w4: 3,   // 收藏权重
  w5: 2,   // 转发权重
  minRead: 1000,  // 入榜门槛
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
    share_count?: number;
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
    (article.share_count ?? 0) * config.w5;

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
