import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { getDayStartIsoDaysAgo, getIsoDaysAgo } from '@/lib/date';
import type { PeriodType, RankType } from '@/types';

// 获取时间范围
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

// 获取排序字段
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

  // 解析查询参数
  const period = (searchParams.get('period') || 'day') as PeriodType;
  const rankType = (searchParams.get('rankType') || 'heat') as RankType;
  const category = searchParams.get('category') || '';
  const type = searchParams.get('type') || '';
  const keyword = searchParams.get('keyword') || '';
  const account = searchParams.get('account') || '';
  const sort = searchParams.get('sort') || 'desc';
  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = parseInt(searchParams.get('limit') || '20', 10);

  const supabase = createServerClient();

  try {
    // 获取算法设置中的入榜门槛
    const { data: algorithmSetting } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'algorithm')
      .single();

    const minRead = algorithmSetting?.value?.minRead ?? 1000;

    // 构建查询
    let query = supabase
      .from('articles')
      .select(
        `
        *,
        account:accounts(id, name, avatar_url),
        favorite:favorites(id)
      `,
        { count: 'exact' }
      )
      .gte('publish_time', getDateRange(period))
      .gte('read_count', minRead); // 从设置读取入榜门槛

    // 分类筛选
    if (category && category !== '全部') {
      query = query.eq('ai_category', category);
    }
    if (type && type !== '全部') {
      query = query.eq('article_type', type);
    }

    // 关键词搜索
    if (keyword) {
      query = query.ilike('title', `%${keyword}%`);
    }

    // 账号筛选
    if (account) {
      // 需要先查询账号ID
      const { data: accountData } = await supabase
        .from('accounts')
        .select('id')
        .ilike('name', `%${account}%`);

      if (accountData && accountData.length > 0) {
        const accountIds = accountData.map((a) => a.id);
        query = query.in('account_id', accountIds);
      } else {
        // 没有匹配的账号，返回空结果
        return NextResponse.json({
          success: true,
          data: {
            items: [],
            total: 0,
            page,
            limit,
            totalPages: 0,
          },
        });
      }
    }

    // 排序
    const sortField = getSortField(rankType);
    query = query.order(sortField, { ascending: sort === 'asc' });

    // 分页
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    query = query.range(from, to);

    const { data: articles, count, error } = await query;

    if (error) {
      throw error;
    }

    // 格式化返回数据
    const items = (articles || []).map((article, index) => ({
      // favorites 表对 articles 是 1:N，这里按“最多1条收藏记录”处理
      favoriteId:
        Array.isArray(article.favorite) && article.favorite.length > 0
          ? article.favorite[0].id
          : article.favorite?.id || null,
      id: article.id,
      rank: from + index + 1,
      title: article.title,
      url: article.url,
      accountName: article.account?.name || '未知',
      accountId: article.account_id,
      accountAvatar: article.account?.avatar_url,
      publishTime: article.publish_time,
      readCount: article.read_count,
      likeCount: article.like_count,
      wowCount: article.wow_count,
      shareCount: Number(article.share_count ?? 0),
      commentCount: article.comment_count,
      favoriteCount: article.favorite_count,
      outperformIndex: article.outperform_index,
      engagementScore: article.engagement_score,
      heatScore: article.heat_score,
      aiCategory: article.ai_category,
      articleType: article.article_type,
      isFavorited: !!(
        (Array.isArray(article.favorite) && article.favorite.length > 0) ||
        article.favorite?.id
      ),
    }));

    const total = count || 0;
    const totalPages = Math.ceil(total / limit);

    return NextResponse.json({
      success: true,
      data: {
        items,
        total,
        page,
        limit,
        totalPages,
      },
    });
  } catch (error) {
    console.error('获取文章列表失败:', error);
    return NextResponse.json(
      { success: false, error: '获取文章列表失败' },
      { status: 500 }
    );
  }
}
