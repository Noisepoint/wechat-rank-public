import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import {
  addAccountByUrlWithInfo,
  getAccountList,
  queryArticlesWithMeta,
  queryArticles,
  Wechat2RssArticle,
} from '@/lib/wechat2rss';
import { getArticleStats, recordApiUsage } from '@/lib/dajiala';
import { classify } from '@/lib/classifier';
import {
  DEFAULT_CONFIG,
  calcOutperformIndex,
  calcEngagementScore,
  calcHeatScore,
} from '@/lib/algorithm';
import { getDayStartIsoDaysAgo } from '@/lib/date';
import type { AlgorithmConfig } from '@/types';

// GET - 获取账号列表
export async function GET() {
  const supabase = createServerClient();

  try {
    const { data: accounts, error } = await supabase
      .from('accounts')
      .select(
        `
        *,
        articles:articles(count)
      `
      )
      .order('created_at', { ascending: false });

    if (error) throw error;

    // 获取每个账号的文章统计
    const accountsWithStats = await Promise.all(
      (accounts || []).map(async (account) => {
        const { count } = await supabase
          .from('articles')
          .select('*', { count: 'exact', head: true })
          .eq('account_id', account.id);

        const { data: latestArticle } = await supabase
          .from('articles')
          .select('publish_time')
          .eq('account_id', account.id)
          .order('publish_time', { ascending: false })
          .limit(1)
          .single();

        return {
          id: account.id,
          name: account.name,
          wechatId: account.wechat_id,
          biz: account.biz,
          avatarUrl: account.avatar_url,
          description: account.description,
          isPreset: account.is_preset,
          createdAt: account.created_at,
          articleCount: count || 0,
          latestArticleTime: latestArticle?.publish_time || null,
        };
      })
    );

    return NextResponse.json({
      success: true,
      data: accountsWithStats,
    });
  } catch (error) {
    console.error('获取账号列表失败:', error);
    return NextResponse.json(
      { success: false, error: '获取账号列表失败' },
      { status: 500 }
    );
  }
}

