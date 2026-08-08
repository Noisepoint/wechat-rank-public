'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search, X } from 'lucide-react';
import { AI_CATEGORY_OPTIONS, ARTICLE_TYPE_OPTIONS } from '@/lib/classifier';

interface FilterBarProps {
  category: string;
  type: string;
  keyword: string;
  account: string;
  onCategoryChange: (value: string) => void;
  onTypeChange: (value: string) => void;
  onKeywordChange: (value: string) => void;
  onAccountChange: (value: string) => void;
  onSearch: (params: { keyword: string; account: string }) => void;
  onReset: () => void;
}

export function FilterBar({
  category,
  type,
  keyword,
  account,
  onCategoryChange,
  onTypeChange,
  onKeywordChange,
  onAccountChange,
  onSearch,
  onReset,
}: FilterBarProps) {
  const [searchKeyword, setSearchKeyword] = useState(keyword);
  const [searchAccount, setSearchAccount] = useState(account);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const keywordEl = form.elements.namedItem('keyword') as HTMLInputElement | null;
    const accountEl = form.elements.namedItem('account') as HTMLInputElement | null;

    // 直接从 DOM 读值，避免中文输入法在 Enter 提交时 state 还没更新的情况
    const nextKeyword = (keywordEl?.value ?? searchKeyword).trim();
    const nextAccount = (accountEl?.value ?? searchAccount).trim();

    setSearchKeyword(nextKeyword);
    setSearchAccount(nextAccount);
    onKeywordChange(nextKeyword);
    onAccountChange(nextAccount);
    onSearch({ keyword: nextKeyword, account: nextAccount });
  };

  const handleReset = () => {
    setSearchKeyword('');
    setSearchAccount('');
    onReset();
  };

  const hasFilters =
    category !== '全部' || type !== '全部' || keyword || account;

  return (
    <div className="space-y-4">
      {/* 第一行：分类筛选 */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground whitespace-nowrap">
            AI领域：
          </span>
          <Select value={category} onValueChange={onCategoryChange}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="全部" />
            </SelectTrigger>
            <SelectContent>
              {AI_CATEGORY_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground whitespace-nowrap">
            文章类型：
          </span>
          <Select value={type} onValueChange={onTypeChange}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="全部" />
            </SelectTrigger>
            <SelectContent>
              {ARTICLE_TYPE_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* 第二行：搜索和操作 */}
      <form className="flex flex-wrap items-center gap-4" onSubmit={handleSubmit}>
        <div className="flex items-center gap-2 flex-1 min-w-[200px] max-w-[300px]">
          <Input
            name="keyword"
            placeholder="搜索标题关键词..."
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            className="flex-1"
          />
        </div>

        <div className="flex items-center gap-2 flex-1 min-w-[200px] max-w-[300px]">
          <Input
            name="account"
            placeholder="搜索公众号名称..."
            value={searchAccount}
            onChange={(e) => setSearchAccount(e.target.value)}
            className="flex-1"
          />
        </div>

        <div className="flex items-center gap-2">
          <Button type="submit" size="sm">
            <Search className="h-4 w-4 mr-1" />
            搜索
          </Button>

          {hasFilters && (
            <Button type="button" variant="outline" size="sm" onClick={handleReset}>
              <X className="h-4 w-4 mr-1" />
              重置
            </Button>
          )}

        </div>
      </form>
    </div>
  );
}
