import { NextRequest, NextResponse } from 'next/server';

function getManualSecret(): string | null {
  return process.env.MANUAL_COLLECT_SECRET || process.env.CRON_SECRET || null;
}

function shouldRequireManualSecret(): boolean {
  // 可能公网部署时，生产环境必须校验，避免任何人点击触发大量外部调用/费用
  return process.env.NODE_ENV === 'production';
}

export async function POST(request: NextRequest) {
  const manualSecret = getManualSecret();
  const requireSecret = shouldRequireManualSecret();

  let token = request.headers.get('x-collect-token') || '';
  if (!token) {
    try {
      const body = await request.json();
      token = String(body?.token || '');
    } catch {
      token = '';
    }
  }

  if (requireSecret) {
    if (!manualSecret) {
      return NextResponse.json(
        {
          success: false,
          error: '未配置 MANUAL_COLLECT_SECRET（或 CRON_SECRET），无法在生产环境启用手动采集',
        },
        { status: 500 }
      );
    }

    if (token !== manualSecret) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
  }

  // 复用现有采集逻辑（/api/cron/collect），由服务端带上 CRON_SECRET 调用，避免在前端暴露密钥
  const cronSecret = process.env.CRON_SECRET || '';
  const targetUrl = new URL('/api/cron/collect', request.nextUrl);
  // 手动采集默认强制回看 7 天，用于补漏文章（例如首次订阅时上游未吐全）
  targetUrl.searchParams.set('lookbackDays', '7');

  const res = await fetch(targetUrl.toString(), {
    method: 'POST',
    headers: {
      ...(cronSecret ? { authorization: `Bearer ${cronSecret}` } : {}),
    },
  });

  const contentType = res.headers.get('content-type') || 'application/json';
  const text = await res.text();

  return new NextResponse(text, {
    status: res.status,
    headers: { 'Content-Type': contentType },
  });
}
