export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "APIキーが設定されていません。" });
  }

  const { messages, systemPrompt, maxTokens } = req.body;
  if (!messages || !systemPrompt) {
    return res.status(400).json({ error: "リクエストが不正です。" });
  }

  try {
    const openaiMessages = [
      { role: "system", content: systemPrompt },
      ...messages.map(m => ({
        role: m.role === "model" ? "assistant" : m.role,
        content: m.parts?.[0]?.text || m.content || ""
      }))
    ];

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: openaiMessages,
        max_tokens: maxTokens || 2000,
        temperature: 0.8
      })
    });

    const data = await response.json();
    if (data.error) return res.status(500).json({ error: data.error.message });

    const reply = data.choices?.[0]?.message?.content || "返答を取得できませんでした。";
    return res.status(200).json({ reply });

  } catch (err) {
    return res.status(500).json({ error: `通信エラー: ${err.message}` });
  }
}
