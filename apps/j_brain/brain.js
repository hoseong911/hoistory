/* apps/j_brain/brain.js — 뇌구조도 공용 렌더러
   학생 편집 화면, 갤러리, 어드민 미리보기가 모두 이 파일 하나로 그린다.
   (세 곳이 따로 그리면 학생이 옮겨 둔 자리와 선생님이 보는 자리가 어긋난다.)

   좌표계: 아래 VB 크기 안쪽 좌표를 그대로 저장한다. 화면 크기가 달라져도 비율로 다시
   계산되므로 폰에서 놓은 자리가 칠판 화면에서도 그대로다. 그림이 정사각형이라 VB도
   정사각형이다. */

export const VB = { w: 320, h: 320 };

/* 면류관 쓴 옆모습 머리. 두 임금이 같은 그림을 쓰고 색과 이름표로만 갈라진다.
   화면에는 webp 를 쓴다 — 원본 png 가 1.1MB라 학생 폰에서 그림 한 장에 1MB를 쓰게 된다.
   같은 크기(1254px) 그대로 다시 구운 것이고 91KB다. **brain.png 가 원본이니 지우지 말 것**,
   그림을 고치면 png 를 갈아 끼운 뒤 webp 를 다시 굽고 아래 BLOCKED 도 다시 잰다. */
export const HEAD_IMG = new URL('brain.webp', import.meta.url).href;

/* ── 글자가 못 들어가는 곳 ──
   면류관과 옷깃만 막고 나머지는 머리 안이든 밖이든 다 쓴다. 표는 눈대중이 아니라 그림을
   캔버스로 읽어 만든 것이다: 흰 배경이 아닌 화소를 모은 뒤 "열기"(깎았다 부풀리기)로
   가는 선을 지워 덩어리만 남기고(그래서 머리 윤곽선과 목선은 사라지고 면류관·유·옷깃만
   남는다) 글자가 닿지 않게 한 번 더 부풀린 값이다. 64x64 칸이고 한 칸이 VB 5이다.
   **그림을 바꾸면 이 표를 다시 재야 한다.** 재는 방법은 CLAUDE.md에 적어 두었다. */
