import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { queryArticlesWithMeta } from '@/lib/wechat2rss';
import { getArticleStats, recordApiUsage } from '@/lib/dajiala';
import { classify } from '@/lib/classifier';
import {
  DEFAULT_CONFIG,
  calcOutperformIndex,
  calcEngagementScore,
  calcHeatScore,
  calcAvgReadCount,
} from '@/lib/algorithm';
import { getDayStartIsoDaysAgo } from '@/lib/date';
import type { AlgorithmConfig } from '@/types';

// 验证Cron密钥
function verifyCronSecret(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) return true; // 开发环境允许无密钥

  return authHeader === `Bearer ${cronSecret}`;
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

export async function POST(request: NextRequest) {
  // 验证密钥
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 测试参数（用于控制采集范围，避免联调时产生大量调用/费用）
  const searchParams = request.nextUrl.searchParams;
  const onlyAccountId = searchParams.get('accountId');
  const onlyBiz = searchParams.get('biz');
  const skipOldUpdate = searchParams.get('skipOld') === '1';
  const maxArticles = Number(searchParams.get('maxArticles') || 0);
  const maxOldArticles = Number(searchParams.get('maxOldArticles') || 0);
  const lookbackDays = (() => {
    // 回看窗口：用于“补漏文章”
    // - 默认 7 天：即使走增量，也会把最近 7 天内漏掉的文章补齐
    // - 允许传 0 关闭回看（完全按 latestPublishTime 增量）
    const raw = searchParams.get('lookbackDays');
    if (raw === null) return 7;
    const n = Number(raw);
    if (!Number.isFinite(n)) return 7;
    return Math.max(0, Math.floor(n));
  })();
  const lookbackDaysCapped = Math.min(30, lookbackDays);
  // 口径C：从“今天往前推 lookbackDays 天”的 00:00 开始算（服务端时区）
  const lookbackStart = lookbackDaysCapped > 0 ? getDayStartIsoDaysAgo(lookbackDaysCapped) : null;
  const lookbackStartTs = lookbackStart ? Date.parse(lookbackStart) : NaN;

  const supabase = createServerClient();
  const results = {
    newArticles: 0,
    updatedArticles: 0,
    errors: [] as string[],
    apiCalls: 0,
  };
  let supportsShareCount = true; // 兼容旧数据库未迁移 share_count 字段的情况

  try {
    // 0. 读取算法权重配置（用于计算 engagement_score/heat_score）
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

    // 1. 获取所有已添加的账号
    const { data: accounts, error: accountsError } = await supabase
      .from('accounts')
      .select('*');

    if (accountsError) {
      throw new Error(`获取账号列表失败: ${accountsError.message}`);
    }

    let targetAccounts = accounts || [];
    if (onlyAccountId) {
      targetAccounts = targetAccounts.filter((a) => a.id === onlyAccountId);
    }
    if (onlyBiz) {
      targetAccounts = targetAccounts.filter((a) => String(a.biz) === String(onlyBiz));
    }

    if (targetAccounts.length === 0) {
      return NextResponse.json({
        success: true,
        message: '没有需要采集的账号（已按参数过滤）',
        results,
      });
    }

    // 缓存本次已获取到的互动数据，避免“插入新文章后”在旧文章更新阶段重复调用极致了
    const statsCache = new Map<
      string,
      {
        read_count: number;
        like_count: number;
        wow_count: number;
        share_count: number;
        favorite_count: number;
        comment_count: number;
      }
    >();

    // 2. 获取每个账号的新文章
    for (const account of targetAccounts) {
      try {
        if (!account.biz) {
          results.errors.push(`账号缺少 biz，无法采集: ${account.name || account.id}`);
          continue;
        }

        // 获取该账号最近一篇文章的时间，用于增量采集
        const { data: latestArticle } = await supabase
          .from('articles')
          .select('publish_time')
          .eq('account_id', account.id)
          .order('publish_time', { ascending: false })
          .limit(1)
          .single();

        // 增量起点：默认使用 latestPublishTime；
        // 但为了补漏文章（例如首次订阅时上游没吐全），会回看最近 lookbackDays 天。
        let afterTime = latestArticle?.publish_time || getDayStartIsoDaysAgo(14);
        if (lookbackDaysCapped > 0 && latestArticle?.publish_time && Number.isFinite(lookbackStartTs)) {
          const latestTs = Date.parse(latestArticle.publish_time);
          if (Number.isFinite(latestTs)) {
            afterTime = new Date(Math.min(latestTs, lookbackStartTs)).toISOString();
          }
        }

        // 从wechat2rss获取文章
        const { data: queriedArticles, err: wechat2rssErr } = await queryArticlesWithMeta({
          bid: account.biz,
          after: afterTime,
          content: true,
        });
        if (wechat2rssErr) {
          results.errors.push(`wechat2rss异常（${account.name || account.biz}）：${wechat2rssErr}`);
          continue;
        }

        let articles = queriedArticles;

        // 联调时可限制每个账号处理的文章数，避免一次性产生大量调用
        if (Number.isFinite(maxArticles) && maxArticles > 0) {
          articles = articles.slice(0, Math.floor(maxArticles));
        }

        if (articles.length === 0) continue;

        // 3. 获取该账号近14天文章用于计算篇均阅读
        const { data: recentArticles } = await supabase
          .from('articles')
          .select('read_count')
          .eq('account_id', account.id)
          .gte('publish_time', getDayStartIsoDaysAgo(14));

        const avgReadCount = calcAvgReadCount(recentArticles || []);

        // 4. 处理每篇文章（仅补漏插入新文章；互动数据刷新交给后续“7天内旧文章更新”统一做）
        for (const article of articles) {
          try {
            // 检查文章是否已存在
            const { data: existing } = await supabase
              .from('articles')
              .select('id, publish_time')
              .eq('url', article.link)
              .single();

            if (existing) {
              // 已存在：这里不再重复刷新互动数据，交给后续“旧文章更新”阶段统一处理
              continue;
            } else {
              // 新文章：插入（并获取一次互动数据；后续旧文章更新阶段会复用缓存，避免重复调用）
              const stats = await getArticleStats(article.link);
              results.apiCalls++;

              if (!stats) {
                results.errors.push(`获取文章数据失败: ${article.title}`);
                continue;
              }

              statsCache.set(article.link, stats);

              // 计算热度指标（最终会在旧文章更新阶段用最新篇均阅读再刷新一次）
              const outperformIndex = calcOutperformIndex(stats.read_count, avgReadCount || 1000);
              const engagementScore = calcEngagementScore({
                like_count: stats.like_count,
                wow_count: stats.wow_count,
                comment_count: stats.comment_count,
                favorite_count: stats.favorite_count,
                share_count: stats.share_count,
                read_count: stats.read_count,
              }, algorithmConfig);
              const heatScore = calcHeatScore(outperformIndex, engagementScore);

              // 自动分类
              const { aiCategory, articleType } = classify(article.title, article.content);

              const insertPayload: Record<string, unknown> = {
                account_id: account.id,
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
                results.errors.push(`插入文章失败: ${article.title} - ${insertError.message}`);
              } else {
                results.newArticles++;
              }

              // 仅在调用了外部 API 后做延迟，避免限流/风控
              await new Promise(resolve => setTimeout(resolve, 200));
            }
          } catch (articleError) {
            results.errors.push(`处理文章异常: ${article.title}`);
          }
        }
      } catch (accountError) {
        results.errors.push(`处理账号异常: ${account.name}`);
      }
    }

    // 5. 更新7天内的旧文章数据（保证周榜数据准确）
    const skippedOldUpdate = skipOldUpdate;

    if (!skippedOldUpdate) {
      const targetAccountIds = targetAccounts.map((a) => a.id);

      const { data: oldArticles } = await supabase
        .from('articles')
        .select('id, url, account_id')
        .in('account_id', targetAccountIds)
        .gte('publish_time', getDayStartIsoDaysAgo(7))
        .order('publish_time', { ascending: false });

      let targetOldArticles = oldArticles || [];
      if (Number.isFinite(maxOldArticles) && maxOldArticles > 0) {
        targetOldArticles = targetOldArticles.slice(0, Math.floor(maxOldArticles));
      }

      if (targetOldArticles.length > 0) {
        // 获取所有账号的篇均阅读量
        const accountAvgReads: Record<string, number> = {};
        for (const account of targetAccounts) {
          const { data: recentArticles } = await supabase
            .from('articles')
            .select('read_count')
            .eq('account_id', account.id)
            .gte('publish_time', getDayStartIsoDaysAgo(14));
          accountAvgReads[account.id] = calcAvgReadCount(recentArticles || []);
        }

        for (const article of targetOldArticles) {
          try {
            // 优先复用本轮“插入新文章时”已获取到的互动数据，避免重复调用极致了
            const cached = statsCache.get(article.url) || null;
            const stats = cached || (await getArticleStats(article.url));
            const calledExternalApi = !cached;
            if (calledExternalApi) results.apiCalls++;

            if (!stats) continue;

            const avgReadCount = accountAvgReads[article.account_id] || 1000;
            const outperformIndex = calcOutperformIndex(stats.read_count, avgReadCount);
            const engagementScore = calcEngagementScore({
              like_count: stats.like_count,
              wow_count: stats.wow_count,
              comment_count: stats.comment_count,
              favorite_count: stats.favorite_count,
              share_count: stats.share_count,
              read_count: stats.read_count,
            }, algorithmConfig);
            const heatScore = calcHeatScore(outperformIndex, engagementScore);

            // 更新数据库
            const updatePayload: Record<string, unknown> = {
              read_count: stats.read_count,
              like_count: stats.like_count,
              wow_count: stats.wow_count,
              comment_count: stats.comment_count,
              favorite_count: stats.favorite_count,
              ...(supportsShareCount ? { share_count: stats.share_count } : {}),
              outperform_index: outperformIndex,
              engagement_score: engagementScore,
              heat_score: heatScore,
            };

            let { error: updateError } = await supabase
              .from('articles')
              .update(updatePayload)
              .eq('id', article.id);
            if (
              updateError &&
              supportsShareCount &&
              updateError.message?.includes('share_count')
            ) {
              supportsShareCount = false;
              const { share_count: _ignored, ...fallbackPayload } = updatePayload;
              const retry = await supabase
                .from('articles')
                .update(fallbackPayload)
                .eq('id', article.id);
              updateError = retry.error;
            }

            if (!updateError) {
              results.updatedArticles++;
            }

            // 仅在调用了外部 API 后做延迟，避免限流/风控
            if (calledExternalApi) {
              await new Promise(resolve => setTimeout(resolve, 200));
            }
          } catch (err) {
            results.errors.push(`更新旧文章失败: ${article.id}`);
          }
        }
      }
    }

    // 6. 记录API用量
    if (results.apiCalls > 0) {
      await recordApiUsage(results.apiCalls, 0.06);
    }

    return NextResponse.json({
      success: true,
      message: skippedOldUpdate ? '数据采集完成（已跳过7天内旧文章更新）' : '数据采集完成',
      results,
    });
  } catch (error) {
    console.error('数据采集失败:', error);
    return NextResponse.json(
      { success: false, error: '数据采集失败', details: String(error) },
      { status: 500 }
    );
  }
}

// 支持GET请求（用于手动触发测试）
export async function GET(request: NextRequest) {
  return POST(request);
}
