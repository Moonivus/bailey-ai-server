import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

// עוזר קטן: קריאת OpenAI (מודל ברירת מחדל ניתן לשינוי דרך ENV)
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
  return data?.choices?.[0]?.message?.content?.trim() || "לא הצלחתי להבין. אפשר לנסח שוב?";
}

// עוזר קטן: קריאת ElevenLabs עם מודל v3 + נפילה ל-alpha במקרה הצורך
async function elevenLabsTTS(text) {
  const voiceId = process.env.ELEVENLABS_VOICE_ID; // חובה
  if (!voiceId) throw new Error("Missing ELEVENLABS_VOICE_ID");

  // עדיפות למודל מה-ENV, אחרת v3 רגיל, ואם נכשל — ננסה v3_alpha
  const primaryModel = process.env.ELEVENLABS_MODEL_ID || "eleven_v3";
  const fallbackModel = "eleven_v3_alpha";

  async function ttsWith(modelId) {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: {
        "xi-api-key": process.env.ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
        Accept: "audio/mpeg", // חשוב להחזיר ישירות MPEG
      },
      body: JSON.stringify({
        text,
        model_id: modelId,
      }),
    });
    if (!r.ok) {
      const body = await r.text();
      throw new Error(`ElevenLabs error ${r.status} (${modelId}): ${body}`);
    }
    const buf = Buffer.from(await r.arrayBuffer());
    return `data:audio/mpeg;base64,${buf.toString("base64")}`;
  }

  try {
    return await ttsWith(primaryModel);
  } catch (e1) {
    // נסיון אוטומטי ל-alpha אם הראשי נכשל
    if (primaryModel !== fallbackModel) {
      try {
        return await ttsWith(fallbackModel);
      } catch (e2) {
        throw e2; // דווח את השגיאה של הניסיון השני
      }
    }
    throw e1;
  }
}

// נקודת הקצה הראשית
app.post("/bailey", async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "Missing 'message' (string) in body" });
    }

    // 1) טקסט מ-OpenAI
    const aiText = await getOpenAIText(message);

    // 2) קול מ-ElevenLabs v3 (עם Fallback אוטומטי)
    const audioDataUrl = await elevenLabsTTS(aiText);

    // 3) החזרה
    res.json({ text: aiText, audio: audioDataUrl });
  } catch (err) {
    console.error("❌ Server error:", err.message);
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

// ברירת מחדל לבדיקה מהירה
app.get("/", (_req, res) => res.send("✅ Bailey AI server is up"));

app.listen(3000, () => {
  console.log("✅ Bailey AI server (OpenAI + ElevenLabs v3) running on port 3000");
});
