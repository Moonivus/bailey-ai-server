import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

// פונקציית סטרימינג אמיתי מול OpenAI
app.post("/api/stream", async (req, res) => {
  const { message } = req.body;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-4o-mini", // מהיר מאוד לסטרימינג
      messages: [{ role: "user", content: message }],
      stream: true
    })
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");

  let textAccumulator = ""; // נשמור את הפלט כדי להעביר אח"כ ל-voice

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value);
    const lines = chunk.split("\n");

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const data = line.replace("data: ", "").trim();
        if (data === "[DONE]") {
          res.write(`data: [DONE]\n\n`);
          break;
        }
        try {
          const json = JSON.parse(data);
          const content = json.choices?.[0]?.delta?.content;
          if (content) {
            textAccumulator += content;
            res.write(`data: ${content}\n\n`);
          }
        } catch (err) {}
      }
    }
  }

  // עכשיו נוסיף קריאה ל-ElevenLabs
  try {
    const voiceResponse = await fetch("https://api.elevenlabs.io/v1/text-to-speech/EXAVITQu4vr4xnSDxMaL/stream", {
      method: "POST",
      headers: {
        "xi-api-key": process.env.ELEVENLABS_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        text: textAccumulator,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.7
        }
      })
    });

    const audioBuffer = await voiceResponse.arrayBuffer();
    const base64Audio = Buffer.from(audioBuffer).toString("base64");
    res.write(`data: [AUDIO:${base64Audio}]\n\n`);
  } catch (error) {
    console.error("ElevenLabs error:", error);
  }

  res.end();
});

// בדיקה פשוטה
app.get("/", (req, res) => {
  res.send("✅ Bailey AI Stream Server is running smoothly.");
});

app.listen(3000, () => console.log("🚀 Bailey backend running on port 3000"));
