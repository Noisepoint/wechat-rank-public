import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { deleteAccount as deleteWechat2rssAccount } from '@/lib/wechat2rss';

// GET - 获取账号详情
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createServerClient();

  try {
    const { data: account, error } = await supabase
      .from('accounts')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !account) {
      return NextResponse.json(
        { success: false, error: '账号不存在' },
        { status: 404 }
      );
    }

    // 获取文章统计
    const { count: articleCount } = await supabase
      .from('articles')
      .select('*', { count: 'exact', head: true })
      .eq('account_id', id);

    // 获取近14天篇均阅读
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

    const { data: recentArticles } = await supabase
      .from('articles')
      .select('read_count')
      .eq('account_id', id)
      .gte('publish_time', fourteenDaysAgo.toISOString());

    const avgReadCount =
      recentArticles && recentArticles.length > 0
        ? Math.round(
            recentArticles.reduce((sum, a) => sum + a.read_count, 0) /
              recentArticles.length
          )
        : 0;

    return NextResponse.json({
      success: true,
      data: {
        id: account.id,
        name: account.name,
        wechatId: account.wechat_id,
        biz: account.biz,
        avatarUrl: account.avatar_url,
        description: account.description,
        isPreset: account.is_preset,
        createdAt: account.created_at,
        articleCount: articleCount || 0,
        avgReadCount,
      },
    });
  } catch (error) {
    console.error('获取账号详情失败:', error);
    return NextResponse.json(
      { success: false, error: '获取账号详情失败' },
      { status: 500 }
    );
  }
}

// DELETE - 删除账号
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createServerClient();

  try {
    // 检查账号是否存在
    const { data: account, error: findError } = await supabase
      .from('accounts')
      .select('id, name, biz')
      .eq('id', id)
      .single();

    if (findError || !account) {
      return NextResponse.json(
        { success: false, error: '账号不存在' },
        { status: 404 }
      );
    }

    // 同时删除 wechat2rss 的订阅
    if (account.biz) {
      await deleteWechat2rssAccount(account.biz);
    }

    // 删除账号（文章会级联删除）
    const { error: deleteError } = await supabase
      .from('accounts')
      .delete()
      .eq('id', id);

    if (deleteError) throw deleteError;

    return NextResponse.json({
      success: true,
      message: `已删除账号: ${account.name}`,
    });
  } catch (error) {
    console.error('删除账号失败:', error);
    return NextResponse.json(
      { success: false, error: '删除账号失败' },
      { status: 500 }
    );
  }
}

// PATCH - 更新账号信息
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createServerClient();

  try {
    const body = await request.json();
    const { name, description } = body;

    const updateData: Record<string, string> = {};
    if (name) updateData.name = name;
    if (description !== undefined) updateData.description = description;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { success: false, error: '没有要更新的字段' },
        { status: 400 }
      );
    }

    const { data: account, error } = await supabase
      .from('accounts')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      data: account,
    });
  } catch (error) {
    console.error('更新账号失败:', error);
    return NextResponse.json(
      { success: false, error: '更新账号失败' },
      { status: 500 }
    );
  }
}
