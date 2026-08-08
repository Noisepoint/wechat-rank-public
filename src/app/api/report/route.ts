import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { getDayStartIsoDaysAgo, getIsoDaysAgo } from '@/lib/date';

// 获取时间范围
function getDateRange(period: 'day' | 'week'): { start: string; end: string } {
  const end = new Date().toISOString();
  // 日报：过去24小时（滚动）；周报：口径C（自然日窗口起点）
  const start = period === 'day' ? getIsoDaysAgo(1) : getDayStartIsoDaysAgo(7);
  return { start, end };
}

// 获取上一周期的时间范围（用于趋势对比）
function getPreviousPeriodRange(period: 'day' | 'week'): { start: string; end: string } {
  // 与当前周期口径保持一致：上一周期的 end 取当前周期的 start
  if (period === 'day') {
    return {
      start: getIsoDaysAgo(2),
      end: getIsoDaysAgo(1),
    };
  }

  return {
    start: getDayStartIsoDaysAgo(14),
    end: getDayStartIsoDaysAgo(7),
  };
}

// 从标题中提取关键词
function extractKeywords(titles: string[]): Record<string, number> {
  const keywords: Record<string, number> = {};
  const stopWords = new Set([
    '的', '了', '是', '在', '我', '有', '和', '就', '不', '人', '都', '一', '一个',
    '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好',
    '自己', '这', '么', '这个', '那', '什么', '如何', '怎么', '为什么', '可以',
  ]);

  for (const title of titles) {
    // 简单分词：按标点符号和空格分割，提取连续中文或英文
    const words = title.match(/[\u4e00-\u9fa5]{2,}|[a-zA-Z]{2,}/g) || [];

    for (const word of words) {
      const lowerWord = word.toLowerCase();
      if (!stopWords.has(lowerWord) && word.length >= 2) {
        keywords[word] = (keywords[word] || 0) + 1;
      }
    }
  }

  return keywords;
}

