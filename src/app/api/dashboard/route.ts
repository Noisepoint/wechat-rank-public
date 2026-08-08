import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { getApiBalance } from '@/lib/dajiala';
import { getDayStartIsoDaysAgo } from '@/lib/date';

export async function GET(request: NextRequest) {
  const supabase = createServerClient();
  const debug = request.nextUrl.searchParams.get('debug') === '1';
  // 为了避免本地测试时反复触发外部余额接口（且接口异常时会刷屏日志），默认不拉取余额。
  // 如确实需要余额数据，可在请求中显式带上 ?withBalance=1（或使用 ?debug=1 排查响应）。
  const withBalance = request.nextUrl.searchParams.get('withBalance') === '1';

  try {
    // 获取今日统计
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    // 口径C：从今天往前推7天的00:00开始（服务端时区）
    const weekAgo = getDayStartIsoDaysAgo(7);

    // 今日采集文章数
    const { count: todayArticles } = await supabase
      .from('articles')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', today);

    // 总文章数
    const { count: totalArticles } = await supabase
      .from('articles')
      .select('*', { count: 'exact', head: true });

    // 总账号数
    const { count: totalAccounts } = await supabase
      .from('accounts')
      .select('*', { count: 'exact', head: true });

    // 今日API用量
    const { data: todayUsage } = await supabase
      .from('api_usage')
      .select('call_count, cost')
      .eq('date', today)
      .single();

    // 本月API用量
    const monthStart = new Date();
    monthStart.setDate(1);
    const { data: monthUsage } = await supabase
      .from('api_usage')
      .select('call_count, cost')
      .gte('date', monthStart.toISOString().split('T')[0]);

    const monthTotal = (monthUsage || []).reduce(
      (acc, u) => ({
        calls: acc.calls + (u.call_count || 0),
        cost: acc.cost + (u.cost || 0),
      }),
      { calls: 0, cost: 0 }
    );

    // 获取API余额
    let apiBalance: number | null = null;
    let balanceDebug:
      | {
          status: number;
          ok: boolean;
          bodySnippet: string;
          jsonKeys: string[] | null;
          parsedBalance: number | null;
          tried?: {
            url: string;
            status: number;
            ok: boolean;
            bodySnippet: string;
            jsonKeys: string[] | null;
            parsedBalance: number | null;
          }[];
        }
      | undefined;

    if (debug) {
      // 调试模式：返回极致了 get_balance 的原始响应片段，便于排查余额为空的问题
      const candidates = [
        'https://www.dajiala.com/fbmain/monitor/v3/get_balance',
        'https://www.dajiala.com/fbmain/monitor/v2/get_balance',
        'https://www.dajiala.com/fbmain/monitor/v1/get_balance',
        'https://www.dajiala.com/fbmain/monitor/get_balance',
      ];

      const tried: {
        url: string;
        status: number;
        ok: boolean;
        bodySnippet: string;
        jsonKeys: string[] | null;
        parsedBalance: number | null;
      }[] = [];

      for (const url of candidates) {
        const balanceRes = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            key: process.env.DAJIALA_API_KEY,
            verifycode: process.env.DAJIALA_VERIFY_CODE || '',
          }),
        });

        const text = await balanceRes.text();
        let parsed: unknown = null;
        try {
          parsed = JSON.parse(text) as unknown;
        } catch {
          parsed = null;
        }

        const parsedObj =
          parsed && typeof parsed === 'object'
            ? (parsed as Record<string, unknown>)
            : null;
        const parsedDataObj =
          parsedObj && parsedObj.data && typeof parsedObj.data === 'object'
            ? (parsedObj.data as Record<string, unknown>)
            : null;

        const remainMoney =
          parsedObj?.remain_money ??
          parsedDataObj?.remain_money ??
          parsedObj?.remain ??
          parsedDataObj?.remain ??
          null;

        const num = remainMoney == null ? null : Number(remainMoney);
        const parsedBalance = Number.isFinite(num) ? num : null;

        tried.push({
          url,
          status: balanceRes.status,
          ok: balanceRes.ok,
          bodySnippet: text.slice(0, 500),
          jsonKeys: parsedObj ? Object.keys(parsedObj) : null,
          parsedBalance,
        });

        if (parsedBalance != null) {
          apiBalance = parsedBalance;
          break;
        }
      }

      balanceDebug = {
        status: tried[0]?.status ?? 0,
        ok: tried[0]?.ok ?? false,
        bodySnippet: tried[0]?.bodySnippet ?? '',
        jsonKeys: tried[0]?.jsonKeys ?? null,
        parsedBalance: apiBalance,
        tried,
      };
    } else if (withBalance) {
      apiBalance = await getApiBalance();
    } else {
      apiBalance = null;
    }

    // 近7天文章热度分布
    const { data: weekArticles } = await supabase
      .from('articles')
      .select('ai_category, heat_score')
      .gte('publish_time', weekAgo);

    // 按分类统计
    const categoryStats: Record<string, { count: number; avgHeat: number }> = {};
    (weekArticles || []).forEach((a) => {
      const cat = a.ai_category || '其他';
      if (!categoryStats[cat]) {
        categoryStats[cat] = { count: 0, avgHeat: 0 };
      }
      categoryStats[cat].count++;
      categoryStats[cat].avgHeat += a.heat_score || 0;
    });

    // 计算平均热度
    Object.keys(categoryStats).forEach((cat) => {
      if (categoryStats[cat].count > 0) {
        categoryStats[cat].avgHeat = Number(
          (categoryStats[cat].avgHeat / categoryStats[cat].count).toFixed(2)
        );
      }
    });

    // 近7天每日发文数趋势（按 publish_time 统计）
    const dailyTrend: { date: string; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date(Date.now() - i * 86400000);
      const dateStr = date.toISOString().split('T')[0];
      const nextDateStr = new Date(date.getTime() + 86400000)
        .toISOString()
        .split('T')[0];

      const { count } = await supabase
        .from('articles')
        .select('*', { count: 'exact', head: true })
        .gte('publish_time', dateStr)
        .lt('publish_time', nextDateStr);

      dailyTrend.push({
        date: dateStr,
        count: count || 0,
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        overview: {
          todayArticles: todayArticles || 0,
          totalArticles: totalArticles || 0,
          totalAccounts: totalAccounts || 0,
        },
        apiUsage: {
          today: {
            calls: todayUsage?.call_count || 0,
            cost: todayUsage?.cost || 0,
          },
          month: monthTotal,
          balance: apiBalance,
        },
        categoryStats,
        dailyTrend,
      },
      ...(debug ? { balanceDebug } : {}),
    });
  } catch (error) {
    console.error('获取看板数据失败:', error);
    return NextResponse.json(
      { success: false, error: '获取看板数据失败' },
      { status: 500 }
    );
  }
}
