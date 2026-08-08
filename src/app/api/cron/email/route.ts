import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { sendTop10Email } from '@/lib/email';

// 验证Cron密钥
function verifyCronSecret(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true;
  return authHeader === `Bearer ${cronSecret}`;
}

function normalizeEmailAddress(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim();
}

export async function POST(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServerClient();

  try {
    // 检查邮件是否启用
    const { data: emailSettings } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'email')
      .single();

    if (!emailSettings?.value?.enabled) {
      return NextResponse.json({
        success: true,
        message: '邮件推送已禁用',
      });
    }

    // 获取算法设置中的入榜门槛（与热榜一致），用于邮件筛选
    const { data: algorithmSetting } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'algorithm')
      .single();

    const minRead = algorithmSetting?.value?.minRead ?? 1000;

    // 获取过去24小时的Top10热文
    const yesterday = new Date(Date.now() - 86400000).toISOString();

    const { data: articles, error } = await supabase
      .from('articles')
      .select(
        `
        id,
        title,
        url,
        read_count,
        heat_score,
        account:accounts(name)
      `
      )
      .gte('publish_time', yesterday)
      .gte('read_count', minRead)
      .order('heat_score', { ascending: false })
      .limit(10);

    if (error) throw error;

    if (!articles || articles.length === 0) {
      return NextResponse.json({
        success: true,
        message: '没有符合条件的文章',
      });
    }

    // 收件人优先使用设置页配置的推送邮箱，未配置则回退到环境变量 EMAIL_TO
    const recipient = normalizeEmailAddress(emailSettings?.value?.address);

    // 格式化数据
    const top10 = articles.map((a, index) => {
      // account 是关联查询结果，可能是对象或数组
      const accountData = a.account as { name: string } | { name: string }[] | null;
      const accountName = Array.isArray(accountData)
        ? accountData[0]?.name
        : accountData?.name;

      return {
        rank: index + 1,
        title: a.title,
        accountName: accountName || '未知',
        readCount: a.read_count,
        heatScore: a.heat_score,
        url: a.url,
      };
    });

    // 发送邮件
    const success = await sendTop10Email(top10, { to: recipient || undefined });

    return NextResponse.json({
      success,
      message: success ? '邮件发送成功' : '邮件发送失败',
      articleCount: top10.length,
    });
  } catch (error) {
    console.error('邮件推送失败:', error);
    return NextResponse.json(
      { success: false, error: '邮件推送失败' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
