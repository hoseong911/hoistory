// shared/icon-picker.js — SVG 아이콘 피커 공용 모듈
// 사용법: import { mountIconPicker } from '../shared/icon-picker.js';
//   mountIconPicker({ triggerEl, previewEl, onSelect, storeSize })

// ── 큐레이션 아이콘 (카테고리별 기본 표시) ──────────────────────────
const CURATED = {
  '학습': [
    'book-open','book','graduation-cap','pencil','edit-3','file-text',
    'lightbulb','brain','search','clipboard','clipboard-check',
    'archive','bookmark','scroll','pen-tool','ruler','compass','pen',
    'notebook-pen','library',
  ],
  '활동': [
    'message-square','message-circle','users','user','heart','star',
    'mic','camera','image','video','music','bell',
    'mail','send','share-2','thumbs-up','zap','flag','megaphone',
  ],
  '역사': [
    'landmark','crown','shield','map','globe','flag','anchor',
    'feather','swords','castle','gem','scroll-text',
    'hourglass','mountain','compass','sword','pilcrow',
  ],
  '상태': [
    'check-circle','check','x-circle','alert-circle','info',
    'shield-check','lock','eye','clock','calendar',
    'timer','refresh-cw','settings','alert-triangle','badge-check',
    'lock-open','ban','circle-dot',
  ],
  '기타': [
    'home','grid-2x2','list','tag','link','download','upload',
    'trophy','award','target','layers','rocket','gift','code-2',
    'database','bar-chart-3','pie-chart','trending-up',
    'package','box',
  ],
};

// 전체 모드용 확장 목록 (검색 범위 확장)
const EXTENDED = [
  'accessibility','activity','airplay','alarm-check','alarm-clock','album','alert-octagon',
  'align-center','align-justify','align-left','align-right','ampersands','angry','aperture',
  'apple','arrow-down','arrow-left','arrow-right','arrow-up','asterisk','at-sign',
  'atom','audio-lines','baby','badge','banana','bar-chart-2','battery','bed',
  'binary','binoculars','bird','bluetooth','bold','bomb','bone','book-copy',
  'book-dashed','book-heart','book-key','book-lock','book-marked','book-minus',
  'book-plus','book-template','book-type','book-up','book-x','bot',
  'boxes','brackets','briefcase','brush','bug','building','building-2',
  'bus','cable','calendar-check','calendar-clock','calendar-days','calendar-heart',
  'camera-off','car','carrot','chart-area','chart-candlestick','chart-column',
  'chart-gantt','chart-line','chart-no-axes-column','chart-pie','chart-scatter',
  'cherry','chevron-down','chevron-left','chevron-right','chevron-up',
  'circle','circle-alert','circle-check','circle-help','circle-minus','circle-plus',
  'circle-stop','circle-user','circle-x','clipboard-list','clipboard-type',
  'cloud','cloud-download','cloud-upload','clover','code','codepen','coffee',
  'cog','coins','columns-2','columns-3','command','component','computer',
  'construction','contact','contrast','copy','copyright','corner-down-left',
  'cpu','creative-commons','credit-card','crop','crosshair','cube',
  'cup-soda','currency','database-backup','database-zap','diff','disc',
  'divide','dog','door-closed','door-open','dot','dumbbell','ear',
  'earth','egg','ellipsis','equal','eraser','external-link','file',
  'file-audio','file-check','file-code','file-diff','file-down','file-heart',
  'file-image','file-json','file-key','file-lock','file-minus','file-music',
  'file-plus','file-search','file-spreadsheet','file-type','file-up','file-video',
  'file-x','files','film','filter','fingerprint','fire','fish','flame',
  'flashlight','flask','flower','flower-2','focus','folder-archive','folder-check',
  'folder-closed','folder-down','folder-git','folder-heart','folder-input','folder-key',
  'folder-lock','folder-minus','folder-open','folder-output','folder-plus','folder-root',
  'folder-search','folder-sync','folder-up','folder-x','framer','frown',
  'fuel','fullscreen','function','game-controller-2','gauge','ghost',
  'github','gitlab','glasses','globe-2','goal','grid-3x3','grip','grip-horizontal',
  'grip-vertical','group','guitar','ham','hammer','hand-helping','hand-metal',
  'handshake','hard-drive','hard-hat','hash','heading','headphones','heart-crack',
  'heart-handshake','heart-pulse','help-circle','hexagon','highlighter','history',
  'home-2','hospital','hotel','ice-cream','image-off','inbox','indent',
  'infinity','input','inspect','instagram','italic','key','keyboard',
  'lamp','layers-2','layers-3','layout','layout-dashboard','layout-list','layout-panel-left',
  'layout-template','leaf','lego','linkedin','lollipop','magnet','mail-check',
  'mail-open','map-pin','map-pinned','maximize','medal','megaphone-off',
  'meh','menu','merge','message-square-more','milestone','minimize','minus',
  'minus-circle','mirror-horizontal','mirror-vertical','monitor','monitor-check',
  'moon','more-horizontal','more-vertical','mountain-snow','mouse','move',
  'move-3d','network','newspaper','octagon','option','outdent',
  'paintbrush','palette','paperclip','paragraph','party-popper','pause',
  'pause-circle','pen-line','pencil-line','percent','person-standing','phone',
  'pin','pizza','plane','planet','play','plug','plus','plus-circle',
  'pointer','power','presentation','printer','puzzle','qr-code','quote',
  'radio','radius','rainbow','rat','receipt','redo','repeat','replace',
  'rewind','ribbon','rotate-cw','rss','save','scale','scan','scissors',
  'screen-share','server','share','sheet','shield-alert','shield-off',
  'shirt','shopping-bag','shopping-cart','sigma','signal','signpost',
  'skip-back','skip-forward','slack','slash','sliders','smile','snowflake',
  'sofa','sort-asc','sort-desc','speaker','sprout','square','square-pen',
  'stamp','star-off','stethoscope','sticker','stop-circle','stretch-horizontal',
  'stretch-vertical','strikethrough','subscript','sun','sunrise','sunset',
  'superscript','swatch-book','switch-camera','sword','table','tablet',
  'tablets','telescope','tent','terminal','thermometer','thumbs-down',
  'ticket','toggle-left','toggle-right','tornado','tree','tree-pine',
  'triangle','tv','tv-2','twitter','type','umbrella','underline',
  'undo','unlink','user-check','user-minus','user-plus','user-x',
  'variable','vault','verified','vibrate','video-off','view','voicemail',
  'volume','volume-1','volume-2','volume-x','wallet','wand','watch',
  'waves','webhook','wifi','wind','wine','workflow','x','x-square',
  'youtube','zap-off','zoom-in','zoom-out',
];

