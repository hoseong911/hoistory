/* apps/j_brain/brain.js — 뇌구조도 공용 렌더러
   학생 편집 화면, 갤러리, 어드민 미리보기가 모두 이 파일 하나로 그린다.
   (세 곳이 따로 그리면 학생이 옮겨 둔 자리와 선생님이 보는 자리가 어긋난다.)

   좌표계: 아래 VB 크기의 SVG 안쪽 좌표를 그대로 저장한다. 화면 크기가 달라져도
   비율로 다시 계산되므로 폰에서 놓은 자리가 칠판 화면에서도 그대로다. */

export const VB = { w: 320, h: 360 };

/* 글자가 머리 밖으로 삐져나오지 않도록, 실루엣보다 조금 작은 타원을 "놓을 수 있는 곳"으로 둔다.
   위쪽은 익선관이 덮는 만큼 더 내려 잡는다(관 밑으로 글자가 숨지 않게). */
export const FIELD = { cx: 160, cy: 202, rx: 94, ry: 104 };

/* 새 키워드를 놓을 자리 차례. 가로로 나란히 두면 긴 낱말끼리 겹치므로 한 줄에 하나씩
   위에서 아래로 쌓는다(학생이 끌어 옮겨 다시 꾸밀 수 있다). */
export const ANCHORS = [
  [160, 122], [160, 159], [160, 196], [160, 233], [160, 270], [160, 300],
  [122, 140], [198, 140], [122, 255], [198, 255]
];

export const WEIGHTS = [
  { w: 1, label: '잠깐 스쳤다' },
  { w: 2, label: '가끔 떠올렸다' },
  { w: 3, label: '자주 생각했다' },
  { w: 4, label: '늘 마음에 두었다' },
  { w: 5, label: '머릿속을 가득 채웠다' }
];

const CHIP_EM = { 1: 0.9, 2: 1.12, 3: 1.36, 4: 1.7, 5: 2.1 };
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

/* 타원 밖으로 나간 점을 가장자리 안쪽으로 끌어당긴다. 밖이면 아예 못 놓게 막는 편이
   구현은 쉽지만, 끌다가 손가락이 조금 벗어나면 칩이 튕겨 나가 답답하다. */
export function clampToField(x, y) {
  const dx = (x - FIELD.cx) / FIELD.rx;
  const dy = (y - FIELD.cy) / FIELD.ry;
  const d = Math.hypot(dx, dy);
  if (d <= 1) return { x, y };
  return { x: FIELD.cx + (dx / d) * FIELD.rx, y: FIELD.cy + (dy / d) * FIELD.ry };
}

/* 이미 놓인 칩과 겹치지 않는 빈자리를 고른다. 자리가 다 차면 가운데 언저리에 흩뿌린다. */
export function nextSpot(chips) {
  const used = chips || [];
  for (const [x, y] of ANCHORS) {
    const near = used.some(c => Math.hypot(c.x - x, c.y - y) < 32);
    if (!near) return { x, y };
  }
  const a = Math.random() * Math.PI * 2;
  return clampToField(FIELD.cx + Math.cos(a) * 50, FIELD.cy + Math.sin(a) * 50);
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ── 실루엣 ──
   조선 왕이라는 것이 한눈에 보이도록 익선관을 얹은 앞모습 머리. 옆모습은 그리기는
   그럴듯해도 안쪽 폭이 좁아 글자가 들어갈 자리가 반으로 줄어든다. */
function silhouette(side) {
  const c = `var(--bm-${side})`;
  return `
<svg class="bm-svg" viewBox="0 0 ${VB.w} ${VB.h}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <g fill="none" stroke="${c}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
    <ellipse cx="58" cy="212" rx="15" ry="22" fill="var(--bm-fill)"/>
    <ellipse cx="262" cy="212" rx="15" ry="22" fill="var(--bm-fill)"/>
    <path d="M160 74 C96 74 58 124 58 198 C58 270 100 322 160 322 C220 322 262 270 262 198 C262 124 224 74 160 74 Z"
          fill="var(--bm-fill)"/>
    <!-- 관. 옆이 거의 곧고 위만 둥근 사다리꼴이라야 "쓴 것"으로 읽힌다 —
         둥근 돔에 뿔 두 개를 세워 보았더니 임금이 아니라 곰 모자가 됐다. -->
    <path d="M104 92 L104 60 C104 44 126 36 160 36 C194 36 216 44 216 60 L216 92 Z" fill="${c}" stroke="none"/>
    <path d="M104 92 L216 92" stroke-width="3"/>
  </g>
</svg>`;
}

/* 한 번만 넣으면 되는 공용 스타일. 학생 화면과 어드민이 같은 모양을 쓰게 하려고
   CSS도 이 파일이 들고 있다(양쪽 HTML에 복사해 두면 한쪽만 고치는 일이 생긴다). */
function ensureStyle() {
  if (document.getElementById('bm-style')) return;
  const el = document.createElement('style');
  el.id = 'bm-style';
  el.textContent = `
.bm-stage{position:relative;width:100%;max-width:420px;margin:0 auto;aspect-ratio:${VB.w}/${VB.h};touch-action:none}
.bm-svg{position:absolute;inset:0;width:100%;height:100%}
.bm-layer{position:absolute;inset:0}
.bm-chip{position:absolute;transform:translate(-50%,-50%);max-width:56%;padding:.08em .4em;border-radius:.45em;
  font-weight:800;line-height:1.2;text-align:center;word-break:keep-all;color:var(--bm-ink);
  background:var(--bm-chip-bg);border:1px solid transparent;cursor:grab;user-select:none;-webkit-user-select:none}
.bm-chip.bm-live:active{cursor:grabbing}
.bm-chip.sel{border-color:currentColor;background:var(--bm-chip-sel)}
.bm-chip.bm-static{cursor:default}
.bm-chip .bm-need{display:block;width:.34em;height:.34em;border-radius:50%;border:.1em solid var(--bm-need);margin:.18em auto 0}
.bm-chip.bm-ok{color:var(--bm-ok)}
.bm-chip.bm-no{color:var(--bm-no)}
.bm-chip.bm-trap{color:var(--bm-no);text-decoration:line-through;text-decoration-thickness:1px}
.bm-empty{position:absolute;left:50%;top:52%;transform:translate(-50%,-50%);width:60%;text-align:center;
  font-size:13px;line-height:1.7;color:var(--hi-text-muted);word-break:keep-all}
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
 *   review    {ok:Set, trap:Set} — 어드민에서 정오 표시를 켤 때만
 *   onPick(k) 칩을 눌렀을 때
 *   onMove(k,x,y) 칩을 옮겨 놓았을 때
 */
export function renderBrain(el, opts) {
  ensureStyle();
  const o = opts || {};
  const chips = Array.isArray(o.chips) ? o.chips : [];
  const stage = document.createElement('div');
  stage.className = 'bm-stage';
  stage.innerHTML = silhouette(o.side || 'yeongjo') + '<div class="bm-layer"></div>';
  const layer = stage.querySelector('.bm-layer');

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
  if (window.ResizeObserver) new ResizeObserver(() => fitFont(stage)).observe(stage);
  return stage;
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
    const p = clampToField(x, y);
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
  maxChips: 6,   // 한 인물에 놓을 수 있는 최대 개수
  minChips: 4,   // 제출하려면 한 인물에 적어도 이만큼
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
