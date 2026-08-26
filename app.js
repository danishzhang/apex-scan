const DATA_URL = "data/latest_scan.json";

const state = {
  data: null,
  sort: "risk",
  riskFilter: "all",
  newsOnly: false,
};

const RISK_ORDER = { "near support (low risk)": 0, "extended (moderate risk)": 1, "extended (high risk, wait for pullback)": 2 };
const RISK_CLASS = { "near support (low risk)": "risk-low", "extended (moderate risk)": "risk-moderate", "extended (high risk, wait for pullback)": "risk-high" };
const RISK_COLOR = { "near support (low risk)": "#3ddc97", "extended (moderate risk)": "#f5b942", "extended (high risk, wait for pullback)": "#ff5d6c" };

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
    document.getElementById("emptyState").hidden = false;
    document.querySelector("#emptyState p").textContent = humanizeError(data.error);
    document.getElementById("resultCount").textContent = "";
    return;
  }

  const scannedAt = new Date(data.scanned_at);
  setStatus("ok", "Scan: " + scannedAt.toLocaleString());

  let hits = [...(data.hits || [])];

  if (state.newsOnly) hits = hits.filter(h => h.news);
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

  el.innerHTML = `
    <div class="card-head">
      <span class="card-symbol">${h.symbol}</span>
      <span class="card-price">$${fmt(h.premarket_price)}<span class="card-gap ${gapClass}">${gapSign}${gap.toFixed(1)}%</span></span>
    </div>
    <div class="badge-row">
      <span class="badge good">MACD turning up</span>
      <span class="badge good">Above MA200</span>
      <span class="badge ${riskClass}">${riskLabel}</span>
    </div>
    <div class="card-levels">
      <div>SMA200 <span>$${fmt(h.sma200)}</span></div>
      <div>Support <span>$${fmt(h.trend.support_level)}</span></div>
      <div>Stop <span>$${fmt(h.trend.suggested_stop)}</span></div>
      <div>Resistance <span>$${fmt(h.trend.resistance_level)}</span></div>
    </div>
    <div class="card-news ${h.news ? "" : "none"}">
      ${h.news
        ? `<span class="news-cat">${h.news.category.replace("_", " ")} · ${h.news.source}</span>${h.news.summary}`
        : "No material news on this name."}
    </div>
  `;

  el.querySelector(".card-symbol").addEventListener("click", (e) => {
    e.stopPropagation();
    openChart(h.symbol);
  });
  el.addEventListener("click", () => openChart(h.symbol));

  return el;
}

function fmt(n) {
  return n === null || n === undefined ? "—" : Number(n).toFixed(2);
}

// ---- Chart side panel ----
let tvWidget = null;
function openChart(symbol) {
  document.getElementById("chartPanelSymbol").textContent = symbol;
  document.getElementById("chartPanel").classList.add("open");
  document.getElementById("panelOverlay").classList.add("visible");

  const container = document.getElementById("tv_chart_container");
  container.innerHTML = "";
  new TradingView.widget({
    autosize: true,
    symbol: symbol,
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

// ---- Wiring ----
document.getElementById("settingsBtn").addEventListener("click", openSettings);
document.getElementById("closeSettings").addEventListener("click", closeSettings);
document.getElementById("settingsOverlay").addEventListener("click", () => { closeSettings(); closeChart(); });
document.getElementById("closePanel").addEventListener("click", closeChart);
document.getElementById("panelOverlay").addEventListener("click", () => { closeChart(); closeSettings(); });

document.getElementById("sortSelect").addEventListener("change", (e) => { state.sort = e.target.value; render(); });
document.getElementById("riskFilter").addEventListener("change", (e) => { state.riskFilter = e.target.value; render(); });
document.getElementById("newsOnlyToggle").addEventListener("change", (e) => { state.newsOnly = e.target.checked; render(); });
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
