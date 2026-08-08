'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Eye,
  ThumbsUp,
  MessageCircle,
  Bookmark,
  Star,
  ExternalLink,
  Loader2,
  Share2,
} from 'lucide-react';
import { toast } from 'sonner';
import type { ArticleItem } from './ArticleList';

interface ArticleDetail extends ArticleItem {
  content: string | null;
  accountDescription?: string;
  favoriteNote?: string | null;
  categoryManual?: boolean;
}

interface ArticleModalProps {
  article: ArticleItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ArticleModal({
  article,
  open,
  onOpenChange,
}: ArticleModalProps) {
  const [detail, setDetail] = useState<ArticleDetail | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchArticleDetail = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/articles/${id}`);
      const json = await res.json();
      if (json.success) {
        setDetail(json.data);
      }
    } catch (error) {
      console.error('获取文章详情失败:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && article) {
      const load = async () => {
        await fetchArticleDetail(article.id);
      };

      void load();
    }
  }, [open, article, fetchArticleDetail]);

  // 格式化阅读量
  const formatReadCount = (count: number) => {
    if (count >= 10000) {
      return `${(count / 10000).toFixed(1)}万`;
    }
    return count.toString();
  };

  // 格式化时间
  const formatTime = (time: string | null) => {
    if (!time) return '';
    return new Date(time).toLocaleString('zh-CN', {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const displayData = detail || article;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="text-xl leading-relaxed pr-8">
            {displayData?.title}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex-1 flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : displayData ? (
          <div className="flex-1 overflow-y-auto space-y-4">
            {/* 元信息 */}
            <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
              <span className="font-medium text-foreground">
                {displayData.accountName}
              </span>
              <span>·</span>
              <span>{formatTime(displayData.publishTime)}</span>
            </div>

            {/* 分类标签 */}
            <div className="flex items-center gap-2 flex-wrap">
              {displayData.aiCategory && (
                <Badge variant="outline">{displayData.aiCategory}</Badge>
              )}
              {displayData.articleType && (
                <Badge variant="outline">{displayData.articleType}</Badge>
              )}
            </div>

            {/* 互动数据 */}
            <div className="flex items-center gap-6 p-4 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-2">
                <Eye className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">
                  {formatReadCount(displayData.readCount)}
                </span>
                <span className="text-sm text-muted-foreground">阅读</span>
              </div>
              <div className="flex items-center gap-2">
                <ThumbsUp className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{displayData.likeCount}</span>
                <span className="text-sm text-muted-foreground">点赞</span>
              </div>
              <div className="flex items-center gap-2">
                <Star className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{displayData.wowCount}</span>
                <span className="text-sm text-muted-foreground">在看</span>
              </div>
              <div className="flex items-center gap-2">
                <Share2 className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{displayData.shareCount}</span>
                <span className="text-sm text-muted-foreground">转发</span>
              </div>
              <div className="flex items-center gap-2">
                <MessageCircle className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{displayData.commentCount}</span>
                <span className="text-sm text-muted-foreground">评论</span>
              </div>
              <div className="flex items-center gap-2">
                <Bookmark className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{displayData.favoriteCount}</span>
                <span className="text-sm text-muted-foreground">收藏</span>
              </div>
            </div>

            {/* 热度指标 */}
            <div className="flex items-center gap-4">
              <div className="flex-1 p-3 bg-muted/30 rounded-lg text-center">
                <div className="text-2xl font-bold text-primary">
                  {displayData.outperformIndex.toFixed(2)}
                </div>
                <div className="text-xs text-muted-foreground">超常指数</div>
              </div>
              <div className="flex-1 p-3 bg-muted/30 rounded-lg text-center">
                <div className="text-2xl font-bold text-primary">
                  {displayData.engagementScore.toFixed(2)}
                </div>
                <div className="text-xs text-muted-foreground">互动质量分</div>
              </div>
              <div className="flex-1 p-3 bg-muted/30 rounded-lg text-center">
                <div className="text-2xl font-bold text-primary">
                  {displayData.heatScore.toFixed(2)}
                </div>
                <div className="text-xs text-muted-foreground">综合热度分</div>
              </div>
            </div>

            <Separator />

            {/* 正文内容 */}
            {detail?.content ? (
              <div className="prose prose-sm max-w-none dark:prose-invert">
                <div
                  dangerouslySetInnerHTML={{ __html: detail.content }}
                  className="article-content"
                />
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <p>正文内容暂未采集</p>
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => window.open(displayData.url, '_blank')}
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  查看原文
                </Button>
              </div>
            )}
          </div>
        ) : null}

        {/* 底部操作栏 */}
        {displayData && (
          <>
            <Separator />
            <div className="flex items-center justify-between pt-2 flex-shrink-0">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(displayData.url);
                    toast.success('链接已复制');
                  }}
                >
                  <Share2 className="h-4 w-4 mr-2" />
                  复制链接
                </Button>
              </div>
              <Button
                variant="outline"
                onClick={() => window.open(displayData.url, '_blank')}
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                查看原文
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
