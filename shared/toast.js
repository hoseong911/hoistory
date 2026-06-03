/**
 * ============================================================
 *  HOISTORY · shared/toast.js  v1.0
 * ------------------------------------------------------------
 *  토스트 알림 공통 모듈. 3가지 스타일 제공:
 *
 *  1. showToast(msg, kind?)        — 간단한 알약형 (하단)
 *  2. showRichToast({...})         — 아이콘+제목+메시지 카드 (상단)
 *  3. showCelebration({...})       — 큰 중앙 팝업 (선생님 PICK!)
 *
 *  사용:
 *    import { showToast, showRichToast, showCelebration }
 *      from '/hoistory/shared/toast.js';
 *
 *    showToast('저장했어요');
 *    showToast('오류 발생', 'error');
 *
 *    showRichToast({
 *      icon: '🚫', title: '게시 불가',
 *      message: '부적절한 표현이 포함되어 있습니다',
 *      kind: 'error'
 *    });
 *
 *    showCelebration({
 *      icon: '⭐', title: '선생님 PICK!',
 *      message: '내가 만든 광고가 선택되었습니다'
 *    });
 * ============================================================
 */

// ─── 컨테이너 자동 생성 ─────────────────────────────────────
let _toastContainer = null;
let _simpleToast = null;
let _celebOverlay = null;

function _ensureToastContainer() {
  if (_toastContainer) return _toastContainer;
  _toastContainer = document.createElement('div');
  _toastContainer.className = 'hi-toast-container';
  document.body.appendChild(_toastContainer);
  return _toastContainer;
}

function _ensureSimpleToast() {
  if (_simpleToast) return _simpleToast;
  _simpleToast = document.createElement('div');
  _simpleToast.className = 'hi-toast';
  document.body.appendChild(_simpleToast);
  return _simpleToast;
}

function _ensureCelebOverlay() {
  if (_celebOverlay) return _celebOverlay;
  _celebOverlay = document.createElement('div');
  _celebOverlay.className = 'hi-celebration-overlay';
  _celebOverlay.style.display = 'none';
  document.body.appendChild(_celebOverlay);
  return _celebOverlay;
}


// ────────────────────────────────────────────────────────────
//  1. 간단한 알약 토스트 (하단)
// ────────────────────────────────────────────────────────────

let _simpleTimer = null;

/**
 * 간단한 알약 토스트를 하단에 표시합니다.
 * @param {string} msg
 * @param {'info'|'error'|'success'} [kind='info']
 * @param {number} [duration=2800]
 */
export function showToast(msg, kind = 'info', duration = 2800) {
  const t = _ensureSimpleToast();
  t.textContent = msg;
  t.className = 'hi-toast' + (kind === 'error' ? ' error' : '');
  setTimeout(() => t.classList.add('show'), 10);
  clearTimeout(_simpleTimer);
  _simpleTimer = setTimeout(() => t.classList.remove('show'), duration);
}


// ────────────────────────────────────────────────────────────
//  2. 리치 토스트 (아이콘 + 제목 + 메시지)
// ────────────────────────────────────────────────────────────

/**
 * 아이콘과 제목이 있는 리치 토스트를 표시합니다.
 *
 * @param {Object} opts
 * @param {string} [opts.icon='📌']
 * @param {string} opts.title
 * @param {string} opts.message - HTML 허용
 * @param {'info'|'error'} [opts.kind='info']
 * @param {number} [opts.duration=4000]
 * @param {boolean} [opts.allowHtml=false] - message HTML 허용 여부
 */