const ALL_NAMES = [...new Set([...Object.values(CURATED).flat(), ...EXTENDED])];

// ── CDN 설정 ──────────────────────────────────────────────────────────
const CDN = 'https://cdn.jsdelivr.net/npm/lucide-static@latest/icons/';
const _cache = {};

async function fetchSvg(name) {
  if (_cache[name] !== undefined) return _cache[name];
  try {
    const r = await fetch(CDN + name + '.svg');
    if (!r.ok) { _cache[name] = null; return null; }
    let txt = await r.text();
    // 속성 정규화: width/height/color 제거 후 표준값 주입
    txt = txt.replace(/<svg([^>]*)>/, (_, attrs) => {
      attrs = attrs
        .replace(/\s*(width|height|color)="[^"]*"/g, '')
        .replace(/\s*xmlns="[^"]*"/g, '');
      return `<svg${attrs} width="22" height="22" xmlns="http://www.w3.org/2000/svg">`;
    });
    _cache[name] = txt;
    return txt;
  } catch { _cache[name] = null; return null; }
}

function toStoreSvg(svg, size) {
  return svg
    .replace(/width="\d+"/, `width="${size}"`)
    .replace(/height="\d+"/, `height="${size}"`);
}

// ── 스타일 ─────────────────────────────────────────────────────────────
const CSS = `
.svgpkr-overlay{position:fixed;inset:0;z-index:9000;pointer-events:none}
.svgpkr{
  position:fixed;z-index:9001;
  background:#FAFAF9;
  border:1px solid #E5E4DF;
  border-radius:18px;
  box-shadow:0 8px 36px rgba(0,0,0,.18);
  width:320px;
  display:none;flex-direction:column;
  max-height:440px;
  overflow:hidden;
  font-family:'Pretendard',-apple-system,sans-serif;
}
.svgpkr.open{display:flex}
.svgpkr-top{padding:12px 12px 0;flex-shrink:0}
.svgpkr-search{
  width:100%;border:1.5px solid #E5E4DF;border-radius:8px;
  padding:8px 12px;font-size:13px;font-family:inherit;
  outline:none;background:#F4F3EE;color:#0A1317;
}
.svgpkr-search:focus{border-color:#1E3A8A}
.svgpkr-cats{
  display:flex;gap:4px;padding:8px 12px;
  overflow-x:auto;flex-shrink:0;scrollbar-width:none;
}
.svgpkr-cats::-webkit-scrollbar{display:none}
.svgpkr-cat{
  background:none;border:1.5px solid #E5E4DF;border-radius:100px;
  padding:3px 10px;font-size:11px;font-weight:700;font-family:inherit;
  cursor:pointer;color:#6B7280;white-space:nowrap;transition:.12s;
}
.svgpkr-cat:hover{border-color:#1E3A8A;color:#1E3A8A}
.svgpkr-cat.on{background:#1E3A8A;border-color:#1E3A8A;color:#fff}
.svgpkr-grid{
  display:grid;grid-template-columns:repeat(7,1fr);
  gap:2px;padding:4px 10px 12px;
  overflow-y:auto;flex:1;
}
.svgpkr-btn{
  background:none;border:none;border-radius:8px;
  padding:7px;cursor:pointer;
  display:flex;align-items:center;justify-content:center;
  color:#374151;transition:.1s;
  position:relative;
}
.svgpkr-btn:hover{background:#EEF2FF;color:#1E3A8A}
.svgpkr-btn.on{background:#EEF2FF;outline:2px solid #1E3A8A;outline-offset:-1px}
.svgpkr-btn svg{pointer-events:none}
.svgpkr-empty{
  grid-column:1/-1;text-align:center;padding:24px 0;
  font-size:12px;color:#9CA3AF;
}
.svgpkr-tip{
  grid-column:1/-1;font-size:10px;color:#9CA3AF;
  text-align:right;padding:0 2px 4px;
}

/* 인라인 피커 트리거 버튼 */
.icon-picker-wrap{display:flex;align-items:center;gap:8px}
.icon-picker-preview{
  width:44px;height:44px;border-radius:10px;
  background:#F4F3EE;border:1.5px solid #E5E4DF;
  display:flex;align-items:center;justify-content:center;
  color:#374151;flex-shrink:0;overflow:hidden;
}
.icon-picker-preview svg{display:block}
.icon-picker-preview.empty::before{content:'?';font-size:20px;color:#C4C4C4}
.icon-picker-trigger{
  background:none;border:1.5px solid #E5E4DF;border-radius:100px;
  padding:6px 14px;font-family:inherit;font-size:12px;font-weight:700;
  color:#6B7280;cursor:pointer;transition:.15s;white-space:nowrap;
}
.icon-picker-trigger:hover{border-color:#1E3A8A;color:#1E3A8A}
`;

