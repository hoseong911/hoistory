/* ════════════════════════════════════════════════════════════════
   감사편지 트리 — 오너먼트 그림 10종

   유니코드 이모지 금지 원칙에 따라 전부 SVG다. 다만 `shared/icons.js`로는
   만들 수 없다 — 그쪽 `icon()`은 바깥 <svg>에 `fill="none" stroke="currentColor"`를
   박아 내보내는 **한 색 선 아이콘** 전용이고, 오너먼트는 색을 채운 그림이다.
   그래서 콘텐츠 그림으로 보고 이 파일에 따로 모았다(j_brain의 머리 그림과 같은 취급).
   화면의 UI 아이콘은 언제나 `shared/icons.js`를 쓴다.

   · 좌표계는 모두 viewBox "0 0 64 80" — 위쪽 y 2~16이 고리와 끈 자리다.
   · id나 <defs>를 쓰지 않는다. 한 화면에 수백 개가 같이 뜨므로 id가 겹치면
     그라데이션이 서로 엉킨다(그래서 그라데이션 없이 납작한 색 + 하이라이트).
   ════════════════════════════════════════════════════════════════ */

// ── 공통 조각 ────────────────────────────────────────────────────

// 가지에 걸리는 고리와 끈
const hook = (color = '#e6d5a8') =>
  `<path d="M32 16V9.5" stroke="${color}" stroke-width="2" stroke-linecap="round" fill="none"/>` +
  `<ellipse cx="32" cy="6.4" rx="4.2" ry="4" fill="none" stroke="${color}" stroke-width="2"/>`;

// 방울과 종 머리에 끼우는 금색 마개
const cap = (color = '#d9b35c') =>
  `<rect x="26" y="14" width="12" height="8" rx="2.5" fill="${color}"/>` +
  `<rect x="28.5" y="16" width="7" height="2.4" rx="1.2" fill="#f3e2b4"/>`;

// 꼭지점 5개 별. 별 오너먼트와 금빛 방울의 무늬가 같이 쓴다.
function starPath(cx, cy, ro, ri) {
  const pts = [];
  for (let i = 0; i < 5; i++) {
    const ao = (-90 + i * 72) * Math.PI / 180;
    const ai = (-54 + i * 72) * Math.PI / 180;
    pts.push(`${(cx + ro * Math.cos(ao)).toFixed(2)} ${(cy + ro * Math.sin(ao)).toFixed(2)}`);
    pts.push(`${(cx + ri * Math.cos(ai)).toFixed(2)} ${(cy + ri * Math.sin(ai)).toFixed(2)}`);
  }
  return `M${pts.join('L')}Z`;
}

// 둥근 방울 하나. deco로 무늬를 얹는다.
const ball = (base, deco = '') =>
  hook() + cap() +
  `<circle cx="32" cy="50" r="23" fill="${base}"/>` +
  `<ellipse cx="23.5" cy="40" rx="6.5" ry="4.2" fill="#fff" opacity=".38" transform="rotate(-28 23.5 40)"/>` +
  deco;

// 눈송이 가지 하나를 60도씩 여섯 번 돌려 붙인다.
function snowArms() {
  const arm =
    `<path d="M32 48V19"/>` +
    `<path d="M25.5 20.5 32 27l6.5-6.5"/>` +
    `<path d="M26 30.5 32 37l6-6.5"/>`;
  let out = '';
  for (let i = 0; i < 6; i++) {
    out += `<g transform="rotate(${i * 60} 32 48)">${arm}</g>`;
  }
  return out;
}

// ── 오너먼트 10종 ───────────────────────────────────────────────

