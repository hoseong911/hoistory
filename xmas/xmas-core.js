/* ════════════════════════════════════════════════════════════════
   감사편지 트리 공통 모듈 — 네 화면이 같이 쓴다.
     index.html   학생이 편지를 쓰는 화면 (공용 태블릿)
     tree.html    전시용 트리 화면
     teacher.html 선생님이 자기 앞으로 온 편지를 읽는 화면
     admin.html   관리 화면

   · Firebase 연결, 설정 읽기, 서버 시각, 밤하늘 눈 내리기, 잡다한 도우미.
   · 편지 본문은 이 모듈로 읽을 수 없다 — 규칙이 클라이언트 읽기를 막고 있고
     선생님 화면은 Cloud Function(xmasLetters)을 거친다. 자세한 까닭은
     아래 "데이터를 둘로 나눈 까닭" 주석에 적어 두었다.
   ════════════════════════════════════════════════════════════════ */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, getDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getDatabase, ref, onValue } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { firebaseConfig } from "../shared/firebase-config.js";
import { kstDate } from "../shared/util.js";

export const app  = initializeApp(firebaseConfig);
export const db   = getFirestore(app);
export const rtdb = getDatabase(app);
export const auth = getAuth(app);

/* ────────────────────────────────────────────────────────────────
   데이터를 둘로 나눈 까닭

   학생은 Firebase Auth로 로그인하지 않고, 선생님도 네 자리 번호로만 들어온다.
   보안 규칙은 "누가 요청했는지"만 볼 수 있어서 번호를 확인해 줄 수 없다.
   그래서 규칙만으로 익명을 지키려면 애초에 내려보낼 수 있는 것을 줄여야 한다.

     xmas_ornaments/{편지id}  { ornament, createdAt }      ← 누구나 읽는다(트리용)
     xmas_letters/{편지id}    학번, 이름, 받는 분, 내용      ← 클라이언트는 못 읽는다
     xmas_teachers/{id}       { name, subject, order }      ← 누구나 읽는다(고르기용)
     xmas_teacher_pins/{id}   { pin, fails, lockUntil }     ← 클라이언트는 못 읽는다

   트리 화면이 받는 것은 오너먼트 종류와 시각뿐이다. 개발자 도구를 열어
   통신을 들여다봐도 편지 내용은커녕 누구 앞으로 간 것인지도 나오지 않는다.
   선생님별 보기는 Cloud Function이 번호를 확인한 뒤 돌려주는 편지 id 목록으로
   한다(그래서 오너먼트 문서에 teacherId를 넣지 않았다 — 넣지 말 것).
   ──────────────────────────────────────────────────────────────── */

export const C_LETTERS   = 'xmas_letters';
export const C_ORNAMENTS = 'xmas_ornaments';
export const C_TEACHERS  = 'xmas_teachers';
export const C_PINS      = 'xmas_teacher_pins';

/** 선생님 편지 열람 중개 함수 (functions/index.js의 xmasLetters) */
export const XMAS_FN_URL = 'https://asia-northeast3-ho0911seong-56638.cloudfunctions.net/xmasLetters';

// ── 설정 ────────────────────────────────────────────────────────

export const DEFAULT_CONFIG = {
  title:  '선생님께 보내는 감사편지',
  sub:    '마음을 적어 트리에 달아 주세요',
  openAt: '',      // 'YYYY-MM-DD' — 선생님이 편지를 읽을 수 있게 되는 날(한국 시간 0시). 비우면 바로 열린다.
  closed: false,   // 편지 받기 중단
  minLen: 20,      // 편지 최소 글자 수(공백 제외)
  maxLen: 400,     // 편지 최대 글자 수
};

const CFG_REF = () => doc(db, 'settings', 'xmas_config');

export function normalizeConfig(raw) {
  const c = Object.assign({}, DEFAULT_CONFIG, raw || {});
  c.minLen = Number(c.minLen) || DEFAULT_CONFIG.minLen;
  c.maxLen = Number(c.maxLen) || DEFAULT_CONFIG.maxLen;
  c.closed = !!c.closed;
  c.openAt = typeof c.openAt === 'string' ? c.openAt.trim() : '';
  return c;
}

