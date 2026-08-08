const BASE_URL = process.env.WECHAT2RSS_BASE_URL || 'http://localhost:1200';
const TOKEN = process.env.WECHAT2RSS_TOKEN || '';

export interface Wechat2RssArticle {
  biz_id: number;
  biz_name: string;
  title: string;
  desc: string;
  link: string;
  created: string;
  content?: string;
}

export interface Wechat2RssAccount {
  id: number;
  name: string;
  link: string;
}

export interface Wechat2RssMetaResult<T> {
  data: T;
  err: string | null;
  status: number;
}

// 转换日期为 YYYYMMDD 格式
function formatDateForApi(dateStr: string): string {
  const date = new Date(dateStr);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

async function fetchWechat2rssJson(
  url: string
): Promise<Wechat2RssMetaResult<Record<string, unknown> | null>> {
  try {
    const res = await fetch(url);
    const text = await res.text();

    try {
      const json: unknown = JSON.parse(text);
      const jsonObj =
        json && typeof json === 'object' ? (json as Record<string, unknown>) : null;
      if (!jsonObj) {
        return {
          data: null,
          err: 'wechat2rss 响应结构异常',
          status: res.status,
        };
      }

      const err = jsonObj.err ? String(jsonObj.err) : null;
      return {
        data: jsonObj,
        err,
        status: res.status,
      };
    } catch {
      return {
        data: null,
        err: `wechat2rss 响应不是有效 JSON（HTTP ${res.status}）`,
        status: res.status,
      };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      data: null,
      err: `wechat2rss 请求失败：${message}`,
      status: 0,
    };
  }
}

export async function queryArticlesWithMeta(params: {
  bid?: string;
  after?: string;
  content?: boolean;
}): Promise<Wechat2RssMetaResult<Wechat2RssArticle[]>> {
  const searchParams = new URLSearchParams({ k: TOKEN });
  if (params.bid) searchParams.append('bid', params.bid);
  if (params.after) {
    // wechat2rss 要求日期格式为 YYYYMMDD（8位数字）
    const formattedDate = formatDateForApi(params.after);
    searchParams.append('after', formattedDate);
  }
  if (params.content !== undefined) {
    searchParams.append('content', params.content ? '1' : '0');
  }

  const { data, err, status } = await fetchWechat2rssJson(
    `${BASE_URL}/api/query?${searchParams}`
  );

  const list = data && Array.isArray(data.data) ? data.data : [];

  return {
    data: list as Wechat2RssArticle[],
    err,
    status,
  };
}

// 查询文章列表
export async function queryArticles(params: {
  bid?: string;
  after?: string;
  content?: boolean;
}): Promise<Wechat2RssArticle[]> {
  try {
    const { data, err } = await queryArticlesWithMeta(params);
    if (err) {
      console.error('wechat2rss错误:', err);
    }
    return data;
  } catch (error) {
    console.error('wechat2rss调用失败:', error);
    return [];
  }
}

export async function getAccountListWithMeta(
  page: number = 1,
  size: number = 100
): Promise<Wechat2RssMetaResult<{ accounts: Wechat2RssAccount[]; total: number }>> {
  const { data, err, status } = await fetchWechat2rssJson(
    `${BASE_URL}/list?k=${TOKEN}&page=${page}&size=${size}`
  );

  const list = data && Array.isArray(data.data) ? data.data : [];
  const meta =
    data && data.meta && typeof data.meta === 'object'
      ? (data.meta as Record<string, unknown>)
      : null;
  const totalRaw = meta?.total ?? 0;

  return {
    data: {
      accounts: list as Wechat2RssAccount[],
      total: Number(totalRaw) || 0,
    },
    err,
    status,
  };
}

// 获取已订阅公众号列表
export async function getAccountList(
  page: number = 1,
  size: number = 100
): Promise<{ accounts: Wechat2RssAccount[]; total: number }> {
  try {
    const { data, err } = await getAccountListWithMeta(page, size);
    if (err) {
      console.error('wechat2rss错误:', err);
      return { accounts: [], total: 0 };
    }
    return data;
  } catch (error) {
    console.error('wechat2rss调用失败:', error);
    return { accounts: [], total: 0 };
  }
}

// 添加公众号订阅
export async function addAccount(id: string): Promise<string | null> {
  try {
    const res = await fetch(`${BASE_URL}/add/${id}?k=${TOKEN}`);
    const data = await res.json();

    if (data.err) {
      console.error('wechat2rss错误:', data.err);
      return null;
    }

    return data.data;
  } catch (error) {
    console.error('wechat2rss调用失败:', error);
    return null;
  }
}

// 通过文章链接添加公众号订阅
export async function addAccountByUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(
      `${BASE_URL}/addurl?k=${TOKEN}&url=${encodeURIComponent(url)}`
    );
    const data = await res.json();

    if (data.err) {
      console.error('wechat2rss错误:', data.err);
      return null;
    }

    return data.data;
  } catch (error) {
    console.error('wechat2rss调用失败:', error);
    return null;
  }
}

