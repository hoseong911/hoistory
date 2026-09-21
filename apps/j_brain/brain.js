/* apps/j_brain/brain.js — 뇌구조도 공용 렌더러
   학생 편집 화면, 갤러리, 어드민 미리보기가 모두 이 파일 하나로 그린다.
   (세 곳이 따로 그리면 학생이 옮겨 둔 자리와 선생님이 보는 자리가 어긋난다.)

   좌표계: 아래 VB 크기 안쪽 좌표를 그대로 저장한다. 화면 크기가 달라져도 비율로 다시
   계산되므로 폰에서 놓은 자리가 칠판 화면에서도 그대로다. 그림(brain.png)이 정사각형이라
   VB도 정사각형이다 — 그림을 바꾸면 VB와 FIELD를 함께 다시 재야 한다. */

export const VB = { w: 320, h: 320 };

/* 면류관 쓴 옆모습 머리. 두 임금이 같은 그림을 쓰고 색과 이름표로만 갈라진다.
   화면에는 webp 를 쓴다 — 원본 png 가 1.1MB라 학생 폰에서 그림 한 장에 1MB를 쓰게 된다.
   같은 크기(1254px) 그대로 다시 구운 것이고 91KB다. **brain.png 가 원본이니 지우지 말 것**,
   그림을 고치면 png 를 갈아 끼운 뒤 webp 를 다시 굽고 FIELD_ROWS 도 다시 잰다. */
export const HEAD_IMG = new URL('brain.webp', import.meta.url).href;

/* 글자를 놓을 수 있는 곳 — 그림의 흰 머릿속 윤곽이다. 타원 하나로 잡으려 했더니
   면류관이 왼쪽 위를 비스듬히 덮고 있어, 타원에 맞추면 아래쪽 넓은 데가 통째로 남고
   타원을 키우면 윗줄 글자가 관 밑을 파고든다. 그래서 줄마다 좌우 끝을 재서 표로 둔다.
   brain.png(1254px)를 캔버스로 읽어 줄마다 흰 구간을 잰 값을 VB 320 기준으로 환산한
   것이다. **그림을 바꾸면 이 표를 다시 재야 한다.** */
const FIELD_ROWS = [
  [135.0,  79.4, 179.4],
  [146.8,  77.3, 188.1],
  [158.5,  78.1, 198.3],
  [170.2,  79.4, 212.8],
  [182.0,  70.4, 233.0],
  [193.7,  62.0, 232.5],
  [205.4,  73.0, 228.9],
  [217.2,  70.9, 221.0],
  [228.9,  72.0, 210.0],
  [240.7,  78.9, 206.5],
  [252.4,  78.3, 209.5]
];
/* 글자가 윤곽선에 닿지 않게 사방으로 남겨 두는 여백 */
const MARGIN = 7;

export const FIELD_TOP = FIELD_ROWS[0][0] + MARGIN;
export const FIELD_BOTTOM = FIELD_ROWS[FIELD_ROWS.length - 1][0] - MARGIN;

/* 그 높이에서 쓸 수 있는 좌우 끝. 표의 두 줄 사이는 곧게 이어 본다. */
function rowAt(y) {
  const R = FIELD_ROWS;
  if (y <= R[0][0]) return { lo: R[0][1] + MARGIN, hi: R[0][2] - MARGIN };
  const last = R[R.length - 1];
  if (y >= last[0]) return { lo: last[1] + MARGIN, hi: last[2] - MARGIN };
  for (let i = 1; i < R.length; i++) {
    if (y <= R[i][0]) {
      const [y0, l0, h0] = R[i - 1], [y1, l1, h1] = R[i];
      const t = (y - y0) / (y1 - y0);
      return { lo: l0 + (l1 - l0) * t + MARGIN, hi: h0 + (h1 - h0) * t - MARGIN };
    }
  }
  return { lo: last[1] + MARGIN, hi: last[2] - MARGIN };
}

/* 높이 h짜리 상자가 y에 놓일 때 쓸 수 있는 좌우 끝 — 상자가 걸치는 모든 줄에서 가장
   좁은 구간을 쓴다. 가운데 한 점만 보고 놓으면 큰 글자의 위아래 모서리가 밖으로 나간다. */
function bandFor(y, h) {
  let lo = -Infinity, hi = Infinity;
  const top = y - h / 2, bot = y + h / 2;
  for (let s = 0; s <= 4; s++) {
    const r = rowAt(top + (bot - top) * (s / 4));
    lo = Math.max(lo, r.lo);
    hi = Math.min(hi, r.hi);
  }
  return { lo, hi };
}

/* 상자(가로 w, 세로 h)를 머릿속에 앉힌다. 밖으로 나간 만큼만 끌어당기므로 끌다가
   손가락이 조금 벗어나도 칩이 튕겨 나가지 않는다. */