export async function loadConfig() {
  try {
    const snap = await getDoc(CFG_REF());
    return normalizeConfig(snap.exists() ? snap.data() : null);
  } catch {
    return normalizeConfig(null);
  }
}

/** 설정이 바뀌면 바로 따라오게 한다(어드민에서 받기를 중단하면 태블릿이 곧장 닫힌다). */
export function watchConfig(cb) {
  return onSnapshot(CFG_REF(),
    snap => cb(normalizeConfig(snap.exists() ? snap.data() : null)),
    () => cb(normalizeConfig(null)));
}

// ── 서버 시각 ───────────────────────────────────────────────────
// 태블릿 시계가 틀어져 있어도 공개 시점이 흔들리지 않게 RTDB 시차를 받아 쓴다.

let _offset = 0;
onValue(ref(rtdb, '.info/serverTimeOffset'), s => { _offset = s.val() || 0; }, () => {});

export function serverNow() { return Date.now() + _offset; }

/** 선생님이 편지 내용을 읽을 수 있는 때가 되었는가 */
export function readingOpen(cfg, ms = serverNow()) {
  if (!cfg || !cfg.openAt) return true;
  return kstDate(ms) >= cfg.openAt;
}

/** '2026-12-24' → '12월 24일' */
export function openAtLabel(cfg) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((cfg && cfg.openAt) || '');
  if (!m) return '';
  return `${Number(m[2])}월 ${Number(m[3])}일`;
}

// ── 잡다한 도우미 ───────────────────────────────────────────────

export function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** 줄바꿈을 살려 보여 준다(편지 본문용). 반드시 esc를 먼저 거친다. */
export function nl2br(s) { return esc(s).replace(/\n/g, '<br>'); }

/** 문자열에서 고정된 0~1 난수를 뽑는다 — 오너먼트 자리가 새로고침해도 안 변하게 */
export function hash01(str, salt = 0) {
  let h = 2166136261 ^ salt;
  const s = String(str || '');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

export function fmtDateTime(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}. ${p(d.getMonth() + 1)}. ${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 학번 5자리를 '3학년 6반 12번'으로 푼다(앞 1자리 학년, 2~3자리 반, 4~5자리 번호). */
export function studentIdLabel(sid) {
  const s = String(sid || '');
  if (!/^\d{5}$/.test(s)) return s;
  return `${+s[0]}학년 ${+s.slice(1, 3)}반 ${+s.slice(3)}번`;
}

// ── 밤하늘 눈 내리기 ────────────────────────────────────────────
// div 수십 개를 애니메이션하는 대신 캔버스 한 장에 그린다(태블릿에서 덜 버겁다).

export function mountSnow(canvas, count = 70) {
  if (!canvas) return () => {};
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ctx = canvas.getContext('2d');
  let w = 0, h = 0, raf = 0, flakes = [];

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = canvas.clientWidth; h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function seed() {
    flakes = Array.from({ length: count }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: 1 + Math.random() * 2.4,
      vy: 0.25 + Math.random() * 0.75,
      vx: -0.25 + Math.random() * 0.5,
      a: 0.25 + Math.random() * 0.5,
      t: Math.random() * Math.PI * 2,
    }));
  }

  function draw() {
    ctx.clearRect(0, 0, w, h);
    for (const f of flakes) {
      if (!reduce) {
        f.t += 0.012;
        f.y += f.vy;
        f.x += f.vx + Math.sin(f.t) * 0.4;
        if (f.y - f.r > h) { f.y = -f.r; f.x = Math.random() * w; }
        if (f.x < -10) f.x = w + 10;
        if (f.x > w + 10) f.x = -10;
      }
      ctx.globalAlpha = f.a;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    raf = reduce ? 0 : requestAnimationFrame(draw);
  }

  const onResize = () => { resize(); seed(); };
  resize(); seed(); draw();
  window.addEventListener('resize', onResize);

  return () => {
    window.removeEventListener('resize', onResize);
    if (raf) cancelAnimationFrame(raf);
  };
}
