// Vercel サーバーレス関数
// APIキーはサーバー側だけで使用され、ブラウザには一切渡されません

export default async function handler(req, res) {
  // POST以外は拒否
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "APIキーが設定されていません。Vercelの環境変数を確認してください。" });
  }

  const { messages, systemPrompt } = req.body;
  if (!messages || !systemPrompt) {
    return res.status(400).json({ error: "リクエストが不正です。" });
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: messages,
          generationConfig: { maxOutputTokens: 800, temperature: 0.7 }
        })
      }
    );

    const data = await response.json();

    if (data.error) {
      return res.status(500).json({ error: data.error.message });
    }

    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "返答を取得できませんでした。";
    return res.status(200).json({ reply });

  } catch (err) {
    return res.status(500).json({ error: `通信エラー: ${err.message}` });
  }
}

