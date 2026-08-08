import { createServerClient } from './supabase';

const BASE_URL = 'https://www.dajiala.com/fbmain/monitor/v3';

interface DajialaResponse<T> {
  code: number;
  msg: string;
  data: T;
  cost_money?: number;
  remain_money?: number;
}

// Pro接口返回的完整互动数据
interface ReadZanProData {
  read: number;
  zan: number;
  looking: number;
  share_num: number;
  collect_num: number;
  comment_count: number;
}

// 获取文章完整互动数据（使用Pro接口）
export async function getArticleStats(url: string): Promise<{
  read_count: number;
  like_count: number;
  wow_count: number;
  share_count: number;
  favorite_count: number;
  comment_count: number;
} | null> {
  try {
    const res = await fetch(`${BASE_URL}/read_zan_pro`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        key: process.env.DAJIALA_API_KEY,
        verifycode: process.env.DAJIALA_VERIFY_CODE || '',
      }),
    });

    const data: DajialaResponse<ReadZanProData> = await res.json();

    if (data.code !== 0) {
      console.error('极致了API错误:', data.msg);
      return null;
    }

    return {
      read_count: data.data.read,
      like_count: data.data.zan,
      wow_count: data.data.looking,
      share_count: data.data.share_num,
      favorite_count: data.data.collect_num,
      comment_count: data.data.comment_count === -1 ? 0 : data.data.comment_count,
    };
  } catch (error) {
    console.error('极致了API调用失败:', error);
    return null;
  }
}

// 记录API调用
export async function recordApiUsage(
  callCount: number = 1,
  costPerCall: number = 0.06
) {
  const supabase = createServerClient();
  const today = new Date().toISOString().split('T')[0];

  await supabase.rpc('increment_api_usage', {
    p_date: today,
    p_count: callCount,
    p_cost: callCount * costPerCall,
  });
}

// 获取API余额
export async function getApiBalance(): Promise<number | null> {
  try {
    const res = await fetch(`${BASE_URL}/get_balance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: process.env.DAJIALA_API_KEY,
        verifycode: process.env.DAJIALA_VERIFY_CODE || '',
      }),
    });

    const data = await res.json();

    // 兼容不同返回结构：
    // 1) { remain_money: 123 }
    // 2) { data: { remain_money: 123 } }
    // 3) { code: 0, msg: 'ok', data: { remain_money: 123 } }
    const remainMoney =
      data?.remain_money ??
      data?.data?.remain_money ??
      data?.remain ??
      data?.data?.remain ??
      null;

    if (remainMoney == null) {
      console.error('获取余额返回结构异常:', data);
      return null;
    }

    const num = Number(remainMoney);
    return Number.isFinite(num) ? num : null;
  } catch (error) {
    console.error('获取余额失败:', error);
    return null;
  }
}
