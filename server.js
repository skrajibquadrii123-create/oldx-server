// OLDX AI server: keeps your Gemini key secret and talks to Gemini for the app.
const express = require("express"), cors = require("cors"), fs = require("fs");
const app = express();
app.use(cors());
app.use(express.json({ limit: "12mb" }));

const KEY = process.env.GEMINI_API_KEY, TOKEN = process.env.APP_TOKEN || "";
const MODELS = { complex: process.env.MODEL_COMPLEX || "gemini-2.5-flash", default: process.env.MODEL_COMPLEX || "gemini-2.5-flash", quick: process.env.MODEL_QUICK || "gemini-2.5-flash-lite" };

// simple rate limit: 30 requests per 10 minutes per IP
const hits = new Map();
function limited(ip) { const now = Date.now(), a = (hits.get(ip) || []).filter(t => now - t < 600000); a.push(now); hits.set(ip, a); return a.length > 30; }

app.get("/", (_, res) => res.send("OLDX AI server is running"));

app.post("/ai", async (req, res) => {
  if (TOKEN && req.get("x-app-token") !== TOKEN) return res.status(401).json({ error: "unauthorized" });
  if (limited(req.ip)) return res.status(429).json({ error: "too many requests" });
  if (!KEY) return res.status(500).json({ error: "server key missing" });
  try {
    const { input, images = [], tier = "default" } = req.body;
    const msgs = typeof input === "string" ? [{ role: "user", content: input }] : (input || []);
    const contents = msgs.map((m, i) => {
      const parts = [];
      if (i === msgs.length - 1) images.slice(0, 3).forEach(d => { const x = /^data:(.+?);base64,(.+)$/.exec(d); parts.push({ inline_data: { mime_type: x ? x[1] : "image/jpeg", data: x ? x[2] : d } }); });
      parts.push({ text: String(m.content) });
      return { role: m.role === "assistant" ? "model" : "user", parts };
    });
    const model = MODELS[tier] || MODELS.default;
    const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent", {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": KEY },
      body: JSON.stringify({ contents, generationConfig: { maxOutputTokens: 4000 } })
    });
    const j = await r.json();
    if (!r.ok) return res.status(502).json({ error: (j.error && j.error.message) || "AI error" });
    const text = ((j.candidates || [])[0]?.content?.parts || []).map(p => p.text || "").join("\n");
    res.json({ text });
  } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
});

// one payment (UTR) can unlock Premium only once
const FILE = "./used-utr.json";
const used = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, "utf8")) : {};
app.post("/claim", (req, res) => {
  if (TOKEN && req.get("x-app-token") !== TOKEN) return res.status(401).json({ error: "unauthorized" });
  const { utr, device } = req.body || {};
  if (!utr || String(utr).length < 8) return res.status(400).json({ error: "bad utr" });
  if (used[utr] && used[utr] !== device) return res.status(409).json({ error: "already used" });
  used[utr] = device || "x"; fs.writeFileSync(FILE, JSON.stringify(used)); res.json({ ok: true });
});

app.listen(process.env.PORT || 3000, () => console.log("OLDX AI server on port " + (process.env.PORT || 3000)));
