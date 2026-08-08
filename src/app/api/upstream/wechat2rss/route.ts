import { NextResponse } from 'next/server';
import { getAccountListWithMeta, queryArticlesWithMeta } from '@/lib/wechat2rss';
import { getDayStartIsoDaysAgo } from '@/lib/date';

function guessRisk(err: string): boolean {
  const text = err.toLowerCase();
  return (
    err.includes('风控') ||
    err.includes('登录') ||
    err.includes('扫码') ||
    err.includes('验证码') ||
    text.includes('risk') ||
    text.includes('login')
  );
}

export async function GET() {
  const checkedAt = new Date().toISOString();

  // 1) 先验证 wechat2rss 的订阅列表接口是否可用
  const list = await getAccountListWithMeta(1, 1);
  if (list.err) {
    return NextResponse.json({
      success: true,
      data: {
        healthy: false,
        riskLikely: guessRisk(list.err),
        message: list.err,
        checkedAt,
      },
    });
  }

  const sample = list.data.accounts[0];
  if (!sample) {
    return NextResponse.json({
      success: true,
      data: {
        healthy: true,
        riskLikely: false,
        message: 'wechat2rss 可访问：暂无订阅公众号',
        checkedAt,
      },
    });
  }

  // 2) 采样一次文章查询，若上游风控/登录失效，通常会返回 err
  // 口径C：从今天往前推7天的00:00开始（服务端时区）
  const sevenDaysAgo = getDayStartIsoDaysAgo(7);
  const query = await queryArticlesWithMeta({
    bid: String(sample.id),
    after: sevenDaysAgo,
    content: false,
  });

  if (query.err) {
    return NextResponse.json({
      success: true,
      data: {
        healthy: false,
        riskLikely: guessRisk(query.err),
        message: query.err,
        checkedAt,
      },
    });
  }

  return NextResponse.json({
    success: true,
    data: {
      healthy: true,
      riskLikely: false,
      message: 'wechat2rss 可访问',
      checkedAt,
    },
  });
}