let _styleAdded = false;
function addStyle() {
  if (_styleAdded) return;
  _styleAdded = true;
  const s = document.createElement('style');
  s.textContent = CSS;
  document.head.appendChild(s);
}

// ── 싱글턴 팝업 ────────────────────────────────────────────────────────
let _popup = null;
let _activeOnSelect = null;
let _activePreview = null;
let _activeSize = 28;
let _activeTrigger = null;
let _currentCat = null;
let _allMode = false;
let _searchVal = '';

function getPopup() {
  if (_popup) return _popup;
  _popup = document.createElement('div');
  _popup.className = 'svgpkr';
  _popup.innerHTML = `
    <div class="svgpkr-top">
      <input class="svgpkr-search" placeholder="아이콘 검색 (영문)…" type="search" autocomplete="off">
    </div>
    <div class="svgpkr-cats"></div>
    <div class="svgpkr-grid"></div>
  `;
  document.body.appendChild(_popup);

  // 카테고리 탭 생성
  const catsEl = _popup.querySelector('.svgpkr-cats');
  [...Object.keys(CURATED), '전체'].forEach((label, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'svgpkr-cat' + (i === 0 ? ' on' : '');
    btn.textContent = label;
    btn.dataset.cat = label;
    btn.onclick = () => {
      catsEl.querySelectorAll('.svgpkr-cat').forEach(b => b.classList.remove('on'));
      btn.classList.add('on');
      _currentCat = label === '전체' ? null : label;
      _allMode = label === '전체';
      _searchVal = '';
      _popup.querySelector('.svgpkr-search').value = '';
      renderGrid();
    };
    catsEl.appendChild(btn);
  });

  _popup.querySelector('.svgpkr-search').addEventListener('input', e => {
    _searchVal = e.target.value.trim().toLowerCase();
    renderGrid();
  });

  // 외부 클릭 시 닫기
  document.addEventListener('click', e => {
    if (!_popup.contains(e.target) && e.target !== _activeTrigger) {
      closePopup();
    }
  }, true);

  return _popup;
}

