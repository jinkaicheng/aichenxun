import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const data = JSON.parse(await fs.readFile(path.join(root, "public", "data", "latest.json"), "utf8"));
const allowedTiers = new Set(["政务官方", "权威媒体", "国内主流媒体", "企业官方", "专业科技媒体"]);
const sensational = /(?:传闻|网传|爆料|内幕|震惊|惊天|泄密|造假|诈骗|犯罪|丑闻|封杀|崩盘|末日|灭绝|杀疯了|彻底怒了|危险阶段|美国病|得了.{0,8}病|牛股|涨停|股票|荐股|概念股|投资建议)/i;
const sensitive = /(?:军事|外交|战争|领导人|国家安全|社会事件|事故|灾害|疫情|选举|制裁)/i;
const seen = new Set();
const errors = [];
const articles = data.groups?.flatMap((group) => group.articles || []) || [];

if (!data.sourcePolicy?.version) errors.push("缺少来源策略版本");
if (!articles.length) errors.push("可信来源新闻为空");
if (articles.length > 18) errors.push("新闻数量超过上限 18");

for (const article of articles) {
  if (!allowedTiers.has(article.sourceTier)) errors.push(`${article.title}: 来源等级不在白名单`);
  if (!/^https:\/\//i.test(article.sourceUrl || "")) errors.push(`${article.title}: 缺少可追溯来源网址`);
  if (!/^https:\/\//i.test(article.url || "")) errors.push(`${article.title}: 缺少原文网址`);
  if (!article.source || !article.title || !article.publishedAt) errors.push(`${article.title || "未知条目"}: 必填字段缺失`);
  if (/<[^>]+>/.test(article.summary || "")) errors.push(`${article.title}: 摘要包含 HTML`);
  if ((article.summary || "").length > 180) errors.push(`${article.title}: 摘要过长`);
  if (sensational.test(article.title || "")) errors.push(`${article.title}: 命中标题党或传闻风险词`);
  if (sensitive.test(article.title || "") && !["政务官方", "权威媒体", "国内主流媒体"].includes(article.sourceTier)) errors.push(`${article.title}: 敏感主题来源等级不足`);
  if (seen.has(article.title)) errors.push(`${article.title}: 标题重复`);
  seen.add(article.title);
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(`来源校验通过：${articles.length} 条，策略 ${data.sourcePolicy.version}`);
