const OWNER = "danishzhang";
const REPO = "apex-scan";
const BRANCH = "master";
const PATH = "scan_request.json";
const THROTTLE_MS = 4 * 60 * 1000;

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  const token = process.env.GH_TOKEN;
  if (!token) {
    res.status(500).json({ error: "not_configured" });
    return;
  }

  const api = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${PATH}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    "User-Agent": "apex-scan-dashboard",
    Accept: "application/vnd.github+json",
  };

  try {
    let sha;
    let current = null;
    const getRes = await fetch(`${api}?ref=${BRANCH}`, { headers });
    if (getRes.ok) {
      const data = await getRes.json();
      sha = data.sha;
      current = JSON.parse(Buffer.from(data.content, "base64").toString("utf8"));
    } else if (getRes.status !== 404) {
      res.status(502).json({ error: "github_read_failed", status: getRes.status });
      return;
    }

    const now = Date.now();
    if (current && current.status === "pending" && now - new Date(current.requested_at).getTime() < THROTTLE_MS) {
      res.status(200).json({ ok: true, throttled: true, requested_at: current.requested_at });
      return;
    }

    const body = { status: "pending", requested_at: new Date(now).toISOString() };
    const content = Buffer.from(JSON.stringify(body, null, 2)).toString("base64");

    const putRes = await fetch(api, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        message: "Manual scan requested via dashboard",
        content,
        branch: BRANCH,
        ...(sha ? { sha } : {}),
      }),
    });

    if (!putRes.ok) {
      const detail = await putRes.text();
      res.status(502).json({ error: "github_write_failed", detail });
      return;
    }

    res.status(200).json({ ok: true, throttled: false, requested_at: body.requested_at });
  } catch (err) {
    res.status(500).json({ error: "unexpected_error", detail: String(err) });
  }
};
