import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();

// CORS פתוח
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json());

// -------- OpenAI (טקסט) --------
async function getOpenAIText(userText) {
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: userText }],
      stream: false,
    }),
  });

  if (!r.ok) {
    const body = await r.text();
    throw new Error(`OpenAI error ${r.status}: ${body}`);
  }

  const data = await r.json();
  const text =
    data?.choices?.[0]?.message?.content?.trim() ||
    "לא הצלחתי להבין, אפשר לנסח שוב?";
  console.log("🧠 OpenAI:", text);
  return text;
}

// -------- ElevenLabs (קול) --------
// ברירת מחדל: eleven_v3 (כפי שביקשת)
async function elevenLabsTTS(text) {
  const voiceId = process.env.ELEVENLABS_VOICE_ID;
  if (!voiceId) throw new Error("Missing ELEVENLABS_VOICE_ID");

  const modelId = process.env.ELEVENLABS_MODEL_ID || "eleven_v3";
  console.log("🎤 ElevenLabs model:", modelId);

  const r = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": process.env.ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: modelId, // ← בדיוק eleven_v3
      }),
    }
  );

  if (!r.ok) {
    const body = await r.text();
    throw new Error(`ElevenLabs error ${r.status} (${modelId}): ${body}`);
  }

  const buf = Buffer.from(await r.arrayBuffer());
  return `data:audio/mpeg;base64,${buf.toString("base64")}`;
}

// -------- נקודת קצה לביילי --------
app.post("/bailey", async (req, res) => {
  const { message } = req.body || {};
  console.log("📩 Incoming message:", message);

  if (!message || typeof message !== "string") {
    return res.status(400).json({ error: "Missing 'message' (string) in body" });
  }

  try {
    // שלב 1: טקסט מ־OpenAI (לא stream)
    const aiText = await getOpenAIText(message);

    // שלב 2: הפקת אודיו (אם תרצה, כרגע נשתמש ב-eleven_v3)
    let audioUrl = null;
    try {
      audioUrl = await elevenLabsTTS(aiText);
    } catch (err) {
      console.warn("⚠️ ElevenLabs failed, returning text only:", err.message);
      audioUrl = null;
    }

    // שלב 3: תשובה אחידה בפורמט שבייס44 מצפה
    const payload = {
      text: aiText,
      audio_url: audioUrl,
      message: aiText,
      audio: audioUrl
    };

    console.log("✅ Response to Base44:", payload);
    res.status(200).json(payload);

  } catch (err) {
    console.error("❌ Server error:", err.message);
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

// ברירת מחדל / בריאות
app.get("/", (_req, res) => res.send("✅ Bailey AI server is up"));

app.listen(3000, () => {
  console.log("✅ Bailey AI server running on port 3000");
});
