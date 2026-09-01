# 智潮日报 · AI 前沿

一个自动汇总昨日 AI 新闻的中文日报站点。页面参考资讯摘要类网站的信息结构重新实现，支持日期归档、分类筛选、摘要展开、分享和本地情报助手。

信息源采用严格白名单，只收录政府官网、国家网信办稿源名单媒体和 AI 企业官方发布；不抓取正文或图片。完整规则见 [SOURCE_POLICY.md](SOURCE_POLICY.md)。

## 本地运行

```bash
npm install
npm run update:news
npm run dev
```

## 每日自动更新

`.github/workflows/daily-news.yml` 会在每天北京时间 08:00（UTC 00:00）运行，从公开 Google News RSS 聚合最近一天的 AI 新闻，更新：

- `public/data/latest.json`
- `public/data/history/YYYY-MM-DD.json`

GitHub Actions 的定时任务可能有数分钟延迟。聚合内容仅用于信息索引，事实与版权归原始来源所有。
