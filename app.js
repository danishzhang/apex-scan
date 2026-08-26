const DATA_URL = "data/latest_scan.json";
const WATCHLIST_KEY = "apexscan_watchlist";

const state = {
  data: null,
  sort: "risk",
  riskFilter: "all",
  newsOnly: false,
  watchlistOnly: false,
  watchlist: new Set(JSON.parse(localStorage.getItem(WATCHLIST_KEY) || "[]")),
};

const RISK_ORDER = { "near support (low risk)": 0, "extended (moderate risk)": 1, "extended (high risk, wait for pullback)": 2 };
const RISK_CLASS = { "near support (low risk)": "risk-low", "extended (moderate risk)": "risk-moderate", "extended (high risk, wait for pullback)": "risk-high" };
const RISK_COLOR = { "near support (low risk)": "#3ddc97", "extended (moderate risk)": "#f5b942", "extended (high risk, wait for pullback)": "#ff5d6c" };

function newsList(h) {
  if (Array.isArray(h.news)) return h.news;
  if (h.news) return [h.news];
  return [];
}

function saveWatchlist() {
  localStorage.setItem(WATCHLIST_KEY, JSON.stringify([...state.watchlist]));
}
function toggleWatch(symbol) {
  if (state.watchlist.has(symbol)) state.watchlist.delete(symbol);
  else state.watchlist.add(symbol);
  saveWatchlist();
  render();
}

