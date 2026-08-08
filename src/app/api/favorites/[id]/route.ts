import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

// DELETE - 取消收藏
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createServerClient();

  try {
    const { error } = await supabase.from('favorites').delete().eq('id', id);

    if (error) throw error;

    return NextResponse.json({
      success: true,
      message: '已取消收藏',
    });
  } catch (error) {
    console.error('取消收藏失败:', error);
    return NextResponse.json(
      { success: false, error: '取消收藏失败' },
      { status: 500 }
    );
  }
}

// PATCH - 更新收藏备注
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createServerClient();

  try {
    const body = await request.json();
    const { note } = body;

    const { data: favorite, error } = await supabase
      .from('favorites')
      .update({ note })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      data: favorite,
    });
  } catch (error) {
    console.error('更新收藏失败:', error);
    return NextResponse.json(
      { success: false, error: '更新收藏失败' },
      { status: 500 }
    );
  }
}
