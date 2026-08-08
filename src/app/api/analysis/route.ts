import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { getDayStartIsoDaysAgo } from '@/lib/date';

// 标题套路模式
const TITLE_PATTERNS = [
  { pattern: 'X个必备的XX', regex: /(\d+)\s*[个款种]\s*.*(必备|神器|工具|推荐)/i },
  { pattern: '我用XX做了XX', regex: /(我|他|她)用.*(做|完成|实现|创建)/i },
  { pattern: '刚刚，XX发布了', regex: /(刚刚|重磅|突发|最新).*(发布|上线|推出|更新)/i },
  { pattern: '手把手教你XX', regex: /(手把手|保姆级|从零|一步步).*(教|学|入门)/i },
  { pattern: 'XX实测/测评', regex: /(实测|测评|体验|试用|评测)/i },
  { pattern: '如何用XX', regex: /(如何|怎么|怎样).*(用|使用|利用)/i },
  { pattern: 'XX天/小时学会', regex: /(\d+)\s*(天|小时|分钟|周).*(学会|掌握|入门)/i },
  { pattern: 'XX vs XX对比', regex: /(vs|对比|PK|比较|谁更)/i },
  { pattern: '免费/白嫖XX', regex: /(免费|白嫖|0元|不花钱)/i },
  { pattern: '太强了/绝了', regex: /(太强|绝了|离谱|炸裂|疯了|牛)/i },
  { pattern: '这XX个XX', regex: /这\s*(\d+)\s*[个款种]/i },
  { pattern: '一文读懂/看懂', regex: /(一文|一篇|一张图).*(读懂|看懂|搞懂|了解)/i },
  { pattern: '收藏/建议收藏', regex: /(收藏|码住|建议收藏|先收藏)/i },
  { pattern: '深度解析/解读', regex: /(深度|全面|详细).*(解析|解读|分析|拆解)/i },
  { pattern: '最新/最全XX', regex: /(最新|最全|最强|最火|最好)/i },
];

// 高频关键词列表（AI领域相关）
const KEYWORDS_TO_TRACK = [
  // AI工具
  'ChatGPT', 'Claude', 'GPT-4', 'GPT-4o', 'Gemini', 'Midjourney', 'Sora', 'Cursor',
  'Copilot', 'Kimi', 'Coze', 'Dify', 'Stable Diffusion', 'DALL-E', 'Runway',
  'Pika', 'Luma', 'HeyGen', '豆包', '通义千问', '文心一言', 'Llama', 'DeepSeek',
  // AI概念
  'AI', '人工智能', '大模型', 'LLM', 'AGI', 'AIGC', 'Prompt', 'RAG', 'Agent',
  'AI写作', 'AI绘画', 'AI视频', 'AI编程', 'AI办公',
  // 动作词
  '教程', '攻略', '测评', '推荐', '盘点', '实战', '案例', '变现', '赚钱',
  '免费', '开源', '发布', '更新', '上线',
];

// 从标题中提取关键词
function extractKeywords(title: string): string[] {
  const found: string[] = [];
  const lowerTitle = title.toLowerCase();

  for (const kw of KEYWORDS_TO_TRACK) {
    if (lowerTitle.includes(kw.toLowerCase())) {
      found.push(kw);
    }
  }

  return found;
}

// 匹配标题套路
function matchPatterns(title: string): string[] {
  const matched: string[] = [];

  for (const { pattern, regex } of TITLE_PATTERNS) {
    if (regex.test(title)) {
      matched.push(pattern);
    }
  }

  return matched;
}

export async function GET(request: NextRequest) {
  const supabase = createServerClient();
  const searchParams = request.nextUrl.searchParams;
  const period = searchParams.get('period') || 'week';

  // 计算时间范围
  const now = new Date();
  let startDate: Date;

  switch (period) {
    case 'day':
      startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      break;
    case 'month':
      // 月维度：自然日窗口（从今天往前推30天的00:00开始）
      startDate = new Date(getDayStartIsoDaysAgo(30));
      break;
    case 'week':
    default:
      // 口径C：自然日窗口（从今天往前推7天的00:00开始）
      startDate = new Date(getDayStartIsoDaysAgo(7));
      break;
  }

  try {
    // 获取算法设置中的入榜门槛
    const { data: algorithmSetting } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'algorithm')
      .single();

    const minRead = algorithmSetting?.value?.minRead ?? 1000;

    // 获取时间范围内的入榜文章（符合阅读量门槛）
    const { data: articles, error } = await supabase
      .from('articles')
      .select('id, title, heat_score')
      .gte('publish_time', startDate.toISOString())
      .gte('read_count', minRead)
      .order('heat_score', { ascending: false });

    if (error) throw error;

    // 统计关键词频率
    const keywordCounts: Record<string, number> = {};
    // 统计套路频率
    const patternCounts: Record<string, number> = {};

    (articles || []).forEach((article) => {
      // 提取并统计关键词
      const keywords = extractKeywords(article.title);
      keywords.forEach((kw) => {
        keywordCounts[kw] = (keywordCounts[kw] || 0) + 1;
      });

      // 匹配并统计套路
      const patterns = matchPatterns(article.title);
      patterns.forEach((p) => {
        patternCounts[p] = (patternCounts[p] || 0) + 1;
      });
    });

    // 转换为排序数组
    const topKeywords = Object.entries(keywordCounts)
      .map(([word, count]) => ({ word, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 30);

    const topPatterns = Object.entries(patternCounts)
      .map(([pattern, count]) => ({ pattern, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15);

    // 获取使用该套路的热门文章示例
    const patternsWithExamples = topPatterns.map((p) => {
      const examples = (articles || [])
        .filter((a) => matchPatterns(a.title).includes(p.pattern))
        .slice(0, 3)
        .map((a) => ({ title: a.title, heatScore: a.heat_score }));

      return {
        ...p,
        examples,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        period,
        totalArticles: articles?.length || 0,
        topKeywords,
        topPatterns: patternsWithExamples,
        dateRange: {
          start: startDate.toISOString(),
          end: now.toISOString(),
        },
      },
    });
  } catch (error) {
    console.error('获取标题分析数据失败:', error);
    return NextResponse.json(
      { success: false, error: '获取标题分析数据失败' },
      { status: 500 }
    );
  }
}
