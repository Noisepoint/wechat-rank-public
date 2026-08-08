import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

// GET - 获取文章详情
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createServerClient();

  try {
    const { data: article, error } = await supabase
      .from('articles')
      .select(
        `
        *,
        account:accounts(id, name, avatar_url, description),
        favorite:favorites(id, note)
      `
      )
      .eq('id', id)
      .single();

    if (error || !article) {
      return NextResponse.json(
        { success: false, error: '文章不存在' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        id: article.id,
        title: article.title,
        url: article.url,
        content: article.content,
        accountName: article.account?.name || '未知',
        accountId: article.account_id,
        accountAvatar: article.account?.avatar_url,
        accountDescription: article.account?.description,
        publishTime: article.publish_time,
        readCount: article.read_count,
        likeCount: article.like_count,
        wowCount: article.wow_count,
        shareCount: Number(article.share_count ?? 0),
        commentCount: article.comment_count,
        favoriteCount: article.favorite_count,
        outperformIndex: article.outperform_index,
        engagementScore: article.engagement_score,
        heatScore: article.heat_score,
        aiCategory: article.ai_category,
        articleType: article.article_type,
        categoryManual: article.category_manual,
        isFavorited: article.favorite && article.favorite.length > 0,
        favoriteId: article.favorite?.[0]?.id || null,
        favoriteNote: article.favorite?.[0]?.note || null,
      },
    });
  } catch (error) {
    console.error('获取文章详情失败:', error);
    return NextResponse.json(
      { success: false, error: '获取文章详情失败' },
      { status: 500 }
    );
  }
}

// PATCH - 更新文章信息（支持手动修正分类）
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createServerClient();

  try {
    const body = await request.json();
    const { aiCategory, articleType } = body;

    // 构建更新数据
    const updateData: Record<string, unknown> = {};

    if (aiCategory !== undefined) {
      updateData.ai_category = aiCategory;
      updateData.category_manual = true; // 标记为手动修改
    }

    if (articleType !== undefined) {
      updateData.article_type = articleType;
      updateData.category_manual = true; // 标记为手动修改
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { success: false, error: '没有要更新的字段' },
        { status: 400 }
      );
    }

    const { data: article, error } = await supabase
      .from('articles')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    if (!article) {
      return NextResponse.json(
        { success: false, error: '文章不存在' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        id: article.id,
        aiCategory: article.ai_category,
        articleType: article.article_type,
        categoryManual: article.category_manual,
      },
      message: '分类更新成功',
    });
  } catch (error) {
    console.error('更新文章失败:', error);
    return NextResponse.json(
      { success: false, error: '更新文章失败' },
      { status: 500 }
    );
  }
}