const GRID = 64;
const CELL = VB.w / GRID;
const BLOCKED = [
  '0000000000000001111111100000000000000000000000000000000000000000',
  '0000001111111111111111111111100000000000000000000000000000000000',
  '0000111111111111111111111111111110000000000000000000000000000000',
  '0000111111111111111111111111111111111100000000000000000000000000',
  '0000011111111111111111111111111111111111110000000000000000000000',
  '0000001111111111111111111111111111111111111111000000000000000000',
  '0000000111111111111111111111111111111111111111111110000000000000',
  '0000000111111111111111111111111111111111111111111111111000000000',
  '0000000111111111111111111111111111111111111111111111111111110000',
  '0000000111111111011111111111111111111111111111111111111111111110',
  '0000000111111111001111111111111111111111111111111111111111111110',
  '0000000111111111011111111111111111111111111111111111111111111110',
  '0000000111111111011111111111111111111111111111111111111111111100',
  '0000000111011111011111111111111111111111111111111111111111110000',
  '0000000111111111011111111111111111111111111111111111111111110000',
  '0000000111111111011111111111111111111111111111111100111111110000',
  '0000000111111111111111111111111111111111111111111000111111110000',
  '0000000111111111111111111111111111111111111111111000111111110000',
  '0000000111111111111111111111111111111111111111111000111111111000',
  '0000000111111111111111111111111111111111111111111000111111111000',
  '0000000111111111111111111111111111111111111111111000111111111000',
  '0000001111111111111111111111111111111111111111111000111111111000',
  '0000001111111111111111111111111111111111111111111000111111111000',
  '0000000111111111111111111111111111111111111111111000111111111000',
  '0000001111111111111111111111111111111111111111111000111111111000',
  '0000001111111111111111111111111111111111111111111100111111111000',
  '0000001111111110000000000000111111111111111111111100111111111000',
  '0000001111111110000000000000000001111111111111111100111111111000',
  '0000000000111100000000000000000000001111111111111100111111111000',
  '0000000000000000000000000000000000001111111111111100111111111000',
  '0000000000000000000000000000000000000111111111111000111111111000',
  '0000000000000000000000000000000000000011111111111000111111111000',
  '0000000000000000000000000000000000000001111111111000111111111000',
  '0000000000000000000000000000000000000000111111111000011111111000',
  '0000000000000000000000000000000000000000011111111000000111111000',
  '0000000000000000000000000000000000000000001111111000000001111000',
  '0000000000000000000000000000000000000000000011111000000000000000',
  '0000000000000000000000000000000000000000000000000000000000000000',
  '0000000000000000000000000000000000000000000000000000000000000000',
  '0000000000000000000000000000000000000000000000000000000000000000',
  '0000000000000000000000000000000000000000000000000000000000000000',
  '0000000000000000000000000000000000000000000000000000000000000000',
  '0000000000000000000000000000000000000000000000000000000000000000',
  '0000000000000000000000000000000000000000000000000000000000000000',
  '0000000000000000000000000000000000000000000000000000000000000000',
  '0000000000000000000000000000000000000000000000000000000000000000',
  '0000000000000000000000000000000000000000000000000000000000000000',
  '0000000000000000000000000000000000000000000000000000000000000000',
  '0000000000000000000000000000000000000000000000000000000000000000',
  '0000000000000000000000000000000000000000000000000000000000000000',
  '0000000000000000000000000000000000000000000111000000000000000000',
  '0000000000000000000000000000000000000000011111000000000000000000',
  '0000000000000000000000000000000000000001111111110000000000000000',
  '0000000000000000000000000000000000000011111111110000000000000000',
  '0000000000000000000000000000000000001111111111111000000000000000',
  '0000000000000000000000000000000000011111111111111100000000000000',
  '0000000000000000000000000000000000111111111111111100000000000000',
  '0000000000000000000000000000000011111111111111111110000000000000',
  '0000000000000000000000000000000011111111111111111111000000000000',
  '0000000000000000000000000000000111111111111111111111000000000000',
  '0000000000000000000000000000011111111111111111111111000000000000',
  '0000000000000000000000000000011111111111111111111110000000000000',
  '0000000000000000000000000000011111111111111111100000000000000000',
  '0000000000000000000000000000011111111110000000000000000000000000'
];

/* 그림 가장자리에서 이만큼은 비워 둔다(글자가 화면 밖으로 걸치지 않게) */
const EDGE = 6;

function cellBlocked(gx, gy) {
  if (gx < 0 || gy < 0 || gx >= GRID || gy >= GRID) return true;
  return BLOCKED[gy].charCodeAt(gx) === 49;   // '1'
}

/* 가운데가 (x,y)이고 크기가 w x h인 상자를 놓을 수 있는가 */
export function boxFree(x, y, w, h) {
  const x0 = x - w / 2, x1 = x + w / 2, y0 = y - h / 2, y1 = y + h / 2;
  if (x0 < EDGE || y0 < EDGE || x1 > VB.w - EDGE || y1 > VB.h - EDGE) return false;
  const gx0 = Math.floor(x0 / CELL), gx1 = Math.floor((x1 - 0.001) / CELL);
  const gy0 = Math.floor(y0 / CELL), gy1 = Math.floor((y1 - 0.001) / CELL);
  for (let gy = gy0; gy <= gy1; gy++)
    for (let gx = gx0; gx <= gx1; gx++)
      if (cellBlocked(gx, gy)) return false;
  return true;
}

/* 두 상자가 겹치는가. 구름은 가장자리가 둥글어 조금 닿는 정도는 오히려 자연스러우므로
   2만큼은 봐 준다. */
