import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { getAccountListWithMeta, queryArticlesWithMeta } from '@/lib/wechat2rss';

// POST - 从 wechat2rss 同步账号
export async function POST() {
  const supabase = createServerClient();

  try {
    // 1. 从 wechat2rss 获取已订阅的公众号列表
    const { data: rssList, err: listErr } = await getAccountListWithMeta(1, 500);
    if (listErr) {
      return NextResponse.json(
        { success: false, error: `wechat2rss 异常：${listErr}` },
        { status: 502 }
      );
    }
    const rssAccounts = rssList.accounts;

    if (rssAccounts.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'wechat2rss 中暂无订阅的公众号',
        synced: 0,
        updated: 0,
      });
    }

    // 2. 获取本地数据库中已有的账号
    const { data: localAccounts } = await supabase
      .from('accounts')
      .select('id, biz, name');

    const localBizSet = new Set(
      (localAccounts || []).map((a) => a.biz).filter(Boolean)
    );
    const localNameSet = new Set(
      (localAccounts || []).map((a) => a.name).filter(Boolean)
    );

    // 3. 找出需要新增的账号
    const newAccounts = rssAccounts.filter(
      (rssAccount) =>
        !localBizSet.has(String(rssAccount.id)) &&
        !(rssAccount.name && localNameSet.has(rssAccount.name))
    );

    // 4. 更新已有账号的信息（名称为空或是临时名称的）
    let updatedCount = 0;
    for (const localAccount of localAccounts || []) {
      // 只处理名称为空或是临时名称的账号
      if (!localAccount.name || localAccount.name.startsWith('公众号_') || localAccount.name.trim() === '') {
        let newName = '';

        // 4.1 先尝试从 wechat2rss 账号列表获取名称
        if (localAccount.biz) {
          const rssAccount = rssAccounts.find((a) => String(a.id) === localAccount.biz);
          if (rssAccount && rssAccount.name && rssAccount.name.trim()) {
            newName = rssAccount.name.trim();
          }
        }

        // 4.2 如果账号列表没有名称，尝试从文章获取
        if (!newName && localAccount.biz) {
          try {
            const { data: articles, err } = await queryArticlesWithMeta({ bid: localAccount.biz });
            if (err) {
              console.error('从文章获取公众号名称失败:', err);
            } else if (
              articles.length > 0 &&
              articles[0].biz_name &&
              articles[0].biz_name.trim()
            ) {
              newName = articles[0].biz_name.trim();
            }
          } catch (err) {
            console.error('从文章获取公众号名称失败:', err);
          }
        }

        // 4.3 更新名称
        if (newName && newName !== localAccount.name) {
          await supabase
            .from('accounts')
            .update({ name: newName })
            .eq('id', localAccount.id);
          updatedCount++;
          console.log(`更新账号名称: ${localAccount.name || '空'} -> ${newName}`);
        }
      }
    }

    // 5. 批量插入新账号（只插入有名称的，或用临时名称）
    if (newAccounts.length > 0) {
      const insertData = newAccounts.map((account) => ({
        name: account.name && account.name.trim() ? account.name.trim() : `公众号_${account.id}`,
        biz: String(account.id),
      }));

      const { error: insertError } = await supabase
        .from('accounts')
        .insert(insertData);

      if (insertError) throw insertError;
    }

    return NextResponse.json({
      success: true,
      message: `同步成功${newAccounts.length > 0 ? `，新增 ${newAccounts.length} 个账号` : ''}${updatedCount > 0 ? `，更新 ${updatedCount} 个账号名称` : ''}`,
      synced: newAccounts.length,
      updated: updatedCount,
      newAccounts: newAccounts.map((a) => a.name || `公众号_${a.id}`),
    });
  } catch (error) {
    console.error('同步账号失败:', error);
    return NextResponse.json(
      { success: false, error: '同步账号失败' },
      { status: 500 }
    );
  }
}

// GET 也支持（方便测试）
export async function GET() {
  return POST();
}