async function loadData() {
  setStatus("loading", "Loading…");
  try {
    const res = await fetch(DATA_URL, { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const json = await res.json();
    state.data = json;
    render();
    document.getElementById("lastLoadedHint").textContent =
      "Last loaded: " + new Date().toLocaleTimeString();
  } catch (err) {
    setStatus("error", "Failed to load data/latest_scan.json");
    console.error(err);
  }
}

function setStatus(kind, text) {
  const dot = document.getElementById("statusDot");
  dot.className = "dot " + kind;
  document.getElementById("statusText").textContent = text;
}

function render() {
  const data = state.data;
  const banner = document.getElementById("sampleBanner");
  banner.hidden = !data.sample;

  if (data.status === "error") {
    setStatus("error", humanizeError(data.error));
    document.getElementById("cardGrid").innerHTML = "";
    document.getElementById("newsRail").hidden = true;
    document.getElementById("emptyState").hidden = false;
    document.querySelector("#emptyState p").textContent = humanizeError(data.error);
    document.getElementById("resultCount").textContent = "";
    return;
  }

  const scannedAt = new Date(data.scanned_at);
  setStatus("ok", "Scan: " + scannedAt.toLocaleString());

  renderNewsRail(data.hits || []);

  let hits = [...(data.hits || [])];

  if (state.newsOnly) hits = hits.filter(h => newsList(h).length > 0);
  if (state.watchlistOnly) hits = hits.filter(h => state.watchlist.has(h.symbol));
  if (state.riskFilter === "low") hits = hits.filter(h => h.trend.entry_zone === "near support (low risk)");
  if (state.riskFilter === "moderate") hits = hits.filter(h => RISK_ORDER[h.trend.entry_zone] <= 1);

  hits.sort((a, b) => {
    if (state.sort === "symbol") return a.symbol.localeCompare(b.symbol);
    if (state.sort === "gap") return gapPct(b) - gapPct(a);
    return (RISK_ORDER[a.trend.entry_zone] ?? 9) - (RISK_ORDER[b.trend.entry_zone] ?? 9);
  });

  document.getElementById("resultCount").textContent =
    hits.length + " of " + (data.hits || []).length + " hits · " + data.candidates_checked + " scanned";

  const grid = document.getElementById("cardGrid");
  grid.innerHTML = "";
  document.getElementById("emptyState").hidden = hits.length > 0;

  for (const h of hits) grid.appendChild(renderCard(h));
}

function renderNewsRail(hits) {
  const withNews = hits.filter(h => newsList(h).length > 0);
  const rail = document.getElementById("newsRail");
  rail.hidden = withNews.length === 0;
  if (!withNews.length) return;

  const track = document.getElementById("newsRailTrack");
  track.innerHTML = "";
  for (const h of withNews) {
    const n = newsList(h)[0];
    const item = document.createElement("button");
    item.className = "news-rail-item";
    item.innerHTML = `<span class="news-rail-sym">${h.symbol}</span><span class="news-rail-headline">${n.headline}</span>`;
    item.addEventListener("click", () => openChart(h));
    track.appendChild(item);
  }
}

function gapPct(h) {
  if (!h.prev_close) return 0;
  return ((h.premarket_price - h.prev_close) / h.prev_close) * 100;
}

function humanizeError(code) {
  return {
    tv_not_connected: "TradingView Desktop isn't connected — launch it, then run the scan again.",
    not_a_trading_day: "Markets are closed today — no scan was run.",
  }[code] || ("Scan error: " + code);
}

function sparklineSvg(values, color) {
  if (!values || values.length < 2) return "";
  const w = 96, h = 32, pad = 3;
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1;
  const step = (w - pad * 2) / (values.length - 1);
  const pts = values.map((v, i) => [pad + i * step, h - pad - ((v - min) / range) * (h - pad * 2)]);
  const d = pts.map((p, i) => (i === 0 ? "M" : "L") + p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ");
  const last = pts[pts.length - 1];
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
    <path d="${d}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${last[0]}" cy="${last[1]}" r="2" fill="${color}"/>
  </svg>`;
}

function renderCard(h) {
  const el = document.createElement("div");
  el.className = "card";
  const riskColor = RISK_COLOR[h.trend.entry_zone] || "#3ddc97";
  el.style.setProperty("--risk-color", riskColor);

  const gap = gapPct(h);
  const gapClass = gap >= 0 ? "pos" : "neg";
  const gapSign = gap >= 0 ? "+" : "";

  const riskClass = RISK_CLASS[h.trend.entry_zone] || "";
  const riskLabel = (h.trend.entry_zone || "unknown").split(" (")[0];
  const news = newsList(h);
  const watched = state.watchlist.has(h.symbol);

  el.innerHTML = `
    <div class="card-head">
      <span class="card-symbol">${h.symbol}<button class="star-btn ${watched ? "active" : ""}" data-star aria-label="Toggle watchlist">${watched ? "★" : "☆"}</button></span>
      <span class="card-price">$${fmt(h.premarket_price)}<span class="card-gap ${gapClass}">${gapSign}${gap.toFixed(1)}%</span></span>
    </div>
    <div class="badge-row">
      <span class="badge good">MACD turning up</span>
      <span class="badge good">Above MA200</span>
      <span class="badge ${riskClass}">${riskLabel}</span>
      ${h.analyst ? `<span class="badge analyst">${h.analyst.rating_label}</span>` : ""}
    </div>
    <div class="card-spark-row">
      ${sparklineSvg(h.spark, riskColor)}
      <div class="card-levels">
        <div>SMA200 <span>$${fmt(h.sma200)}</span></div>
        <div>Support <span>$${fmt(h.trend.support_level)}</span></div>
        <div>Stop <span>$${fmt(h.trend.suggested_stop)}</span></div>
        <div>Resistance <span>$${fmt(h.trend.resistance_level)}</span></div>
      </div>
    </div>
    <div class="card-news ${news.length ? "" : "none"}">
      ${news.length
        ? `<span class="news-cat">${news[0].category.replace("_", " ")} · ${news[0].source}${news.length > 1 ? ` · +${news.length - 1} more` : ""}</span>${news[0].summary}`
        : "No material news on this name."}
    </div>
  `;

  el.querySelector("[data-star]").addEventListener("click", (e) => {
    e.stopPropagation();
    toggleWatch(h.symbol);
  });
  el.addEventListener("click", () => openChart(h));

  return el;
}

function fmt(n) {
  return n === null || n === undefined ? "—" : Number(n).toFixed(2);
}

// ---- Chart + detail side panel ----
let currentPanelHit = null;

function openChart(h) {
  currentPanelHit = h;
  document.getElementById("chartPanelSymbol").textContent = h.symbol;
  updateWatchBtn();
  document.getElementById("chartPanel").classList.add("open");
  document.getElementById("panelOverlay").classList.add("visible");

  const container = document.getElementById("tv_chart_container");
  container.innerHTML = "";
  new TradingView.widget({
    autosize: true,
    symbol: h.symbol,
    interval: "5",
    timezone: "America/New_York",
    theme: "dark",
    style: "1",
    locale: "en",
    toolbar_bg: "#0b0f14",
    enable_publishing: false,
    hide_top_toolbar: false,
    hide_legend: false,
    save_image: false,
    container_id: "tv_chart_container",
  });

  renderPanelTabs(h);
  switchPanelTab("overview");
}

const RATING_TONE = {
  "Strong Buy": "buy", "Buy": "buy",
  "Hold": "hold",
  "Sell": "sell", "Strong Sell": "sell",
};

function renderPanelTabs(h) {
  document.getElementById("tab-overview").innerHTML = `
    <div class="detail-section">
      <div class="detail-label">Levels</div>
      <div class="card-levels wide">
        <div>SMA200 <span>$${fmt(h.sma200)}</span></div>
        <div>Support <span>$${fmt(h.trend.support_level)}</span></div>
        <div>Stop <span>$${fmt(h.trend.suggested_stop)}</span></div>
        <div>Resistance <span>$${fmt(h.trend.resistance_level)}</span></div>
        <div>MACD DIF <span>${fmt(h.macd.dif)}</span></div>
        <div>MACD DEA <span>${fmt(h.macd.dea)}</span></div>
      </div>
    </div>
    <div class="detail-section">
      <div class="detail-label">Setup</div>
      <div class="detail-hint">Premarket $${fmt(h.premarket_price)}, prior close $${fmt(h.prev_close)} (${gapPct(h) >= 0 ? "+" : ""}${gapPct(h).toFixed(1)}%). Entry zone: ${h.trend.entry_zone || "unknown"}.</div>
    </div>
  `;

  document.getElementById("tab-analysis").innerHTML = renderAnalysisTab(h);
  document.getElementById("tab-news").innerHTML = renderNewsTab(h);
  document.getElementById("tab-financials").innerHTML = renderFinancialsTab(h);
}

function renderAnalysisTab(h) {
  const a = h.analyst;
  if (!a) return `<div class="detail-section"><div class="detail-hint">No analyst coverage found for this name.</div></div>`;

  const tone = RATING_TONE[a.rating_label] || "hold";
  const bd = a.breakdown;
  const words = a.rating_label.split(" ");

  const gaugeBlock = `
    <div class="rating-gauge tone-${tone}">
      ${words.map(w => `<span>${w}</span>`).join("")}
    </div>
    ${a.analyst_count ? `<div class="detail-hint center">Based on ${a.analyst_count} analysts</div>` : ""}
  `;

  const barsBlock = bd ? `
    <div class="rating-bars">
      <div class="rating-bar-row"><span class="rating-bar-label buy">Buy</span><div class="rating-bar-track"><div class="rating-bar-fill buy" style="width:${bd.buy_pct}%"></div></div><span class="rating-bar-pct">${bd.buy_pct}%</span></div>
      <div class="rating-bar-row"><span class="rating-bar-label hold">Hold</span><div class="rating-bar-track"><div class="rating-bar-fill hold" style="width:${bd.hold_pct}%"></div></div><span class="rating-bar-pct">${bd.hold_pct}%</span></div>
      <div class="rating-bar-row"><span class="rating-bar-label sell">Sell</span><div class="rating-bar-track"><div class="rating-bar-fill sell" style="width:${bd.sell_pct}%"></div></div><span class="rating-bar-pct">${bd.sell_pct}%</span></div>
    </div>
  ` : "";

  const pt = a.price_target;
  const targetBlock = pt && pt.avg ? `
    <div class="detail-section">
      <div class="detail-label">Price target (12mo)</div>
      <div class="target-avg">$${fmt(pt.avg)} <span class="target-avg-sub">average target</span></div>
      ${renderTargetRange(pt)}
    </div>
  ` : "";

  return `
    <div class="detail-section">
      <div class="detail-label">Analyst rating</div>
      ${gaugeBlock}
      ${barsBlock}
    </div>
    ${targetBlock}
    <div class="detail-hint">Source: ${a.source}</div>
  `;
}

function renderTargetRange(pt) {
  const low = pt.low ?? pt.avg * 0.85;
  const high = pt.high ?? pt.avg * 1.15;
  const cur = pt.current ?? null;
  const span = high - low || 1;
  const pct = (v) => Math.max(0, Math.min(100, ((v - low) / span) * 100));

  return `
    <div class="target-range">
      <div class="target-track">
        <div class="target-marker avg" style="left:${pct(pt.avg)}%"></div>
        ${cur !== null ? `<div class="target-marker current" style="left:${pct(cur)}%"></div>` : ""}
      </div>
      <div class="target-range-labels">
        <span>Min $${fmt(low)}</span>
        ${cur !== null ? `<span class="current-label">Current $${fmt(cur)}</span>` : ""}
        <span>Max $${fmt(high)}</span>
      </div>
    </div>
  `;
}

function renderNewsTab(h) {
  const news = newsList(h);
  return `
    <div class="detail-section">
      <div class="detail-label">News (${news.length})</div>
      ${news.length ? news.map(n => `
        <a class="news-item" href="${n.url || "#"}" target="_blank" rel="noopener">
          <span class="news-cat">${n.category.replace("_", " ")} · ${n.source}</span>
          <span class="news-item-headline">${n.headline}</span>
          <span class="news-item-summary">${n.summary}</span>
        </a>
      `).join("") : `<div class="detail-hint">No material news found for this name.</div>`}
    </div>
  `;
}

function renderFinancialsTab(h) {
  const f = h.fundamentals;
  if (!f) return `<div class="detail-section"><div class="detail-hint">No fundamentals data available for this name.</div></div>`;
  return `
    <div class="detail-section">
      <div class="detail-label">Fundamentals</div>
      <div class="card-levels wide">
        <div>Market cap <span>${f.market_cap ?? "—"}</span></div>
        <div>P/E (ttm) <span>${f.pe_ttm ?? "—"}</span></div>
        <div>EPS (ttm) <span>${f.eps_ttm ?? "—"}</span></div>
        <div>Sales (ttm) <span>${f.sales_ttm ?? "—"}</span></div>
        <div>Profit margin <span>${f.profit_margin ?? "—"}</span></div>
        <div>Shares out <span>${f.shares_outstanding ?? "—"}</span></div>
      </div>
      <div class="detail-hint">Source: ${f.source}</div>
    </div>
  `;
}

function switchPanelTab(tab) {
  document.querySelectorAll(".panel-tab").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
  document.querySelectorAll(".panel-tab-content").forEach(c => c.hidden = c.id !== "tab-" + tab);
}

function updateWatchBtn() {
  const btn = document.getElementById("panelWatchBtn");
  const watched = currentPanelHit && state.watchlist.has(currentPanelHit.symbol);
  btn.textContent = watched ? "★" : "☆";
  btn.classList.toggle("active", !!watched);
}

function closeChart() {
  document.getElementById("chartPanel").classList.remove("open");
  document.getElementById("panelOverlay").classList.remove("visible");
}

// ---- Settings panel ----
function openSettings() {
  document.getElementById("settingsPanel").classList.add("open");
  document.getElementById("settingsOverlay").classList.add("visible");
}
function closeSettings() {
  document.getElementById("settingsPanel").classList.remove("open");
  document.getElementById("settingsOverlay").classList.remove("visible");
}

// ---- Run scan now ----
let runCooldownUntil = 0;
async function requestScan() {
  const btn = document.getElementById("runScanBtn");
  const toast = document.getElementById("runToast");
  if (Date.now() < runCooldownUntil) {
    showToast("A scan was already requested — check back in a few minutes.", "warn");
    return;
  }
  btn.disabled = true;
  btn.textContent = "Requesting…";
  try {
    const res = await fetch("/api/request-scan", { method: "POST" });
    const json = await res.json();
    if (!res.ok || json.error === "not_configured") {
      showToast("Scan trigger isn't configured yet (missing GH_TOKEN on the server).", "error");
    } else if (json.throttled) {
      showToast("A scan was already requested at " + new Date(json.requested_at).toLocaleTimeString() + " — it's still running.", "warn");
      runCooldownUntil = Date.now() + 4 * 60 * 1000;
    } else {
      showToast("Scan requested — the dashboard will refresh with live results within ~5 minutes.", "ok");
      runCooldownUntil = Date.now() + 4 * 60 * 1000;
    }
  } catch (err) {
    showToast("Couldn't reach the scan trigger. Try again shortly.", "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Run scan now";
  }
}

function showToast(msg, kind) {
  const toast = document.getElementById("runToast");
  toast.textContent = msg;
  toast.className = "run-toast visible " + kind;
  toast.hidden = false;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => { toast.hidden = true; }, 7000);
}

// ---- Wiring ----
document.getElementById("settingsBtn").addEventListener("click", openSettings);
document.getElementById("closeSettings").addEventListener("click", closeSettings);
document.getElementById("settingsOverlay").addEventListener("click", () => { closeSettings(); closeChart(); });
document.getElementById("closePanel").addEventListener("click", closeChart);
document.getElementById("panelOverlay").addEventListener("click", () => { closeChart(); closeSettings(); });
document.getElementById("panelWatchBtn").addEventListener("click", () => {
  if (currentPanelHit) { toggleWatch(currentPanelHit.symbol); updateWatchBtn(); }
});
document.getElementById("runScanBtn").addEventListener("click", requestScan);
document.getElementById("panelTabs").addEventListener("click", (e) => {
  const btn = e.target.closest(".panel-tab");
  if (btn) switchPanelTab(btn.dataset.tab);
});

document.getElementById("sortSelect").addEventListener("change", (e) => { state.sort = e.target.value; render(); });
document.getElementById("riskFilter").addEventListener("change", (e) => { state.riskFilter = e.target.value; render(); });
document.getElementById("newsOnlyToggle").addEventListener("change", (e) => { state.newsOnly = e.target.checked; render(); });
document.getElementById("watchlistOnlyToggle").addEventListener("change", (e) => { state.watchlistOnly = e.target.checked; render(); });
document.getElementById("reloadDataBtn").addEventListener("click", loadData);

document.getElementById("accentSwatches").addEventListener("click", (e) => {
  const btn = e.target.closest(".swatch");
  if (!btn) return;
  document.querySelectorAll(".swatch").forEach(s => s.classList.remove("active"));
  btn.classList.add("active");
  const accent = btn.dataset.accent;
  document.documentElement.style.setProperty("--accent", accent);
  document.documentElement.style.setProperty("--accent-dim", accent + "33");
  localStorage.setItem("apexscan_accent", accent);
});

// restore saved accent
const savedAccent = localStorage.getItem("apexscan_accent");
if (savedAccent) {
  document.documentElement.style.setProperty("--accent", savedAccent);
  document.documentElement.style.setProperty("--accent-dim", savedAccent + "33");
  const match = document.querySelector(`.swatch[data-accent="${savedAccent}"]`);
  if (match) {
    document.querySelectorAll(".swatch").forEach(s => s.classList.remove("active"));
    match.classList.add("active");
  }
}

// auto-refresh
let refreshTimer = null;
document.getElementById("autoRefreshInput").addEventListener("change", (e) => {
  const secs = Number(e.target.value);
  if (refreshTimer) clearInterval(refreshTimer);
  if (secs > 0) refreshTimer = setInterval(loadData, secs * 1000);
});
refreshTimer = setInterval(loadData, 60000);

loadData();