function hits(a, b) {
  return Math.abs(a.x - b.x) < (a.w + b.w) / 2 - 2 &&
         Math.abs(a.y - b.y) < (a.h + b.h) / 2 - 2;
}

/* 막힌 데(면류관·옷깃)도 아니고 이미 놓인 구름과도 겹치지 않는가 */
function fits(x, y, w, h, avoid) {
  if (!boxFree(x, y, w, h)) return false;
  const me = { x, y, w, h };
  return !avoid || !avoid.some(r => hits(me, r));
}

/* 놓을 수 없는 자리에 있는 상자를 가장 가까운 빈자리로 옮긴다(나선으로 넓혀 가며 찾는다).
   찾지 못하면 원래 자리를 그대로 돌려준다 — 못 찾았다고 화면 밖으로 던지지 않는다. */
export function findSpot(x, y, w, h, avoid) {
  if (fits(x, y, w, h, avoid)) return { x, y };
  for (let r = 4; r <= 150; r += 4) {
    for (let a = 0; a < 24; a++) {
      const t = (a / 24) * Math.PI * 2;
      const nx = x + Math.cos(t) * r, ny = y + Math.sin(t) * r;
      if (fits(nx, ny, w, h, avoid)) return { x: nx, y: ny };
    }
  }
  return { x, y };
}

/* 새 키워드를 놓을 자리 차례. 머릿속 한가운데에서 시작해 바깥으로 퍼진다.
   표에서 직접 찾아내므로 그림이 바뀌어도 (표만 다시 재면) 자리는 저절로 따라온다. */
const HEART = { x: 150, y: 212 };          // 머릿속 한가운데 — 여기서 가까운 자리부터 채운다
export const ANCHORS = (() => {
  const pw = 58, ph = 26;                  // 보통 크기 칩 하나
  const cands = [];
  for (let y = 12; y <= VB.h - 12; y += 6)
    for (let x = 12; x <= VB.w - 12; x += 6)
      if (boxFree(x, y, pw, ph)) cands.push([x, y, Math.hypot(x - HEART.x, y - HEART.y)]);
  cands.sort((a, b) => a[2] - b[2]);
  const out = [];
  for (const [x, y] of cands) {
    if (out.every(o => Math.hypot(o[0] - x, o[1] - y) >= 36)) out.push([x, y]);
    if (out.length >= 16) break;
  }
  return out;
})();

/* 아무것도 안 놓였을 때 안내를 띄울 자리 */
const EMPTY_AT = ANCHORS[0] || [HEART.x, HEART.y];

export const WEIGHTS = [
  { w: 1, label: '잠깐 스쳤다' },
  { w: 2, label: '가끔 떠올렸다' },
  { w: 3, label: '자주 생각했다' },
  { w: 4, label: '늘 마음에 두었다' },
  { w: 5, label: '머릿속을 가득 채웠다' }
];

const CHIP_EM = { 1: 0.82, 2: 1.0, 3: 1.22, 4: 1.5, 5: 1.85 };
/* 비중(1~5)에 따른 글자 크기. 학생 화면이 슬라이더를 움직일 때 칩 하나만 손보므로
   여기서 내보내 둔다 — 표를 양쪽에 적어 두면 한쪽만 고치는 일이 생긴다. */
export function chipEm(w) { return CHIP_EM[w] || CHIP_EM[2]; }

export const SIDES = [
  { key: 'yeongjo', name: '영조' },
  { key: 'jeongjo', name: '정조' }
];

export function sideName(key) {
  const s = SIDES.find(v => v.key === key);
  return s ? s.name : key;
}

