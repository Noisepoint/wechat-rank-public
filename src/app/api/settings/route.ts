import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { calcEngagementScore, calcHeatScore, DEFAULT_CONFIG } from '@/lib/algorithm';
import type { AlgorithmConfig } from '@/types';

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

async function recalculateRecentArticleScores(params: {
  supabase: ReturnType<typeof createServerClient>;
  algorithmConfig: AlgorithmConfig;
  days: number;
}): Promise<{ updated: number }> {
  const { supabase, algorithmConfig, days } = params;
  const since = new Date(Date.now() - days * 86400000).toISOString();

  const pageSize = 1000;
  const upsertChunkSize = 200;

  let offset = 0;
  let updated = 0;
  let includeShareCount = true; // 兼容旧数据库未迁移 share_count 字段的情况

  while (true) {
    // 注意：Supabase 的 .select() 在类型层面需要传字面量字符串，否则会解析成 ParserError，导致 build 失败
    if (includeShareCount) {
      const { data: articles, error } = await supabase
        .from('articles')
        .select(
          'id, account_id, title, url, read_count, like_count, wow_count, comment_count, favorite_count, share_count, outperform_index, publish_time'
        )
        .gte('publish_time', since)
        .order('publish_time', { ascending: false })
        .range(offset, offset + pageSize - 1);

      if (error) {
        if (error.message?.includes('share_count')) {
          // 数据库未迁移 share_count 时降级，避免影响保存设置的主流程
          includeShareCount = false;
          continue;
        }
        throw new Error(`查询文章失败: ${error.message}`);
      }

      if (!articles || articles.length === 0) {
        break;
      }

      const updates = articles.map((a) => {
        const engagementScore = calcEngagementScore(
          {
            like_count: Number(a.like_count ?? 0),
            wow_count: Number(a.wow_count ?? 0),
            comment_count: Number(a.comment_count ?? 0),
            favorite_count: Number(a.favorite_count ?? 0),
            share_count: Number(a.share_count ?? 0),
            read_count: Number(a.read_count ?? 0),
          },
          algorithmConfig
        );

        const outperformIndexRaw = Number(a.outperform_index ?? 0);
        const outperformIndex = Number.isFinite(outperformIndexRaw) ? outperformIndexRaw : 0;
        const heatScore = calcHeatScore(outperformIndex, engagementScore);

        return {
          id: a.id,
          account_id: a.account_id,
          title: a.title,
          url: a.url,
          engagement_score: engagementScore,
          heat_score: heatScore,
        };
      });

      for (let i = 0; i < updates.length; i += upsertChunkSize) {
        const chunk = updates.slice(i, i + upsertChunkSize);
        const { error: upsertError } = await supabase
          .from('articles')
          .upsert(chunk, { onConflict: 'id' });
        if (upsertError) {
          throw new Error(`重算分数写入失败: ${upsertError.message}`);
        }
      }

      updated += updates.length;

      if (articles.length < pageSize) {
        break;
      }
      offset += articles.length;
      continue;
    }

    const { data: articles, error } = await supabase
      .from('articles')
      .select(
        'id, account_id, title, url, read_count, like_count, wow_count, comment_count, favorite_count, outperform_index, publish_time'
      )
      .gte('publish_time', since)
      .order('publish_time', { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (error) {
      throw new Error(`查询文章失败: ${error.message}`);
    }

    if (!articles || articles.length === 0) {
      break;
    }

    const updates = articles.map((a) => {
      const engagementScore = calcEngagementScore(
        {
          like_count: Number(a.like_count ?? 0),
          wow_count: Number(a.wow_count ?? 0),
          comment_count: Number(a.comment_count ?? 0),
          favorite_count: Number(a.favorite_count ?? 0),
          share_count: 0,
          read_count: Number(a.read_count ?? 0),
        },
        algorithmConfig
      );

      const outperformIndexRaw = Number(a.outperform_index ?? 0);
      const outperformIndex = Number.isFinite(outperformIndexRaw) ? outperformIndexRaw : 0;
      const heatScore = calcHeatScore(outperformIndex, engagementScore);

      return {
        id: a.id,
        account_id: a.account_id,
        title: a.title,
        url: a.url,
        engagement_score: engagementScore,
        heat_score: heatScore,
      };
    });

    for (let i = 0; i < updates.length; i += upsertChunkSize) {
      const chunk = updates.slice(i, i + upsertChunkSize);
      const { error: upsertError } = await supabase
        .from('articles')
        .upsert(chunk, { onConflict: 'id' });
      if (upsertError) {
        throw new Error(`重算分数写入失败: ${upsertError.message}`);
      }
    }

    updated += updates.length;

    if (articles.length < pageSize) {
      break;
    }
    offset += articles.length;
  }

  return { updated };
}

// GET - 获取所有设置
export async function GET() {
  const supabase = createServerClient();

  try {
    const { data: settings, error } = await supabase
      .from('settings')
      .select('key, value');

    if (error) throw error;

    // 转换为对象格式
    const settingsObj: Record<string, unknown> = {};
    (settings || []).forEach((s) => {
      settingsObj[s.key] = s.value;
    });

    // 提供默认值
    const defaultSettings = {
      algorithm: { w1: 1, w2: 2, w3: 5, w4: 3, w5: 2, minRead: 1000 },
      email: { time: '08:00', address: '', enabled: true },
      cron: { time: '06:00' },
    };

    return NextResponse.json({
      success: true,
      data: {
        ...defaultSettings,
        ...settingsObj,
        algorithm: normalizeAlgorithmConfig(
          settingsObj.algorithm ?? defaultSettings.algorithm
        ),
      },
    });
  } catch (error) {
    console.error('获取设置失败:', error);
    return NextResponse.json(
      { success: false, error: '获取设置失败' },
      { status: 500 }
    );
  }
}

// PUT - 更新设置
export async function PUT(request: NextRequest) {
  const supabase = createServerClient();

  try {
    const body = await request.json();
    const { key, value } = body;

    if (!key || value === undefined) {
      return NextResponse.json(
        { success: false, error: '请提供key和value' },
        { status: 400 }
      );
    }

    const storedValue = key === 'algorithm' ? normalizeAlgorithmConfig(value) : value;

    // 使用 upsert 更新或插入
    const { error } = await supabase.from('settings').upsert(
      {
        key,
        value: storedValue,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' }
    );

    if (error) throw error;

    // 算法参数更新后，自动重算近30天文章分数，保证榜单即时生效
    if (key === 'algorithm') {
      const days = 30;
      try {
        const { updated } = await recalculateRecentArticleScores({
          supabase,
          algorithmConfig: storedValue as AlgorithmConfig,
          days,
        });

        return NextResponse.json({
          success: true,
          message: `算法参数已更新，已重算近${days}天文章分数（${updated}篇）`,
        });
      } catch (recalcError) {
        const msg =
          recalcError instanceof Error ? recalcError.message : String(recalcError);
        console.error('重算文章分数失败:', recalcError);
        return NextResponse.json({
          success: true,
          message: `算法参数已更新，但自动重算失败：${msg}`,
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: '设置已更新',
    });
  } catch (error) {
    console.error('更新设置失败:', error);
    return NextResponse.json(
      { success: false, error: '更新设置失败' },
      { status: 500 }
    );
  }
}
