const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");

const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");

// hismile/index.html, apps/interview/index.html 등 공개 페이지가 이 origin에서만 호출한다.
// 로컬 테스트용 origin도 열어둔다.
const ALLOWED_ORIGINS = new Set([
  "https://hoseong911.github.io",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
]);

// Anthropic 키를 서버(Secret Manager)에만 두고, 클라이언트는 이 프록시로만 호출한다.
// 클라이언트가 보낼 수 있는 필드를 model/max_tokens/messages로 제한해 임의 파라미터 주입을 막는다.
exports.claudeProxy = onRequest(
  { secrets: [ANTHROPIC_API_KEY], region: "asia-northeast3", timeoutSeconds: 60 },
  async (req, res) => {
    const origin = req.get("Origin") || "";
    if (ALLOWED_ORIGINS.has(origin)) {
      res.set("Access-Control-Allow-Origin", origin);
    }
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }
    if (!ALLOWED_ORIGINS.has(origin)) {
      res.status(403).json({ error: "허용되지 않은 origin입니다" });
      return;
    }
    if (req.method !== "POST") {
      res.status(405).json({ error: "POST만 허용됩니다" });
      return;
    }

    const { model, max_tokens, messages } = req.body || {};
    if (!model || !max_tokens || !Array.isArray(messages)) {
      res.status(400).json({ error: "model, max_tokens, messages가 필요합니다" });
      return;
    }

    try {
      const upstream = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_API_KEY.value(),
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({ model, max_tokens, messages }),
      });
      const data = await upstream.json();
      res.status(upstream.status).json(data);
    } catch (err) {
      console.error("claudeProxy upstream error", err);
      res.status(502).json({ error: "Claude API 호출 실패" });
    }
  }
);
