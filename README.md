# Apex Scan

Premarket dashboard: stocks with a bullish MACD reversal (DIF crossing up through DEA) while both premarket price and prior close sit above the 200-day moving average, filtered down further by trend strength (moving-average alignment + an approximated swing-based trendline/channel for low-risk entries), each paired with only material news (earnings, M&A, FDA, major contracts, analyst actions, legal).

Static site — no build step, no backend. `app.js` fetches `data/latest_scan.json` and renders it; clicking a ticker opens a side panel with a live embedded TradingView chart for that symbol.

`data/latest_scan.json` is written locally by a Claude Code scheduled task (TradingView MCP + Finviz/Yahoo/Benzinga fetches) and pushed here so Vercel redeploys with fresh data each morning on trading days.