export function showRichToast(opts) {
  const {
    icon = '📌',
    title,
    message,
    kind = 'info',
    duration = 4000,
    allowHtml = false
  } = opts;

  const container = _ensureToastContainer();
  const toast = document.createElement('div');
  toast.className = 'hi-toast-rich' + (kind === 'error' ? ' error' : '');

  const iconEl = document.createElement('div');
  iconEl.className = 'hi-toast-icon';
  iconEl.textContent = icon;

  const body = document.createElement('div');
  body.className = 'hi-toast-body';

  const titleEl = document.createElement('div');
  titleEl.className = 'hi-toast-title';
  titleEl.textContent = title || '';

  const msgEl = document.createElement('div');
  msgEl.className = 'hi-toast-msg';
  if (allowHtml) msgEl.innerHTML = message || '';
  else msgEl.textContent = message || '';

  body.append(titleEl, msgEl);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'hi-toast-close';
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', () => _removeToast(toast));

  toast.append(iconEl, body, closeBtn);
  container.appendChild(toast);

  setTimeout(() => _removeToast(toast), duration);
  return toast;
}

function _removeToast(toast) {
  if (!toast || toast._removing) return;
  toast._removing = true;
  toast.classList.add('out');
  setTimeout(() => toast.remove(), 300);
}


// ────────────────────────────────────────────────────────────
//  3. Celebration popup (중앙 큰 알림 — 선생님 PICK 같은)
// ────────────────────────────────────────────────────────────

/**
 * 중앙 큰 축하 팝업을 표시합니다.
 * @param {Object} opts
 * @param {string} [opts.icon='⭐']
 * @param {string} opts.title
 * @param {string} [opts.message] - 보조 텍스트 (HTML 허용 시 <br> 가능)
 * @param {number} [opts.duration=4000]
 * @param {boolean} [opts.allowHtml=false]
 */
export function showCelebration(opts) {
  const {
    icon = '⭐',
    title,
    message,
    duration = 4000,
    allowHtml = false
  } = opts;

  const overlay = _ensureCelebOverlay();
  overlay.style.display = 'flex';
  overlay.innerHTML = '';

  const box = document.createElement('div');
  box.className = 'hi-celebration';

  const emoji = document.createElement('span');
  emoji.className = 'hi-celebration-emoji';
  emoji.textContent = icon;
  box.appendChild(emoji);

  box.appendChild(document.createTextNode(title || ''));

  if (message) {
    const sub = document.createElement('span');
    sub.className = 'hi-celebration-sub';
    if (allowHtml) sub.innerHTML = message;
    else sub.textContent = message;
    box.appendChild(sub);
  }

  overlay.appendChild(box);
  setTimeout(() => {
    overlay.style.display = 'none';
    overlay.innerHTML = '';
  }, duration);
}


// ────────────────────────────────────────────────────────────
//  실시간 PICK 감지 (Firebase 토스트 채널 구독 헬퍼)
// ────────────────────────────────────────────────────────────

/**
 * Firebase RTDB의 특정 경로를 구독해서 새 PICK 이벤트가 오면
 * 자동으로 celebration을 띄웁니다.
 *
 * 사용:
 *   import { subscribePickChannel } from '/hoistory/shared/toast.js';
 *   import { ref, onValue } from 'firebase/database';
 *
 *   subscribePickChannel({
 *     dbRef: ref(db, 'goryeo_v2_toast'),
 *     onValue,
 *     buildMessage: ({content, nickname}) =>
 *       `"${content.length>40?content.slice(0,40)+'…':content}"<br>— ${nickname}`,
 *     title: '선생님이 이 글을 Pick 했어요!'
 *   });
 */
export function subscribePickChannel(opts) {
  const {
    dbRef, onValue,
    title = '선생님이 PICK 했어요!',
    icon = '⭐',
    buildMessage,
    maxAgeMs = 5000
  } = opts;

  let lastKey = null;

  onValue(dbRef, snap => {
    const data = snap.val();
    if (!data) return;
    if (data.key === lastKey) return;
    lastKey = data.key;
    if (Date.now() - (data.ts || 0) > maxAgeMs) return;

    const msg = buildMessage ? buildMessage(data) : '';
    showRichToast({
      icon, title, message: msg,
      allowHtml: true, duration: 5000
    });
  });
}