// 匹配标题套路模式
function extractPatterns(titles: string[]): Record<string, number> {
  const patterns: Record<string, { regex: RegExp; count: number }> = {
    '数字列表体': { regex: /(\d+)[个款种件条]|[一二三四五六七八九十]+[个款种件条]/, count: 0 },
    '如何/怎么体': { regex: /如何|怎么|怎样/, count: 0 },
    '刚刚/突发体': { regex: /刚刚|突发|重磅|官宣/, count: 0 },
    '揭秘/真相体': { regex: /揭秘|真相|内幕|秘密/, count: 0 },
    '必备/神器体': { regex: /必备|神器|必看|必学/, count: 0 },
    '我用X做了Y': { regex: /我用.*做了|我用.*写了|我用.*生成/, count: 0 },
    '保姆级/手把手': { regex: /保姆级|手把手|从零|入门/, count: 0 },
    '盘点/合集体': { regex: /盘点|合集|汇总|大全/, count: 0 },
    '对比/测评体': { regex: /对比|测评|vs|VS|PK/, count: 0 },
    '警惕/注意体': { regex: /警惕|注意|别再|千万别/, count: 0 },
  };

  for (const title of titles) {
    for (const [name, pattern] of Object.entries(patterns)) {
      if (pattern.regex.test(title)) {
        pattern.count++;
      }
    }
  }

  const result: Record<string, number> = {};
  for (const [name, pattern] of Object.entries(patterns)) {
    if (pattern.count > 0) {
      result[name] = pattern.count;
    }
  }

  return result;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const period = (searchParams.get('period') || 'day') as 'day' | 'week';

  const supabase = createServerClient();
  const { start, end } = getDateRange(period);
  const prevRange = getPreviousPeriodRange(period);

  try {
    // 获取算法设置中的入榜门槛（与热榜保持一致）
    const { data: algorithmSetting } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'algorithm')
      .single();
    const minRead = algorithmSetting?.value?.minRead ?? 1000;

    // 1. 获取当前周期的文章数据
    const { data: articles, error: articlesError } = await supabase
      .from('articles')
      .select(`
        id,
        title,
        url,
        read_count,
        like_count,
        wow_count,
        comment_count,
        favorite_count,
        heat_score,
        outperform_index,
        engagement_score,
        ai_category,
        article_type,
        publish_time,
        account:accounts(id, name)
      `)
      .gte('publish_time', start)
      .lte('publish_time', end)
      .gte('read_count', minRead) // 入榜门槛
      .order('heat_score', { ascending: false });

    if (articlesError) throw articlesError;

    // 2. 获取上一周期的统计数据（用于趋势对比）
    const { count: prevCount } = await supabase
      .from('articles')
      .select('*', { count: 'exact', head: true })
      .gte('publish_time', prevRange.start)
      .lte('publish_time', prevRange.end)
      .gte('read_count', minRead);

    const { data: prevTopArticle } = await supabase
      .from('articles')
      .select('heat_score')
      .gte('publish_time', prevRange.start)
      .lte('publish_time', prevRange.end)
      .gte('read_count', minRead)
      .order('heat_score', { ascending: false })
      .limit(1)
      .single();

    // 3. 统计数据
    const totalArticles = articles?.length || 0;
    const hotArticles = articles?.filter((a) => a.heat_score > 50).length || 0;
    const maxHeatScore = articles?.[0]?.heat_score || 0;

    // 4. Top 10 热文
    const top10Articles = (articles || []).slice(0, 10).map((article, index) => {
      const accountData = article.account as { id: string; name: string } | { id: string; name: string }[] | null;
      const accountName = Array.isArray(accountData) ? accountData[0]?.name : accountData?.name;
      return {
        rank: index + 1,
        id: article.id,
        title: article.title,
        url: article.url,
        accountName: accountName || '未知',
        readCount: article.read_count,
        heatScore: article.heat_score,
        outperformIndex: article.outperform_index,
        aiCategory: article.ai_category,
      };
    });

    // 5. 分类热度分布
    const categoryDistribution: Record<string, { count: number; avgHeat: number }> = {};
    for (const article of articles || []) {
      const category = article.ai_category || '其他';
      if (!categoryDistribution[category]) {
        categoryDistribution[category] = { count: 0, avgHeat: 0 };
      }
      categoryDistribution[category].count++;
      categoryDistribution[category].avgHeat += article.heat_score;
    }

    // 计算平均热度
    for (const category of Object.keys(categoryDistribution)) {
      categoryDistribution[category].avgHeat =
        Math.round(
          (categoryDistribution[category].avgHeat / categoryDistribution[category].count) * 100
        ) / 100;
    }

    // 6. 文章类型分布
    const typeDistribution: Record<string, number> = {};
    for (const article of articles || []) {
      const type = article.article_type || '其他';
      typeDistribution[type] = (typeDistribution[type] || 0) + 1;
    }

    // 7. 提取关键词
    const titles = (articles || []).map((a) => a.title);
    const keywords = extractKeywords(titles);

    // 取前20个高频词
    const topKeywords = Object.entries(keywords)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([word, count]) => ({ word, count }));

    // 8. 提取标题套路
    const patterns = extractPatterns(titles);
    const topPatterns = Object.entries(patterns)
      .sort((a, b) => b[1] - a[1])
      .map(([pattern, count]) => ({ pattern, count }));

    // 9. 账号表现排行
    const accountStats: Record<string, { name: string; count: number; avgHeat: number; maxHeat: number }> = {};
    for (const article of articles || []) {
      const accountData = article.account as { id: string; name: string } | { id: string; name: string }[] | null;
      const accountId = Array.isArray(accountData) ? accountData[0]?.id : accountData?.id;
      const accountName = Array.isArray(accountData) ? accountData[0]?.name : accountData?.name;
      if (accountId) {
        if (!accountStats[accountId]) {
          accountStats[accountId] = { name: accountName || '未知', count: 0, avgHeat: 0, maxHeat: 0 };
        }
        accountStats[accountId].count++;
        accountStats[accountId].avgHeat += article.heat_score;
        accountStats[accountId].maxHeat = Math.max(accountStats[accountId].maxHeat, article.heat_score);
      }
    }

    // 计算平均并排序
    const accountRanking = Object.values(accountStats)
      .map((stat) => ({
        ...stat,
        avgHeat: Math.round((stat.avgHeat / stat.count) * 100) / 100,
      }))
      .sort((a, b) => b.avgHeat - a.avgHeat)
      .slice(0, 10);

    // 10. 趋势变化
    const prevArticleCount = prevCount || 0;
    const prevMaxHeat = prevTopArticle?.heat_score || 0;

    const trend = {
      articleCountChange: totalArticles - prevArticleCount,
      articleCountChangePercent:
        prevArticleCount > 0
          ? Math.round(((totalArticles - prevArticleCount) / prevArticleCount) * 100)
          : 0,
      maxHeatChange: Math.round((maxHeatScore - prevMaxHeat) * 100) / 100,
    };

    // 11. 选题建议（基于数据规则）
    const suggestions: string[] = [];

    // 找出最热门的分类
    const hottestCategory = Object.entries(categoryDistribution)
      .sort((a, b) => b[1].avgHeat - a[1].avgHeat)[0];
    if (hottestCategory) {
      suggestions.push(`「${hottestCategory[0]}」领域热度最高，建议重点关注`);
    }

    // 找出高频套路
    if (topPatterns.length > 0) {
      suggestions.push(`「${topPatterns[0].pattern}」是本周期最有效的标题套路`);
    }

    // 找出高频关键词
    if (topKeywords.length > 0) {
      const hotWords = topKeywords.slice(0, 3).map((k) => k.word).join('、');
      suggestions.push(`热门关键词：${hotWords}，可考虑融入选题`);
    }

    // 超常发挥的账号
    const outperformAccounts = (articles || [])
      .filter((a) => a.outperform_index > 3)
      .map((a) => {
        const accData = a.account as { id: string; name: string } | { id: string; name: string }[] | null;
        return Array.isArray(accData) ? accData[0]?.name : accData?.name;
      })
      .filter((name, index, arr) => name && arr.indexOf(name) === index)
      .slice(0, 3);
    if (outperformAccounts.length > 0) {
      suggestions.push(`${outperformAccounts.join('、')} 有超常发挥文章，可借鉴选题`);
    }

    return NextResponse.json({
      success: true,
      data: {
        period,
        periodLabel: period === 'day' ? '日报' : '周报',
        dateRange: { start, end },
        summary: {
          totalArticles,
          hotArticles,
          maxHeatScore: Math.round(maxHeatScore * 100) / 100,
        },
        top10Articles,
        categoryDistribution,
        typeDistribution,
        topKeywords,
        topPatterns,
        accountRanking,
        trend,
        suggestions,
      },
    });
  } catch (error) {
    console.error('获取报告数据失败:', error);
    return NextResponse.json(
      { success: false, error: '获取报告数据失败' },
      { status: 500 }
    );
  }
}
