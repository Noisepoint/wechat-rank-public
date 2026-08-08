import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

// GET - 获取收藏列表
export async function GET() {
  const supabase = createServerClient();

  try {
    const { data: favorites, error } = await supabase
      .from('favorites')
      .select(
        `
        *,
        article:articles(
          id,
          title,
          url,
          publish_time,
          read_count,
          like_count,
          wow_count,
          comment_count,
          heat_score,
          ai_category,
          article_type,
          account:accounts(name, avatar_url)
        )
      `
      )
      .order('created_at', { ascending: false });

    if (error) throw error;

    const items = (favorites || []).map((fav) => ({
      id: fav.id,
      note: fav.note,
      createdAt: fav.created_at,
      article: fav.article
        ? {
            id: fav.article.id,
            title: fav.article.title,
            url: fav.article.url,
            publishTime: fav.article.publish_time,
            readCount: fav.article.read_count,
            likeCount: fav.article.like_count,
            wowCount: fav.article.wow_count,
            commentCount: fav.article.comment_count,
            heatScore: fav.article.heat_score,
            aiCategory: fav.article.ai_category,
            articleType: fav.article.article_type,
            accountName: fav.article.account?.name || '未知',
            accountAvatar: fav.article.account?.avatar_url,
          }
        : null,
    }));

    return NextResponse.json({
      success: true,
      data: items,
    });
  } catch (error) {
    console.error('获取收藏列表失败:', error);
    return NextResponse.json(
      { success: false, error: '获取收藏列表失败' },
      { status: 500 }
    );
  }
}

// POST - 添加收藏
export async function POST(request: NextRequest) {
  const supabase = createServerClient();

  try {
    const body = await request.json();
    const { articleId, note } = body;

    if (!articleId) {
      return NextResponse.json(
        { success: false, error: '请指定文章ID' },
        { status: 400 }
      );
    }

    // 检查文章是否存在
    const { data: article, error: articleError } = await supabase
      .from('articles')
      .select('id')
      .eq('id', articleId)
      .single();

    if (articleError || !article) {
      return NextResponse.json(
        { success: false, error: '文章不存在' },
        { status: 404 }
      );
    }

    // 检查是否已收藏
    const { data: existing } = await supabase
      .from('favorites')
      .select('id')
      .eq('article_id', articleId)
      .single();

    if (existing) {
      return NextResponse.json(
        { success: false, error: '已收藏该文章' },
        { status: 400 }
      );
    }

    // 添加收藏
    const { data: favorite, error: insertError } = await supabase
      .from('favorites')
      .insert({
        article_id: articleId,
        note: note || null,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    return NextResponse.json({
      success: true,
      data: favorite,
    });
  } catch (error) {
    console.error('添加收藏失败:', error);
    return NextResponse.json(
      { success: false, error: '添加收藏失败' },
      { status: 500 }
    );
  }
}
