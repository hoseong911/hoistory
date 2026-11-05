const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");

const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");

// hismile/index.html, apps/interview/index.html 등 공개 페이지가 이 origin에서만 호출한다.
// 로컬 테스트용 origin도 열어둔다.
const ALLOWED_ORIGINS = new Set([
  "https://hoseong911.github.io",
  // Firebase Hosting 기본 도메인 (lms/index.html의 생각 체크 AI 도움이 학생 화면에서 직접 호출한다)
  "https://ho0911seong-56638.web.app",
  "https://ho0911seong-56638.firebaseapp.com",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  // npm run preview (tools/preview-server.js) 기본 포트
  "http://localhost:4173",
  "http://127.0.0.1:4173",
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

/* ════════════════════════════════════════════════════════════════
   감사편지 트리 — 선생님 편지 열람 (xmas/teacher.html)

   왜 서버를 거치는가:
   학생도 선생님도 Firebase Auth로 로그인하지 않는다. 보안 규칙은 "누가
   요청했는지"만 볼 수 있어서 네 자리 번호를 확인해 줄 수 없다. 그래서
   xmas_letters는 규칙에서 클라이언트 읽기를 통째로 막아 두고, 번호 확인과
   편지 전달을 이 함수가 맡는다. 번호(xmas_teacher_pins)도 같은 이유로
   클라이언트가 못 읽는다 — 읽을 수 있으면 확인 절차 자체가 의미가 없다.
   ════════════════════════════════════════════════════════════════ */
const admin = require("firebase-admin");
if (!admin.apps.length) admin.initializeApp();

const MAX_FAILS = 8;              // 이만큼 틀리면
const LOCK_MS = 10 * 60 * 1000;   // 10분 쉬게 한다

// 한국 시간 기준 오늘 날짜('YYYY-MM-DD'). shared/util.js의 kstDate와 같은 규칙이다.
function kstToday(ms = Date.now()) {
  return new Date(ms + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

exports.xmasLetters = onRequest(
  { region: "asia-northeast3", timeoutSeconds: 30 },
  async (req, res) => {
    const origin = req.get("Origin") || "";
    if (ALLOWED_ORIGINS.has(origin)) res.set("Access-Control-Allow-Origin", origin);
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    res.set("Vary", "Origin");

    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    if (!ALLOWED_ORIGINS.has(origin)) {
      res.status(403).json({ ok: false, message: "허용되지 않은 접속입니다." });
      return;
    }
    if (req.method !== "POST") {
      res.status(405).json({ ok: false, message: "POST만 허용됩니다." });
      return;
    }

    const body = req.body || {};
    const teacherId = String(body.teacherId || "");
    const pin = String(body.pin || "");
    // 문서 id에 슬래시 같은 것이 섞이면 경로가 깨진다. 형식부터 막는다.
    if (!/^[A-Za-z0-9_-]{1,200}$/.test(teacherId) || !/^\d{4}$/.test(pin)) {
      res.status(400).json({ ok: false, message: "번호가 맞지 않아요." });
      return;
    }

    const db = admin.firestore();
    const pinRef = db.collection("xmas_teacher_pins").doc(teacherId);

    try {
      // 번호 확인과 실패 횟수 기록을 한 트랜잭션에서 한다
      // (여러 창에서 동시에 두드려도 횟수가 새지 않게).
      const verdict = await db.runTransaction(async (tx) => {
        const snap = await tx.get(pinRef);
        if (!snap.exists) return { state: "nopin" };
        const d = snap.data() || {};
        const now = Date.now();
        if (Number(d.lockUntil || 0) > now) {
          return { state: "locked", until: Number(d.lockUntil) };
        }
        if (String(d.pin || "") !== pin) {
          const fails = Number(d.fails || 0) + 1;
          if (fails >= MAX_FAILS) {
            tx.update(pinRef, { fails: 0, lockUntil: now + LOCK_MS });
            return { state: "locked", until: now + LOCK_MS };
          }
          tx.update(pinRef, { fails });
          return { state: "wrong" };
        }
        if (Number(d.fails || 0) !== 0) tx.update(pinRef, { fails: 0 });
        return { state: "ok" };
      });

      if (verdict.state === "locked") {
        const min = Math.max(1, Math.ceil((verdict.until - Date.now()) / 60000));
        res.status(429).json({ ok: false, message: `번호를 여러 번 잘못 넣었어요. ${min}분 뒤에 다시 해 주세요.` });
        return;
      }
      if (verdict.state !== "ok") {
        res.status(403).json({ ok: false, message: "번호가 맞지 않아요." });
        return;
      }

      // 공개일 판정 — 설정이 비어 있으면 바로 열린다
      const cfgSnap = await db.collection("settings").doc("xmas_config").get();
      const openAt = String((cfgSnap.exists ? cfgSnap.data() : {}).openAt || "").trim();
      const open = !openAt || kstToday() >= openAt;

      /* 같음 조건 하나뿐이라 따로 색인을 만들지 않아도 된다.
         숨긴 편지 거르기와 시간순 정렬은 받아 와서 한다(한 선생님 몫이라 양이 적다). */
      const qs = await db.collection("xmas_letters").where("teacherId", "==", teacherId).get();
      const rows = qs.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .filter((r) => !r.hidden)
        .sort((a, b) => toMs(a.createdAt) - toMs(b.createdAt));

      if (!open) {
        // 아직 읽을 수 없는 동안에도 "트리 어디에 걸려 있는지"는 알려 준다.
        // 오너먼트 문서 id가 편지 id와 같아서 이것만으로 트리에서 빛나게 할 수 있다.
        res.json({ ok: true, locked: true, count: rows.length, letterIds: rows.map((r) => r.id) });
        return;
      }

      res.json({
        ok: true,
        locked: false,
        letters: rows.map((r) => ({
          id: r.id,
          studentId: String(r.studentId || ""),
          studentName: String(r.studentName || ""),
          body: String(r.body || ""),
          ornament: String(r.ornament || ""),
          createdAt: toMs(r.createdAt),
        })),
      });
    } catch (err) {
      console.error("xmasLetters error", err);
      res.status(500).json({ ok: false, message: "편지를 가져오지 못했어요." });
    }
  }
);

function toMs(ts) {
  if (!ts) return 0;
  if (typeof ts.toMillis === "function") return ts.toMillis();
  if (typeof ts._seconds === "number") return ts._seconds * 1000;
  return 0;
}
