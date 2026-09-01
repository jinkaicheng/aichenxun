import { useEffect, useMemo, useState } from "react";

const navItems = ["今日重点", "新闻资讯", "重点舆情", "社媒动态", "项目动态", "AI 洞察"];

function localDate(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function formatDate(value) {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  return `${year}年${month}月${day}日`;
}

function Article({ article, onShare }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <article className="article">
      <span className="timeline-dot" aria-hidden="true" />
      <div className="article-body">
        <h3>{article.title}</h3>
        <p className={expanded ? "" : "clamp"}>{article.summary}</p>
        <div className="article-meta">
          <span className="source-line">
            <span className="source-tier">{article.sourceTier || "可信来源"}</span>
            来源：{article.sourceUrl ? <a href={article.sourceUrl} target="_blank" rel="noreferrer">{article.source}</a> : article.source}
          </span>
          <div className="article-actions">
            <button type="button" onClick={() => onShare(article)}>分享</button>
            <button type="button" onClick={() => setExpanded((value) => !value)}>
              {expanded ? "收起" : "查看摘要"}
            </button>
            <a href={article.url} target="_blank" rel="noreferrer">原文</a>
          </div>
        </div>
      </div>
    </article>
  );
}

function Assistant({ data, onClose }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("选择一个问题，快速掌握今日动态。");
  const prompts = ["最值得关注的一件事？", "有哪些 AI 产品动态？", "用 3 句话总结今日新闻"];

  function ask(text) {
    setQuestion(text);
    const first = data?.groups?.flatMap((group) => group.articles)?.slice(0, 3) || [];
    setAnswer(first.length ? first.map((item, index) => `${index + 1}. ${item.title}`).join("\n") : "今天的数据还在路上，请稍后再试。");
  }

  return (
    <aside className="assistant-panel" aria-label="AI 情报助手">
      <div className="assistant-head">
        <div><strong>AI 情报助手</strong><span>基于本期简报回答</span></div>
        <button type="button" onClick={onClose} aria-label="关闭助手">关闭</button>
      </div>
      <div className="assistant-answer">{answer}</div>
      <div className="assistant-prompts">
        {prompts.map((prompt) => <button type="button" key={prompt} onClick={() => ask(prompt)}>{prompt}</button>)}
      </div>
      <form onSubmit={(event) => { event.preventDefault(); if (question.trim()) ask(question); }}>
        <input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="问问今天的 AI 动态" />
        <button type="submit">发送</button>
      </form>
    </aside>
  );
}

export function App() {
  const [activeNav, setActiveNav] = useState(navItems[0]);
  const [selectedDate, setSelectedDate] = useState(localDate(-1));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(true);
  const [assistantOpen, setAssistantOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    const latest = selectedDate === localDate(-1);
    fetch(latest ? "/data/latest.json" : `/data/history/${selectedDate}.json`)
      .then((response) => { if (!response.ok) throw new Error("not found"); return response.json(); })
      .then((payload) => { if (!cancelled) setData(payload); })
      .catch(() => { if (!cancelled) { setData(null); setError("该日期暂无归档，自动更新后会逐日积累历史简报。"); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [selectedDate]);

  const visibleGroups = useMemo(() => {
    if (!data?.groups) return [];
    if (activeNav === "今日重点" || activeNav === "新闻资讯") return data.groups;
    const keywords = {
      "重点舆情": /监管|安全|版权|诉讼|政策|风险/i,
      "社媒动态": /发布|开源|上线|热议|社区/i,
      "项目动态": /融资|合作|投资|收购|产品|模型/i,
      "AI 洞察": /研究|趋势|报告|评测|洞察/i,
    }[activeNav];
    return data.groups.map((group) => ({ ...group, articles: group.articles.filter((item) => keywords.test(`${item.title} ${item.summary}`)) })).filter((group) => group.articles.length);
  }, [activeNav, data]);

  async function share(article) {
    const payload = { title: article.title, text: article.summary, url: article.url };
    if (navigator.share) await navigator.share(payload).catch(() => {});
    else await navigator.clipboard?.writeText(`${article.title}\n${article.url}`);
  }

  return (
    <div className="site-shell">
      <header className="site-header">
        <div className="header-row">
          <a className="brand" href="#top" aria-label="AI 晨讯首页">AI 晨讯</a>
          <label className="date-control"><span>选择日期</span><input type="date" max={localDate(-1)} value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} /></label>
        </div>
        <nav aria-label="新闻分类">
          {navItems.map((item) => <button type="button" key={item} className={activeNav === item ? "active" : ""} onClick={() => setActiveNav(item)}>{item}</button>)}
        </nav>
      </header>

      {notice && <div className="notice"><div><strong>可信来源简报：</strong>每天北京时间 08:00 更新。仅收录政府官网、网信办稿源名单媒体及企业官方发布；本站不复制正文和图片，请以原始报道为准。权利人提出异议后将及时核查处理。</div><button type="button" onClick={() => setNotice(false)} aria-label="关闭公告">关闭</button></div>}

      <main id="top">
        <section className="intro">
          <div className="section-title"><h1>{activeNav === "今日重点" ? "昨日重点新闻" : activeNav}</h1><p>每日必读，3 分钟速览 AI 行业重要动态</p></div>
          {data && <div className="daily-summary"><span>{formatDate(data.date)}</span>{data.summary}</div>}
        </section>

        {loading && <div className="state-card">正在加载昨日简报…</div>}
        {error && <div className="state-card error">{error}</div>}
        {!loading && !error && visibleGroups.length === 0 && <div className="state-card">该分类今日暂无新闻。</div>}

        <div className="news-groups">
          {visibleGroups.map((group) => (
            <section className="news-group" key={group.name}>
              <h2>{group.name}</h2>
              <div className="timeline">
                {group.articles.map((article) => <Article key={article.id} article={article} onShare={share} />)}
              </div>
            </section>
          ))}
        </div>
      </main>

      <footer><span>AI 晨讯</span><span>仅作信息索引 · 保留来源与原文入口 · 不构成法律、投资或决策建议</span></footer>
      <button className="assistant-fab" type="button" onClick={() => setAssistantOpen(true)}>AI 情报助手</button>
      {assistantOpen && <Assistant data={data} onClose={() => setAssistantOpen(false)} />}
    </div>
  );
}