/* 이미 놓인 칩과 겹치지 않는 빈자리를 고른다. 자리가 다 차면 아무 빈자리에나 놓는다. */
export function nextSpot(chips) {
  const used = chips || [];
  for (const [x, y] of ANCHORS) {
    if (!used.some(c => Math.hypot(c.x - x, c.y - y) < 34)) return { x, y };
  }
  const pick = ANCHORS[Math.floor(Math.random() * ANCHORS.length)] || [HEART.x, HEART.y];
  return { x: pick[0], y: pick[1] };
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ── 구름 ──
   글자를 둘러싸는 뭉게구름. 타원 위에 점을 고르게 찍고 이웃한 두 점을 바깥으로 불룩한
   호로 잇는다(가리비 모양). 네모 상자에 모서리를 굴리고 혹을 붙이는 식으로는 테두리를
   실선/점선으로 갈라 그릴 수 없어서, 길 하나로 떨어지는 이 방법을 쓴다. */
function cloudPath(w, h) {
  const a = w / 2, b = h / 2;
  const n = Math.max(8, Math.min(18, Math.round((w + h) / Math.max(9, h * 0.44))));
  const N = n % 2 ? n + 1 : n;
  const pt = i => {
    const t = (i / N) * Math.PI * 2;
    return [a + a * Math.cos(t), b + b * Math.sin(t)];
  };
  let d = '';
  for (let i = 0; i < N; i++) {
    const p = pt(i), q = pt(i + 1);
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const r = (len / 2) * 1.2;
    if (!i) d += `M${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
    d += `A${r.toFixed(1)} ${r.toFixed(1)} 0 0 1 ${q[0].toFixed(1)} ${q[1].toFixed(1)}`;
  }
  return d + 'Z';
}

/* 구름이 글자를 다 덮으려면 타원이 글자 네모를 품어야 한다. 네모의 모서리가 타원 안에
   들어오도록 가로 1.44배, 세로 1.56배로 잡은 값이다((0.694)^2+(0.641)^2 < 1). */
const CLOUD_W = 1.44, CLOUD_H = 1.56;

/* ── 머리 그림 ── */
function headImage() {
  return `<img class="bm-img" src="${HEAD_IMG}" alt="" draggable="false">`;
}

/* 한 번만 넣으면 되는 공용 스타일. 학생 화면과 어드민이 같은 모양을 쓰게 하려고
   CSS도 이 파일이 들고 있다(양쪽 HTML에 복사해 두면 한쪽만 고치는 일이 생긴다). */
function ensureStyle() {
  if (document.getElementById('bm-style')) return;
  const el = document.createElement('style');
  el.id = 'bm-style';
  el.textContent = `
.bm-stage{position:relative;width:100%;max-width:560px;margin:0 auto;aspect-ratio:${VB.w}/${VB.h};touch-action:none}
.bm-img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;user-select:none;-webkit-user-drag:none;pointer-events:none}
.bm-layer{position:absolute;inset:0}
.bm-chip{position:absolute;transform:translate(-50%,-50%);max-width:30%;
  font-weight:800;line-height:1.2;text-align:center;word-break:keep-all;color:var(--bm-ink);
  cursor:grab;user-select:none;-webkit-user-select:none}
.bm-chip .bm-cloud{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);
  pointer-events:none;overflow:visible}
.bm-chip .bm-cloud path{fill:var(--bm-cloud-fill);stroke:var(--bm-cloud-line);stroke-width:1.5;vector-effect:non-scaling-stroke}
.bm-chip .bm-txt{position:relative}
.bm-chip.bm-live:active{cursor:grabbing}
/* 구름 색은 임금마다 다르다 — 갤러리에서 두 머리가 나란히 서므로 색이 곧 이름표다.
   연한 채움 + 진한 테두리 한 쌍으로 두고 글자는 먹색 그대로 둔다(색 글자는 작을 때 읽기 나쁘다). */
.bm-stage.bm-side-yeongjo{--bm-cloud-fill:#E3EFEC;--bm-cloud-line:#2F5D62;--bm-cloud-sel:#BCDCD4}
.bm-stage.bm-side-jeongjo{--bm-cloud-fill:#F8E7E9;--bm-cloud-line:#8B2F3F;--bm-cloud-sel:#EFC7CD}
/* 까닭을 아직 안 쓴 것은 점선, 쓴 것은 실선 */
.bm-chip.bm-open .bm-cloud path{stroke-dasharray:4 3;opacity:.9}
.bm-chip.sel .bm-cloud path{fill:var(--bm-cloud-sel);stroke-width:2.5}
.bm-chip.bm-static{cursor:default}
/* 어드민 정오 표시 — 이때만 구름 테두리가 글자 색을 따라간다 */
.bm-chip.bm-ok{color:var(--bm-ok)}
.bm-chip.bm-no{color:var(--bm-no)}
.bm-chip.bm-trap{color:var(--bm-no)}
.bm-chip.bm-ok .bm-cloud path,.bm-chip.bm-no .bm-cloud path,.bm-chip.bm-trap .bm-cloud path{stroke:currentColor}
.bm-chip.bm-trap .bm-txt{text-decoration:line-through;text-decoration-thickness:1px}
.bm-empty{position:absolute;left:${(EMPTY_AT[0] / VB.w * 100).toFixed(1)}%;top:${(EMPTY_AT[1] / VB.h * 100).toFixed(1)}%;
  transform:translate(-50%,-50%);width:38%;text-align:center;
  font-size:12px;line-height:1.6;color:var(--hi-text-muted);word-break:keep-all}
/* 두 임금을 가를 이름표. 그림이 한 장이라 갤러리에서 이것으로 구별한다. */
.bm-name{position:absolute;left:50%;bottom:1.5%;transform:translateX(-50%);padding:3px 12px;border-radius:999px;
  font-size:12px;font-weight:800;color:#fff;white-space:nowrap}
`;
  document.head.appendChild(el);
}

/* 칩 글자 크기를 무대 폭에 맞춰 키운다. em으로 적어 두고 무대의 font-size만 바꾸면
   비중(1~5)에 따른 크기 차이가 화면 크기와 상관없이 같은 비율로 유지된다.
   그래서 폰에서 그림이 작아져도 들어가는 글자 수는 데스크톱과 똑같다. */
function fitFont(stage) {
  const w = stage.clientWidth || 320;
  stage.style.fontSize = (w / VB.w * 11) + 'px';
}

/**
 * @param {HTMLElement} el      그릴 자리
 * @param {object} opts
 *   side      'yeongjo' | 'jeongjo'
 *   chips     [{k,label,w,x,y,note}]
 *   selected  선택된 칩 id
 *   live      true면 끌어 옮기기와 누르기를 받는다
 *   emptyText 칩이 하나도 없을 때 가운데에 띄울 안내
 *   nameTag   true면 그림 아래에 임금 이름표를 붙인다(갤러리처럼 둘이 나란히 설 때)
 *   review    {ok:Set, trap:Set} — 어드민에서 정오 표시를 켤 때만
 *   onPick(k) 칩을 눌렀을 때
 *   onMove(k,x,y) 칩을 옮겨 놓았을 때
 */
export function renderBrain(el, opts) {
  ensureStyle();
  const o = opts || {};
  const side = o.side || 'yeongjo';
  const chips = Array.isArray(o.chips) ? o.chips : [];
  const stage = document.createElement('div');
  stage.className = 'bm-stage bm-side-' + side;
  stage.innerHTML = headImage() + '<div class="bm-layer"></div>';
  const layer = stage.querySelector('.bm-layer');

  if (o.nameTag) {
    const tag = document.createElement('div');
    tag.className = 'bm-name';
    tag.style.background = `var(--bm-${side})`;
    tag.textContent = sideName(side);
    layer.appendChild(tag);
  }

  if (!chips.length && o.emptyText) {
    const em = document.createElement('div');
    em.className = 'bm-empty';
    em.textContent = o.emptyText;
    layer.appendChild(em);
  }

  chips.forEach(c => {
    const d = document.createElement('div');
    let cls = 'bm-chip' + (o.live ? ' bm-live' : ' bm-static');
    if (o.selected === c.k) cls += ' sel';
    /* 까닭을 아직 안 쓴 칩은 테두리를 점선으로 둔다(편집 화면에서만 — 갤러리와
       어드민에서는 다 쓴 뒤라 구별할 일이 없다). */
    if (o.live && !c.note) cls += ' bm-open';
    if (o.review) {
      if (o.review.trap && o.review.trap.has(c.k)) cls += ' bm-trap';
      else if (o.review.ok && o.review.ok.has(c.k)) cls += ' bm-ok';
      else cls += ' bm-no';
    }
    d.className = cls;
    d.style.left = (c.x / VB.w * 100) + '%';
    d.style.top = (c.y / VB.h * 100) + '%';
    d.style.fontSize = chipEm(c.w) + 'em';
    d.innerHTML = '<span class="bm-txt">' + esc(c.label) + '</span>';
    d.dataset.k = c.k;
    if (o.live) bindDrag(d, stage, c, o);
    layer.appendChild(d);
  });

  el.innerHTML = '';
  el.appendChild(stage);
  fitFont(stage);
  settle(stage, chips, o);
  if (window.ResizeObserver) new ResizeObserver(() => { fitFont(stage); settle(stage, chips, o); }).observe(stage);
  return stage;
}

/* 그려 놓고 나서 글자 상자를 실제로 재어 구름을 씌우고, 막힌 데(면류관·옷깃)에 걸쳤으면
   가장 가까운 빈자리로 옮긴다. 낱말 길이와 비중에 따라 구름 크기가 제각각이라 놓을 때
   좌표만 보고는 걸치는지 알 수 없다. 갤러리와 어드민에서도 돌리므로 예전에 저장된
   좌표도 제자리에 들어와 보인다(저장값은 건드리지 않고 화면만 고친다 — 학생이 끌어
   옮기면 그때 저장된다). */
function settle(stage, chips, o) {
  const sw = stage.clientWidth, sh = stage.clientHeight;
  if (!sw || !sh) return;
  /* 먼저 자리 잡은 구름을 쌓아 두고 뒤엣것이 그것을 피해 앉는다. 막힌 데만 피하게 두면
     구름끼리 포개져 글자가 서로에 묻힌다. */
  const placed = [];
  chips.forEach(c => {
    const node = stage.querySelector('.bm-chip[data-k="' + cssEscape(c.k) + '"]');
    if (!node) return;
    const txt = node.querySelector('.bm-txt');
    if (!txt) return;

    const tw = txt.offsetWidth, th = txt.offsetHeight;
    const cw = Math.max(18, tw * CLOUD_W), chh = Math.max(18, th * CLOUD_H);
    let svg = node.querySelector('.bm-cloud');
    if (!svg) {
      svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'bm-cloud');
      svg.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'path'));
      node.insertBefore(svg, node.firstChild);
    }
    svg.setAttribute('width', cw);
    svg.setAttribute('height', chh);
    svg.setAttribute('viewBox', `0 0 ${cw.toFixed(1)} ${chh.toFixed(1)}`);
    svg.firstChild.setAttribute('d', cloudPath(cw, chh));

    /* 부딪힘을 따질 때 쓰는 크기는 글자가 아니라 구름이다. */
    const w = cw / sw * VB.w, h = chh / sh * VB.h;
    const p = findSpot(c.x, c.y, w, h, placed);
    if (Math.abs(p.x - c.x) > 0.5 || Math.abs(p.y - c.y) > 0.5) {
      if (o.live) { c.x = p.x; c.y = p.y; }
      node.style.left = (p.x / VB.w * 100) + '%';
      node.style.top = (p.y / VB.h * 100) + '%';
    }
    placed.push({ x: p.x, y: p.y, w, h });
    node.dataset.bw = w.toFixed(2);
    node.dataset.bh = h.toFixed(2);
  });
}

function cssEscape(v) {
  return window.CSS && CSS.escape ? CSS.escape(String(v)) : String(v).replace(/["\\]/g, '\\$&');
}

function bindDrag(node, stage, chip, o) {
  let moved = false, startX = 0, startY = 0, rect = null;

  node.addEventListener('pointerdown', e => {
    e.preventDefault();
    moved = false;
    startX = e.clientX; startY = e.clientY;
    rect = stage.getBoundingClientRect();
    node.setPointerCapture(e.pointerId);
  });

  node.addEventListener('pointermove', e => {
    if (!rect || !node.hasPointerCapture(e.pointerId)) return;
    /* 손가락이 조금 흔들린 것까지 옮기기로 보면 누르기가 먹지 않는다. */
    if (!moved && Math.hypot(e.clientX - startX, e.clientY - startY) < 5) return;
    moved = true;
    const x = (e.clientX - rect.left) / rect.width * VB.w;
    const y = (e.clientY - rect.top) / rect.height * VB.h;
    /* 구름 크기는 그릴 때 재어 둔 값을 쓴다 — 끄는 동안 매번 재면 레이아웃을 다시
       계산하느라 손가락을 따라오지 못한다. */
    const w = +node.dataset.bw || 0, h = +node.dataset.bh || 0;
    let nx = x, ny = y;
    if (!boxFree(nx, ny, w, h)) {
      /* 막힌 데에 닿으면 가장자리를 따라 미끄러지게 한다(한 축씩 따로 시도).
         둘 다 막혔으면 그 자리에 둔다 — 면류관 위로 끌려 들어가지 않는다. */
      if (boxFree(nx, chip.y, w, h)) ny = chip.y;
      else if (boxFree(chip.x, ny, w, h)) nx = chip.x;
      else return;
    }
    chip.x = nx; chip.y = ny;
    node.style.left = (nx / VB.w * 100) + '%';
    node.style.top = (ny / VB.h * 100) + '%';
  });

  node.addEventListener('pointerup', e => {
    if (node.hasPointerCapture(e.pointerId)) node.releasePointerCapture(e.pointerId);
    rect = null;
    if (moved) { if (o.onMove) o.onMove(chip.k, chip.x, chip.y); }
    else if (o.onPick) o.onPick(chip.k);
  });
}

/* ── 기본 키워드 풀 ──
   선생님이 어드민에서 고치면 settings/j_brain_config 가 이 값을 덮어쓴다. 두 화면이
   같은 목록을 봐야 하므로 여기 한 곳에만 적어 둔다.
   side: yeongjo | jeongjo | both(둘 다 맞음) | trap(다른 임금의 일 — 놓으면 안 된다) */
export const DEFAULT_KEYWORDS = [
  { id: 'y1', label: '균역법', side: 'yeongjo' },
  { id: 'y2', label: '탕평비 건립', side: 'yeongjo' },
  { id: 'y3', label: '속대전 편찬', side: 'yeongjo' },
  { id: 'y4', label: '청계천 준설', side: 'yeongjo' },
  { id: 'y5', label: '신문고 부활', side: 'yeongjo' },
  { id: 'y6', label: '사도세자', side: 'yeongjo' },
  { id: 'y7', label: '이인좌의 난', side: 'yeongjo' },
  { id: 'y8', label: '가혹한 형벌 폐지', side: 'yeongjo' },
  { id: 'j1', label: '규장각 설치', side: 'jeongjo' },
  { id: 'j2', label: '초계문신제', side: 'jeongjo' },
  { id: 'j3', label: '장용영 창설', side: 'jeongjo' },
  { id: 'j4', label: '수원 화성 건설', side: 'jeongjo' },
  { id: 'j5', label: '신해통공', side: 'jeongjo' },
  { id: 'j6', label: '대전통편 편찬', side: 'jeongjo' },
  { id: 'j7', label: '서얼 등용', side: 'jeongjo' },
  { id: 'j8', label: '화성 행차', side: 'jeongjo' },
  { id: 'b1', label: '탕평책', side: 'both' },
  { id: 'b2', label: '왕권 강화', side: 'both' },
  { id: 'b3', label: '붕당의 대립', side: 'both' },
  /* 함정. 헷갈릴 만한 것으로 고른다 — 균역법과 대동법, 속대전과 경국대전처럼
     이름이 비슷하거나 같은 갈래의 제도라야 따져 보게 된다. */
  { id: 't1', label: '대동법 확대', side: 'trap' },
  { id: 't2', label: '경국대전 완성', side: 'trap' },
  { id: 't3', label: '훈련도감 설치', side: 'trap' },
  { id: 't4', label: '훈민정음 창제', side: 'trap' },
  { id: 't5', label: '삼정이정청 설치', side: 'trap' }
];

/* 활동을 열었을 때 맨 위에 뜨는 안내. 선생님이 어드민에서 고친다(빈 줄이 문단을 나눈다).
   맨 아래 "두 임금의 머릿속을 채워 보세요" 한 줄은 화면에 붙박이라 여기 들어 있지 않다. */
export const DEFAULT_INTRO =
`영조와 정조는 각각 오십 년 가까이 조선을 다스린 임금입니다. 두 사람은 붕당끼리 서로를 죽이던 시대를 물려받아, 흔들리는 왕권을 다시 세우고 백성의 살림을 펴는 일에 평생을 걸었습니다.

이어진 시대를 살았지만 두 임금이 밤낮으로 골몰한 일은 서로 달랐습니다. 할아버지가 아들을 뒤주에 가둔 일도, 그 아들의 아들이 화성을 쌓은 일도 모두 이 머릿속에서 나온 것입니다.

오늘 배운 일들 가운데 어느 임금의 일인지 가려내고, 그 임금이 그 일에 얼마나 마음을 쏟았을지 크기로 나타내 보세요.`;

export const DEFAULT_CONFIG = {
  keywords: DEFAULT_KEYWORDS,
  intro: DEFAULT_INTRO,
  maxChips: 8,   // 한 인물에 놓을 수 있는 최대 개수 — 면류관과 옷깃 빼고 다 쓰므로 넉넉하다
  minChips: 4    // 제출하려면 한 인물에 적어도 이만큼
};

/* 까닭은 글자 수를 제한하지 않는다(학생에게 세는 칸도 보여 주지 않는다).
   다만 문서 하나가 끝없이 커지지는 않게 저장할 때만 조용히 끊는다. */
export const NOTE_HARD_CAP = 1000;

/* 저장된 설정과 기본값을 섞는다(선생님이 일부만 고쳐 두었을 때를 위해). */
export function mergeConfig(data) {
  const d = data || {};
  return {
    keywords: Array.isArray(d.keywords) && d.keywords.length ? d.keywords : DEFAULT_KEYWORDS,
    intro: typeof d.intro === 'string' && d.intro.trim() ? d.intro : DEFAULT_INTRO,
    maxChips: Number(d.maxChips) > 0 ? Number(d.maxChips) : DEFAULT_CONFIG.maxChips,
    minChips: Number(d.minChips) > 0 ? Number(d.minChips) : DEFAULT_CONFIG.minChips
  };
}

/* 한 인물 화면에서 이 키워드가 맞는 선택인지. 어드민 채점 보조와 통계에 쓴다. */
export function judge(kw, side) {
  if (!kw) return 'no';
  if (kw.side === 'trap') return 'trap';
  if (kw.side === 'both' || kw.side === side) return 'ok';
  return 'no';
}