// POST - 添加账号（只需要文章链接）
export async function POST(request: NextRequest) {
  const supabase = createServerClient();

  try {
    const body = await request.json();
    const { url } = body;

    if (!url) {
      return NextResponse.json(
        { success: false, error: '请输入文章链接' },
        { status: 400 }
      );
    }

    // 通过 wechat2rss 添加订阅并获取公众号信息
    const accountInfo = await addAccountByUrlWithInfo(url);
    if (!accountInfo) {
      return NextResponse.json(
        { success: false, error: '无法识别该链接，请确认是有效的公众号文章链接' },
        { status: 400 }
      );
    }

    const { biz, name } = accountInfo;

    // 检查是否已存在（用 biz 判断）
    const { data: existing } = await supabase
      .from('accounts')
      .select('id, name')
      .eq('biz', biz)
      .single();

    if (existing) {
      return NextResponse.json(
        { success: false, error: `该公众号「${existing.name}」已存在` },
        { status: 400 }
      );
    }

    // 插入账号
    const { data: newAccount, error: insertError } = await supabase
      .from('accounts')
      .insert({
        name,
        biz,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    // 后台触发历史数据采集（先按近7天验证）
    collectHistoricalData(newAccount.id, biz);

    return NextResponse.json({
      success: true,
      data: newAccount,
      message: `「${name}」添加成功，正在采集近7天历史数据（自然日口径）...`,
    });
  } catch (error) {
    console.error('添加账号失败:', error);
    return NextResponse.json(
      { success: false, error: '添加账号失败' },
      { status: 500 }
    );
  }
}

function normalizeName(name: string | null | undefined): string {
  return (name || '').trim();
}

function isTempAccountName(name: string | null | undefined): boolean {
  const trimmed = normalizeName(name);
  if (!trimmed) return true;
  return /^公众号_\d+$/.test(trimmed);
}

function normalizeAlgorithmConfig(value: unknown): AlgorithmConfig {
  const toNumber = (v: unknown, fallback: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };

  const config: AlgorithmConfig = { ...DEFAULT_CONFIG };
  if (!value || typeof value !== 'object') return config;

  const obj = value as Record<string, unknown>;
  config.w1 = toNumber(obj.w1, config.w1);
  config.w2 = toNumber(obj.w2, config.w2);
  config.w3 = toNumber(obj.w3, config.w3);
  config.w4 = toNumber(obj.w4, config.w4);
  config.w5 = toNumber(obj.w5, config.w5);
  config.minRead = toNumber(obj.minRead, config.minRead);
  return config;
}

async function ensureAccountName(params: {
  accountId: string;
  biz: string;
  supabase: ReturnType<typeof createServerClient>;
  articleName?: string | null;
}) {
  const { accountId, biz, supabase, articleName } = params;

  try {
    const { data: account } = await supabase
      .from('accounts')
      .select('name')
      .eq('id', accountId)
      .single();

    const currentName = account?.name || '';
    if (!isTempAccountName(currentName)) return;

    // 1) 优先用文章中携带的公众号名称更新
    const fromArticle = normalizeName(articleName);
    if (fromArticle && !isTempAccountName(fromArticle)) {
      await supabase.from('accounts').update({ name: fromArticle }).eq('id', accountId);
      console.log(`更新账号名称为: ${fromArticle}`);
      return;
    }

    // 2) wechat2rss 刚订阅时名称可能稍后才出现在 /list 里，做短重试
    const retries = 3;
    const intervalMs = 2000;

    for (let i = 0; i < retries; i++) {
      const { accounts } = await getAccountList(1, 500);
      const rssAccount = accounts.find((a) => String(a.id) === String(biz));
      const fromList = normalizeName(rssAccount?.name);
      if (fromList && !isTempAccountName(fromList)) {
        await supabase.from('accounts').update({ name: fromList }).eq('id', accountId);
        console.log(`更新账号名称为: ${fromList}`);
        return;
      }

      // 兜底：尝试从文章接口拿 biz_name（不限制时间范围）
      const fallbackArticles = await queryArticles({ bid: biz });
      const fallbackName = normalizeName(fallbackArticles?.[0]?.biz_name);
      if (fallbackName && !isTempAccountName(fallbackName)) {
        await supabase.from('accounts').update({ name: fallbackName }).eq('id', accountId);
        console.log(`更新账号名称为: ${fallbackName}`);
        return;
      }

      if (i < retries - 1) {
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      }
    }
  } catch (error) {
    console.error('同步账号名称失败:', error);
  }
}

// 异步采集历史数据
async function collectHistoricalData(accountId: string, biz: string | null) {
  if (!biz) return;

  const supabase = createServerClient();
  let supportsShareCount = true; // 兼容旧数据库未迁移 share_count 字段的情况

  try {
    // 读取算法权重配置（用于计算 engagement_score/heat_score）
    let algorithmConfig: AlgorithmConfig = { ...DEFAULT_CONFIG };
    try {
      const { data: algorithmSetting, error: algorithmError } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'algorithm')
        .single();
      if (!algorithmError) {
        algorithmConfig = normalizeAlgorithmConfig(algorithmSetting?.value);
      }
    } catch {
      // 忽略：使用默认算法参数
    }

    // 先按近7天做初始化采集（验证稳定后再扩到14天）
    const historicalDays = 7;
    // 口径C：从“今天往前推7天”的 00:00 开始算（服务端时区）
    const historicalStartIso = getDayStartIsoDaysAgo(historicalDays);

    // wechat2rss 在刚订阅时通常需要一点时间生成历史数据；
    // 这里做有限次数重试，避免“一次返回0就永远是0”的体验问题。
    const maxWaitMs = 5 * 60 * 1000; // 最多等待5分钟
    const retryIntervalMs = 10 * 1000; // 每10秒重试一次

    console.log(`开始采集账号 ${biz} 的近${historicalDays}天历史数据...`);

    // 先尝试把账号名称同步到位（避免“采集到文章了但仍显示临时名称”）
    await ensureAccountName({ accountId, biz, supabase });

    let articles: Wechat2RssArticle[] = [];
    const startTime = Date.now();
    let attempt = 0;
    let lastErr: string | null = null;
    while (Date.now() - startTime <= maxWaitMs) {
      attempt++;
      const { data, err } = await queryArticlesWithMeta({
        bid: biz,
        after: historicalStartIso,
        content: true,
      });
      lastErr = err;
      if (err) {
        console.log(`wechat2rss 返回错误（账号 ${biz}）：${err}`);
        // 若明确是风控/登录失效，不做无意义重试，避免加重风控
        if (err.includes('风控') || err.includes('登录') || err.includes('扫码')) {
          break;
        }
      } else {
        articles = data;
      }

      if (articles.length > 0) break;

      console.log(
        `账号 ${biz} 暂无文章数据（第 ${attempt} 次尝试），等待 wechat2rss 继续采集中...`
      );
      await new Promise((resolve) => setTimeout(resolve, retryIntervalMs));
    }

    console.log(`从 wechat2rss 获取到 ${articles.length} 篇文章`);

    // 若仍是临时名称，再用文章/列表信息补一次
    await ensureAccountName({
      accountId,
      biz,
      supabase,
      articleName: articles?.[0]?.biz_name || null,
    });

    if (articles.length === 0) {
      console.log(
        `账号 ${biz} 在等待${Math.round(maxWaitMs / 1000)}秒后仍暂无文章数据，可能是：1) 近${historicalDays}天确实未发文；2) wechat2rss 仍在采集；3) wechat2rss 请求失败${lastErr ? `（${lastErr}）` : ''}。`
      );
      return;
    }

    let apiCalls = 0;
    let insertedCount = 0;

    for (const article of articles) {
      try {
        // 检查是否已存在
        const { data: existing } = await supabase
          .from('articles')
          .select('id')
          .eq('url', article.link)
          .single();

        if (existing) continue;

        // 获取互动数据
        const stats = await getArticleStats(article.link);
        apiCalls++;

        if (!stats) {
          console.log(`获取文章互动数据失败: ${article.title}`);
          continue;
        }

        // 计算指标（首次采集没有历史数据，暂用默认值）
        const outperformIndex = calcOutperformIndex(stats.read_count, 1000);
        const engagementScore = calcEngagementScore({
          like_count: stats.like_count,
          wow_count: stats.wow_count,
          comment_count: stats.comment_count,
          favorite_count: stats.favorite_count,
          share_count: stats.share_count,
          read_count: stats.read_count,
        }, algorithmConfig);
        const heatScore = calcHeatScore(outperformIndex, engagementScore);

        const { aiCategory, articleType } = classify(article.title, article.content);

        const insertPayload: Record<string, unknown> = {
          account_id: accountId,
          title: article.title,
          url: article.link,
          content: article.content || null,
          publish_time: article.created,
          read_count: stats.read_count,
          like_count: stats.like_count,
          wow_count: stats.wow_count,
          comment_count: stats.comment_count,
          favorite_count: stats.favorite_count,
          ...(supportsShareCount ? { share_count: stats.share_count } : {}),
          outperform_index: outperformIndex,
          engagement_score: engagementScore,
          heat_score: heatScore,
          ai_category: aiCategory,
          article_type: articleType,
        };

        let { error: insertError } = await supabase
          .from('articles')
          .insert(insertPayload);
        if (
          insertError &&
          supportsShareCount &&
          insertError.message?.includes('share_count')
        ) {
          // 数据库没迁移 share_count 时，降级为不写该字段，保证采集主流程可用
          supportsShareCount = false;
          const { share_count: _ignored, ...fallbackPayload } = insertPayload;
          const retry = await supabase
            .from('articles')
            .insert(fallbackPayload);
          insertError = retry.error;
        }
        if (insertError) {
          console.error('插入文章失败:', article.title, insertError);
          continue;
        }

        insertedCount++;

        // 延迟避免API限流
        await new Promise((resolve) => setTimeout(resolve, 300));
      } catch (err) {
        console.error('采集文章失败:', article.title, err);
      }
    }

    console.log(`采集完成: 共 ${insertedCount} 篇文章入库，调用 API ${apiCalls} 次`);

    // 记录API用量
    if (apiCalls > 0) {
      await recordApiUsage(apiCalls, 0.06);
    }

    // 采集完成后重新计算超常指数
    await recalculateOutperformIndex(accountId);
  } catch (error) {
    console.error('历史数据采集失败:', error);
  }
}

// 重新计算账号文章的超常指数
async function recalculateOutperformIndex(accountId: string) {
  const supabase = createServerClient();

  try {
    // 获取该账号所有文章
    const { data: articles } = await supabase
      .from('articles')
      .select('id, read_count')
      .eq('account_id', accountId);

    if (!articles || articles.length === 0) return;

    // 计算篇均阅读
    const avgReadCount =
      articles.reduce((sum, a) => sum + a.read_count, 0) / articles.length;

    // 更新每篇文章的超常指数
    for (const article of articles) {
      const outperformIndex = calcOutperformIndex(article.read_count, avgReadCount);

      await supabase
        .from('articles')
        .update({ outperform_index: outperformIndex })
        .eq('id', article.id);
    }
  } catch (error) {
    console.error('重新计算超常指数失败:', error);
  }
}
