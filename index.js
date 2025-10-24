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
  const t0 = Date.now();
  const { message } = req.body || {};
  console.log("📩 Incoming message:", message);

  if (!message || typeof message !== "string") {
    return res.status(400).json({ error: "Missing 'message' (string) in body" });
  }

  // כיוון שמדובר ב־stream — נכין את הכותרות מראש:
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Connection", "keep-alive");

  try {
    // יצירת בקשה ל־OpenAI במצב סטרים
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        messages: [{ role: "user", content: message }],
        stream: true,
      }),
    });

    if (!r.ok) {
      const errBody = await r.text();
      throw new Error(`OpenAI stream error ${r.status}: ${errBody}`);
    }

    // קריאת הזרם של OpenAI
    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    let fullText = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n").filter((l) => l.trim().startsWith("data: "));
      for (const line of lines) {
        if (line.includes("[DONE]")) continue;
        try {
          const data = JSON.parse(line.replace("data: ", ""));
          const delta = data?.choices?.[0]?.delta?.content;
          if (delta) {
            fullText += delta;
            res.write(`data: ${JSON.stringify({ text: delta })}\n\n`);
          }
        } catch (e) {
          console.warn("⚠️ Parse stream chunk failed:", e.message);
        }
      }
    }

    // לאחר סיום הסטרים — נייצר קול בעזרת ElevenLabs
    console.log("🧠 Full AI text:", fullText);
    let audioUrl = null;

    try {
      const voiceId = process.env.ELEVENLABS_VOICE_ID;
      const modelId = process.env.ELEVENLABS_MODEL_ID || "eleven_v3";

      const tts = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: "POST",
        headers: {
          "xi-api-key": process.env.ELEVENLABS_API_KEY,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text: fullText,
          model_id: modelId,
        }),
      });

      if (!tts.ok) {
        throw new Error(`TTS failed ${tts.status}`);
      }

      const buf = Buffer.from(await tts.arrayBuffer());
      audioUrl = `data:audio/mpeg;base64,${buf.toString("base64")}`;
    } catch (e) {
      console.warn("⚠️ TTS generation failed:", e.message);
      audioUrl = null;
    }

    // סיום ושליחת ההודעה הסופית לבייס44
    res.write(`data: ${JSON.stringify({ done: true, full_text: fullText, audio_url: audioUrl })}\n\n`);
    res.end();

    console.log(`✅ Completed full stream (${Date.now() - t0}ms)`);

  } catch (err) {
    console.error("❌ Server error:", err.message);
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  }
});

// ברירת מחדל / בריאות
app.get("/", (_req, res) => res.send("✅ Bailey AI server is up"));

app.listen(3000, () => {
  console.log("✅ Bailey AI server running on port 3000");
});
