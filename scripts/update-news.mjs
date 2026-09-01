import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "public", "data");
const timeZone = "Asia/Shanghai";
const sourcePolicyVersion = "2026-09-trusted-cn-v1";

const sourceRules = [
  {
    tier: "政务官方",
    rank: 1,
    domains: ["gov.cn", "cac.gov.cn", "miit.gov.cn", "most.gov.cn", "ndrc.gov.cn", "samr.gov.cn", "sasac.gov.cn", "stats.gov.cn", "csrc.gov.cn"],
    names: [/国务院|中国政府网|国家网信办|工业和信息化部|科技部|国资委|市场监管总局/],
  },
  {
    tier: "权威媒体",
    rank: 2,
    domains: ["news.cn", "xinhuanet.com", "people.com.cn", "cctv.com", "cnr.cn", "chinanews.com.cn", "china.com.cn", "chinadaily.com.cn", "gmw.cn", "ce.cn", "youth.cn", "stdaily.com", "stcn.com", "legaldaily.com.cn", "thepaper.cn", "yicai.com", "caixin.com"],
    names: [/新华社|新华网|人民日报|人民网|央视网|央广网|中国新闻网|中国网|中国日报|光明网|中国经济网|中国青年网|科技日报|证券时报|法治日报|澎湃新闻|第一财经|财新/],
  },
  {
    tier: "企业官方",
    rank: 3,
    domains: ["openai.com", "anthropic.com", "deepmind.google", "blog.google", "microsoft.com", "nvidia.com", "about.fb.com", "alibabacloud.com", "aliyun.com", "baidu.com", "tencent.com", "huawei.com", "deepseek.com", "zhipuai.cn", "moonshot.cn", "minimax.io", "bytedance.com"],
    names: [/OpenAI|Anthropic|Google|DeepMind|Microsoft|NVIDIA|Meta|阿里云|百度|腾讯|华为|DeepSeek|智谱|月之暗面|MiniMax|字节跳动/],
  },
  {
    tier: "专业科技媒体",
    rank: 4,
    domains: ["cls.cn", "jiemian.com", "36kr.com", "ithome.com", "leiphone.com", "zhidx.com", "qbitai.com", "ifanr.com"],
    names: [/财联社|界面新闻|36氪|IT之家|雷峰网|智东西|量子位|爱范儿/],
  },
];

const highRiskTitle = /(?:传闻|网传|爆料|内幕|震惊|惊天|泄密|造假|诈骗|犯罪|丑闻|封杀|崩盘|末日|灭绝|杀疯了|彻底怒了|危险阶段)/i;
const sensitiveSubject = /(?:军事|外交|战争|领导人|国家安全|社会事件|事故|灾害|疫情|选举|制裁)/i;

function dateInChina(offsetDays = 0) {
  const now = new Date();
  now.setUTCDate(now.getUTCDate() + offsetDays);
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function decode(value = "") {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/\s+/g, " ").trim();
}

function tag(block, name) {
  return decode(block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, "i"))?.[1] || "");
}

function sourceMetadata(block, fallbackName) {
  const match = block.match(/<source\b([^>]*)>([\s\S]*?)<\/source>/i);
  const source = decode(match?.[2] || fallbackName || "");
  const sourceUrl = decode(match?.[1]?.match(/\burl=["']([^"']+)["']/i)?.[1] || "").replace(/^http:/i, "https:");
  let host = "";
  try { host = new URL(sourceUrl).hostname.toLowerCase().replace(/^www\./, ""); } catch { host = ""; }
  const rule = sourceRules.find((candidate) => host
    ? candidate.domains.some((domain) => host === domain || host.endsWith(`.${domain}`))
    : candidate.names.some((pattern) => pattern.test(source))
  );
  return rule ? { source, sourceUrl, sourceTier: rule.tier, sourceRank: rule.rank } : null;
}

function groupFor(title) {
  const rules = [
    ["OpenAI", /OpenAI|ChatGPT|Sora/i], ["Anthropic", /Anthropic|Claude/i],
    ["Google", /Google|Gemini|DeepMind/i], ["Meta", /Meta|Llama/i],
    ["Microsoft", /Microsoft|微软|Copilot/i], ["Nvidia", /Nvidia|英伟达|芯片|GPU/i],
    ["国内 AI", /阿里|百度|腾讯|字节|DeepSeek|智谱|月之暗面|MiniMax|华为/i],
  ];
  return rules.find(([, pattern]) => pattern.test(title))?.[0] || "行业动态";
}

