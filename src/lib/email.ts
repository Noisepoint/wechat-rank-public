import { Resend } from 'resend';

// 延迟初始化，避免构建时缺少环境变量错误
let resend: Resend | null = null;

function getResend() {
  if (!resend) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error('RESEND_API_KEY is not configured');
    }
    resend = new Resend(apiKey);
  }
  return resend;
}

interface ArticleSummary {
  rank: number;
  title: string;
  accountName: string;
  readCount: number;
  heatScore: number;
  url: string;
}

function normalizeRecipients(input: string | string[] | null | undefined): string[] {
  if (!input) return [];

  const candidates = Array.isArray(input) ? input : String(input).split(/[,\n;]+/);
  return candidates
    .map((s) => String(s).trim())
    .filter((s) => s.length > 0);
}

function resolveRecipients(override?: string | string[]): string[] {
  const fromOverride = normalizeRecipients(override);
  if (fromOverride.length > 0) return fromOverride;

  return normalizeRecipients(process.env.EMAIL_TO);
}

// 发送Top10热文邮件
export async function sendTop10Email(
  articles: ArticleSummary[],
  options?: { to?: string | string[] }
) {
  const recipients = resolveRecipients(options?.to);
  if (recipients.length === 0) {
    console.error('未配置收件人邮箱（优先使用设置页推送邮箱，其次使用环境变量 EMAIL_TO）');
    return false;
  }

  const today = new Date().toLocaleDateString('zh-CN');

  const articleList = articles
    .map(
      (a) => `
    <tr>
      <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: center; color: ${a.rank <= 3 ? '#f59e0b' : '#666'}; font-weight: bold;">
        ${a.rank}
      </td>
      <td style="padding: 12px; border-bottom: 1px solid #eee;">
        <a href="${a.url}" style="color: #1a1a1a; text-decoration: none; font-weight: 500;">
          ${a.title}
        </a>
        <div style="color: #666; font-size: 12px; margin-top: 4px;">
          ${a.accountName} · ${(a.readCount / 10000).toFixed(1)}万阅读
        </div>
      </td>
      <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: center;">
        <span style="background: #f3f4f6; padding: 4px 8px; border-radius: 4px; font-family: monospace;">
          ${a.heatScore.toFixed(1)}
        </span>
      </td>
    </tr>
  `
    )
    .join('');

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>AI公众号热榜 - ${today}</title>
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; padding: 20px;">
      <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
        <div style="background: linear-gradient(135deg, #f97316, #ea580c); padding: 24px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px;">AI公众号热榜</h1>
          <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0;">${today} 热门文章 Top10</p>
        </div>

        <div style="padding: 20px;">
          <table style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="background: #f9fafb;">
                <th style="padding: 12px; text-align: center; font-size: 12px; color: #666; width: 50px;">排名</th>
                <th style="padding: 12px; text-align: left; font-size: 12px; color: #666;">文章</th>
                <th style="padding: 12px; text-align: center; font-size: 12px; color: #666; width: 80px;">热度</th>
              </tr>
            </thead>
            <tbody>
              ${articleList}
            </tbody>
          </table>
        </div>

        <div style="padding: 16px 20px; background: #f9fafb; text-align: center; color: #666; font-size: 12px;">
          此邮件由 AI公众号热榜 自动发送
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    const { error } = await getResend().emails.send({
      from: 'AI热榜 <onboarding@resend.dev>',
      to: recipients,
      subject: `AI公众号热榜 - ${today} Top10`,
      html,
    });

    if (error) {
      console.error('发送邮件失败:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('发送邮件异常:', error);
    return false;
  }
}

// 发送爆文提醒邮件
export async function sendHotAlertEmail(
  article: ArticleSummary & { outperformIndex: number },
  options?: { to?: string | string[] }
) {
  const recipients = resolveRecipients(options?.to);
  if (recipients.length === 0) return false;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; padding: 20px;">
      <div style="max-width: 500px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
        <div style="background: #dc2626; padding: 20px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 20px;">爆文提醒</h1>
        </div>

        <div style="padding: 24px;">
          <h2 style="margin: 0 0 12px; font-size: 18px;">
            <a href="${article.url}" style="color: #1a1a1a; text-decoration: none;">
              ${article.title}
            </a>
          </h2>

          <p style="color: #666; margin: 0 0 16px;">
            ${article.accountName}
          </p>

          <div style="display: flex; gap: 16px; background: #f9fafb; padding: 16px; border-radius: 8px;">
            <div style="text-align: center; flex: 1;">
              <div style="font-size: 24px; font-weight: bold; color: #dc2626;">
                ${article.outperformIndex.toFixed(1)}x
              </div>
              <div style="font-size: 12px; color: #666;">超常指数</div>
            </div>
            <div style="text-align: center; flex: 1;">
              <div style="font-size: 24px; font-weight: bold; color: #1a1a1a;">
                ${(article.readCount / 10000).toFixed(1)}万
              </div>
              <div style="font-size: 12px; color: #666;">阅读量</div>
            </div>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    const { error } = await getResend().emails.send({
      from: 'AI热榜 <onboarding@resend.dev>',
      to: recipients,
      subject: `[爆文提醒] ${article.title}`,
      html,
    });

    return !error;
  } catch {
    return false;
  }
}
