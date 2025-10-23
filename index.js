import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

// פונקציית POST ראשית
app.post("/bailey", async (req, res) => {
  const { message } = req.body;

  try {
    // שלב 1: שולח את ההודעה ל־OpenAI
    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5",
        messages: [{ role: "user", content: message }],
        stream: false
      }),
    });

    const openaiData = await openaiResponse.json();
    const aiText = openaiData.choices?.[0]?.message?.content || "I'm not sure what to say.";

    // שלב 2: שולח את התשובה לקול דרך ElevenLabs
    const elevenResponse = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVENLABS_VOICE_ID}`, {
      method: "POST",
      headers: {
        "xi-api-key": process.env.ELEVENLABS_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        text: aiText,
        model_id: "eleven_monolingual_v1",
        voice_settings: {
          stability: 0.4,
          similarity_boost: 0.8
        }
      })
    });

    const audioBuffer = await elevenResponse.arrayBuffer();
    const audioBase64 = Buffer.from(audioBuffer).toString("base64");

    // שלב 3: מחזיר גם טקסט וגם קול
    res.json({
      text: aiText,
      audio: `data:audio/mpeg;base64,${audioBase64}`
    });

  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: "An error occurred", details: error.message });
  }
});

app.listen(3000, () => console.log("✅ Bailey backend running with voice on port 3000"));