const DEFS = [
  {
    key: 'ball_red', name: '빨간 방울', glow: '#e4635a',
    body: ball('#d94f45',
      `<path d="M11.5 43q5.1 5.5 10.2 0t10.3 0 10.2 0 10.3 0" fill="none" stroke="#f7e6b4" stroke-width="2.8" stroke-linecap="round" opacity=".9"/>`)
  },
  {
    key: 'ball_green', name: '초록 방울', glow: '#49b185',
    body: ball('#2f7d5a',
      `<g fill="#f7e6b4" opacity=".92"><circle cx="24" cy="57" r="2.6"/><circle cx="34.5" cy="62" r="2.2"/><circle cx="43" cy="54" r="2.6"/><circle cx="38.5" cy="44" r="2.2"/><circle cx="26.5" cy="48.5" r="2"/></g>`)
  },
  {
    key: 'ball_gold', name: '금빛 방울', glow: '#f0c457',
    body: ball('#e8b341',
      `<path d="${starPath(32, 52, 10, 4.3)}" fill="#fdf6e8" opacity=".95"/>`)
  },
  {
    key: 'star', name: '별', glow: '#f7d479',
    body: hook('#e0b94f') +
      `<path d="${starPath(32, 48, 25, 10.5)}" fill="#f0c457"/>` +
      `<path d="${starPath(32, 48, 13, 5.5)}" fill="#fdf6e8" opacity=".55"/>`
  },
  {
    key: 'bell', name: '종', glow: '#f0c457',
    body: hook('#d9a832') + cap('#d9a832') +
      `<path d="M32 21c-8.5 0-11.8 6-12.4 14.2C19 44 16.2 50 12.8 53.4h38.4C47.8 50 45 44 44.4 35.2 43.8 27 40.5 21 32 21Z" fill="#f0c457"/>` +
      `<rect x="11" y="52" width="42" height="8" rx="4" fill="#deaa38"/>` +
      `<circle cx="32" cy="66" r="5.5" fill="#deaa38"/>` +
      `<path d="M21.5 26q10.5 5 21 0" fill="none" stroke="#d94f45" stroke-width="3.4" stroke-linecap="round"/>`
  },
  {
    key: 'sock', name: '양말', glow: '#e4635a',
    body: hook() +
      `<path d="M21.5 28h20v18c0 2.6 1.3 4 3.8 5.1l7.2 3.3c4.6 2.1 5.4 7.9 1.3 10.8-3.3 2.3-7.4 1.6-10.6-.5l-16-10.4c-3.6-2.3-5.7-5.7-5.7-10.1V28Z" fill="#d94f45"/>` +
      `<rect x="18" y="19.5" width="27" height="10" rx="3.5" fill="#fdf6e8"/>` +
      `<path d="M23 38.5h17" stroke="#fdf6e8" stroke-width="3.6" stroke-linecap="round" opacity=".8"/>`
  },
  {
    key: 'candy', name: '지팡이 사탕', glow: '#ef7a70',
    // 지팡이는 스스로 가지에 걸리므로 고리를 달지 않는다.
    body: `<path d="M22 73V39a11 11 0 0 1 22 0" fill="none" stroke="#fdf6e8" stroke-width="12" stroke-linecap="round"/>` +
      `<path d="M22 73V39a11 11 0 0 1 22 0" fill="none" stroke="#d94f45" stroke-width="12" stroke-dasharray="7 7.5"/>`
  },
  {
    key: 'gift', name: '선물', glow: '#49b185',
    body: hook() +
      `<path d="M30 28C24 28 18 26 15.5 23c-2-2.4.3-5.3 3.4-4.3C22.8 19.9 27 23.4 30 28Z" fill="#e4635a"/>` +
      `<path d="M34 28C40 28 46 26 48.5 23c2-2.4-.3-5.3-3.4-4.3C41.2 19.9 37 23.4 34 28Z" fill="#e4635a"/>` +
      `<rect x="11" y="28" width="42" height="11" rx="3" fill="#3b9d74"/>` +
      `<rect x="15" y="38" width="34" height="31" rx="3" fill="#2f7d5a"/>` +
      `<rect x="28" y="28" width="8" height="41" fill="#f0c457"/>` +
      `<circle cx="32" cy="26.5" r="3.4" fill="#d94f45"/>`
  },
  {
    key: 'snow', name: '눈송이', glow: '#bfe4f5',
    body: hook('#cfe8f6') +
      `<g stroke="#cfe8f6" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" fill="none">${snowArms()}</g>` +
      `<circle cx="32" cy="48" r="3.6" fill="#eaf7ff"/>`
  },
  {
    key: 'heart', name: '하트', glow: '#f0889f',
    body: hook('#f0c457') +
      `<path d="M32 74S9 58.5 9 40.5C9 32 15.6 25.6 23.4 25.6c4 0 7 1.7 8.6 4.2 1.6-2.5 4.6-4.2 8.6-4.2C48.4 25.6 55 32 55 40.5 55 58.5 32 74 32 74Z" fill="#e8738f"/>` +
      `<ellipse cx="22" cy="38" rx="5" ry="3.4" fill="#fff" opacity=".4" transform="rotate(-30 22 38)"/>`
  },
];

// ── 바깥에 내보내는 것 ──────────────────────────────────────────

export const ORNAMENTS = DEFS.map(d => ({ key: d.key, name: d.name, glow: d.glow }));
export const ORNAMENT_KEYS = DEFS.map(d => d.key);

const BY_KEY = {};
DEFS.forEach(d => { BY_KEY[d.key] = d; });

export function isOrnamentKey(key) {
  return Object.prototype.hasOwnProperty.call(BY_KEY, key);
}

/** 오너먼트 한 개를 <svg> 문자열로 만든다. 없는 키는 빨간 방울로 대체한다. */
export function ornamentSVG(key, size = 64, cls = '') {
  const d = BY_KEY[key] || DEFS[0];
  const h = Math.round(size * 80 / 64);
  return `<svg class="xm-orn${cls ? ' ' + cls : ''}" width="${size}" height="${h}" ` +
    `viewBox="0 0 64 80" aria-hidden="true">${d.body}</svg>`;
}

export function ornamentName(key) {
  return (BY_KEY[key] || DEFS[0]).name;
}

/** 반짝임과 테두리 빛에 쓰는 대표 색 */
export function ornamentGlow(key) {
  return (BY_KEY[key] || DEFS[0]).glow;
}
