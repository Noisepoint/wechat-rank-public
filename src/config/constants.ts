// 榜单周期选项
export const PERIOD_OPTIONS = [
  { value: 'day', label: '日榜' },
  { value: 'week', label: '周榜' },
  { value: 'month', label: '月榜' },
] as const;

// 榜单类型选项
export const RANK_TYPE_OPTIONS = [
  { value: 'heat', label: '综合热度榜' },
  { value: 'outperform', label: '超常发挥榜' },
  { value: 'engagement', label: '互动质量榜' },
] as const;

// 导航菜单
export const NAV_ITEMS = [
  { href: '/', label: '热榜', icon: 'Flame' },
] as const;