function parseItems(xml) {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map((match) => {
    const block = match[1];
    const rawTitle = tag(block, "title");
    const fallbackSource = rawTitle.split(" - ").at(-1) || "";
    const metadata = sourceMetadata(block, fallbackSource);
    if (!metadata) return null;
    const { source, sourceUrl, sourceTier, sourceRank } = metadata;
    const title = rawTitle.replace(new RegExp(`\\s+-\\s+${source.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}$`), "");
    if (highRiskTitle.test(title) || sensitiveSubject.test(title)) return null;
    return {
      id: createHash("sha1").update(`${title}|${tag(block, "link")}`).digest("hex").slice(0, 12),
      title,
      summary: `该条信息来自${sourceTier}“${source}”，本站仅作新闻线索索引，不复制报道正文或图片。请点击原文核验完整内容。`,
      source,
      sourceUrl,
      sourceTier,
      sourceRank,
      url: tag(block, "link"),
      publishedAt: tag(block, "pubDate"),
      group: groupFor(title),
    };
  });
}

const query = encodeURIComponent("人工智能 OR AI OR OpenAI OR Anthropic OR Gemini OR DeepSeek when:2d");
const trustedQuery = encodeURIComponent("(site:news.cn OR site:people.com.cn OR site:cctv.com OR site:cnr.cn OR site:chinanews.com.cn OR site:gov.cn OR site:miit.gov.cn OR site:cac.gov.cn OR site:stdaily.com OR site:stcn.com) (人工智能 OR AI) when:2d");
const officialQuery = encodeURIComponent("(site:openai.com OR site:anthropic.com OR site:deepmind.google OR site:microsoft.com OR site:nvidia.com OR site:alibabacloud.com OR site:baidu.com OR site:tencent.com OR site:huawei.com OR site:deepseek.com) AI when:2d");
const feeds = [
  `https://news.google.com/rss/search?q=${query}&hl=zh-CN&gl=CN&ceid=CN:zh-Hans`,
  `https://news.google.com/rss/search?q=${trustedQuery}&hl=zh-CN&gl=CN&ceid=CN:zh-Hans`,
  `https://news.google.com/rss/search?q=${officialQuery}&hl=zh-CN&gl=CN&ceid=CN:zh-Hans`,
];

const fixture = process.env.AI_NEWS_RSS_FILE;
const results = fixture
  ? [{ status: "fulfilled", value: parseItems(await fs.readFile(fixture, "utf8")) }]
  : await Promise.allSettled(feeds.map(async (url) => {
      const response = await fetch(url, { headers: { "user-agent": "AI-Pulse-Daily/1.0" } });
      if (!response.ok) throw new Error(`RSS ${response.status}`);
      return parseItems(await response.text());
    }));

const seen = new Set();
const targetDate = dateInChina(-1);
const publicationDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
};
const articles = results.flatMap((result) => result.status === "fulfilled" ? result.value : [])
  .filter(Boolean)
  .filter((item) => item.title && item.url && publicationDate(item.publishedAt) === targetDate && !seen.has(item.title) && seen.add(item.title))
  .sort((a, b) => a.sourceRank - b.sourceRank || new Date(b.publishedAt) - new Date(a.publishedAt))
  .slice(0, 24);

if (!articles.length) throw new Error("没有获取到新闻，保留上一版数据。");

const order = ["OpenAI", "Anthropic", "Google", "Meta", "Microsoft", "Nvidia", "国内 AI", "行业动态"];
const groups = order.map((name) => ({ name, articles: articles.filter((item) => item.group === name).map(({ group, sourceRank, ...item }) => item) })).filter((group) => group.articles.length);
const date = targetDate;
const names = groups.slice(0, 4).map((group) => group.name).join("、");
const payload = {
  date,
  generatedAt: new Date().toISOString(),
  sourcePolicy: { version: sourcePolicyVersion, mode: "政府官网、网信办稿源名单媒体及企业官方发布白名单" },
  summary: `昨日从可信白名单中收录 ${articles.length} 条 AI 相关信息，主要涉及 ${names || "人工智能行业"} 等方向。所有条目均保留来源和原文入口。`,
  groups,
};

await fs.mkdir(path.join(outDir, "history"), { recursive: true });
await fs.writeFile(path.join(outDir, "latest.json"), `${JSON.stringify(payload, null, 2)}\n`);
await fs.writeFile(path.join(outDir, "history", `${date}.json`), `${JSON.stringify(payload, null, 2)}\n`);
console.log(`已生成 ${date} 简报，共 ${articles.length} 条新闻。`);
