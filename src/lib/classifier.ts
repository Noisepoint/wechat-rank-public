// AI细分领域关键词
const AI_CATEGORIES: Record<string, string[]> = {
  'AI写作': ['写作', '文案', 'copywriting', '写文章', '爆文', '文字'],
  'AI绘画/设计': ['绘画', 'Midjourney', 'MJ', 'SD', 'Stable Diffusion', '画图', '设计', 'DALL-E', '图片生成', '生图', '作图'],
  'AI编程': ['编程', 'Cursor', 'Copilot', '代码', '开发', '程序员', '编码', 'coding'],
  'AI办公/效率': ['办公', '效率', 'PPT', 'Excel', '自动化', '提效', '工作流', 'workflow'],
  'AI视频/音频': ['视频', '音频', 'Sora', '剪辑', '配音', 'TTS', '语音', '音乐'],
  'AI对话/聊天': ['ChatGPT', 'Claude', '对话', '聊天', 'GPT', '大模型', 'LLM', 'Gemini', 'Kimi'],
};

// 文章类型关键词
const ARTICLE_TYPES: Record<string, string[]> = {
  '教程/攻略': ['教程', '攻略', '怎么', '如何', '手把手', '保姆级', '入门', '教你', '学会'],
  '工具推荐/测评': ['推荐', '测评', '盘点', '合集', '必备', '神器', '工具', '款', '个'],
  '行业资讯/新闻': ['发布', '官宣', '重磅', '最新', '刚刚', '突发', '上线', '更新'],
  '观点评论/分析': ['观点', '分析', '看法', '思考', '为什么', '深度', '解读', '趋势'],
  '案例拆解': ['案例', '拆解', '复盘', '实战', '实操', '赚钱', '变现'],
};

export function classify(title: string, content?: string): {
  aiCategory: string;
  articleType: string;
} {
  const text = (title + ' ' + (content || '')).toLowerCase();

  let aiCategory = '其他';
  let articleType = '其他';

  // 匹配AI领域
  for (const [category, keywords] of Object.entries(AI_CATEGORIES)) {
    if (keywords.some(kw => text.includes(kw.toLowerCase()))) {
      aiCategory = category;
      break;
    }
  }

  // 匹配文章类型
  for (const [type, keywords] of Object.entries(ARTICLE_TYPES)) {
    if (keywords.some(kw => text.includes(kw.toLowerCase()))) {
      articleType = type;
      break;
    }
  }

  return { aiCategory, articleType };
}

export const AI_CATEGORY_OPTIONS = ['全部', ...Object.keys(AI_CATEGORIES), '其他'];
export const ARTICLE_TYPE_OPTIONS = ['全部', ...Object.keys(ARTICLE_TYPES), '其他'];
