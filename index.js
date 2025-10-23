import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

app.post("/bailey", async (req, res) => {
  const userMessage = req.body.message;

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": "Bearer GROQ_API_KEY_HERE",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "mixtral-8x7b",
      messages: [{ role: "user", content: userMessage }],
      stream: false
    })
  });

  const data = await response.json();
  const answer = data.choices[0].message.content;
  res.json({ reply: answer });
});

app.listen(3000, () => console.log("✅ Bailey backend running on port 3000"));
