import { NextRequest, NextResponse } from 'next/server';

function getManualSecret(): string | null {
  return process.env.MANUAL_COLLECT_SECRET || process.env.CRON_SECRET || null;
}

function shouldRequireManualSecret(): boolean {
  // 可能公网部署时，生产环境必须校验，避免任何人点击触发外部调用/费用
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
          error: '未配置 MANUAL_COLLECT_SECRET（或 CRON_SECRET），无法在生产环境启用手动发送邮件',
        },
        { status: 500 }
      );
    }

    if (token !== manualSecret) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
  }

  // 复用现有邮件逻辑（/api/cron/email），由服务端带上 CRON_SECRET 调用，避免在前端暴露密钥
  const cronSecret = process.env.CRON_SECRET || '';
  const targetUrl = new URL('/api/cron/email', request.nextUrl);

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

