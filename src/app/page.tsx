'use client';

import { useState, useEffect, useCallback } from 'react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArticleList, type ArticleItem } from '@/components/ArticleList';
import { ArticleModal } from '@/components/ArticleModal';
import { FilterBar } from '@/components/FilterBar';
import { toast } from 'sonner';

type PeriodType = 'day' | 'week' | 'month';
type RankType = 'outperform' | 'engagement' | 'heat';

interface ArticlesResponse {
  success: boolean;
  data?: {
    items: ArticleItem[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  error?: string;
}

export default function HomePage() {
  // 筛选状态
  const [period, setPeriod] = useState<PeriodType>('day');
  const [rankType, setRankType] = useState<RankType>('heat');
  const [category, setCategory] = useState('全部');
  const [type, setType] = useState('全部');
  const [keyword, setKeyword] = useState('');
  const [account, setAccount] = useState('');
  const [page, setPage] = useState(1);

  // 数据状态
  const [articles, setArticles] = useState<ArticleItem[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);

  // 弹窗状态
  const [selectedArticle, setSelectedArticle] = useState<ArticleItem | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // 获取文章列表
  const fetchArticles = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        period,
        rankType,
        page: page.toString(),
        limit: '20',
      });

      if (category && category !== '全部') {
        params.append('category', category);
      }
      if (type && type !== '全部') {
        params.append('type', type);
      }
      if (keyword) {
        params.append('keyword', keyword);
      }
      if (account) {
        params.append('account', account);
      }

      const res = await fetch(`/api/articles?${params}`);
      const json: ArticlesResponse = await res.json();

      if (json.success && json.data) {
        setArticles(json.data.items);
        setTotal(json.data.total);
        setTotalPages(json.data.totalPages);
      } else {
        toast.error(json.error || '获取数据失败');
      }
    } catch (error) {
      console.error('获取文章列表失败:', error);
      toast.error('获取数据失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, [period, rankType, category, type, keyword, account, page]);

  // 初始加载和筛选变化时重新获取数据
  useEffect(() => {
    const load = async () => {
      await fetchArticles();
    };

    void load();
  }, [fetchArticles]);

  // 处理文章点击
  const handleArticleClick = (article: ArticleItem) => {
    setSelectedArticle(article);
    setModalOpen(true);
  };

  // 处理搜索
  const handleSearch = (params: { keyword: string; account: string }) => {
    void params;
    setPage(1);
  };

  // 重置筛选
  const handleReset = () => {
    setCategory('全部');
    setType('全部');
    setKeyword('');
    setAccount('');
    setPage(1);
  };

  // 获取榜单名称
  const getRankName = () => {
    switch (rankType) {
      case 'outperform':
        return '超常发挥榜';
      case 'engagement':
        return '互动质量榜';
      case 'heat':
      default:
        return '综合热度榜';
    }
  };

  // 获取周期名称
  const getPeriodName = () => {
    switch (period) {
      case 'day':
        return '日榜';
      case 'week':
        return '周榜';
      case 'month':
        return '月榜';
    }
  };

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div>
        <h1 className="text-2xl font-bold">AI公众号热榜</h1>
        <p className="text-muted-foreground">发现AI领域最热门的选题</p>
      </div>

      {/* 榜单切换 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        {/* 时间周期 */}
        <Tabs
          value={period}
          onValueChange={(v) => {
            setPeriod(v as PeriodType);
            setPage(1);
          }}
        >
          <TabsList>
            <TabsTrigger value="day">日榜</TabsTrigger>
            <TabsTrigger value="week">周榜</TabsTrigger>
            <TabsTrigger value="month">月榜</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* 榜单类型 */}
        <Tabs
          value={rankType}
          onValueChange={(v) => {
            setRankType(v as RankType);
            setPage(1);
          }}
        >
          <TabsList>
            <TabsTrigger value="heat">综合热度</TabsTrigger>
            <TabsTrigger value="outperform">超常发挥</TabsTrigger>
            <TabsTrigger value="engagement">互动质量</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* 筛选栏 */}
      <FilterBar
        category={category}
        type={type}
        keyword={keyword}
        account={account}
        onCategoryChange={(value) => {
          setCategory(value);
          setPage(1);
        }}
        onTypeChange={(value) => {
          setType(value);
          setPage(1);
        }}
        onKeywordChange={setKeyword}
        onAccountChange={setAccount}
        onSearch={handleSearch}
        onReset={handleReset}
      />

      {/* 当前榜单信息 */}
      <div className="text-sm text-muted-foreground">
        当前查看：{getPeriodName()} - {getRankName()}
      </div>

      {/* 文章列表 */}
      <ArticleList
        articles={articles}
        loading={loading}
        page={page}
        totalPages={totalPages}
        total={total}
        rankType={rankType}
        onPageChange={setPage}
        onArticleClick={handleArticleClick}
      />

      {/* 文章预览弹窗 */}
      <ArticleModal
        article={selectedArticle}
        open={modalOpen}
        onOpenChange={setModalOpen}
      />
    </div>
  );
}
