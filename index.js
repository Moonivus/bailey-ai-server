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
  const { message, mode } = req.body || {};
  console.log("📩 Incoming message:", message);

  if (!message || typeof message !== "string") {
    return res.status(400).json({ error: "Missing 'message' (string) in body" });
  }

  try {
    // 1) טקסט
    const aiText = await getOpenAIText(message);

    // תמיכה בבדיקת טקסט-בלבד (כדי לבודד את Base44)
    if (mode === "textOnly") {
      const payload = {
        // השדות שבייס44 מצפה להם:
        text: aiText,
        audio: null,
        // תאימות לאחור/קדימה:
        message: aiText,
        audio_url: null
      };
      console.log("✅ Sending TEXT-ONLY response:", payload);
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json(payload);
    }

    // 2) אודיו
    // ⚠️ חשוב: Base44 מצפה ל <audio_url_if_available>. עדיף URL אמיתי (http/https).
    // אם כרגע אין לך אחסון לקובץ, זמנית נחזיר ללא אודיו כדי לא לחסום את התצוגה.
    // כשתרצה אודיו, שמור את ה-MP3 ל-Object Storage/CDN והחזר URL.
    let audioUrl = null;
    try {
      // אם אתה *חייב* כרגע Data-URI, זה יעבוד לעתים — אבל עלול לתקוע קליינטים.
      // const dataUri = await elevenLabsTTS(aiText);
      // audioUrl = dataUri;

      // המלצה: עדכון עתידי – לשמור את ה-MP3 זמנית ולתת URL אמיתי.
      // בינתיים נשאיר null כדי לוודא שהטקסט מוצג בביילי בלי תקיעות.
      audioUrl = null;
    } catch (e) {
      console.warn("⚠️ TTS failed, continuing with text only:", e.message);
      audioUrl = null;
    }

    // 3) שליחה – גם וגם (text/audio + message/audio_url) כדי שלא תהיה תלות בשם שדה
    const payload = {
      text: aiText,           // מה שבייס44 מצפה לפי ההנחיות בפאנל
      audio: audioUrl,        // URL לקובץ אם קיים (כרגע null)
      message: aiText,        // תאימות לאחור
      audio_url: audioUrl     // תאימות לאחור
    };

    console.log(
      `✅ Sending response (${Date.now() - t0}ms):`,
      { textLen: aiText?.length, hasAudio: !!audioUrl }
    );
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json(payload);

  } catch (err) {
    console.error("❌ Server error:", err.stack || err.message);
    return res.status(500).json({ error: "Server error", details: err.message });
  }
});

// ברירת מחדל / בריאות
app.get("/", (_req, res) => res.send("✅ Bailey AI server is up"));

app.listen(3000, () => {
  console.log("✅ Bailey AI server running on port 3000");
});
