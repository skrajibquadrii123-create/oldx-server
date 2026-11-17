// import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json({ limit: "15mb" }));

const KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const TOKEN = process.env.APP_TOKEN;

app.use("/api", (req, res, next) => {
  if (TOKEN && req.get("authorization") !== "Bearer " + TOKEN) return res.status(401).json({ error: "unauthorized" });
  next();
});

const imgPart = (d) => {
  const m = /^data:(.+?);base64,(.+)$/.exec(d || "");
  return m ? { inline_data: { mime_type: m[1], data: m[2] } } : null;
};

async function gemini(contents, generationConfig) {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": KEY },
    body: JSON.stringify({ contents, generationConfig }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error?.message || "Gemini error " + r.status);
  return (d.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
}

app.post("/api/ai/json", async (req, res) => {
  try {
    const { prompt = "", images = [] } = req.body;
    const parts = [{ text: prompt }, ...images.map(imgPart).filter(Boolean)];
    const text = await gemini([{ role: "user", parts }], { responseMimeType: "application/json" });
    res.json({ text });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.post("/api/ai/chat", async (req, res) => {
  try {
    const { messages = [], images = [] } = req.body;
    const contents = messages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: String(m.content) }],
    }));
    const last = contents[contents.length - 1];
    if (last) last.parts.push(...images.map(imgPart).filter(Boolean));
    res.json({ text: await gemini(contents, {}) });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get("/", (_req, res) => res.send("oldx-server ok"));
app.listen(process.env.PORT || 3000);