export function clampBox(x, y, w, h) {
  const yy = Math.min(Math.max(y, FIELD_TOP + h / 2), FIELD_BOTTOM - h / 2);
  const b = bandFor(yy, h);
  const room = b.hi - b.lo;
  const xx = room <= w
    ? (b.lo + b.hi) / 2                                   // 그 줄이 글자보다 좁으면 가운데로
    : Math.min(Math.max(x, b.lo + w / 2), b.hi - w / 2);
  return { x: xx, y: yy };
}

/* 새 키워드를 놓을 자리 차례. 머릿속이 가로로 넓어 보여도 낱말이 길어 두 칸씩은 못 넣는다.
   한 줄에 하나씩 위에서 아래로 쌓고, 학생이 끌어 옮겨 다시 꾸민다. 가로 자리는 그 높이의
   한가운데로 잡는다(머리가 아래로 갈수록 오른쪽으로 벌어지기 때문). */
const ANCHOR_YS = [152, 182, 212, 238, 167, 197, 225, 160, 190, 220];
export const ANCHORS = ANCHOR_YS.map(y => {
  const r = rowAt(y);
  return [(r.lo + r.hi) / 2, y];
});

/* 아무것도 안 놓였을 때 안내를 띄울 자리 = 머릿속 한가운데 */
const EMPTY_AT = (() => {
  const y = (FIELD_TOP + FIELD_BOTTOM) / 2;
  const r = rowAt(y);
  return { x: (r.lo + r.hi) / 2, y };
})();

export const WEIGHTS = [
  { w: 1, label: '잠깐 스쳤다' },
  { w: 2, label: '가끔 떠올렸다' },
  { w: 3, label: '자주 생각했다' },
  { w: 4, label: '늘 마음에 두었다' },
  { w: 5, label: '머릿속을 가득 채웠다' }
];

const CHIP_EM = { 1: 0.92, 2: 1.12, 3: 1.36, 4: 1.6, 5: 1.9 };
/* 비중(1~5)에 따른 글자 크기. 학생 화면이 슬라이더를 움직일 때 칩 하나만 손보므로
   여기서 내보내 둔다 — 표를 양쪽에 적어 두면 한쪽만 고치는 일이 생긴다. */
export function chipEm(w) { return CHIP_EM[w] || CHIP_EM[2]; }

export const SIDES = [
  { key: 'yeongjo', name: '영조', reign: '1724 - 1776' },
  { key: 'jeongjo', name: '정조', reign: '1776 - 1800' }
];

export function sideName(key) {
  const s = SIDES.find(v => v.key === key);
  return s ? s.name : key;
}

/* 이미 놓인 칩과 겹치지 않는 빈자리를 고른다. 자리가 다 차면 가운데 언저리에 흩뿌린다. */
export function nextSpot(chips) {
  const used = chips || [];
  for (const [x, y] of ANCHORS) {
    const near = used.some(c => Math.abs(c.y - y) < 18);
    if (!near) return { x, y };
  }
  const y = FIELD_TOP + Math.random() * (FIELD_BOTTOM - FIELD_TOP);
  const r = rowAt(y);
  return { x: (r.lo + r.hi) / 2, y };
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ── 머리 그림 ──
   손으로 그린 SVG 실루엣을 쓰다가 선생님이 올린 그림 파일로 바꿨다. 그림은 한 장뿐이고
   두 임금은 색과 이름표로만 갈라진다 — 색을 입히려 filter 를 걸면 관의 금색과 붉은 깃까지
   같이 돌아가 딴 그림이 된다. */
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
.bm-stage{position:relative;width:100%;max-width:480px;margin:0 auto;aspect-ratio:${VB.w}/${VB.h};touch-action:none}
.bm-img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;user-select:none;-webkit-user-drag:none;pointer-events:none}
.bm-layer{position:absolute;inset:0}
/* 머릿속 가로폭이 무대의 39%뿐이라 칩이 그보다 넓으면 얼굴 밖으로 삐져나온다. */
.bm-chip{position:absolute;transform:translate(-50%,-50%);max-width:38%;padding:.08em .4em;border-radius:.45em;
  font-weight:800;line-height:1.2;text-align:center;word-break:keep-all;color:var(--bm-ink);
  background:var(--bm-chip-bg);border:1px solid transparent;cursor:grab;user-select:none;-webkit-user-select:none}
.bm-chip.bm-live:active{cursor:grabbing}
.bm-chip.sel{border-color:currentColor;background:var(--bm-chip-sel)}
.bm-chip.bm-static{cursor:default}
.bm-chip .bm-need{display:block;width:.34em;height:.34em;border-radius:50%;border:.1em solid var(--bm-need);margin:.18em auto 0}
.bm-chip.bm-ok{color:var(--bm-ok)}
.bm-chip.bm-no{color:var(--bm-no)}
.bm-chip.bm-trap{color:var(--bm-no);text-decoration:line-through;text-decoration-thickness:1px}
.bm-empty{position:absolute;left:${(EMPTY_AT.x / VB.w * 100).toFixed(1)}%;top:${(EMPTY_AT.y / VB.h * 100).toFixed(1)}%;
  transform:translate(-50%,-50%);width:36%;text-align:center;
  font-size:12px;line-height:1.6;color:var(--hi-text-muted);word-break:keep-all}
