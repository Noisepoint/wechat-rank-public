'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Eye,
  ThumbsUp,
  MessageCircle,
  Bookmark,
  Star,
  Share2,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from 'lucide-react';

export interface ArticleItem {
  id: string;
  rank: number;
  title: string;
  url: string;
  accountName: string;
  accountId: string;
  accountAvatar?: string;
  publishTime: string | null;
  readCount: number;
  likeCount: number;
  wowCount: number;
  shareCount: number;
  commentCount: number;
  favoriteCount: number;
  outperformIndex: number;
  engagementScore: number;
  heatScore: number;
  aiCategory: string | null;
  articleType: string | null;
  isFavorited: boolean;
  favoriteId?: string | null;
}

interface ArticleListProps {
  articles: ArticleItem[];
  loading: boolean;
  page: number;
  totalPages: number;
  total: number;
  rankType: 'outperform' | 'engagement' | 'heat';
  onPageChange: (page: number) => void;
  onArticleClick: (article: ArticleItem) => void;
}

export function ArticleList({
  articles,
  loading,
  page,
  totalPages,
  total,
  rankType,
  onPageChange,
  onArticleClick,
}: ArticleListProps) {
  // 获取当前榜单类型对应的分数
  const getScore = (article: ArticleItem) => {
    switch (rankType) {
      case 'outperform':
        return article.outperformIndex;
      case 'engagement':
        return article.engagementScore;
      case 'heat':
      default:
        return article.heatScore;
    }
  };

  // 获取分数标签
  const getScoreLabel = () => {
    switch (rankType) {
      case 'outperform':
        return '超常指数';
      case 'engagement':
        return '互动分';
      case 'heat':
      default:
        return '热度分';
    }
  };

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
    const date = new Date(time);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);

    if (hours < 1) return '刚刚';
    if (hours < 24) return `${hours}小时前`;
    if (days < 7) return `${days}天前`;
    return date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
  };

  // 获取排名样式
  const getRankStyle = (rank: number) => {
    if (rank === 1) return 'bg-yellow-500 text-white';
    if (rank === 2) return 'bg-gray-400 text-white';
    if (rank === 3) return 'bg-amber-600 text-white';
    return 'bg-muted text-muted-foreground';
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-20">
          <div className="flex flex-col items-center justify-center text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin mb-4" />
            <p>加载中...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (articles.length === 0) {
    return (
      <Card>
        <CardContent className="py-20">
          <div className="text-center text-muted-foreground">
            <p className="text-lg">暂无数据</p>
            <p className="text-sm mt-2">请先添加公众号并等待数据采集</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-0">
          <div className="divide-y">
            {articles.map((article) => (
              <div
                key={article.id}
                className="flex items-start gap-4 p-4 hover:bg-muted/50 transition-colors"
              >
                {/* 排名 */}
                <div
                  className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${getRankStyle(
                    article.rank
                  )}`}
                >
                  {article.rank}
                </div>

                {/* 内容 */}
                <div className="flex-1 min-w-0">
                  {/* 标题 */}
                  <h3
                    className="font-medium hover:text-primary cursor-pointer line-clamp-2"
                    onClick={() => onArticleClick(article)}
                  >
                    {article.title}
                  </h3>

                  {/* 元信息 */}
                  <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground flex-wrap">
                    <span className="font-medium">{article.accountName}</span>
                    <span>·</span>
                    <span>{formatTime(article.publishTime)}</span>
                    {article.aiCategory && (
                      <>
                        <span>·</span>
                        <Badge variant="outline" className="text-xs">
                          {article.aiCategory}
                        </Badge>
                      </>
                    )}
                    {article.articleType && (
                      <Badge variant="outline" className="text-xs">
                        {article.articleType}
                      </Badge>
                    )}
                  </div>

                  {/* 互动数据 */}
                  <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground flex-wrap">
                    <span className="flex items-center gap-1">
                      <Eye className="h-3.5 w-3.5" />
                      {formatReadCount(article.readCount)}
                    </span>
                    <span className="flex items-center gap-1">
                      <ThumbsUp className="h-3.5 w-3.5" />
                      {article.likeCount}
                    </span>
                    <span className="flex items-center gap-1">
                      <Star className="h-3.5 w-3.5" />
                      {article.wowCount}
                    </span>
                    <span className="flex items-center gap-1">
                      <Share2 className="h-3.5 w-3.5" />
                      {article.shareCount}
                    </span>
                    <span className="flex items-center gap-1">
                      <MessageCircle className="h-3.5 w-3.5" />
                      {article.commentCount}
                    </span>
                    <span className="flex items-center gap-1">
                      <Bookmark className="h-3.5 w-3.5" />
                      {article.favoriteCount}
                    </span>
                  </div>
                </div>

                {/* 右侧区域 */}
                <div className="flex-shrink-0 flex flex-col items-end gap-2">
                  {/* 热度分 */}
                  <div className="text-right">
                    <Badge variant="secondary" className="font-mono text-sm">
                      {getScore(article).toFixed(1)}
                    </Badge>
                    <div className="text-xs text-muted-foreground mt-1">
                      {getScoreLabel()}
                    </div>
                  </div>

                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            共 {total} 篇文章，第 {page}/{totalPages} 页
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              上一页
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
            >
              下一页
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