function openPopup(triggerEl, previewEl, onSelect, storeSize) {
  const popup = getPopup();
  _activeOnSelect = onSelect;
  _activePreview = previewEl;
  _activeSize = storeSize;
  _activeTrigger = triggerEl;

  // 첫 카테고리로 초기화
  const firstCat = Object.keys(CURATED)[0];
  _currentCat = firstCat;
  _allMode = false;
  _searchVal = '';
  const search = popup.querySelector('.svgpkr-search');
  if (search) search.value = '';
  popup.querySelectorAll('.svgpkr-cat').forEach((b, i) => {
    b.classList.toggle('on', i === 0);
  });

  // 위치 계산
  const rect = triggerEl.getBoundingClientRect();
  const pw = 320, ph = 440;
  let top = rect.bottom + 6;
  let left = rect.left;
  if (top + ph > window.innerHeight) top = rect.top - ph - 6;
  if (left + pw > window.innerWidth) left = window.innerWidth - pw - 8;
  if (left < 8) left = 8;
  popup.style.top = Math.max(8, top) + 'px';
  popup.style.left = left + 'px';

  popup.classList.add('open');
  renderGrid();
  if (search) search.focus();
}

function closePopup() {
  if (_popup) _popup.classList.remove('open');
}

async function renderGrid() {
  const popup = getPopup();
  const grid = popup.querySelector('.svgpkr-grid');
  grid.innerHTML = '<div class="svgpkr-empty">로딩 중…</div>';

  let names;
  if (_searchVal) {
    names = ALL_NAMES.filter(n => n.includes(_searchVal));
  } else if (_allMode) {
    names = ALL_NAMES;
  } else {
    names = CURATED[_currentCat] || [];
  }

  if (!names.length) {
    grid.innerHTML = '<div class="svgpkr-empty">검색 결과 없음</div>';
    return;
  }

  // 최대 200개 제한 (성능)
  const limited = names.slice(0, 200);
  const svgs = await Promise.all(limited.map(fetchSvg));

  grid.innerHTML = '';

  let rendered = 0;
  limited.forEach((name, i) => {
    const svg = svgs[i];
    if (!svg) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'svgpkr-btn';
    btn.title = name;
    btn.innerHTML = svg;
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const storeSvg = toStoreSvg(svg, _activeSize);
      if (_activePreview) {
        _activePreview.innerHTML = storeSvg;
        _activePreview.classList.remove('empty');
      }
      _activeOnSelect?.(storeSvg, name);
      closePopup();
    });
    grid.appendChild(btn);
    rendered++;
  });

  if (!rendered) {
    grid.innerHTML = '<div class="svgpkr-empty">결과 없음</div>';
    return;
  }

  if (names.length > 200) {
    const tip = document.createElement('div');
    tip.className = 'svgpkr-tip';
    tip.textContent = `${names.length}개 중 200개 표시 — 검색으로 좁혀보세요`;
    grid.appendChild(tip);
  }
}

// ── 공개 API ───────────────────────────────────────────────────────────
/**
 * SVG 아이콘 피커를 마운트합니다.
 *
 * @param {Object} opts
 * @param {HTMLElement} opts.triggerEl   - 피커를 여는 버튼
 * @param {HTMLElement} opts.previewEl   - 현재 아이콘을 미리 보여줄 엘리먼트
 * @param {Function}    opts.onSelect    - (svgCode, iconName) 선택 콜백
 * @param {number}      [opts.storeSize=28]  - 저장할 SVG 크기(px)
 * @param {string}      [opts.initialSvg=''] - 초기 SVG HTML
 */
export function mountIconPicker({ triggerEl, previewEl, onSelect, storeSize = 28, initialSvg = '' }) {
  addStyle();

  if (initialSvg && previewEl) {
    previewEl.innerHTML = initialSvg;
    previewEl.classList.remove('empty');
  } else if (previewEl) {
    previewEl.classList.add('empty');
  }

  triggerEl.addEventListener('click', e => {
    e.stopPropagation();
    const popup = getPopup();
    if (popup.classList.contains('open') && _activeTrigger === triggerEl) {
      closePopup();
    } else {
      openPopup(triggerEl, previewEl, onSelect, storeSize);
    }
  });
}
