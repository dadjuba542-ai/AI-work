#!/usr/bin/env python3
"""Fetch prompts from yao-open-prompts and create agents in DB."""
import sqlite3
import re
import urllib.request
import time
import uuid
from datetime import datetime, timezone

DB_PATH = "data/sqlite.db"
BASE = "https://raw.githubusercontent.com/yaojingang/yao-open-prompts/main/prompts"

AGENTS = [
    ("智能架构师", "将创意转化为可执行的系统架构和实现方案", "技术", "code",
     "07-ai-coding/ai-system-architect.md"),
    ("PPT助手", "输入任意内容，一键生成高质量PPT网页", "工作", "presentation",
     "02-ai-work/high-quality-ai-ppt-generator.md"),
    ("销售助手", "AI私域销售话术生成与客户沟通", "营销", "trending-up",
     "02-ai-work/private-domain-sales-prompt.md"),
    ("客服助手", "智能客服系统，自动回复客户咨询", "工作", "headset",
     "02-ai-work/customer-service-system-prompt.md"),
    ("合同助手", "合同生成、审查与条款分析", "工作", "file-text",
     "02-ai-work/contract-generator.md"),
    ("学习助教", "个性化AI学习辅导与知识答疑", "教育", "book-open",
     "02-ai-work/personalized-ai-learning-tutor.md"),
    ("公众号助手", "微信公众号文章写作与排版", "内容", "message-square",
     "06-ai-content/wechat-article-expert.md"),
    ("小红书助手", "小红书爆款图文创作与运营", "内容", "camera",
     "06-ai-content/xiaohongshu-graphic-expert.md"),
    ("抖音助手", "抖音短视频策划与爆款文案", "内容", "video",
     "06-ai-content/douyin-viral-planner.md"),
    ("文章润色", "智能文章润色、改写与优化", "内容", "pen",
     "06-ai-content/humanized-writing/humanized-writing-polish-v3.md"),
    ("标题助手", "标题优化与爆款标题生成", "内容", "type",
     "06-ai-content/title-alchemist-content.md"),
    ("选题策划", "内容选题策划与热点追踪", "内容", "lightbulb",
     "06-ai-content/topic-planner.md"),
    ("竞品分析", "对标分析与竞品研究", "营销", "search",
     "06-ai-content/benchmark-analyst.md"),
    ("评论区运营", "评论区互动策略与运营", "内容", "message-circle",
     "06-ai-content/comment-section-operator.md"),
    ("数据复盘", "内容数据复盘与增长诊断", "内容", "chart-bar",
     "06-ai-content/content-data-review-diagnostician.md"),
    ("内容拆解", "爆款仿写拆解与重构", "内容", "layers",
     "06-ai-content/viral-remix-deconstruction-rewriter.md"),
    ("调研助手", "从0到1用AI深度调研企业", "营销", "globe",
     "02-ai-work/company-research-methodology.md"),
    ("GEO写作", "GEO搜索引擎优化文章生成", "营销", "file-search",
     "08-ai-marketing/geo-article-generator.md"),
    ("GEO改写", "GEO搜索引擎优化文章改写", "营销", "refresh-cw",
     "08-ai-marketing/geo-article-rewriter.md"),
    ("评审助手", "自我批判与方案评审", "思维", "check-circle",
     "09-ai-thinking/self-critique-master.md"),
    ("费曼学习", "用费曼学习法理解任意知识", "教育", "graduation-cap",
     "03-ai-learning/learning-methods/feynman-learning-method.md"),
    ("习惯养成", "个性化习惯养成计划制定", "生活", "target",
     "03-ai-learning/personalized-habit-formation-planner.md"),
    ("记忆宫殿", "用记忆宫殿法整理知识", "思维", "brain",
     "09-ai-thinking/memory-palace-architect.md"),
    ("采访策划", "采访提纲与访谈策划", "内容", "mic",
     "06-ai-content/interview-outline-planner.md"),
    ("直播脚本", "直播脚本策划与话术生成", "内容", "radio",
     "06-ai-content/livestream-script-planner.md"),
]

def fetch(url):
    time.sleep(0.3)
    req = urllib.request.Request(url, headers={"User-Agent": "agent-terminal/1.0"})
    with urllib.request.urlopen(req, timeout=15) as r:
        return r.read().decode("utf-8")

def extract_prompt(text):
    """Extract content inside the code block after ## Prompt section."""
    # Pattern 1: ## Prompt \n ```markdown ... ``` 
    m = re.search(
        r'## Prompt\s*\n(?:````?markdown)?\s*\n([\s\S]*?)\n(?:````?)\s*\n',
        text
    )
    if m:
        return m.group(1).strip()
    # Pattern 2: ## Prompt \n ``` ... ```
    m = re.search(
        r'## Prompt\s*\n```\s*\n([\s\S]*?)\n```\s*\n',
        text
    )
    if m:
        return m.group(1).strip()
    return None

def main():
    db = sqlite3.connect(DB_PATH)
    created = 0
    errors = []

    for name, desc, category, icon, path in AGENTS:
        url = f"{BASE}/{path}"
        try:
            print(f"  Fetching {name}...", end=" ", flush=True)
            md = fetch(url)
            prompt = extract_prompt(md)

            if not prompt:
                # Fallback: use everything after frontmatter
                parts = re.split(r'^---\s*$', md, 2, re.MULTILINE)
                prompt = parts[-1].strip() if len(parts) > 1 else md.strip()
                prompt = prompt[:5000]

            agent_id = uuid.uuid4().hex
            now = datetime.now(timezone.utc).isoformat()

            db.execute(
                """INSERT INTO agents (id, name, description, icon, category, system_prompt,
                   example_prompts, model, temperature, is_published, max_iterations, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (agent_id, name, desc, icon, category, prompt, "[]",
                 "MiniMax-M2.7", "0.7", 1, 5, now, now)
            )
            db.commit()
            print(f"✅ ({len(prompt)} chars)")
            created += 1
        except Exception as e:
            print(f"❌ {e}")
            errors.append(f"{name}: {e}")

    db.close()
    print(f"\nCreated {created} agents, {len(errors)} errors")
    for e in errors:
        print(f"  Error: {e}")

if __name__ == "__main__":
    main()
