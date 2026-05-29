import { auth } from "@/auth";
import { readdirSync, readFileSync, existsSync } from "fs";
import { join, resolve } from "path";
import { parseSkillMd } from "@/lib/skill-parser";

const LOCAL_SKILLS_DIR = resolve(join(process.cwd(), "../", "skills"));

const DESC_ZH: Record<string, string> = {
  "algorithmic-art": "使用 p5.js 创建算法艺术作品，支持种子随机性与交互式参数探索。避免复制已有作品以防版权问题。",
  "brainstorming": "在任何创意工作之前使用——将原始想法转化为经过验证的设计方案的结构化对话流程，探索用户意图、需求和设计。",
  "brand-guidelines": "为任何作品应用 Anthropic 官方品牌色彩与排版规范。当涉及品牌色、风格指南、视觉格式化或公司设计标准时使用。",
  "canvas-design": "在 PNG 和 PDF 文档中创建精美的视觉艺术作品。用于制作海报、艺术设计等静态作品，避免复制已有作品。",
  "context-fundamentals": "理解 AI Agent 系统的上下文工程基础知识，包括上下文窗口、注意力机制、渐进式上下文加载等。",
  "dispatching-parallel-agents": "当面临 2 个以上可独立完成、无共享状态或顺序依赖的任务时，并行分派多个子 Agent 处理。",
  "doc-coauthoring": "结构化文档协作工作流——高效传递上下文、迭代完善内容、验证文档对读者的有效性。",
  "docx": "综合 Word 文档创建、编辑和分析工具，支持修订跟踪、批注、格式保留和文本提取。",
  "executing-plans": "当有书面的实施计划需要在单独会话中执行并设置审查检查点时使用。",
  "find-skills": "帮助用户发现和安装 Agent 技能，支持功能搜索和技能扩展。",
  "finishing-a-development-branch": "当实现完成、所有测试通过后，引导开发者决定如何集成工作——合并、PR 或清理。",
  "frontend-design": "创建独特、生产级的前端界面，具有高设计质量。用于构建网页组件、仪表板、React 组件、HTML/CSS 布局等。",
  "group-media-reporter": "自动从指定的飞书群获取今天的媒体文件（.jpg/.mp4），打包并通过邮件发送。",
  "intelligent-video-slicer": "智能视频语义切片大师。结合字幕进行深度语义分析，识别知识点和主题切换，利用 FFmpeg 精准切片。适用直播回放、教学讲座、会议记录。",
  "internal-comms": "帮助撰写各类内部沟通文档，使用公司喜欢的格式。适用于状态报告、领导更新、新闻通讯、FAQ、事件报告等。",
  "mcp-builder": "创建高质量 MCP 服务器的指南，支持 Python（FastMCP）或 Node/TypeScript（MCP SDK），实现与外部 API 或服务的集成。",
  "pdf": "综合 PDF 处理工具包——提取文本和表格、创建新 PDF、合并/拆分文档、处理表单。",
  "pptx": "演示文稿的创建、编辑和分析。支持布局、批注、演讲者备注等功能。",
  "receiving-code-review": "接收代码审查反馈时使用——在实施建议之前进行技术验证，而非盲目采纳。",
  "requesting-code-review": "完成任务、实现重要功能或合并前，验证工作是否满足需求时使用。",
  "seedance": "为字节跳动即梦 Seedance 2.0 生成可直接使用的生产级中文视频提示词。适用短剧、广告视频等场景。",
  "skill-creator": "创建和更新技能的指南——将专业知识、工作流或工具集成为可复用的技能模块。",
  "slack-gif-creator": "为 Slack 优化的动画 GIF 创建工具。提供约束验证、枚举选项和动画概念。",
  "subagent-driven-development": "在执行有独立任务的多步实施计划时使用，支持指定审查员和检查点。",
  "systematic-debugging": "遇到任何 Bug、测试失败或意外行为时，在提出修复方案之前使用系统化调试方法。",
  "test-driven-development": "在实现任何功能或修复 Bug 之前使用，确保测试先行。",
  "theme-factory": "为作品应用主题的工具包——含 10 个预设主题（色彩/字体），可应用于幻灯片、文档、HTML 页面等。",
  "using-git-worktrees": "启动需要与当前工作区隔离的功能开发时使用——创建隔离的 Git worktree。",
  "using-superpowers": "在任何对话开始时使用——建立技能发现与使用的规则，要求先查看可用技能再回应。",
  "verification-before-completion": "在声称工作完成、修复或通过之前使用——必须先运行验证命令并确认输出才能断言成功。",
  "video-to-gif": "智能视频转 GIF，严格文件大小约束（如微信表情 <500KB），支持尺寸和帧率调整。",
  "web-artifacts-builder": "使用 React、Tailwind CSS、shadcn/ui 创建复杂的多组件 HTML 制品，支持状态管理和路由。",
  "webapp-testing": "使用 Playwright 与本地 Web 应用交互和测试的工具包——验证前端功能、调试 UI 行为、浏览器截图。",
  "writing-plans": "当有多步骤任务的规格或需求时，在动手编码前先写实施计划。",
  "writing-skills": "创建新技能、编辑现有技能或在部署前验证技能时使用。",
  "xlsx": "综合电子表格创建、编辑和分析——支持公式、格式化、数据分析和可视化（.xlsx/.csv 等）。",
};

export async function GET() {
  const session = await auth();
  if (!session) return Response.json({ error: "未登录" }, { status: 401 });

  const items = readdirSync(LOCAL_SKILLS_DIR);
  const available: Array<{
    name: string;
    description: string;
    category: string;
    icon: string;
    toolsAllowed: string[];
  }> = [];

  for (const item of items) {
    const skillPath = join(LOCAL_SKILLS_DIR, item, "SKILL.md");
    if (!existsSync(skillPath)) continue;
    const content = readFileSync(skillPath, "utf-8");
    const parsed = parseSkillMd(content);
    if (parsed) {
      available.push({
        name: parsed.name,
        description: DESC_ZH[item] || parsed.description,
        category: parsed.category,
        icon: parsed.icon,
        toolsAllowed: parsed.toolsAllowed,
      });
    }
  }

  return Response.json(available);
}
