/**
 * 时间窗口工具函数
 *
 * 说明：
 * - “自然日”口径以服务端运行环境的本地时区为准（即 Date 的本地时区行为）。
 * - 返回值统一使用 ISO 字符串，方便传给 Supabase / wechat2rss 的 after 参数。
 */

// 过去 N 天（滚动窗口：精确到当前时刻）
export function getIsoDaysAgo(daysAgo: number): string {
  const safeDays = Number.isFinite(daysAgo) ? Math.max(0, Math.floor(daysAgo)) : 0;
  const date = new Date();
  date.setDate(date.getDate() - safeDays);
  return date.toISOString();
}

// 过去 N 天（自然日窗口：起点为“今天往前推 N 天”的 00:00）
export function getDayStartIsoDaysAgo(daysAgo: number): string {
  const safeDays = Number.isFinite(daysAgo) ? Math.max(0, Math.floor(daysAgo)) : 0;
  const date = new Date();
  date.setDate(date.getDate() - safeDays);
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

