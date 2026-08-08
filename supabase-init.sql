-- ============================================
-- Supabase 数据库初始化 SQL
-- 复制全部内容到 Supabase SQL Editor 执行
-- ============================================

-- 公众号账号表
CREATE TABLE accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  wechat_id VARCHAR(100),
  biz VARCHAR(100),
  avatar_url TEXT,
  description TEXT,
  is_preset BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 文章表
CREATE TABLE articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
  title VARCHAR(500) NOT NULL,
  url TEXT NOT NULL UNIQUE,
  content TEXT,
  publish_time TIMESTAMPTZ,

  -- 互动数据
  read_count INTEGER DEFAULT 0,
  like_count INTEGER DEFAULT 0,
  wow_count INTEGER DEFAULT 0,
  share_count INTEGER DEFAULT 0,
  comment_count INTEGER DEFAULT 0,
  favorite_count INTEGER DEFAULT 0,

  -- 计算字段
  outperform_index DECIMAL(10,4) DEFAULT 0,
  engagement_score DECIMAL(10,4) DEFAULT 0,
  heat_score DECIMAL(10,4) DEFAULT 0,

  -- 分类
  ai_category VARCHAR(50),
  article_type VARCHAR(50),
  category_manual BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 收藏表
CREATE TABLE favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id UUID REFERENCES articles(id) ON DELETE CASCADE,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(article_id)
);

-- 设置表
CREATE TABLE settings (
  key VARCHAR(100) PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- API用量记录表
CREATE TABLE api_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL UNIQUE,
  call_count INTEGER DEFAULT 0,
  cost DECIMAL(10,4) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 插入默认设置
INSERT INTO settings (key, value) VALUES
('algorithm', '{"w1": 1, "w2": 2, "w3": 5, "w4": 3, "w5": 2, "minRead": 1000}'),
('email', '{"time": "08:00", "address": "", "enabled": true}'),
('cron', '{"time": "06:00"}');

-- 创建索引
CREATE INDEX idx_articles_account ON articles(account_id);
CREATE INDEX idx_articles_publish_time ON articles(publish_time DESC);
CREATE INDEX idx_articles_heat_score ON articles(heat_score DESC);
CREATE INDEX idx_articles_outperform ON articles(outperform_index DESC);
CREATE INDEX idx_articles_category ON articles(ai_category, article_type);
CREATE INDEX idx_articles_created ON articles(created_at DESC);

-- 创建更新时间触发器
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER accounts_updated_at
  BEFORE UPDATE ON accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER articles_updated_at
  BEFORE UPDATE ON articles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- API用量累加函数
CREATE OR REPLACE FUNCTION increment_api_usage(
  p_date DATE,
  p_count INTEGER,
  p_cost DECIMAL
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO api_usage (date, call_count, cost)
  VALUES (p_date, p_count, p_cost)
  ON CONFLICT (date)
  DO UPDATE SET
    call_count = api_usage.call_count + p_count,
    cost = api_usage.cost + p_cost;
END;
$$ LANGUAGE plpgsql;
