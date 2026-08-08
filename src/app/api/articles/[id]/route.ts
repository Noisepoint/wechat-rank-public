import { NextRequest, NextResponse } from 'next/server';
import { createPublicReadClient } from '@/lib/supabase';

// GET - 获取文章详情
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createPublicReadClient();

  try {
    const { data: article, error } = await supabase
      .from('articles')
      .select(
        `
        *,
        account:accounts(id, name, avatar_url, description)
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
        isFavorited: false,
        favoriteId: null,
        favoriteNote: null,
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

// 公网版不提供文章修改能力。
export async function PATCH() {
  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}