/* 두 임금을 가를 이름표. 그림이 한 장이라 갤러리에서 이것으로 구별한다. */
/* 오른쪽 아래는 곤룡포 깃이 차지하므로 턱 아래 빈 곳에 둔다. */
.bm-name{position:absolute;left:30%;bottom:4%;transform:translateX(-50%);padding:3px 12px;border-radius:999px;
  font-size:12px;font-weight:800;color:#fff;white-space:nowrap}
`;
  document.head.appendChild(el);
}

/* 칩 글자 크기를 무대 폭에 맞춰 키운다. em으로 적어 두고 무대의 font-size만 바꾸면
   비중(1~5)에 따른 크기 차이가 화면 크기와 상관없이 같은 비율로 유지된다. */
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
  stage.className = 'bm-stage';
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
    d.className = 'bm-chip' + (o.live ? ' bm-live' : ' bm-static') + (o.selected === c.k ? ' sel' : '');
    if (o.review) {
      if (o.review.trap && o.review.trap.has(c.k)) d.classList.add('bm-trap');
      else if (o.review.ok && o.review.ok.has(c.k)) d.classList.add('bm-ok');
      else d.classList.add('bm-no');
    }
    d.style.left = (c.x / VB.w * 100) + '%';
    d.style.top = (c.y / VB.h * 100) + '%';
    d.style.fontSize = chipEm(c.w) + 'em';
    /* 아직 까닭을 안 쓴 칩에만 작은 고리를 붙인다(쓴 것마다 점을 찍으면 다 채운 화면이
       점투성이가 된다). 편집 화면에서만 쓰고 갤러리와 어드민에서는 붙이지 않는다. */
    d.innerHTML = esc(c.label) + (o.live && !c.note ? '<span class="bm-need"></span>' : '');
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

/* 그려 놓고 나서 칩 상자를 실제로 재어 머릿속으로 밀어 넣는다.
   낱말 길이와 비중에 따라 상자 크기가 제각각이라, 놓을 때 좌표만 보고는 삐져나오는지
   알 수 없다. 갤러리와 어드민에서도 돌리므로 예전에 저장된 좌표도 안쪽에 들어와 보인다
   (저장값은 건드리지 않고 화면만 고친다 — 학생 화면에서 끌어 옮기면 그때 저장된다). */
function settle(stage, chips, o) {
  const sw = stage.clientWidth, sh = stage.clientHeight;
  if (!sw || !sh) return;
  chips.forEach(c => {
    const node = stage.querySelector('.bm-chip[data-k="' + cssEscape(c.k) + '"]');
    if (!node) return;
    const w = node.offsetWidth / sw * VB.w;
    const h = node.offsetHeight / sh * VB.h;
    const p = clampBox(c.x, c.y, w, h);
    if (Math.abs(p.x - c.x) > 0.5 || Math.abs(p.y - c.y) > 0.5) {
      if (o.live) { c.x = p.x; c.y = p.y; }   // 편집 중이면 저장값도 따라간다
      node.style.left = (p.x / VB.w * 100) + '%';
      node.style.top = (p.y / VB.h * 100) + '%';
    }
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
    /* 상자 크기는 그릴 때 재어 둔 값을 쓴다 — 끄는 동안 매번 재면 레이아웃을 다시 계산하느라
       손가락을 따라오지 못한다. */
    const p = clampBox(x, y, +node.dataset.bw || 0, +node.dataset.bh || 0);
    chip.x = p.x; chip.y = p.y;
    node.style.left = (p.x / VB.w * 100) + '%';
    node.style.top = (p.y / VB.h * 100) + '%';
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

export const DEFAULT_CONFIG = {
  keywords: DEFAULT_KEYWORDS,
  maxChips: 4,   // 한 인물에 놓을 수 있는 최대 개수 — 머릿속 높이가 딱 네 줄이다
  minChips: 3,   // 제출하려면 한 인물에 적어도 이만큼
  noteMax: 40    // 근거 한 줄의 글자 수 상한
};

/* 저장된 설정과 기본값을 섞는다(선생님이 일부만 고쳐 두었을 때를 위해). */
export function mergeConfig(data) {
  const d = data || {};
  return {
    keywords: Array.isArray(d.keywords) && d.keywords.length ? d.keywords : DEFAULT_KEYWORDS,
    maxChips: Number(d.maxChips) > 0 ? Number(d.maxChips) : DEFAULT_CONFIG.maxChips,
    minChips: Number(d.minChips) > 0 ? Number(d.minChips) : DEFAULT_CONFIG.minChips,
    noteMax: Number(d.noteMax) > 0 ? Number(d.noteMax) : DEFAULT_CONFIG.noteMax
  };
}

/* 한 인물 화면에서 이 키워드가 맞는 선택인지. 어드민 채점 보조와 통계에 쓴다. */
export function judge(kw, side) {
  if (!kw) return 'no';
  if (kw.side === 'trap') return 'trap';
  if (kw.side === 'both' || kw.side === side) return 'ok';
  return 'no';
}
