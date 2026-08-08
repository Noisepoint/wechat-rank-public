import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { getDayStartIsoDaysAgo, getIsoDaysAgo } from '@/lib/date';
import type { PeriodType, RankType } from '@/types';

function getDateRange(period: PeriodType): string {
  switch (period) {
    case 'day':
      // 日榜：过去24小时（滚动窗口）
      return getIsoDaysAgo(1);
    case 'week':
      // 周榜：口径C（自然日窗口：从今天往前推7天的00:00开始）
      return getDayStartIsoDaysAgo(7);
    case 'month':
      // 月榜：自然日窗口（从今天往前推30天的00:00开始）
      return getDayStartIsoDaysAgo(30);
  }
}

function getSortField(rankType: RankType): string {
  switch (rankType) {
    case 'outperform':
      return 'outperform_index';
    case 'engagement':
      return 'engagement_score';
    case 'heat':
    default:
      return 'heat_score';
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const period = (searchParams.get('period') || 'day') as PeriodType;
  const rankType = (searchParams.get('rankType') || 'heat') as RankType;
  const category = searchParams.get('category') || '';
  const type = searchParams.get('type') || '';
  const keyword = searchParams.get('keyword') || '';
  const account = searchParams.get('account') || '';

  const supabase = createServerClient();

  try {
    // 获取算法设置中的入榜门槛（与热榜保持一致）
    const { data: algorithmSetting } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'algorithm')
      .single();

    const minRead = algorithmSetting?.value?.minRead ?? 1000;

    let query = supabase
      .from('articles')
      .select(
        `
        *,
        account:accounts(name)
      `
      )
      .gte('publish_time', getDateRange(period))
      .gte('read_count', minRead)
      .order(getSortField(rankType), { ascending: false })
      .limit(500);

    if (category && category !== '全部') {
      query = query.eq('ai_category', category);
    }
    if (type && type !== '全部') {
      query = query.eq('article_type', type);
    }
    if (keyword) {
      query = query.ilike('title', `%${keyword}%`);
    }

    if (account) {
      const { data: accountData, error: accountError } = await supabase
        .from('accounts')
        .select('id')
        .ilike('name', `%${account}%`);

      if (accountError) throw accountError;

      if (accountData && accountData.length > 0) {
        const accountIds = accountData.map((a) => a.id);
        query = query.in('account_id', accountIds);
      } else {
        // 没有匹配账号：返回只有表头的空 CSV
        const emptyHeaders = [
          '排名',
          '标题',
          '公众号',
          '阅读量',
          '点赞',
          '在看',
          '转发',
          '评论',
          '收藏',
          '超常指数',
          '互动分',
          '热度分',
          'AI领域',
          '文章类型',
          '发布时间',
          '链接',
        ];

        const bom = '\uFEFF';
        const csv = emptyHeaders.join(',') + '\r\n';
        return new NextResponse(bom + csv, {
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="articles-${period}-${new Date().toISOString().split('T')[0]}.csv"`,
          },
        });
      }
    }

    const { data: articles, error } = await query;

    if (error) throw error;

    const escapeCsvCell = (value: unknown) => {
      if (value === null || value === undefined) return '';
      const str = String(value).replace(/\r?\n/g, ' ');
      if (/[",\n]/.test(str)) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    // 生成CSV
    const headers = [
      '排名',
      '标题',
      '公众号',
      '阅读量',
      '点赞',
      '在看',
      '转发',
      '评论',
      '收藏',
      '超常指数',
      '互动分',
      '热度分',
      'AI领域',
      '文章类型',
      '发布时间',
      '链接',
    ];

    const rows = (articles || []).map((article, index) => [
      index + 1,
      article.title || '',
      article.account?.name || '未知',
      article.read_count,
      article.like_count,
      article.wow_count,
      article.share_count ?? 0,
      article.comment_count,
      article.favorite_count,
      article.outperform_index,
      article.engagement_score,
      article.heat_score,
      article.ai_category || '',
      article.article_type || '',
      article.publish_time || '',
      article.url || '',
    ]);

    const csv = [headers, ...rows].map((row) => row.map(escapeCsvCell).join(',')).join('\r\n');

    // 添加BOM以支持Excel正确显示中文
    const bom = '\uFEFF';

    return new NextResponse(bom + csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="articles-${period}-${new Date().toISOString().split('T')[0]}.csv"`,
      },
    });
  } catch (error) {
    console.error('导出失败:', error);
    return NextResponse.json({ success: false, error: '导出失败' }, { status: 500 });
  }
}