// 通过文章链接添加订阅并返回完整信息
export async function addAccountByUrlWithInfo(url: string): Promise<{
  biz: string;
  name: string;
} | null> {
  try {
    // 1. 添加订阅
    const rssUrl = await addAccountByUrl(url);
    if (!rssUrl) return null;

    // 从 RSS URL 中提取 biz，格式: /feed/3265034346.xml
    const match = rssUrl.match(/\/feed\/(\d+)\.xml/);
    const biz = match ? match[1] : null;
    if (!biz) return null;

    // 等待让 wechat2rss 处理（增加到2秒）
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // 2. 尝试多次获取名称（最多重试3次，每次间隔2秒）
    for (let i = 0; i < 3; i++) {
      // 2.1 从账号列表获取
      const { accounts } = await getAccountList(1, 500);
      const account = accounts.find((a) => String(a.id) === biz);
      if (account && account.name && account.name.trim()) {
        return {
          biz,
          name: account.name.trim(),
        };
      }

      // 2.2 尝试从文章获取公众号名称
      const articles = await queryArticles({ bid: biz });
      if (articles.length > 0 && articles[0].biz_name && articles[0].biz_name.trim()) {
        return {
          biz,
          name: articles[0].biz_name.trim(),
        };
      }

      // 如果是最后一次重试，不再等待
      if (i < 2) {
        console.log(`获取公众号名称第 ${i + 1} 次尝试失败，等待重试...`);
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    // 3. 都没有，返回 biz 作为临时名称（后续同步时会更新）
    console.log(`无法获取公众号名称，使用临时名称: 公众号_${biz}`);
    return {
      biz,
      name: `公众号_${biz}`,
    };
  } catch (error) {
    console.error('添加订阅失败:', error);
    return null;
  }
}

// 获取单个公众号的详细信息
export async function getAccountInfo(biz: string): Promise<{
  name: string;
  articleCount: number;
} | null> {
  try {
    // 从账号列表获取
    const { accounts } = await getAccountList(1, 500);
    const account = accounts.find((a) => String(a.id) === biz);

    // 从文章获取
    const articles = await queryArticles({ bid: biz });

    let name = '';
    if (account && account.name && account.name.trim()) {
      name = account.name.trim();
    } else if (articles.length > 0 && articles[0].biz_name && articles[0].biz_name.trim()) {
      name = articles[0].biz_name.trim();
    }

    return {
      name,
      articleCount: articles.length,
    };
  } catch (error) {
    console.error('获取公众号信息失败:', error);
    return null;
  }
}

// 删除公众号订阅
export async function deleteAccount(id: string): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/del/${id}?k=${TOKEN}`);
    const data = await res.json();
    return !data.err;
  } catch (error) {
    console.error('wechat2rss调用失败:', error);
    return false;
  }
}
