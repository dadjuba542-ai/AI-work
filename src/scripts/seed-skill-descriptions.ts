import Database from "better-sqlite3";

const db = new Database("data/sqlite.db");

const descriptions: Record<string, string> = {
  brainstorming: "引导用户将原始想法转化为经过验证的设计方案的结构化对话流程。",
  "brand-guidelines": "应用Anthropic官方品牌色彩和排版规范到任何需要品牌化的制品上。",
  "canvas-design": "在PNG和PDF文档中创建精美的视觉艺术作品。",
  "context-fundamentals": "理解上下文窗口、注意力机制和上下文工程的基础知识。",
  "dispatching-parallel-agents": "面对2个以上独立任务时，并行调度多个Agent分别处理。",
  "doc-coauthoring": "引导用户完成文档协作的结构化工作流程，从草稿到定稿。",
  docx: "综合文档创建、编辑和分析工具，支持修订跟踪和批注。",
  "frontend-design": "创建独特的、生产级的前端界面，具有高设计质量。",
  "internal-comms": "帮助撰写各种内部沟通文案的资源集合。",
  pdf: "综合PDF处理工具包，用于提取、创建、合并和填写表单。",
  pptx: "演示文稿创建、编辑和分析，支持布局和演讲者备注。",
  seedance: "为字节跳动即梦平台Seedance 2.0生成生产级中文视频提示词。",
  "skill-creator": "创建有效技能的指南，提供专门知识、工作流程或工具集成。",
  "slack-gif-creator": "为Slack优化动画GIF的知识、约束和工具。",
  "test-driven-development": "实现任何功能或修复bug时先写测试再写代码。",
  "theme-factory": "为制品应用主题的工具包，支持10个预设主题和自定义主题。",
  "using-git-worktrees": "在需要隔离的 feature 开发时使用 Git Worktree。",
  "using-superpowers": "在开始任何对话时，用系统思维分析问题再行动。",
  "verification-before-completion": "在声称工作完成之前，验证所有测试、类型检查和边界情况。",
  "video-to-gif": "智能地将视频转换为高质量GIF动图。",
  "writing-skills": "创建新技能时的写作规范和最佳实践指南。",
  xlsx: "综合电子表格创建、编辑和分析，支持公式和可视化。",
  "intelligent-video-slicer": "智能视频语义切片大师，结合字幕进行深度语义分析。",
};

const skills = db.prepare("SELECT id, name, description FROM skills").all() as {
  id: string;
  name: string;
  description: string;
}[];
let updated = 0;

for (const skill of skills) {
  const cn = descriptions[skill.name];
  if (cn && skill.description !== cn) {
    db.prepare("UPDATE skills SET description = ? WHERE id = ?").run(cn, skill.id);
    updated++;
    console.log(`✓ ${skill.name}: ${skill.description.slice(0, 40)}... → ${cn}`);
  } else if (!cn) {
    console.warn(`⚠ ${skill.name}: 未找到中文描述`);
  } else {
    console.log(`- ${skill.name}: 已是最新`);
  }
}

console.log(`\n完成: 更新了 ${updated} 个技能描述`);
