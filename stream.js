import express from "express";
import fetch from "node-fetch";

const router = express.Router();

// סטרימינג אמיתי מול OpenAI
router.post("/api/stream", async (req, res) => {
  const userMessage = req.body.message;

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
      model: "gpt-4o-mini",   // מהיר וזול לסטרימינג
      messages: [{ role: "user", content: userMessage }],
      stream: true
    })
  });

  // קריאה לזרם של טוקנים
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value);
    res.write(`data: ${chunk}\n\n`);
  }

  res.write("data: [DONE]\n\n");
  res.end();
});

export default router;
