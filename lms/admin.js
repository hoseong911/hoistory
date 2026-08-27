import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore, collection, query, orderBy, where, onSnapshot,
  addDoc, updateDoc, deleteDoc, doc, getDocs, getDoc, setDoc, writeBatch, serverTimestamp, limit, runTransaction
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getDatabase, ref, get, set, remove, update, onValue, push } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut, EmailAuthProvider, reauthenticateWithCredential } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getStorage, ref as sRef, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";
import { mountIconPicker } from '../shared/icon-picker.js?v=20260822a';
import { icon } from '../shared/icons.js';

import { firebaseConfig } from "../shared/firebase-config.js";

const app  = initializeApp(firebaseConfig);
const db   = getFirestore(app);
const rtdb = getDatabase(app);
const auth = getAuth(app);
const storage = getStorage(app);
import { CLAUDE_PROXY_URL, kstDate } from '../shared/util.js?v=20260826';

// ── 관리자 로그인 (Firebase Authentication) ──
function showAdminView() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('adminView').style.display = 'flex';
  // 메뉴 전환이 URL을 안 바꿔서 브라우저 히스토리에 아무것도 안 남던 문제 보완: 최초 진입 상태를
  // 히스토리에 하나 심어둔다(switchNav가 그 위에 쌓아가고, 뒤로가기는 popstate로 되짚어간다).
  try { history.replaceState({ nav: (typeof _currentNav !== 'undefined' && _currentNav) || 'dashboard' }, '', location.href); } catch (e) {}
}
function showLoginView() {
  document.getElementById('adminView').style.display = 'none';
  document.getElementById('loginScreen').style.display = 'flex';
}
onAuthStateChanged(auth, user => { if (user) showAdminView(); else showLoginView(); });

async function tryAdminLogin() {
  const email    = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errEl    = document.getElementById('loginError');
  const btn      = document.getElementById('loginSubmitBtn');
  if (!email || !password) { errEl.textContent = '이메일과 비밀번호를 입력해 주세요'; return; }
  btn.disabled = true; btn.textContent = '접속 중...';
  try {
    await signInWithEmailAndPassword(auth, email, password);
    errEl.textContent = '';
  } catch (e) {
    errEl.textContent = '이메일 또는 비밀번호가 올바르지 않습니다';
    document.getElementById('loginPassword').value = '';
  } finally {
    btn.disabled = false; btn.textContent = '접속';
  }
}
document.getElementById('loginSubmitBtn').addEventListener('click', tryAdminLogin);
document.getElementById('loginPassword').addEventListener('keydown', e => { if (e.key === 'Enter') tryAdminLogin(); });
document.getElementById('loginEmail').addEventListener('keydown', e => { if (e.key === 'Enter') tryAdminLogin(); });
document.getElementById('adminLogoutBtn').addEventListener('click', () => {
  if (!confirm('로그아웃 하시겠습니까?')) return;
  signOut(auth);
});

const SECTION_MAP = {
  concept: { colorVar:'--c1', previewClass:'preview-concept' },
  mission: { colorVar:'--c2', previewClass:'preview-mission' },
  think:   { colorVar:'--c3', previewClass:'preview-think'   },
  grade:   { colorVar:'--c4', previewClass:'preview-grade'   },
};

async function initAdmin() {
  initSidebar();
  startListening();
  await seedLectureOrderByNumberOnce(); // 기존 강의·질문의 order를 강 번호 기준으로 1회 보정
  ceInitContent();
  ceInitDesign();
  initMissionTab();
  initGradeTab();
  initGradeSettings();
  initContentsTab();
  initArchiveTab();
  await loadTestIds();                    // 집계 제외용 테스트 학번(랭킹·집계보다 먼저 로드)
  dbLoad();
}

// ── 테스트 학생(집계 제외) ──
// settings/lms_config.testStudentIds 에 저장. 로그인·개별 조회는 되지만
// 경험치 랭킹·대시보드 오늘 집계·성적(GRADE) 목록/평균에서 빠진다.
let _testIds = new Set();
function isTestId(sid) { return _testIds.has(String(sid == null ? '' : sid).trim()); }

async function loadTestIds() {
  try {
    const cfg = await getDoc(doc(db, 'settings', 'lms_config'));
    const arr = cfg.exists() ? (cfg.data().testStudentIds || []) : [];
    _testIds = new Set(arr.map(x => String(x).trim()).filter(Boolean));
  } catch (_) { _testIds = new Set(); }
  stRenderTestIds();
}
async function saveTestIds() {
  await setDoc(doc(db, 'settings', 'lms_config'), { testStudentIds: [..._testIds] }, { merge: true });
}
function stRenderTestIds() {
  const box = document.getElementById('st-testid-list');
  if (!box) return;
  const ids = [..._testIds].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  box.innerHTML = ids.length
    ? ids.map(id => `<span class="test-id-chip">${esc(id)}<button title="제거" onclick="stRemoveTestId('${esc(id)}')">×</button></span>`).join('')
    : '<span style="font-size:13px;color:var(--sub)">등록된 테스트 학생이 없습니다.</span>';
}
window.stAddTestId = async function() {
  const inp = document.getElementById('st-testid-input');
  const sid = (inp?.value || '').trim();
  if (!/^\d{5}$/.test(sid)) { alert('학번 5자리를 입력하세요.'); return; }
  _testIds.add(sid);
  try { await saveTestIds(); } catch (e) { _testIds.delete(sid); alert('저장 실패: ' + e.message); return; }
  if (inp) inp.value = '';
  stRenderTestIds();
  if (typeof dbLoad === 'function') dbLoad(); // 대시보드 집계 즉시 반영
};
window.stRemoveTestId = async function(sid) {
  const id = String(sid).trim();
  _testIds.delete(id);
  try { await saveTestIds(); } catch (e) { _testIds.add(id); alert('저장 실패: ' + e.message); return; }
  stRenderTestIds();
  if (typeof dbLoad === 'function') dbLoad();
};

// 개념 강의(class_lessons)·생각 질문(think_lectures)의 order를 강 번호 기준으로 딱 한 번 재설정한다.
// 이후에는 ▲▼ 수동 순서 변경 값을 그대로 보존하려고 settings/lms_order 마커로 재실행을 막는다.
async function seedLectureOrderByNumberOnce() {
  try {
    const marker = await getDoc(doc(db, 'settings', 'lms_order'));
    if (marker.exists() && marker.data().seededByNumber === true) return;
    const batch = writeBatch(db);
    const clSnap = await getDocs(collection(db, 'class_lessons'));
    clSnap.docs.forEach(d => batch.update(d.ref, { order: lecOrderKey(d.data().num) }));
    const tlSnap = await getDocs(collection(db, 'think_lectures'));
    tlSnap.docs.forEach(d => { const v = d.data(); batch.update(d.ref, { order: lecOrderKey(v.icon || v.title) }); });
    batch.set(doc(db, 'settings', 'lms_order'), { seededByNumber: true }, { merge: true });
    await batch.commit();
  } catch (e) { console.warn('[order seed]', e); }
}

// ── 사이드바 ──
function initSidebar() {
  // 사이드바 메뉴 아이콘(SVG) 렌더 — 색 점 대신 각 메뉴 성격에 맞는 Lucide 아이콘
  document.querySelectorAll('.nav-ic[data-nic]').forEach(el => {
    el.innerHTML = icon(el.dataset.nic, 18);
  });
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => switchNav(item.dataset.nav));
  });
  // 상단 앱 제목을 누르면 대시보드로 이동
  const admTitle = document.querySelector('.adm-title');
  if (admTitle) {
    admTitle.style.cursor = 'pointer';
    admTitle.title = '대시보드로 이동';
    admTitle.addEventListener('click', () => switchNav('dashboard'));
  }
  document.querySelectorAll('.nav-sub-item').forEach(item => {
    item.addEventListener('click', e => {
      e.stopPropagation();
      switchNav(item.dataset.subnav);
    });
  });
  // 각종 콘텐츠는 사이드바 hover 서브메뉴(웹앱 어드민 바로가기)를 두지 않는다.
  // 각 웹앱 어드민은 콘텐츠 패널의 카드별 어드민(톱니) 버튼(openAppAdmin)으로 접속한다.

  // ── 모바일: 햄버거 드로어 ──
  const menuBtn = document.getElementById('admMenuBtn');
  const scrim   = document.getElementById('admSidebarScrim');
  const sidebar = document.querySelector('.adm-sidebar');
  menuBtn?.addEventListener('click', () => {
    const open = sidebar?.classList.toggle('open');
    scrim?.classList.toggle('open', open);
  });
  scrim?.addEventListener('click', closeAdmDrawer);

  // ── 모바일: 'PC 권장' 안내에서 그래도 열기 ──
  document.getElementById('mpnOpenBtn')?.addEventListener('click', () => {
    const notice  = document.getElementById('mobilePcNotice');
    const panelId = notice?.dataset.panel;
    const nav     = notice?.dataset.nav;
    if (!panelId) return;
    _mobileForced.add(panelId);      // 이후 이 세션 동안은 모바일에서도 바로 열림
    if (nav) switchNav(nav);         // 지연 렌더까지 정상 재실행
  });

  // 화면 크기 전환 시 게이트 재평가(모바일↔PC)
  let _rzT;
  window.addEventListener('resize', () => {
    clearTimeout(_rzT);
    _rzT = setTimeout(() => applyMobileGate(_currentPanelId, _currentNav), 200);
  });
}

// 메뉴별 서브메뉴 목록 (첫 항목이 기본 진입 페이지)
const SUBNAV_MAP = {
  concept: ['concept-content', 'concept-design'],
  grade: ['grade-check', 'grade-grade', 'grade-setting'],
  xp: ['xp-award', 'xp-ranking', 'xp-settings'],
  settings: ['settings-schedule', 'settings-student', 'settings-system']
};

// ── 모바일 소프트 게이트 ──
// 넓은 화면 기준으로 만든 '저작' 패널은 모바일에서 열면 곧바로 띄우지 않고 안내 카드를 보여준다.
// 대신 '그래도 여기서 열기'로 언제든 강제로 불러 쓸 수 있다(하드 차단 아님).
const MOBILE_PC_ONLY = new Set([
  'panel-concept-content','panel-concept-design','panel-mission',
  'panel-think','panel-grade-setting','panel-contents',
  'panel-archive',
  'panel-settings-system','panel-settings-student','panel-settings-schedule',
  'panel-xp-settings'
]);
const PANEL_LABELS = {
  'panel-concept-content':'개념 Check CONTENT','panel-concept-design':'개념 Check DESIGN',
  'panel-mission':'미션 Check','panel-think':'생각 Check',
  'panel-grade-setting':'성적 Check SETTING','panel-contents':'각종 콘텐츠',
  'panel-archive':'아카이브','panel-settings-schedule':'설정 SCHEDULE',
  'panel-settings-system':'설정 SYSTEM','panel-settings-student':'설정 STUDENT',
  'panel-xp-settings':'경험치 설정'
};
const _mobileForced = new Set(); // 사용자가 '그래도 열기'로 통과시킨 패널
let _currentNav = 'dashboard', _currentPanelId = 'panel-dashboard';
function isMobileAdmin() { return window.matchMedia('(max-width:768px)').matches; }

function applyMobileGate(panelId, nav) {
  const notice = document.getElementById('mobilePcNotice');
  if (!notice) return;
  const panel = document.getElementById(panelId);
  // 모바일에서는 대시보드만 그대로 쓰고, 그 외 모든 패널은 PC 이용 안내를 띄운다.
  const gated = isMobileAdmin() && panelId !== 'panel-dashboard' && !_mobileForced.has(panelId);
  if (gated) {
    if (panel) panel.classList.remove('active');
    notice.dataset.panel = panelId;
    notice.dataset.nav   = nav || '';
    const nameEl = document.getElementById('mpnName');
    if (nameEl) nameEl.textContent = PANEL_LABELS[panelId] || '이 기능';
    notice.classList.add('show');
  } else {
    notice.classList.remove('show');
    if (panel && !panel.classList.contains('active')) panel.classList.add('active');
  }
}

function closeAdmDrawer() {
  document.querySelector('.adm-sidebar')?.classList.remove('open');
  document.getElementById('admSidebarScrim')?.classList.remove('open');
}

/* ── 버튼 폭 고정 ──
   어드민 버튼은 진행 상태에 따라 문구가 바뀐다("불러오기" → "불러오는 중…", "임시 저장" →
   "저장 중…"). 그때마다 폭이 달라지면 옆 버튼이 밀려 줄이 통째로 출렁이고 심하면 줄바꿈까지
   생긴다. 그래서 버튼마다 "지금까지 본 가장 넓은 폭"을 min-width로 박아 두고 다시는 줄어들지
   않게 한다. 문구를 바꾸는 코드가 스무 군데 넘게 흩어져 있어서, 각 호출부를 고치는 대신
   버튼 안 글자가 바뀌는 것을 MutationObserver로 감시해 한 곳에서 처리한다.
   숨어 있는 버튼은 폭이 0으로 잡히므로 건너뛰고, 패널이 보이는 순간 다시 잰다(switchNav). */
function pinButtonWidths(root) {
  (root || document).querySelectorAll('button').forEach(pinOneButton);
}
function pinOneButton(btn) {
  if (!btn || btn.offsetParent === null) return;      // 안 보이는 버튼은 폭이 0이라 의미 없다
  const w = btn.getBoundingClientRect().width;
  if (!w) return;
  const cur = parseFloat(btn.dataset.wpin || 0);
  if (w > cur + 0.5) {
    btn.dataset.wpin = w;
    btn.style.minWidth = Math.ceil(w) + 'px';
  }
}
function watchButtonWidths() {
  pinButtonWidths(document);
  new MutationObserver(muts => {
    const seen = new Set();
    muts.forEach(m => {
      const node = m.target.nodeType === 1 ? m.target : m.target.parentElement;
      const btn = node && node.closest ? node.closest('button') : null;
      if (btn && !seen.has(btn)) { seen.add(btn); pinOneButton(btn); }
    });
  }).observe(document.body, { subtree: true, childList: true, characterData: true });
}

function switchNav(nav, fromHistory) {
  // 웹앱 어드민 iframe이 열려있는 상태에서 다른 메뉴로 이동하면 오버레이부터 닫는다.
  const overlay = document.getElementById('app-admin-overlay');
  if (overlay && overlay.classList.contains('open')) window.closeAppAdmin();

  let mainNav = nav;
  for (const [parent, subs] of Object.entries(SUBNAV_MAP)) {
    if (subs.includes(nav)) { mainNav = parent; break; }
  }
  const subs = SUBNAV_MAP[mainNav];
  const isSub = !!subs && subs.includes(nav);

  // nav-item 활성화
  document.querySelectorAll('.nav-item').forEach(i => {
    i.classList.remove('active');
    if (i.classList.contains('has-sub')) i.classList.remove('open');
  });
  const activeItem = document.querySelector(`.nav-item[data-nav="${mainNav}"]`);
  if (activeItem) {
    activeItem.classList.add('active');
    if (activeItem.classList.contains('has-sub')) activeItem.classList.add('open');
  }

  // 서브메뉴 열기/닫기
  document.querySelectorAll('.nav-sub').forEach(s => s.classList.remove('open'));
  document.querySelectorAll('.nav-sub-item').forEach(i => i.classList.remove('active'));
  let subNav = mainNav;
  if (subs) {
    const sub = document.getElementById(`subnav-${mainNav}`);
    if (sub) sub.classList.add('open');
    subNav = isSub ? nav : subs[0];
    const activeSubItem = document.querySelector(`.nav-sub-item[data-subnav="${subNav}"]`);
    if (activeSubItem) activeSubItem.classList.add('active');
  }
  // 패널 전환
  document.querySelectorAll('.adm-panel').forEach(p => p.classList.remove('active'));
  const panelId = subs ? `panel-${subNav}` : `panel-${mainNav}`;
  const panel = document.getElementById(panelId);
  if (panel) panel.classList.add('active');

  // 서브메뉴가 있는 패널은 상단 제목을 "메뉴 제목 - 서브메뉴 제목"으로 통일해 보여준다.
  if (subs && panel) {
    const groupTitle = document.getElementById(`subnav-${mainNav}`)?.dataset.title || '';
    const subLabel = document.querySelector(`.nav-sub-item[data-subnav="${subNav}"]`)?.textContent.trim() || '';
    const titleEl = panel.querySelector('.panel-title');
    if (titleEl && groupTitle && subLabel) titleEl.textContent = `${groupTitle} - ${subLabel}`;
  }

  // 숨어 있던 동안엔 폭이 0이라 버튼 크기를 잴 수 없다. 패널이 보이는 순간 한 번 재서 고정한다.
  if (panel) requestAnimationFrame(() => pinButtonWidths(panel));

  // 개념 체크 · 디자인 패널은 숨겨진 동안 미리보기 폭 계산이 0이 되므로, 보일 때마다 다시 계산한다.
  if (panelId === 'panel-concept-design') requestAnimationFrame(rescalePreview);
  if (panelId === 'panel-think' && window.thMainRefresh) window.thMainRefresh();
  if (panelId === 'panel-archive') {
    if (typeof renderArchiveCards === 'function') renderArchiveCards();
    if (typeof renderArchiveCategoryEditor === 'function') renderArchiveCategoryEditor();
  }
  // XP 패널 진입 시 데이터 로드
  if (panelId === 'panel-xp-award'    && typeof xpManualLoadStudents === 'function') { xpEnsureConfig(); xpManualLoadStudents(); }
  if (panelId === 'panel-xp-ranking'  && typeof xpLoadStatus         === 'function') xpLoadStatus();
  if (panelId === 'panel-settings-student' && typeof stRenderTestIds === 'function') stRenderTestIds();
  if (panelId === 'panel-xp-settings' && typeof xpLoadSettings       === 'function') xpLoadSettings();
  if (panelId === 'panel-settings-schedule' && typeof plLoad         === 'function') plLoad();
  if (panelId === 'panel-dashboard') dbLoad();

  // 모바일: 저작 패널이면 안내 카드로 대체(강제 열기 전까지), 그리고 열린 드로어를 닫는다.
  _currentNav = nav; _currentPanelId = panelId;
  applyMobileGate(panelId, nav);
  closeAdmDrawer();

  // 메뉴 클릭으로 들어온 이동만 히스토리에 쌓는다(popstate로 되짚어온 이동은 다시 쌓지 않음) —
  // 이래야 "개념 Check → 생각 Check → 뒤로가기"가 로그인 화면이 아니라 개념 Check로 돌아간다.
  if (!fromHistory) { try { history.pushState({ nav }, '', location.href); } catch (e) {} }
}

window.addEventListener('popstate', e => {
  const nav = e.state && e.state.nav;
  if (nav) switchNav(nav, true);
});

// 사이드바의 미션 체크 서브메뉴에서 특정 웹앱 어드민을 바로 열 때: 카드 목록 패널로
// 이동한 뒤(switchNav) 그 자리에서 곧바로 오버레이를 띄우고, 클릭한 서브메뉴 항목만 active로 표시한다.
window.openMissionAppAdmin = function(el, adminUrl) {
  switchNav('mission');
  document.querySelectorAll('#subnav-mission .nav-sub-item').forEach(i => i.classList.remove('active'));
  el.classList.add('active');
  openAppAdmin(adminUrl);
};

window.openContentsAppAdmin = function(el, adminUrl) {
  switchNav('contents');
  document.querySelectorAll('#subnav-contents .nav-sub-item').forEach(i => i.classList.remove('active'));
  el.classList.add('active');
  openAppAdmin(adminUrl);
};

// ══════════ 대시보드 ══════════
let _dbConcept = [], _dbMission = [], _dbThink = [];
let _dbStuCount = 0, _dbToday = { attend: 0, thinkSubmit: 0, review: 0 };
let _dbStudents = []; // 학생 검색용 명단 캐시 ({studentId, name})
let _dbAnnList = []; // 공지사항(announcements 컬렉션, 패치노트 리스트, 최신순 최대 10건)
let _dbAnnEditId = null; // 수정 중인 공지 docId (null이면 새 글 작성 모드)
let _dbAutoOpen = false; // 수업일 자동 공개 사용 여부 (settings/lms_config.autoOpenBySchedule)
let _dbAutoOpened = []; // 이번 로드에서 자동 공개된 항목 이름 — 대시보드에 무엇이 열렸는지 알려준다

async function dbLoad() {
  const el = document.getElementById('db-content');
  if (el) el.innerHTML = '<div style="padding:32px;text-align:center;color:var(--sub);font-size:14px">불러오는 중...</div>';
  try {
    const today = kstDate(); // 한국시간 기준 (shared/util.js)

    // 개념 체크 강의 (상위 10)
    const clSnap = await getDocs(query(collection(db, 'class_lessons'), orderBy('order', 'desc')));
    _dbConcept = clSnap.docs.map(d => { const v = d.data(); return { docId: d.id, num: v.num, title: v.title || '', isOpen: v.isOpen !== false, autoOpenedAt: v.autoOpenedAt || null }; }).slice(0, 10);

    // 미션 체크 카드 (mission_category)
    let missionCat = '';
    try {
      const cfg = await getDoc(doc(db, 'settings', 'lms_config'));
      if (cfg.exists()) {
        missionCat  = cfg.data().mission_category || '';
        _dbAutoOpen = cfg.data().autoOpenBySchedule === true;
      }
    } catch (_) {}
    if (missionCat) {
      const mSnap = await getDocs(query(collection(db, 'cards'), where('category', '==', missionCat)));
      _dbMission = mSnap.docs.map(d => { const v = d.data(); return { docId: d.id, title: v.title || v.label || '', locked: v.locked === true, order: v.order ?? 999, lessonNum: v.lessonNum || '', autoOpenedAt: v.autoOpenedAt || null }; }).sort((a, b) => a.order - b.order);
    } else _dbMission = [];

    // 생각 체크 강의 (상위 10)
    const tlSnap = await getDocs(query(collection(db, 'think_lectures'), orderBy('createdAt', 'desc')));
    // order는 강 번호 기준 → 내림차순으로 강 번호 큰(최신) 강의가 맨 위. 개념 Check 카드와 방향 일치.
    // icon에 강의수("24"·"OT" 등)가 들어 있어 수업 스케줄 매칭에 쓴다(thScheduledDate와 같은 기준).
    _dbThink = tlSnap.docs.map(d => { const v = d.data(); return { docId: d.id, title: v.title || '', isOpen: v.isOpen === true, order: v.order ?? -1, ungraded: 0, icon: v.icon || '', autoOpenedAt: v.autoOpenedAt || null }; }).sort((a, b) => b.order - a.order).slice(0, 10);

    // 수업일이 지난 강의와 미션을 자동 공개(설정이 켜져 있을 때만, 항목당 한 번만).
    // 개념·미션·생각 세 가지를 모두 보므로 _dbThink까지 채운 뒤에 부른다.
    // 여기서 실패해도 대시보드 자체는 그대로 떠야 하므로 따로 감싼다.
    try { await dbAutoOpenBySchedule(); } catch (e) { console.warn('수업일 자동 공개 실패:', e); }

    // 제출물: 강의별 미채점 수 + 오늘 제출 수
    // 미채점 중 가장 최근 제출이 어느 반인지도 같이 기억해 둔다("채점" 버튼이 그 반으로 바로 열리게).
    const tsSnap = await getDocs(collection(db, 'think_submissions'));
    const ungraded = {};
    const newestUngraded = {}; // lectureDocId → { secs, cls }
    let thinkSubmit = 0;
    tsSnap.docs.forEach(d => {
      const s = d.data();
      if (isTestId(s.id)) return; // 테스트 학생 제출은 집계·채점대기에서 제외
      const secs = s.createdAt?.seconds;
      if (s.thGraded !== true) {
        ungraded[s.lectureDocId] = (ungraded[s.lectureDocId] || 0) + 1;
        const cls = parseInt(String(s.id || '').slice(1, 3), 10); // 학번 2~3번째 자리가 반
        const cur = newestUngraded[s.lectureDocId];
        if (cls >= 1 && cls <= 9 && (!cur || (secs || 0) > cur.secs)) {
          newestUngraded[s.lectureDocId] = { secs: secs || 0, cls };
        }
      }
      if (secs && kstDate(secs * 1000) === today) thinkSubmit++;
    });
    _dbThink.forEach(t => {
      t.ungraded    = ungraded[t.docId] || 0;
      t.ungradedCls = newestUngraded[t.docId]?.cls || 0;
    });

    // 학생 수 + 오늘 출석/복습(rtdb/xp)
    const stuSnap = await get(ref(rtdb, 'students'));
    const stuData = stuSnap.exists() ? (stuSnap.val() || {}) : {};
    _dbStudents = Object.values(stuData).filter(v => v && v.studentId).map(v => ({ studentId: String(v.studentId), name: v.name || v.studentName || '' }));
    _dbStuCount = _dbStudents.filter(s => !isTestId(s.studentId)).length; // 테스트 학생은 총원에서 제외(이름 조회는 유지)
    const xpSnap = await get(ref(rtdb, `${XP_ROOT}/students`));
    const xp = xpSnap.exists() ? (xpSnap.val() || {}) : {};
    let attend = 0, review = 0;
    Object.entries(xp).forEach(([sid, x]) => { if (!x || isTestId(sid)) return; if (x.lastAttendance === today) attend++; if (x.lastTypingReview === today) review++; });
    _dbToday = { attend, thinkSubmit, review };

    // 공지사항(패치노트 리스트, 최신 10건)
    try {
      const annSnap = await getDocs(query(collection(db, 'announcements'), orderBy('createdAt', 'desc')));
      _dbAnnList = annSnap.docs.map(d => { const v = d.data(); return { docId: d.id, title: v.title || '', body: v.body || '', createdAt: v.createdAt }; }).slice(0, 10);
    } catch(_) { _dbAnnList = []; }

    dbRender();
  } catch(e) {
    if (el) el.innerHTML = `<div style="padding:32px;color:var(--critical);font-size:14px">로드 실패: ${esc(e.message)}</div>`;
  }
}

// ── 수업일 자동 공개 ──────────────────────────────────────────────
// 수업 스케줄(class_progress/plan)에서 그 강의를 "가장 먼저 하는 반"의 수업일이 지나면,
// 개념 체크 강의(num), 생각 체크 질문(icon), 거기에 연결된 미션 카드(lessonNum)를
// 자동으로 공개로 돌린다. 셋 다 강의수를 들고 있어 같은 스케줄 행에 붙는다.
// 서버가 없는 정적 사이트라 어드민 대시보드를 열 때 돌아간다 — 즉 수업 날 아침 정각이 아니라
// 선생님이 그날 어드민을 여는 순간 반영된다.
//
// 항목당 딱 한 번만 연다(autoOpenedAt 기록). 그러지 않으면 일부러 비공개로 돌린 강의를
// 대시보드를 열 때마다 다시 공개로 뒤집어 버린다.

// 강의 번호 → 스케줄에서 가장 빠른 반의 수업일. 스케줄에 없거나 날짜가 하나도 없으면 null.
// 반 id를 가리지 않고 그 행의 모든 칸을 훑기 때문에, "반 추가"로 만들어 id가 c1~c6 형식이
// 아닌 반(plAddClass)도 그대로 계산에 들어간다.
function dbEarliestLessonDate(num) {
  const raw = String(num == null ? '' : num).trim();
  if (!raw) return null;
  const label = lecIsNum(raw) ? `${raw}강` : raw;
  const row = (_plData.rows || []).find(r => r.label === label);
  if (!row || !row.cells) return null;
  const today = plToday();
  let best = null;
  Object.values(row.cells).forEach(cell => {
    const d = plResolveDate(cell, today);
    if (d && (!best || d < best)) best = d;
  });
  return best;
}

async function dbAutoOpenBySchedule() {
  _dbAutoOpened = [];
  if (!_dbAutoOpen) return;
  await plEnsureLoaded();
  if (!(_plData.rows || []).length) return;
  const today = plToday();

  // 개념 체크 — _dbConcept는 강 번호 내림차순 상위 10개라 최근 강의만 대상이 된다(그걸로 충분).
  for (const t of _dbConcept) {
    if (t.isOpen || t.autoOpenedAt) continue;
    const d = dbEarliestLessonDate(t.num);
    if (!d || d > today) continue;
    try {
      await updateDoc(doc(db, 'class_lessons', t.docId), { isOpen: true, autoOpenedAt: serverTimestamp() });
      t.isOpen = true; t.autoOpenedAt = true;
      _dbAutoOpened.push(lecLabel(t.num, cleanTitle(t.title)));
    } catch (e) { console.warn('개념 체크 자동 공개 실패:', t.docId, e); }
  }

  // 미션 체크 — 카드에 적어 둔 "연결 강의번호"(lessonNum)로 같은 수업일을 따른다.
  for (const m of _dbMission) {
    if (!m.locked || m.autoOpenedAt || !m.lessonNum) continue;
    const d = dbEarliestLessonDate(m.lessonNum);
    if (!d || d > today) continue;
    try {
      await updateDoc(doc(db, 'cards', m.docId), { locked: false, autoOpenedAt: serverTimestamp() });
      m.locked = false; m.autoOpenedAt = true;
      _dbAutoOpened.push(cleanTitle(m.title));
    } catch (e) { console.warn('미션 카드 자동 공개 실패:', m.docId, e); }
  }

  // 생각 체크 — 강의수가 icon에 들어 있다(지연 제출 판정의 thScheduledDate와 같은 기준).
  for (const t of _dbThink) {
    if (t.isOpen || t.autoOpenedAt || !t.icon) continue;
    const d = dbEarliestLessonDate(t.icon);
    if (!d || d > today) continue;
    try {
      await updateDoc(doc(db, 'think_lectures', t.docId), { isOpen: true, autoOpenedAt: serverTimestamp() });
      t.isOpen = true; t.autoOpenedAt = true;
      _dbAutoOpened.push(cleanTitle(t.title));
    } catch (e) { console.warn('생각 체크 자동 공개 실패:', t.docId, e); }
  }
}

window.dbToggleAutoOpen = async function(el) {
  const on = !el.classList.contains('on');
  el.classList.toggle('on', on);
  try {
    await setDoc(doc(db, 'settings', 'lms_config'), { autoOpenBySchedule: on }, { merge: true });
    _dbAutoOpen = on;
    if (on) await dbLoad(); // 켜는 즉시 이미 수업일이 지난 항목들을 열어 준다
    else dbRender();
  } catch (e) {
    alert('설정 저장 실패: ' + e.message);
    el.classList.toggle('on', !on);
  }
};

function dbRender() {
  const el = document.getElementById('db-content');
  if (!el) return;
  const totalUngraded = _dbThink.reduce((a, t) => a + (t.ungraded || 0), 0);
  // 수정 중인 공지가 있으면 오른쪽 폼을 "수정" 모드로 그린다(_dbAnnEditId는 목록에서 "수정"을 누를 때 설정).
  const editing = _dbAnnEditId ? _dbAnnList.find(a => a.docId === _dbAnnEditId) : null;
  if (_dbAnnEditId && !editing) _dbAnnEditId = null; // 수정 중이던 글이 사라졌으면 작성 모드로 되돌린다
  el.innerHTML = `
    <div class="db-summary-row">
      <div class="db-summary-card"><div class="db-summary-label">오늘 출석</div><div class="db-summary-val">${_dbToday.attend} / ${_dbStuCount}명</div></div>
      <div class="db-summary-card"><div class="db-summary-label">오늘 생각체크 제출</div><div class="db-summary-val">${_dbToday.thinkSubmit}건</div></div>
      <div class="db-summary-card"><div class="db-summary-label">오늘 복습 퀴즈</div><div class="db-summary-val">${_dbToday.review}명</div></div>
      <div class="db-summary-card"><div class="db-summary-label">채점 대기(생각체크)</div><div class="db-summary-val" style="color:${totalUngraded ? 'var(--critical)' : 'var(--text)'}">${totalUngraded}건</div></div>
      <div class="db-summary-card db-autoopen"><div class="db-summary-label">수업일 자동 공개</div><div class="th-toggle ${_dbAutoOpen ? 'on' : ''}" onclick="dbToggleAutoOpen(this)"></div></div>
    </div>
    ${_dbAutoOpened.length ? `<div class="db-autoopen-done">수업일이 되어 ${_dbAutoOpened.length}개를 공개했습니다 — ${esc(_dbAutoOpened.join(', '))}</div>` : ''}
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px">
      ${dbToggleCard('개념 Check', _dbConcept, 'concept')}
      ${dbToggleCard('미션 Check', _dbMission, 'mission')}
      ${dbToggleCard('생각 Check', _dbThink, 'think')}
    </div>
    <div class="stu-card" style="margin-top:14px">
      <div class="stu-card-head">학생 검색</div>
      <div style="display:flex;gap:8px;padding:12px 18px 0">
        <input id="db-stu-q" class="stu-edit-input" style="flex:1" inputmode="numeric" maxlength="5" placeholder="학번 5자리 입력" onkeydown="if(event.key==='Enter')dbStudentSearch()">
        <button class="add-btn" onclick="dbStudentSearch()">검색</button>
      </div>
      <div id="db-stu-result" style="padding:10px 18px 14px"></div>
    </div>
    <div class="stu-card" style="margin-top:14px">
      <div class="stu-card-head">공지사항</div>
      <div class="db-ann-grid">
        <div>
          <div class="db-ann-col-head">등록된 공지</div>
          <div id="db-ann-list">${dbAnnListHTML()}</div>
        </div>
        <div>
          <div class="db-ann-col-head">${editing ? '공지 수정' : '새 공지 작성'}</div>
          <input id="db-ann-title" class="stu-edit-input" style="width:100%" maxlength="60" placeholder="제목(선택)" value="${editing ? esc(editing.title || '') : ''}">
          <textarea id="db-ann-body" class="stu-edit-input" style="width:100%;height:120px;resize:vertical;border-radius:10px;margin-top:8px" placeholder="예) 8월 25일(화) 역사 수행평가는 개념 체크 3~5강 범위입니다.">${editing ? esc(editing.body || '') : ''}</textarea>
          <div style="display:flex;gap:8px;margin-top:10px">
            <button class="add-btn" onclick="dbPostAnnouncement()">${editing ? '저장하기' : '게시하기'}</button>
            ${editing ? '<button class="stu-btn stu-btn-cancel" onclick="dbCancelAnnEdit()">취소</button>' : ''}
          </div>
        </div>
      </div>
    </div>`;
}

// 대시보드 공지사항 — announcements 컬렉션(패치노트 리스트). 각 글은 오른쪽 폼에서 수정하거나 삭제한다.
function dbAnnListHTML() {
  if (!_dbAnnList.length) return '<p style="font-size:13px;color:var(--sub);padding:4px 0">등록된 공지가 없습니다.</p>';
  return _dbAnnList.map(a => `
    <div class="db-ann-item${a.docId === _dbAnnEditId ? ' editing' : ''}">
      <div class="db-ann-item-title">${esc(a.title || '(제목 없음)')}</div>
      <div class="db-ann-item-date">${dbAnnDate(a.createdAt)}</div>
      <div class="db-ann-item-btns">
        <button class="stu-btn stu-btn-edit" style="padding:6px 12px;font-size:12px" onclick="dbEditAnnouncement('${a.docId}')">수정</button>
        <button class="stu-btn stu-btn-del" style="padding:6px 12px;font-size:12px" onclick="dbDeleteAnnouncement('${a.docId}')">삭제</button>
      </div>
    </div>`).join('');
}

function dbAnnDate(ts) {
  if (!ts || !ts.seconds) return '방금 전';
  const d = new Date(ts.seconds * 1000);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

// 목록의 "수정"을 누르면 오른쪽 폼이 그 글의 내용으로 채워진 수정 모드로 바뀐다.
window.dbEditAnnouncement = function(docId) {
  _dbAnnEditId = docId;
  dbRender();
  document.getElementById('db-ann-body')?.focus();
};

window.dbCancelAnnEdit = function() {
  _dbAnnEditId = null;
  dbRender();
};

// 새 글이면 게시, 수정 모드면 그 글을 덮어쓴다. 작성 시각(createdAt)은 수정해도 그대로 둔다.
window.dbPostAnnouncement = async function() {
  const titleEl = document.getElementById('db-ann-title');
  const bodyEl  = document.getElementById('db-ann-body');
  const title = (titleEl?.value || '').trim();
  const body  = (bodyEl?.value  || '').trim();
  if (!body) { alert('내용을 입력해 주세요.'); return; }
  try {
    if (_dbAnnEditId) {
      const docId = _dbAnnEditId;
      await updateDoc(doc(db, 'announcements', docId), { title, body });
      const t = _dbAnnList.find(a => a.docId === docId);
      if (t) { t.title = title; t.body = body; }
      _dbAnnEditId = null;
    } else {
      const docRef = await addDoc(collection(db, 'announcements'), { title, body, createdAt: serverTimestamp() });
      _dbAnnList = [{ docId: docRef.id, title, body, createdAt: null }, ..._dbAnnList].slice(0, 10);
    }
    dbRender();
  } catch(e) { alert((_dbAnnEditId ? '저장' : '게시') + ' 실패: ' + e.message); }
};

window.dbDeleteAnnouncement = async function(docId) {
  if (!confirm('이 공지를 삭제할까요? 학생 화면에서도 바로 사라집니다.')) return;
  try {
    await deleteDoc(doc(db, 'announcements', docId));
    _dbAnnList = _dbAnnList.filter(a => a.docId !== docId);
    if (_dbAnnEditId === docId) _dbAnnEditId = null; // 수정 중이던 글을 지웠으면 폼도 작성 모드로
    dbRender();
  } catch(e) { alert('삭제 실패: ' + e.message); }
};

// 대시보드 학생 검색 — 학번으로 이름·성적(달성 현황)·피드백을 보고 PW 초기화까지 한다.
// 모바일에서도 쓸 수 있게 대시보드에 둔다(비밀번호 초기화를 휴대폰으로 해야 할 때 대비).
window.dbStudentSearch = async function() {
  const box = document.getElementById('db-stu-result');
  if (!box) return;
  const sid = (document.getElementById('db-stu-q')?.value || '').trim();
  if (!sid) { box.innerHTML = ''; return; }
  const stu = _dbStudents.find(s => s.studentId === sid);
  const name = stu ? stu.name : '(명단에 없음)';
  box.innerHTML = '<div style="color:var(--sub);font-size:13px">불러오는 중...</div>';
  try {
    const [snap, xpSnap] = await Promise.all([
      getDocs(query(collection(db, 'grade_records'), where('studentId', '==', sid))),
      get(ref(rtdb, 'xp/students')),
    ]);
    await xpEnsureConfig();
    const recs = snap.docs.map(d => d.data());
    const recByKey = {};
    const fbs = [];
    recs.forEach(r => {
      if (r.lessonKey) recByKey[r.lessonKey] = r;
      if (r.feedback && String(r.feedback).trim()) fbs.push({ key: r.lessonKey || '', text: String(r.feedback).trim() });
    });

    // 성적 Check(GRADE)와 동일하게 계산해서 요약만 보여준다.
    const score = await dbComputeStudentScore(recByKey, sid);

    // 경험치 + 랭킹(전체 학생 대비, 동률 규칙 적용)
    const xpAll   = xpSnap.exists() ? (xpSnap.val() || {}) : {};
    const my      = xpAll[sid] || { total: 0 };
    const myTotal = my.total || 0;
    const lv      = my.level || calcLevel(myTotal, _xpCfg?.levels, _xpCfg?.levelFormula);
    const ranked  = xpBuildRanking(xpAll);
    const mine    = ranked.find(e => e.sid === sid);
    const isShared = mine && ranked.filter(e => e.rank === mine.rank).length > 1;
    const rankTxt = isTestId(sid)
      ? '테스트 계정 (순위 제외)'
      : (mine ? `${isShared ? '공동 ' : ''}${mine.rank}위 / ${ranked.length}명` : '기록 없음');

    box.innerHTML = `
      <div class="dbs-head">
        <div class="dbs-name">${esc(name)}<span class="sid">${esc(sid)}</span></div>
        <button class="chip-btn" onclick="dbResetPw('${esc(sid)}','${esc(name)}')">PW 초기화</button>
      </div>

      <div class="dbs-sec">
        <div class="dbs-sec-label">실시간 포트폴리오 점수</div>
        ${dbRenderScoreChips(score, recs.length)}
      </div>

      <div class="dbs-sec">
        <div class="dbs-sec-label">경험치</div>
        <div class="dbs-xp">
          <div class="dbs-xp-info">누적 <b>${myTotal.toLocaleString()} 경험치</b> / Lv.${lv} / 랭킹 ${rankTxt}</div>
          <button class="chip-btn danger" style="margin-left:auto" onclick="dbResetXp('${esc(sid)}','${esc(name)}')">경험치 초기화</button>
        </div>
      </div>

      <div class="dbs-sec">
        <div class="dbs-sec-label">선생님 피드백</div>
        ${fbs.length
          ? `<button class="chip-btn" onclick="this.nextElementSibling.classList.toggle('open')">피드백 ${fbs.length}건 보기</button>
             <div class="dbs-fb-list">${fbs.map(f => `<div class="dbs-fb-item"><span class="lec">${esc(String(f.key))}</span>${esc(f.text)}</div>`).join('')}</div>`
          : `<div style="font-size:13px;color:var(--sub)">등록된 피드백이 없어요.</div>`}
      </div>
    `;
  } catch(e) {
    box.innerHTML = `<div style="color:var(--critical);font-size:13px">불러오기 실패: ${esc(e.message)}</div>`;
  }
};

// 대시보드 학생 경험치 초기화 — 초기화 후 검색 결과를 다시 그린다.
window.dbResetXp = async function(sid, name) {
  if (!confirm(`${name}(${sid}) 학생의 경험치를 초기화할까요?\n누적 경험치, 레벨, 적립 기록이 모두 0으로 돌아갑니다.`)) return;
  try {
    await set(ref(rtdb, `xp/students/${sid}`), { name, total: 0, level: 1 });
    if (_xpStuAll && _xpStuAll[sid]) _xpStuAll[sid] = { name, total: 0, level: 1 };
    dbStudentSearch();
  } catch(e) { alert('초기화 실패: ' + e.message); }
};

// 성적 Check(GRADE, loadScoreData)의 계산 로직을 한 학생분만 그대로 재현한다.
// grade_settings/config 급간·반영 강의 + grade_lecture_config 미실시/가중치를 반영한다.
// 학생 index.js(loadStudentGrade)와 동일하게, "성적 반영하기"로 실제 반영된(grade_publish_status) 강의만 집계한다.
// 반환: { concept, mission, think, total, maxScore, lectureCount } 또는 null(설정 없음)
async function dbComputeStudentScore(recByKey, sid) {
  const settingsSnap = await getDoc(doc(db, 'grade_settings', 'config'));
  if (!settingsSnap.exists()) return null;
  const { selectedLectures = [], bands = [] } = settingsSnap.data();
  if (!selectedLectures.length || !bands.length) return null;

  const classNum = Math.floor((parseInt(sid) - 30000) / 100);
  const publishChecks = await Promise.all(selectedLectures.map(async key => {
    try {
      const snap = await getDoc(doc(db, 'grade_publish_status', `${key}_${classNum}`));
      return { key, published: snap.exists() && snap.data().published === true };
    } catch { return { key, published: false }; }
  }));
  const publishedLectures = publishChecks.filter(p => p.published).map(p => p.key);

  const enabledMap = {};
  await Promise.all(publishedLectures.map(async key => {
    try {
      const snap = await getDoc(doc(db, 'grade_lecture_config', key));
      const d = snap.exists() ? snap.data() : {};
      enabledMap[key] = {
        concept: d.conceptEnabled !== false, mission: d.missionEnabled !== false, think: d.thinkEnabled !== false,
        conceptWeight: parseInt(d.conceptWeight) || 1, missionWeight: parseInt(d.missionWeight) || 1, thinkWeight: parseInt(d.thinkWeight) || 1,
      };
    } catch(e) { enabledMap[key] = { concept:true, mission:true, think:true, conceptWeight:1, missionWeight:1, thinkWeight:1 }; }
  }));

  const calcScore = (achieved, total, type) => {
    if (!total) return { achieved:0, total:0, pct:0, score:0 };
    const pct = Math.round(achieved / total * 100);
    const band = bands.find(b => pct >= b.min) || bands[bands.length-1];
    return { achieved, total, pct, score: band ? (band[type]||0) : 0 };
  };

  let cA=0, cN=0, mA=0, mN=0, tA=0, tN=0;
  publishedLectures.forEach(key => {
    const en = enabledMap[key];
    const rec = recByKey[key];
    if (en.concept) { cN += 2*en.conceptWeight; if (rec?.concept?.achieved) cA += en.conceptWeight; if (rec?.concept?.onTime) cA += en.conceptWeight; }
    if (en.mission) { mN += 2*en.missionWeight; if (rec?.mission?.achieved) mA += en.missionWeight; if (rec?.mission?.onTime) mA += en.missionWeight; }
    if (en.think)   { tN += 2*en.thinkWeight;   if (rec?.think?.achieved)   tA += en.thinkWeight;   if (rec?.think?.onTime)   tA += en.thinkWeight; }
  });
  const concept = calcScore(cA, cN, 'concept');
  const mission = calcScore(mA, mN, 'mission');
  const think   = calcScore(tA, tN, 'think');
  const maxScore = (bands[0]?.concept||0) + (bands[0]?.mission||0) + (bands[0]?.think||0);
  return { concept, mission, think, total: concept.score + mission.score + think.score, maxScore, lectureCount: publishedLectures.length };
}

// 포트폴리오 점수 요약 — 세부(달성·%)는 성적 Check에서 확인하고, 여기선 체크 3개 점수 + 총점만.
function dbRenderScoreChips(s, recCount) {
  if (!s) {
    return `<div style="font-size:13px;color:var(--sub)">성적 설정(반영 강의와 급간)이 없어 점수를 계산할 수 없어요. <span>(성적 기록 ${recCount}건)</span></div>`;
  }
  const chip = (k, v, cls = '') => `<div class="dbs-score ${cls}"><div class="k">${k}</div><div class="v">${v}</div></div>`;
  return `<div class="dbs-scorerow">
    ${chip('개념체크', s.concept.score)}
    ${chip('미션체크', s.mission.score)}
    ${chip('생각체크', s.think.score)}
    ${chip('총점', `${s.total}<span style="font-size:12px;color:var(--sub);font-weight:600"> / ${s.maxScore}</span>`, 'total')}
  </div>`;
}

// 학생이 LMS 로그인 때 설정한 비밀번호(lms_auth/{학번})를 지워 초기화한다(다음 로그인 때 재설정).
window.dbResetPw = async function(sid, name) {
  if (!confirm(`${name}(${sid}) 학생의 비밀번호를 초기화할까요?\n다음 로그인 때 새 비밀번호를 설정하게 됩니다.`)) return;
  try {
    await deleteDoc(doc(db, 'lms_auth', sid));
    alert('비밀번호가 초기화되었어요.');
  } catch(e) {
    alert('초기화 실패: ' + e.message);
  }
};

function dbToggleCard(title, list, kind) {
  const rows = !list.length
    ? '<div class="empty-panel" style="padding:14px;font-size:13px">항목 없음</div>'
    : list.map(item => {
        const open = kind === 'mission' ? !item.locked : item.isOpen;
        const clean = String(item.title || '').replace(/\*\*/g, '').replace(/[{}]/g, ''); // 편집기호 제거
        const label = kind === 'concept' ? lecLabel(item.num, esc(clean)) : esc(clean);
        // 채점 버튼: 미채점이 남아 있으면 그중 가장 최근 제출이 있는 반으로 바로 열어 준다.
        const gradeBtn = kind === 'think'
          ? `<button class="add-btn" style="font-size:11px;padding:3px 9px"${item.ungradedCls ? ` title="미채점이 남은 ${item.ungradedCls}반으로 이동"` : ''} onclick="dbGoGrade('${item.docId}',${item.ungradedCls || 0})">채점${item.ungraded ? ` <b>${item.ungraded}</b>${item.ungradedCls ? ` (${item.ungradedCls}반)` : ''}` : ''}</button>`
          : '';
        const editBtn =
            kind === 'concept' ? `<button class="add-btn" style="font-size:11px;padding:3px 9px" onclick="dbEditLesson('${esc(String(item.num))}')">수정</button>`
          : kind === 'mission' ? `<button class="add-btn" style="font-size:11px;padding:3px 9px" onclick="dbEditMission()">수정</button>`
          : kind === 'think'   ? `<button class="add-btn" style="font-size:11px;padding:3px 9px" onclick="dbEditThink()">수정</button>`
          : '';
        return `<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 0;border-bottom:1px solid var(--hairline-soft)">
            <span style="font-size:13px;font-weight:600;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${label}</span>
            <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
              ${gradeBtn}${editBtn}
              <div class="th-toggle ${open ? 'on' : ''}" onclick="dbToggle('${kind}','${item.docId}',this)"></div>
            </div>
          </div>`;
      }).join('');
  return `<div class="stu-card"><div class="stu-card-head">${title} 공개 관리</div><div style="padding:6px 18px 14px">${rows}</div></div>`;
}

window.dbToggle = async function(kind, docId, el) {
  const on = !el.classList.contains('on');
  el.classList.toggle('on', on);
  try {
    if (kind === 'concept')      { await updateDoc(doc(db, 'class_lessons', docId), { isOpen: on }); const t = _dbConcept.find(x => x.docId === docId); if (t) t.isOpen = on; }
    else if (kind === 'mission') { await updateDoc(doc(db, 'cards', docId), { locked: !on });        const t = _dbMission.find(x => x.docId === docId); if (t) t.locked = !on; }
    else                         { await updateDoc(doc(db, 'think_lectures', docId), { isOpen: on }); const t = _dbThink.find(x => x.docId === docId); if (t) t.isOpen = on; }
  } catch(e) {
    alert('변경 실패: ' + e.message);
    el.classList.toggle('on', !on);
  }
};

// 대시보드 → 개념 체크 CONTENT 편집으로 이동해 해당 강의를 바로 연다.
window.dbEditLesson = function(num) {
  switchNav('concept-content');
  const sel = document.getElementById('lesson-select');
  if (sel) sel.value = num;
  onLessonChange(num);
};

// 대시보드 → 생각 체크(해당 강의 선택 후 채점 화면)로 이동해 바로 채점하게 한다.
// cls를 주면 그 반이 선택된 채로 열린다(미채점이 남은 반). 반 태그를 그리는 thBuildClassTags가
// th-sel-cls의 현재 값을 그대로 살려 쓰므로, 화면을 그리기 전에 미리 넣어 둔다.
window.dbGoGrade = function(lecId, cls) {
  switchNav('think');
  const sel = document.getElementById('th-sel-cls-lec');
  if (sel) sel.value = lecId;
  const clsSel = document.getElementById('th-sel-cls');
  if (clsSel && cls) clsSel.value = String(cls);
  if (window.thMainSelect) window.thMainSelect();
  if (window.thMainGrade) window.thMainGrade();
};

// 대시보드 → 미션 체크(카드 목록) 편집 화면으로 이동.
window.dbEditMission = function() { switchNav('mission'); };

// 대시보드 → 생각 체크(강의·질문 편집) 화면으로 이동.
window.dbEditThink = function() { switchNav('think'); };

// ── Firestore: lms_items (개념·미션·생각 섹션용) ──
let _items = [];
function startListening() {
  const q = query(collection(db, 'lms_items'), orderBy('order', 'asc'));
  onSnapshot(q, snap => {
    _items = snap.docs.map(d => ({ docId: d.id, ...d.data() }));
  });
}

// ══════════ 개념 체크 (class/admin.html 이식) ══════════
// slide-render.js(classic script, 전역 SlideRender)와 slide-style.css를 그대로 이어받아
// 학생 화면(class/lesson.html)과 미리보기가 항상 100% 동일하게 렌더링되도록 한다.
// 글꼴 크기 항목 정의는 slide-render.js의 FONT_SPEC 한 곳에만 둔다 — 어드민 패널과
// 수업 화면(lecture.html)이 같은 표를 읽어야 항목이 어긋나지 않는다.
const CE_FONT_KEYS = SlideRender.FONT_KEYS;
const CE_FONT_VAR_MAP = SlideRender.FONT_VARS;
const CE_LH_KEYS = ['body','label','obj','think','thinkGuide'];
const CE_LH_VAR_MAP = {
  body: '--lh-body', label: '--lh-label', obj: '--lh-obj',
  think: '--lh-question', thinkGuide: '--lh-think-guide',
};
const CE_SD = {
  fonts: { title: 40, body: 60, label: 70, obj: 70, cover: 200, coverTagline: 40, coverMeta: 40, think: 80, thinkGuide: 50,
    coverScript: 680, coverNum: 100, diveQ: 80, diveGuide: 50, diveKicker: 40, badge: 30, qtSub: 40, qtText: 60, qtSrc: 40,
    chosung: 48, chosungNum: 110,
    colsTitle: 70, colsHead: 60, colsBody: 60 },
  lineHeights: { body: 1.6, label: 1.6, obj: 1.6, think: 1.6, thinkGuide: 1.6 },
  letterSpacing: -15, // -20~10 슬라이더 값, 100분의 1em 단위 (-15 = -0.15em)
  textWidth: 95,      // % (장평, scaleX = 값/100)
  fontFamily: "'Pretendard', 'Apple SD Gothic Neo', sans-serif",
  navy: '#27384F', red: '#FF6B3D',
  bg: '#F0F0EF', slideBg: '#F0F0EF', rowBg: '#FFFFFF', text: '#1E293B',
  thinkGuideColor: '#6b675e',
  badgeColor: '#27384F'
};
const CE_LESSON_DEFAULTS = {
  '23': {
    lesson: {
      num: '23', title: '고려의 사회, 고려의 문화',
      unit: 'Ⅲ-4. 고려의 생활과 문화', page: 'p.96~103',
      objectives: [
        '고려 사회의 모습을 가족 제도를 중심으로 설명할 수 있다.',
        '종교, 사상, 학문 등을 통해 고려 문화의 특징을 말할 수 있다.'
      ]
    },
    contentLines: [
      { type: 'divider', title: '고려 사회의 모습' },
      { type: 'row', label: '사회 정책', items: ['① 제도 마련 : {농민}의 보호를 위해 마련, 농사철에 농민 {노동력} 동원 금지, 자연재해 피해 시 세금 감면', '② {의창} : 백성에게 곡식 빌려주었다가 추수한 다음 갚도록 함', '③ {동서 대비원} : 국립 의료 기관, 의료 사업 뿐만 아니라 구제 기관 역할'] },
      { type: 'divider', title: '고려 사회의 모습' },
      { type: 'row', label: '가족 제도', items: ['① 구성 : {소가족} 중심, {일부일처제}, 이혼과 재혼 가능 (재혼한 여성과 자녀는 차별 없음)', '② 특징 : {처가살이}하는 경우 많음, 외가 친척도 동일하게 혜택, {조혼} 풍속 유행 (고려 후기), 자녀 {균분} 상속 원칙'] },
      { type: 'divider', title: '고려 사회의 모습' },
      { type: 'row', label: '여성 지위', items: ['① 특징 : 사회 활동에는 {제한}이 있지만, {일상생활}에서는 남성과 거의 대등한 위치', '② 호적 : 남녀 구분 없이 {태어난} 순서대로 기록, 여성이 {호주}가 되기도 함'] },
      { type: 'divider', title: '고려의 사상' },
      { type: 'row', label: '불교', items: ['① 불교 장려 : 국가의 지원 받으며 발전, {연등회}·{팔관회} 등 개최, {대장경} 간행', '② {의천} : {교종} 중심으로 {선종} 통합({교관겸수}), 해동 천태종 창시', '③ {지눌} : {선종} 중심으로 {교종} 포용({정혜쌍수}), 수선사 결사 운동 주장'] },
      { type: 'divider', title: '고려의 사상' },
      { type: 'row', label: '도교', items: ['① {도교} : 국가의 평안을 기원하는 행사 개최', '② {풍수지리설} : {도참}사상(미래 예언하는 사상)과 결합, {묘청의 난}에 영향'] },
      { type: 'row', label: '유학', items: ['① 유학 중시 : {과거제} 실시, {최충}의 9재 학당 설립 후 {사학} 12도 발전, 무신 집권기에는 크게 위축', '② {성리학} : 인간의 심성과 우주의 원리 문제를 철학적으로 탐구하는 신유학', ' {원}으로부터 수용, {안향}이 소개 → 신진 사대부 중심으로 발전, 조선 건국의 사상적 기반'] },
      { type: 'divider', title: '고려의 사상 — 역사서' },
      { type: 'row', label: '역사서', items: ['① {『삼국사기』}(김부식) : 현존하는 가장 오래된 역사서, {유교}적 입장에서 편찬, {신라} 계승 의식 엿보임', '② {『삼국유사』}(일연) : 삼국시대의 역사 기록, {단군왕검}의 고조선 건국 이야기 수록', '③ {『동명왕편』}(이규보) : {고구려} 계승 의식 반영', '④ {『제왕운기』}(이승휴) : 우리와 중국의 역사를 {시}의 형식으로 정리'] },
      { type: 'divider', title: '불교 문화의 발달' },
      { type: 'row', label: '불교 문화', items: ['① 불상 : 거대한 {석불}과 대형 {철불} 조성, 관촉사 석조 미륵보살 입상 등 조성', '② 석탑 : 신라 계승하여 {3층 석탑} 조성, {다}각 {다}층탑 유행, 승탑 제작', '③ 불화 : 왕실과 귀족의 후원', '④ 건축 : {봉정사} 극락전, {부석사} 무량수전, {수덕사} 대웅전'] },
      { type: 'divider', title: '불교 문화의 발달' },
      { type: 'row', label: '인쇄술', items: ['① 목판 인쇄술 : {팔만대장경} 제작', '② 금속 활자 발명 : {『상정고금예문』}(1234), {『직지심체요절』}(1377)'] },
      { type: 'row', label: '공예', items: ['① 청자 : 기술 발달시켜 {상감 청자} 제작, 나전 칠기 발전, 은입사 기법 발달'] }
    ],
    think: {
      question: '고려의 사회, 문화 모습 중\n현재 우리에게 가장 필요한 것은 무엇일까?',
      guide: '핸드폰 등 모바일 기기로 QR 코드 접속 후\n오늘의 질문에 대한 본인의 생각을\n50자 이상 작성해 주세요.'
    }
  }
};

let ceCs = {}, ceCd = {};
let ceCurrentLessonNum = '';

function switchSubTab(name) {
  document.querySelectorAll('.sub-tab').forEach(t => t.classList.toggle('active', t.dataset.sub === name));
  document.querySelectorAll('.sub-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('sub-' + name).classList.add('active');
  requestAnimationFrame(() => document.getElementById('sub-' + name).querySelectorAll('textarea').forEach(autoResizeTa));
}

// ── 미리보기 스케일 ──
function rescalePreview() {
  const outer = document.getElementById('design-pv-outer');
  const inner = document.getElementById('design-pv-inner');
  if (!outer || !inner) return;
  const scale = outer.clientWidth / 1920;
  inner.style.transform = `scale(${scale})`;
  outer.style.height = (1080 * scale) + 'px';
}
window.addEventListener('resize', rescalePreview);

// ── 디자인 탭 ──
// 폰트 크기·색상은 강의별이 아니라 전체 공통 설정이라 settings/class_design 문서 하나에 저장한다.
async function ceInitDesign() {
  const snap = await getDoc(doc(db, 'settings', 'class_design'));
  if (snap.exists()) {
    ceCs = ceDeepMerge(CE_SD, snap.data());
  } else {
    // 학생 페이지도 같은 값을 봐야 하므로 기본값을 바로 Firestore에도 기록해둔다.
    ceCs = ceDeepMerge(CE_SD, {});
    await setDoc(doc(db, 'settings', 'class_design'), ceCs);
  }
  ceLoadDesignInputs();
  ceRenderPreview();
  ceApplyDesignPreview();
  requestAnimationFrame(rescalePreview);
}

/* 글꼴 크기 패널을 FONT_SPEC대로 그린다. 항목이 50개 가까이 되므로 섹션(표지/Dive/개념/
   미션/생각)마다 접었다 펴는 형태로 두고, 그 안에서 슬라이드 형식별로 묶는다.
   슬라이더 개수가 많아 HTML로 일일이 적어 두면 관리가 안 되므로 스펙에서 생성한다. */
let _fontPanelDrawn = false;
function ceRenderFontPanel() {
  const wrap = document.getElementById('fs-panel');
  if (!wrap || _fontPanelDrawn) return;
  const row = r => {
    const min = r.min != null ? r.min : 10;
    const max = r.max != null ? r.max : 200;
    return `<div class="fs-row">
      <span class="fs-name">${esc(r.label)}</span>
      <input type="range" class="fs-slider" id="fs-${r.key}" min="${min}" max="${max}" step="1" oninput="onFsSliderInput('${r.key}')">
      <input type="number" class="fs-val" id="fv-${r.key}" min="${min}" max="${max}" oninput="onFsNumberInput('${r.key}')">
    </div>`;
  };
  wrap.innerHTML = SlideRender.FONT_SPEC.map((sec, i) => `
    <details class="fs-sec"${i === 0 ? ' open' : ''}>
      <summary class="fs-sec-sum">${esc(sec.name)}</summary>
      <div class="fs-sec-body">
        ${sec.groups.map(g => `
          <div class="fs-group">
            ${sec.groups.length > 1 || g.name !== sec.name ? `<div class="fs-section">${esc(g.name)}</div>` : ''}
            ${g.rows.map(row).join('')}
          </div>`).join('')}
      </div>
    </details>`).join('');
  _fontPanelDrawn = true;
}

function ceLoadDesignInputs() {
  // 예전 설정(label/body/bodyMission 3개)만 있으면 형식별 값으로 펴 준다.
  // 이미 있는 값은 그대로 두므로 처음 열었을 때 화면이 지금과 똑같다.
  const f = SlideRender.normalizeFonts(ceCs.fonts);
  ceCs.fonts = f;
  ceRenderFontPanel();
  CE_FONT_KEYS.forEach(k => {
    const s = document.getElementById('fs-' + k), n = document.getElementById('fv-' + k);
    if (s) s.value = f[k];
    if (n) n.value = f[k];
  });
  const lh = ceCs.lineHeights || CE_SD.lineHeights;
  CE_LH_KEYS.forEach(k => {
    document.getElementById('lh-' + k).value = lh[k];
    document.getElementById('lv-' + k).value = lh[k];
  });
  const ls = ceCs.letterSpacing ?? CE_SD.letterSpacing;
  const tw = ceCs.textWidth ?? CE_SD.textWidth;
  document.getElementById('ls-global').value = ls; document.getElementById('lsv-global').value = ls;
  document.getElementById('tw-global').value = tw; document.getElementById('twv-global').value = tw;
  document.getElementById('c-navy').value    = ceCs.navy;
  document.getElementById('c-red').value     = ceCs.red;
  document.getElementById('c-bg').value      = ceCs.bg;
  document.getElementById('c-slidebg').value = ceCs.slideBg;
  document.getElementById('c-rowbg').value   = ceCs.rowBg;
  document.getElementById('c-text').value    = ceCs.text;
  document.getElementById('c-thinkGuide').value = ceCs.thinkGuideColor || CE_SD.thinkGuideColor;
  document.getElementById('c-badge').value      = ceCs.badgeColor      || CE_SD.badgeColor;
  document.getElementById('ff-family').value    = ceCs.fontFamily       || CE_SD.fontFamily;
}

function ceReadDesignInputs() {
  // 예전 키(label/body/bodyMission)는 이제 슬라이더가 없지만, 값은 그대로 들고 간다.
  // 스펙에 아직 안 올라온 규칙이 남아 있어도 예전처럼 동작하게 하는 안전판이다.
  const prev = ceCs.fonts || {};
  const fonts = { label: prev.label, body: prev.body, bodyMission: prev.bodyMission };
  CE_FONT_KEYS.forEach(k => {
    const el = document.getElementById('fs-' + k);
    if (el) fonts[k] = +el.value;
    else if (prev[k] != null) fonts[k] = prev[k];
  });
  const lineHeights = {};
  CE_LH_KEYS.forEach(k => { lineHeights[k] = +document.getElementById('lh-' + k).value; });
  ceCs = {
    fonts,
    lineHeights,
    letterSpacing: +document.getElementById('ls-global').value,
    textWidth:     +document.getElementById('tw-global').value,
    fontFamily:    document.getElementById('ff-family').value,
    navy:    document.getElementById('c-navy').value,
    red:     document.getElementById('c-red').value,
    bg:      document.getElementById('c-bg').value,
    slideBg: document.getElementById('c-slidebg').value,
    rowBg:   document.getElementById('c-rowbg').value,
    text:    document.getElementById('c-text').value,
    thinkGuideColor: document.getElementById('c-thinkGuide').value,
    badgeColor: document.getElementById('c-badge').value,
  };
}

function onFsSliderInput(k) {
  document.getElementById('fv-' + k).value = document.getElementById('fs-' + k).value;
  ceReadDesignInputs();
  ceApplyDesignPreview();
}
function onFsNumberInput(k) {
  const v = document.getElementById('fv-' + k).value;
  if (v === '') return;
  document.getElementById('fs-' + k).value = v;
  ceReadDesignInputs();
  ceApplyDesignPreview();
}
function onLhSliderInput(k) {
  document.getElementById('lv-' + k).value = document.getElementById('lh-' + k).value;
  ceReadDesignInputs();
  ceApplyDesignPreview();
}
function onLhNumberInput(k) {
  const v = document.getElementById('lv-' + k).value;
  if (v === '') return;
  document.getElementById('lh-' + k).value = v;
  ceReadDesignInputs();
  ceApplyDesignPreview();
}
function onLsSliderInput() {
  document.getElementById('lsv-global').value = document.getElementById('ls-global').value;
  ceReadDesignInputs();
  ceApplyDesignPreview();
}
function onLsNumberInput() {
  const v = document.getElementById('lsv-global').value;
  if (v === '') return;
  document.getElementById('ls-global').value = v;
  ceReadDesignInputs();
  ceApplyDesignPreview();
}
function onTwSliderInput() {
  document.getElementById('twv-global').value = document.getElementById('tw-global').value;
  ceReadDesignInputs();
  ceApplyDesignPreview();
}
function onTwNumberInput() {
  const v = document.getElementById('twv-global').value;
  if (v === '') return;
  document.getElementById('tw-global').value = v;
  ceReadDesignInputs();
  ceApplyDesignPreview();
}
function onColorChange() { ceReadDesignInputs(); ceApplyDesignPreview(); }

function ceApplyDesignPreview() {
  ceSetSlideVars(document.getElementById('design-pv-solo'), ceCs);
}

// slide-style.css가 실제로 쓰는 변수 이름(--navy, --fs-slide-title 등)에 그대로 값을 설정한다.
// 미리보기 컨테이너에만 스코프해서 설정하므로 이 페이지의 다른 --navy/--text 등에는 영향이 없다.
let ceFontsReady = false; // 슬라이드 폰트를 한 번 받아 뒀는지(미리보기 쪽 나눔 정확도용)

function ceSetSlideVars(el, cfg) {
  const c = cfg || ceCs;
  const f = c.fonts || CE_SD.fonts;
  el.style.setProperty('--navy',     c.navy    || CE_SD.navy);
  el.style.setProperty('--red',      c.red     || CE_SD.red);
  el.style.setProperty('--bg',       c.bg      || CE_SD.bg);
  el.style.setProperty('--slide-bg', c.slideBg || CE_SD.slideBg);
  el.style.setProperty('--row-bg',   c.rowBg   || CE_SD.rowBg);
  el.style.setProperty('--text',     c.text    || CE_SD.text);
  // 재디자인 색 역할 매핑: 라벨/구조=navy, 강조=red, 본문 글자=text
  el.style.setProperty('--label',    c.navy    || CE_SD.navy);
  el.style.setProperty('--accent',   c.red     || CE_SD.red);
  el.style.setProperty('--ink',      c.text    || CE_SD.text);
  el.style.setProperty('--border',   '#e2ddd2');
  el.style.setProperty('--think-guide-color', c.thinkGuideColor || CE_SD.thinkGuideColor);
  el.style.setProperty('--badge-color',       c.badgeColor      || CE_SD.badgeColor);
  el.style.setProperty('--font',              c.fontFamily      || CE_SD.fontFamily);
  // 글꼴 크기 변수는 slide-render.js가 스펙대로 한 번에 걸어 준다(수업 화면과 같은 코드).
  const nf = SlideRender.applyFontVars(el, f);
  // 미션 본문 전용 변수. 저장값 없으면 개념 본문값을 따른다.
  el.style.setProperty('--fs-body-mission', ((nf.bodyMission != null ? nf.bodyMission : nf.body) || CE_SD.fonts.body) + 'px');
  // 초성 퀴즈 쪽 나눔은 화면 밖 임시 DOM(document.body 밑)에서 줄 수를 재기 때문에,
  // 이 두 값만은 문서 루트에도 같이 걸어 줘야 미리보기와 학생 화면의 쪽 나눔이 일치한다.
  // 이름이 --fs-chosung* 으로 고유해서 어드민 자체 CSS 토큰과 부딪히지 않는다.
  document.documentElement.style.setProperty('--fs-chosung',     (nf.chosung    || CE_SD.fonts.chosung)    + 'px');
  document.documentElement.style.setProperty('--fs-chosung-num', (nf.chosungNum || CE_SD.fonts.chosungNum) + 'px');
  const lh = c.lineHeights || CE_SD.lineHeights;
  CE_LH_KEYS.forEach(k => {
    el.style.setProperty(CE_LH_VAR_MAP[k], lh[k] || CE_SD.lineHeights[k]);
  });
  el.style.setProperty('--ls-global', (c.letterSpacing ?? CE_SD.letterSpacing) / 100 + 'em');
  el.style.setProperty('--tw-global', (c.textWidth ?? CE_SD.textWidth) / 100);
}

async function saveDesign() {
  ceReadDesignInputs();
  await setDoc(doc(db, 'settings', 'class_design'), ceCs);
  ceShowToast('toast-design');
}
async function resetDesign() {
  ceCs = ceDeepMerge(CE_SD, {});
  ceCs.fonts = SlideRender.normalizeFonts(ceCs.fonts); // 형식별 값까지 채워서 저장
  await setDoc(doc(db, 'settings', 'class_design'), ceCs);
  ceLoadDesignInputs();
  ceApplyDesignPreview();
}

// ── 강의 목록 (Firestore) ──
let ceLessonsCache = [];

async function ceGetLessonsFromFirestore() {
  const snap = await getDocs(query(collection(db, 'class_lessons'), orderBy('order', 'asc')));
  ceLessonsCache = snap.docs.map(d => ({ docId: d.id, ...d.data() }));
  return ceLessonsCache;
}

// ── 강의 선택 드롭다운 공통 정렬 ──
// 개념·성적(class_lessons)·생각(think_lectures) 세 체크의 강의 선택 드롭다운은 모두
// 이 비교 함수 하나만 쓴다: order 필드 내림차순(최신 강의가 위, OT/인트로처럼 order 낮은 건 맨 아래).
// (예전엔 화면마다 asc+reverse / desc / num 파싱 등 기준이 제각각이라 OT(num="OT")가 튀어 올라왔다.)
function lecSortByOrderDesc(a, b) { return (b.order ?? -1) - (a.order ?? -1); }

function cePopulateLessonSelect() {
  const sel = document.getElementById('lesson-select');
  const cur = sel.value || ceCurrentLessonNum; // 선택 유지 (새 강의 추가/갱신 시)
  sel.innerHTML = '<option value="">— 강의 선택 —</option>' +
    [...ceLessonsCache].sort(lecSortByOrderDesc).map(l => `<option value="${esc(l.num)}" ${cur && l.num===cur?'selected':''}>${lecLabel(esc(l.num), esc(String(l.title||'').replace(/\*\*/g,'').replace(/[{}]/g,'')))}</option>`).join('');
}

// 개념 체크 강의 순서 목록(미션 체크 카드처럼 ▲▼로 순서 변경). 드롭다운과 같은 기준으로 정렬한다.
function ceLessonOrderList() { return [...ceLessonsCache].sort(lecSortByOrderDesc); }

function renderCeLessonOrder() {
  const box = document.getElementById('ce-lesson-order');
  if (!box) return;
  const list = ceLessonOrderList();
  if (!list.length) {
    box.innerHTML = '<div class="empty-panel" style="padding:14px;font-size:13px">강의가 없습니다.</div>';
    return;
  }
  box.innerHTML = list.map((l, idx) => {
    const clean = String(l.title || '').replace(/\*\*/g, '').replace(/[{}]/g, '');
    return `<div class="item-row">
        <div class="item-info"><div class="item-label">${lecLabel(esc(String(l.num)), esc(clean))}</div></div>
        <div class="item-meta">
          <button class="edit-btn" ${idx===0?'disabled':''} title="위로" onclick="ceMoveLesson('${l.docId}','up',${idx})">▲</button>
          <button class="edit-btn" ${idx===list.length-1?'disabled':''} title="아래로" onclick="ceMoveLesson('${l.docId}','down',${idx})">▼</button>
        </div>
      </div>`;
  }).join('');
}

window.ceOpenOrderModal = function() {
  renderCeLessonOrder();
  document.getElementById('ceOrderBackdrop')?.classList.add('open');
};
window.ceCloseOrderModal = function() {
  document.getElementById('ceOrderBackdrop')?.classList.remove('open');
};

window.ceMoveLesson = async function(docId, dir, idx) {
  const list = ceLessonOrderList(); // 화면과 동일한 내림차순 목록 기준
  const targetIdx = dir === 'up' ? idx - 1 : idx + 1;
  if (targetIdx < 0 || targetIdx >= list.length) return;
  const cur = list[idx], target = list[targetIdx];
  try {
    const batch = writeBatch(db);
    // 인접한 두 강의의 order 값을 맞바꾼다(표시 방향과 무관하게 안전).
    const curOrder    = cur.order    ?? ceLessonsCache.indexOf(cur);
    const targetOrder = target.order ?? ceLessonsCache.indexOf(target);
    batch.update(doc(db, 'class_lessons', cur.docId),    { order: targetOrder });
    batch.update(doc(db, 'class_lessons', target.docId), { order: curOrder });
    await batch.commit();
    await ceGetLessonsFromFirestore();
    cePopulateLessonSelect();
    renderCeLessonOrder();
  } catch(e) { alert('순서 변경 실패: ' + e.message); }
};

// 강의 선택 줄의 ▲▼ — 현재 선택된 강의를 순서 목록에서 위/아래로 옮긴다(순서 모달 대체).
window.ceMoveCurrentLesson = function(dir) {
  const num = document.getElementById('lesson-select')?.value;
  if (!num) { alert('강의를 먼저 선택하세요.'); return; }
  const list = ceLessonOrderList();
  const idx = list.findIndex(l => String(l.num) === String(num));
  if (idx < 0) return;
  window.ceMoveLesson(list[idx].docId, dir, idx);
};

window.ceLessonPreview = function() {
  // preview=1 을 붙여 비공개(편집 중) 강의도 미리보기로 열 수 있게 한다.
  if (ceCurrentLessonNum) window.open('lecture.html?num=' + ceCurrentLessonNum + '&mode=complete&preview=1', '_blank', 'noopener');
};

function onLessonChange(num) {
  const area = document.getElementById('ce-editor-area');
  const prevBtn = document.getElementById('ce-preview-btn');
  if (!num) {
    if (area) area.style.display = 'none';
    return; // 미리보기 버튼은 항시 표시(강의 미선택 시 클릭해도 무시됨)
  }
  ceCurrentLessonNum = num;
  ceLoadLessonData(num);
  if (area) area.style.display = '';
  if (prevBtn) prevBtn.style.display = '';
}

async function addLesson() {
  const num = (prompt('강 번호를 입력하세요 (예: 24)') || '').trim();
  if (!num) return;
  if (ceLessonsCache.find(l => l.num === num)) { alert('이미 있는 강 번호입니다.'); return; }
  const title = (prompt('수업 제목을 입력하세요') || '새 강의').trim();
  const unit = (prompt('학습 단원을 입력하세요 (예: Ⅲ-4. 고려의 생활과 문화)') || '').trim();
  const year = (prompt('연도를 입력하세요 (예: 2026)') || '2026').trim();
  const order = lecOrderKey(num); // 강 번호 기준(큰 번호가 위)
  await addDoc(collection(db, 'class_lessons'), {
    num, title, unit, year, order, isOpen: false,
    content: ceBlankLessonData(num)
  });
  await ceGetLessonsFromFirestore();
  ceCurrentLessonNum = num;
  cePopulateLessonSelect();
  renderCeLessonOrder();
  ceLoadLessonData(num);
  const area = document.getElementById('ce-editor-area');
  if (area) area.style.display = '';
  const prevBtn = document.getElementById('ce-preview-btn');
  if (prevBtn) prevBtn.style.display = '';
}

async function deleteLesson() {
  if (!confirm(`${lecTag(ceCurrentLessonNum)}을 삭제하시겠습니까? (슬라이드 내용은 삭제되지 않습니다)`)) return;
  const lesson = ceLessonsCache.find(l => l.num === ceCurrentLessonNum);
  if (!lesson) return;
  await deleteDoc(doc(db, 'class_lessons', lesson.docId));
  await ceGetLessonsFromFirestore();
  ceCurrentLessonNum = '';
  cePopulateLessonSelect();
  renderCeLessonOrder();
  const area = document.getElementById('ce-editor-area');
  if (area) area.style.display = 'none';
}

// ── 강의 내용 탭 ──
function ceBlankLessonData(num) {
  return {
    lesson: { num, title: '새 강의', unit: '', page: '', objectives: ['학습 목표를 입력하세요'] },
    dive: { headerTitle: '', title: '', guide: '', img: null, imgCaption: '', imgLayout: 'right', guideBox: true, openingEnabled: true, chosungEnabled: false, chosungItems: [] },
    contentLines: [],
    mission: { contentLines: [] },
    think: { question: '', guide: '' }
  };
}

// dive(Dive into HISTORY)·미션 체크는 나중에 추가된 필드라 그 전에 저장된 강의는 없을 수
// 있다. 없으면 빈 값으로 채워서(기존 데이터를 지우지 않고) 렌더링이 깨지지 않게 한다.
// 구버전에서 쓰던 opening{question,guide} 필드가 남아있으면 dive{title,guide}로 옮긴다.
function ceEnsureNewFields(cd) {
  if (!cd.dive) {
    cd.dive = cd.opening
      ? { title: cd.opening.question || '', guide: cd.opening.guide || '', chosungEnabled: false, chosungItems: [] }
      : { title: '', guide: '', chosungEnabled: false, chosungItems: [] };
  }
  if (cd.dive.headerTitle === undefined) cd.dive.headerTitle = '';
  if (cd.dive.img === undefined) cd.dive.img = null;
  if (cd.dive.imgCaption === undefined) cd.dive.imgCaption = '';
  if (cd.dive.imgLayout === undefined) cd.dive.imgLayout = 'right';
  if (cd.dive.guideBox === undefined) cd.dive.guideBox = true;
  if (cd.dive.chosungEnabled === undefined) cd.dive.chosungEnabled = false;
  if (cd.dive.openingEnabled === undefined) cd.dive.openingEnabled = true;
  if (!Array.isArray(cd.dive.chosungItems)) cd.dive.chosungItems = [];
  delete cd.opening;
  if (!cd.mission || !Array.isArray(cd.mission.contentLines)) cd.mission = { contentLines: [] };
  ceNormalizeContentLines(cd.contentLines);
  ceNormalizeContentLines(cd.mission.contentLines);
}

// row는 반드시 앞선 divider(=페이지)에 딸려야 한다는 것이 편집기의 전제다. 그런데 페이지
// 사이에 이미지·전면 이미지·영상이 끼어들면 그 뒤 row들이 divider를 잃어버리는 경우가 생긴다.
// 이렇게 붕 뜬 row를 편집기(ceBuildGroups)는 통째로 버려서 화면에서 사라지지만, 슬라이드
// 렌더러(SlideRender.buildCheckSlides)는 제목 없는 슬라이드로 그려 준다 — 편집기에서는
// 안 보이는데 실제 슬라이드에는 나오는 상태다. 로드 시점에 제목 없는 divider를 끼워 넣어
// 두 쪽 해석을 일치시킨다. (title:''은 렌더러가 만드는 슬라이드와 같은 값)
function ceNormalizeContentLines(lines) {
  if (!Array.isArray(lines)) return lines;
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i] || lines[i].type !== 'row') continue;
    const prev = lines[i - 1];
    if (prev && (prev.type === 'divider' || prev.type === 'row')) continue;
    lines.splice(i, 0, { type: 'divider', title: '' });
  }
  return lines;
}

// Firestore에 저장된 content가 지금 코드가 기대하는 구조(lesson/contentLines/think)와
// 맞는지 검사한다. 구조가 안 맞으면 렌더링이 통째로 깨지므로 그런 경우 기본값으로 대체한다.
function ceIsValidContentData(d) {
  return !!d
    && d.lesson && typeof d.lesson === 'object' && Array.isArray(d.lesson.objectives)
    && Array.isArray(d.contentLines)
    && d.think && typeof d.think === 'object';
}

async function ceInitContent() {
  await ceGetLessonsFromFirestore();
  cePopulateLessonSelect();
  renderCeLessonOrder();
  // 강의를 선택해야 편집 영역이 나타나도록 초기에는 숨겨둔다.
}

function ceLoadLessonData(num) {
  const lesson = ceLessonsCache.find(l => l.num === num);

  if (ceIsValidContentData(lesson?.content)) {
    ceCd = lesson.content;
    ceEnsureNewFields(ceCd);
  } else {
    const def = CE_LESSON_DEFAULTS[num];
    ceCd = def ? ceDeepCopy(def) : ceBlankLessonData(num);
    ceEnsureNewFields(ceCd);
    // Firestore에 저장된 content가 없거나 깨져 있었던 것이므로, 방금 만든 기본값을
    // 바로 Firestore에도 반영해서 실제 학생 페이지도 같은 내용을 보게 한다.
    if (lesson) ceSaveContentToFirestore(lesson.docId, ceCd);
  }

  ceRenderCoverForm();
  ceRenderOpenToggle();
  ceRenderDiveForm();
  ceRenderObjectivesForm();
  ceRenderContentLines('concept');
  ceRenderContentLines('mission');
  ceRenderThinkForm();
  ceRenderPreview();
}

// ── 표지 폼 (수업 정보) — 학습 목표는 Dive 메뉴로 이동 ──
function ceRenderCoverForm() {
  const l = ceCd.lesson;
  const el = document.getElementById('cover-form');
  el.innerHTML = `
    ${ceFInputInline('강 번호', l.num, `updateLesson('num',this.value)`)}
    ${ceFInputInline('수업 제목', l.title, `updateLesson('title',this.value)`)}
    ${ceFInputInline('학습 단원', l.unit, `updateLesson('unit',this.value)`)}
    ${ceFInputInline('교과서 페이지', l.page, `updateLesson('page',this.value)`)}`;
}

// ── 학습 목표 폼 (Dive 메뉴 안, 항상 표시되는 슬라이드) ──
function ceRenderObjectivesForm() {
  const l = ceCd.lesson;
  const el = document.getElementById('objectives-form');
  if (!el) return;
  el.innerHTML = `<textarea class="field-input" rows="4" placeholder="한 줄 = 목표 하나" oninput="updateObjectives(this.value);autoResizeTa(this)">${esc(l.objectives.join('\n'))}</textarea>`;
}

function updateLesson(f,v){ ceCd.lesson[f]=v; ceRenderPreview(); }
function updateObjectives(v){ ceCd.lesson.objectives = v.split('\n').filter(s=>s.trim()!==''); ceRenderPreview(); }

// ── 학생 공개/비공개 토글 ──
// isOpen 필드가 아예 없는 예전 강의(이 기능 추가 전에 만든 강의)는 이미 학생들이
// 보고 있었을 수 있으므로 공개 상태로 취급한다. 새로 만드는 강의만 명시적으로
// isOpen:false로 시작해 기본이 비공개가 되도록 한다.
function ceRenderOpenToggle() {
  const lesson = ceLessonsCache.find(l => l.num === ceCurrentLessonNum);
  const isOpen = lesson?.isOpen !== false;
  const tog = document.getElementById('ce-open-toggle');
  if (!tog) return;
  tog.classList.toggle('on', isOpen);
  tog.title = isOpen ? '공개 중 (클릭하면 비공개)' : '비공개 (클릭하면 공개)';
  // 생각 Check의 강의 선택 줄과 같은 자리에 같은 문구를 띄운다.
  const lbl = document.getElementById('ce-open-toglbl');
  if (lbl) {
    lbl.textContent = lesson ? (isOpen ? '공개 중' : '비공개') : '';
    lbl.style.color = isOpen ? 'var(--c3)' : 'var(--sub)';
  }
}
async function ceToggleLessonOpen() {
  const lesson = ceLessonsCache.find(l => l.num === ceCurrentLessonNum);
  if (!lesson) return;
  const next = lesson.isOpen === false; // 지금 비공개였으면 공개로, 아니면 비공개로
  await updateDoc(doc(db, 'class_lessons', lesson.docId), { isOpen: next });
  lesson.isOpen = next;
  ceRenderOpenToggle();
}

// ── 개념/미션 Check 콘텐츠 (구분선 + 행, 드래그로 순서 변경) ──
// 개념 체크와 미션 체크는 완전히 같은 방식(구분선/행/이미지)으로 편집하므로, 어느 쪽을
// 편집 중인지를 target('concept'|'mission')으로 받아서 같은 함수를 재사용한다.
function ceLinesFor(target) {
  return target === 'mission' ? ceCd.mission.contentLines : ceCd.contentLines;
}
function ceContainerIdFor(target) {
  return target === 'mission' ? 'mission-content-lines' : 'content-lines';
}

// 드래그 핸들이 잘 안 잡힐 때를 위한 대체 수단 (위/아래로 한 칸씩 이동)
function ceMoveButtons(target, i) {
  const last = ceLinesFor(target).length - 1;
  return `
    <span class="cl-move">
      <button class="cl-move-btn" onclick="moveLine('${target}',${i},-1)" ${i === 0 ? 'disabled' : ''} title="위로 이동">↑</button>
      <button class="cl-move-btn" onclick="moveLine('${target}',${i},1)" ${i === last ? 'disabled' : ''} title="아래로 이동">↓</button>
    </span>`;
}
function moveLine(target, i, dir) {
  const lines = ceLinesFor(target);
  const j = i + dir;
  if (j < 0 || j >= lines.length) return;
  const [item] = lines.splice(i, 1);
  lines.splice(j, 0, item);
  ceRenderContentLines(target);
  ceRenderPreview();
}

// ── 슬라이드 형식(연표/비교표/사료 인용/플로우) 선택 및 형식별 데이터 편집 ──
// 기본값은 'rows'(지금까지의 행 나열)라서, 기존 강의는 아무 필드도 없어도 그대로 동작한다.
const CE_FORMAT_LABELS = {
  rows: '행 나열', 'timeline-h': '연표(가로)', 'timeline-v': '연표(세로)',
  compare: '비교표', quote: '사료 인용', 'flow-h': '플로우(가로)', 'flow-v': '플로우(세로)',
  notice: '안내(OT/수행)', cols: '중앙 나열'
};
const CE_FORMATS = ['rows','timeline-h','timeline-v','compare','quote','flow-h','flow-v','notice','cols'];

function ceFormatChips(target, i, current) {
  return CE_FORMATS.map(f => `<button type="button" class="cl-fmt-chip${current===f?' active':''}" onclick="setLineFormat('${target}',${i},'${f}')">${CE_FORMAT_LABELS[f]}</button>`).join('');
}

function setLineFormat(target, i, fmt) {
  const line = ceLinesFor(target)[i];
  if (fmt === 'rows') { delete line.format; }
  else { line.format = fmt; }
  if ((fmt === 'timeline-h' || fmt === 'timeline-v') && !line.events) {
    line.events = fmt === 'timeline-h' ? [{ year: '', label: '' }] : [{ memo: '', content: [''] }];
  }
  if (fmt === 'compare') {
    if (!line.left)  line.left  = { label: '', items: [''] };
    if (!line.right) line.right = { label: '', items: [''] };
  }
  if (fmt === 'quote') {
    if (line.quoteText == null)   line.quoteText = '';
    if (line.quoteSource == null) line.quoteSource = '';
    if (line.quoteLabel == null)  line.quoteLabel = '';
  }
  if ((fmt === 'flow-h' || fmt === 'flow-v') && !line.stages) {
    line.stages = [{ label: '', text: '' }];
  }
  if (fmt === 'notice' && line.noticeText == null) line.noticeText = '';
  if (fmt === 'cols' && !line.cols) line.cols = [{ head:'', body:'' }, { head:'', body:'' }, { head:'', body:'' }];
  ceRenderContentLines(target);
  ceToggleFmt(target, i);
  ceRenderPreview();
}

function toggleLabelPos(target, i, isChecked) {
  const line = ceLinesFor(target)[i];
  // 기본은 상단. 체크하면 좌측 배치로 되돌린다.
  if (isChecked) line.labelPos = 'left';
  else delete line.labelPos;
  const lines = ceLinesFor(target);
  const nth = lines.slice(0, i).filter(l => l.type === 'divider').length;
  const type = target === 'mission' ? 'mission' : 'concept';
  ceRenderPreview(slides => {
    const typed = slides.filter(s => s.type === type);
    return typed[nth] || slides.find(s => s.type === 'concept') || slides[0];
  });
}

// 페이지(슬라이드)별 본문 글자 크기 절대값(px). 비우면 필드를 지워 디자인 기본값을 따른다.
// 페이지별 개념/미션 배지 숨김(A 기능) — 켜면 형식(rows 등) 상관없이 배지 없이 제목만 표시.
function toggleHideBadge(target, i, checked) {
  const line = ceLinesFor(target)[i];
  if (checked) line.hideBadge = true;
  else delete line.hideBadge;
  ceRenderPreview();
}

function setLineFontSize(target, i, v) {
  const line = ceLinesFor(target)[i];
  const n = parseInt(v, 10);
  if (v === '' || isNaN(n)) delete line.fontSize;
  else line.fontSize = n;
  ceRenderPreview();
}

// 중앙 나열 페이지의 대제목만 따로 키우거나 줄인다. 비우면 디자인 탭 기본값을 따른다.
function setColsTitleSize(target, i, v) {
  const line = ceLinesFor(target)[i];
  const n = parseInt(v, 10);
  if (v === '' || isNaN(n)) delete line.colsTitleSize;
  else line.colsTitleSize = n;
  ceRenderPreview();
}

function autoResizeTa(ta) {
  ta.style.height = '1px';
  ta.style.height = ta.scrollHeight + 'px';
}

/* 콘텐츠 textarea 입력 보조: Tab → " : "(소제목 구분). Shift+Enter는 일반 Enter와 동일하게
   처리(줄바꿈)하며, a./b./c. 로 시작하는 줄은 updateLineItems가 저장 시 자동으로 <br>로 합친다. */
function handleContentKeydown(e) {
  if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
    e.preventDefault();
    const ta = e.target;
    ta.setRangeText(' : ', ta.selectionStart, ta.selectionEnd, 'end');
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }
}
/* 행 항목(.cl-items) 전용: Tab → " : ", Shift+Enter → 같은 항목 안 줄바꿈.
   Shift+Enter는 실제 개행(\n) + 보이지 않는 ZWSP(U+200B, 이어붙임 표시)를 넣어
   편집기에선 줄바꿈처럼 보이고, updateLineItems가 그 줄을 직전 항목에 U+2028로 합친다. */
function handleItemsKeydown(e) {
  if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
    e.preventDefault();
    const ta = e.target;
    ta.setRangeText(' : ', ta.selectionStart, ta.selectionEnd, 'end');
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  } else if (e.key === 'Enter' && e.shiftKey) {
    e.preventDefault();
    const ta = e.target;
    ta.setRangeText('\n' + String.fromCharCode(0x200B), ta.selectionStart, ta.selectionEnd, 'end');
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

function ceFormatPanelBody(target, i, line) {
  const fmt = line.format || 'rows';
  if (fmt === 'timeline-h' || fmt === 'timeline-v') return ceTimelineEditor(target, i, line);
  if (fmt === 'compare') return ceCompareEditor(target, i, line);
  if (fmt === 'quote') return ceQuoteEditor(target, i, line);
  if (fmt === 'flow-h' || fmt === 'flow-v') return ceFlowEditor(target, i, line);
  if (fmt === 'notice') return ceNoticeEditor(target, i, line);
  if (fmt === 'cols') return ceColsEditor(target, i, line);
  // 행 나열(rows)의 옵션(라벨 좌측·배지 숨김·글자 크기)과 하단 사료는 페이지 설정 패널에서 직접 렌더한다.
  return '';
}

// 중앙 나열(cols) 편집기 — 대제목은 슬라이드 제목칸, 항목마다 소제목+내용.
function ceColsEditor(target, i, line) {
  const cols = line.cols || [];
  const rows = cols.map((c, j) => `
    <div class="cl-fmt-row">
      <input type="text" class="cl-fmt-sm" style="width:150px" placeholder="소제목" value="${esc(c.head||'')}" oninput="updateColField('${target}',${i},${j},'head',this.value)">
      <input type="text" class="cl-fmt-grow" placeholder="내용 (선택), {단어}는 빈칸" value="${esc(c.body||'')}" oninput="updateColField('${target}',${i},${j},'body',this.value)">
      <button class="cl-fmt-del" onclick="removeCol('${target}',${i},${j})">삭제</button>
    </div>`).join('');
  return `<div class="cl-fmt-fields">
      <div class="cl-fmt-hint">상단 배지 헤더는 위 슬라이드 제목칸 / 아래 대제목은 본문 가운데 큰 제목(선택) / 항목은 가로로 균등 배치 / **글자**로 감싸면 강조색</div>
      <input type="text" class="cl-fmt-sm" style="width:100%" placeholder="대제목 (본문 가운데 큰 제목, 선택)" value="${esc(line.colsTitle||'')}" oninput="updateLine('${target}',${i},'colsTitle',this.value)">
      ${rows}
      <button type="button" class="cbtn-sm" onclick="addCol('${target}',${i})">+ 항목 추가</button>
    </div>`;
}
function updateColField(target,i,j,f,v){ ceLinesFor(target)[i].cols[j][f]=v; ceRenderPreview(); }
function addCol(target,i){ ceLinesFor(target)[i].cols.push({head:'',body:''}); ceRenderContentLines(target); ceRenderPreview(); }
function removeCol(target,i,j){ ceLinesFor(target)[i].cols.splice(j,1); ceRenderContentLines(target); ceRenderPreview(); }

// 안내(OT·수행평가) 자유 문단 편집기 — 한 줄 = 한 문단, "- "로 시작하면 불릿, 빈 줄은 간격.
function ceNoticeEditor(target, i, line) {
  return `
    <div class="cl-fmt-fields">
      <div class="cl-fmt-hint">한 줄 = 한 문단 / 줄 앞에 "- "를 붙이면 불릿 / 빈 줄은 간격 / **굵게**/{빈칸} 문법 사용 가능</div>
      <textarea class="cl-fmt-grow" placeholder="예)&#10;- 수행평가 안내&#10;- 제출 기한: 다음 주 금요일&#10;&#10;**모둠별**로 발표 자료를 준비하세요." oninput="updateLine('${target}',${i},'noticeText',this.value);autoResizeTa(this)" onkeydown="handleContentKeydown(event)">${esc(line.noticeText||'')}</textarea>
    </div>`;
}

// 행 나열 하단 사료 인용(선택). 채우면 행 아래에 사료 블록이 붙는다. quote 형식과 같은 필드를 공유.
function ceBottomQuoteEditor(target, i, line) {
  return `
    <details class="cl-bq" ${(line.quoteText && line.quoteText.trim()) ? 'open' : ''}>
      <summary class="cl-bq-summary">하단 사료 인용 (선택)</summary>
      <div class="cl-fmt-fields">
        <input type="text" class="cl-fmt-sm" style="width:100%" placeholder="사료 소제목 (선택, 예: (가) …)" value="${esc(line.quoteLabel||'')}" oninput="updateLine('${target}',${i},'quoteLabel',this.value)">
        <textarea class="cl-fmt-grow" placeholder="사료 원문 (비우면 사료 안 붙음), {단어}는 빈칸" oninput="updateLine('${target}',${i},'quoteText',this.value);autoResizeTa(this)" onkeydown="handleContentKeydown(event)">${esc(line.quoteText||'')}</textarea>
        <input type="text" class="cl-fmt-sm" style="width:100%" placeholder="출처 (선택, 자동으로 겹낫표 『』 표시)" value="${esc(line.quoteSource||'')}" oninput="updateLine('${target}',${i},'quoteSource',this.value)">
      </div>
    </details>`;
}

function ceTimelineEditor(target, i, line) {
  const isV = line.format === 'timeline-v';
  const rows = line.events.map((ev, j) => isV ? `
    <div class="cl-fmt-row">
      <input type="text" class="cl-fmt-sm" placeholder="메모(연도 등)" value="${esc(ev.memo||'')}" oninput="updateEventField('${target}',${i},${j},'memo',this.value)">
      <textarea class="cl-fmt-grow" placeholder="내용, 한 줄 = 한 항목, {단어}는 빈칸, ' : '로 소제목 구분" oninput="updateEventContent('${target}',${i},${j},this.value);autoResizeTa(this)" onkeydown="handleContentKeydown(event)">${esc((ev.content||[]).join('\n'))}</textarea>
      <button class="cl-fmt-del" onclick="removeEvent('${target}',${i},${j})">삭제</button>
    </div>` : `
    <div class="cl-fmt-row">
      <input type="text" class="cl-fmt-sm" placeholder="연도" value="${esc(ev.year||'')}" oninput="updateEventField('${target}',${i},${j},'year',this.value)">
      <input type="text" class="cl-fmt-grow" placeholder="라벨, {단어}는 빈칸" value="${esc(ev.label||'')}" oninput="updateEventField('${target}',${i},${j},'label',this.value)">
      <button class="cl-fmt-del" onclick="removeEvent('${target}',${i},${j})">삭제</button>
    </div>`).join('');
  return `<div class="cl-fmt-fields">${rows}<button type="button" class="cbtn-sm" onclick="addEvent('${target}',${i})">+ 사건 추가</button></div>`;
}
function updateEventField(target,i,j,f,v) { ceLinesFor(target)[i].events[j][f] = v; ceRenderPreview(); }
function updateEventContent(target,i,j,v) { ceLinesFor(target)[i].events[j].content = v.split('\n').filter(s=>s.trim()!==''); ceRenderPreview(); }
function addEvent(target,i) {
  const line = ceLinesFor(target)[i];
  line.events.push(line.format === 'timeline-v' ? { memo:'', content:[''] } : { year:'', label:'' });
  ceRenderContentLines(target); ceRenderPreview();
}
function removeEvent(target,i,j) { ceLinesFor(target)[i].events.splice(j,1); ceRenderContentLines(target); ceRenderPreview(); }

function ceCompareEditor(target, i, line) {
  const side = (key, label) => `
    <div class="cl-fmt-col">
      <input type="text" class="cl-fmt-sm" style="width:100%" placeholder="${label} 라벨" value="${esc(line[key].label||'')}" oninput="updateCompareField('${target}',${i},'${key}','label',this.value)">
      <textarea class="cl-fmt-grow" placeholder="한 줄 = 한 항목, {단어}는 빈칸, ' : '로 소제목 구분" oninput="updateCompareItems('${target}',${i},'${key}',this.value);autoResizeTa(this)" onkeydown="handleContentKeydown(event)">${esc((line[key].items||[]).join('\n'))}</textarea>
    </div>`;
  return `<div class="cl-fmt-fields cl-fmt-fields-2col">${side('left','왼쪽(네이비)')}${side('right','오른쪽(레드)')}</div>`;
}
function updateCompareField(target,i,side,f,v) { ceLinesFor(target)[i][side][f] = v; ceRenderPreview(); }
function updateCompareItems(target,i,side,v)  { ceLinesFor(target)[i][side].items = v.split('\n').filter(s=>s.trim()!==''); ceRenderPreview(); }

function ceQuoteEditor(target, i, line) {
  return `
    <div class="cl-fmt-fields">
      <input type="text" class="cl-fmt-sm" style="width:100%" placeholder="사료 소제목 (선택, 예: (가) 조선의 통치제도) — 전체 제목은 위 그룹 제목칸에서 편집" value="${esc(line.quoteLabel||'')}" oninput="updateLine('${target}',${i},'quoteLabel',this.value)">
      <textarea class="cl-fmt-grow" placeholder="원문 텍스트, {단어}는 빈칸" oninput="updateLine('${target}',${i},'quoteText',this.value);autoResizeTa(this)" onkeydown="handleContentKeydown(event)">${esc(line.quoteText||'')}</textarea>
      <input type="text" class="cl-fmt-sm" style="width:100%" placeholder="출처" value="${esc(line.quoteSource||'')}" oninput="updateLine('${target}',${i},'quoteSource',this.value)">
    </div>`;
}

function ceFlowEditor(target, i, line) {
  const rows = line.stages.map((st, j) => `
    <div class="cl-fmt-row">
      <input type="text" class="cl-fmt-sm" placeholder="단계명" value="${esc(st.label||'')}" oninput="updateStageField('${target}',${i},${j},'label',this.value)">
      <textarea class="cl-fmt-grow" placeholder="설명, {단어}는 빈칸" oninput="updateStageField('${target}',${i},${j},'text',this.value);autoResizeTa(this)" onkeydown="handleContentKeydown(event)">${esc(st.text||'')}</textarea>
      <button class="cl-fmt-del" onclick="removeStage('${target}',${i},${j})">삭제</button>
    </div>`).join('');
  return `<div class="cl-fmt-fields">${rows}<button type="button" class="cbtn-sm" onclick="addStage('${target}',${i})">+ 단계 추가</button></div>`;
}
function updateStageField(target,i,j,f,v) { ceLinesFor(target)[i].stages[j][f] = v; ceRenderPreview(); }
function addStage(target,i) { ceLinesFor(target)[i].stages.push({label:'',text:''}); ceRenderContentLines(target); ceRenderPreview(); }
function removeStage(target,i,j) { ceLinesFor(target)[i].stages.splice(j,1); ceRenderContentLines(target); ceRenderPreview(); }

// 전체 슬라이드(표지·목표·Dive·초성·개념·미션·생각 전부)에서 이 섹션의 첫 페이지 앞까지의 슬라이드 수.
// = 이 섹션 페이지 번호의 전역 시작 오프셋. 실제 발표 순서와 맞추려고 SlideRender로 전체 덱을 만들어 계산한다.
function ceGlobalBaseOffset(target) {
  try {
    const all = SlideRender.buildSlidesFromData(ceCd);
    const type = target === 'mission' ? 'mission' : 'concept';
    const idx = all.findIndex(s => s.type === type);
    if (idx >= 0) return idx;                 // 해당 섹션 첫 슬라이드의 0-based 위치
    // 아직 이 섹션 슬라이드가 없으면 앞 섹션 수로 추정
    if (type === 'concept') return all.filter(s => ['cover','objectives','dive','chosung'].includes(s.type)).length;
    const lastConcept = all.map(s => s.type).lastIndexOf('concept');
    if (lastConcept >= 0) return lastConcept + 1;
    return all.filter(s => ['cover','objectives','dive','chosung'].includes(s.type)).length;
  } catch { return 0; }
}

let _ceSyncing = false; // 개념↔미션 페이지 번호 동기화 재진입 방지

function ceRenderContentLines(target) {
  const lines = ceLinesFor(target);
  const container = document.getElementById(ceContainerIdFor(target));
  if (!lines.length) {
    container.innerHTML = '<p class="field-hint">아직 내용이 없습니다. 아래 버튼으로 구분선과 행을 추가하세요.</p>';
    return;
  }
  const groups = ceBuildGroups(lines);
  let pageNum = ceGlobalBaseOffset(target); // 전체 슬라이드 기준 시작 번호
  container.innerHTML = groups.map(group => {
    if (group.type === 'image') {
      const i = group.idx, line = lines[i];
      const pg = ++pageNum;
      return `
        <div class="cl-image" data-idx="${i}">
          <div class="cl-divider-top">
            <span class="cl-handle">⋮⋮</span>
            <span class="cl-slide-meta">${pg}페이지 <span class="cl-meta-sep">｜</span> 이미지 슬라이드</span>
            <input type="text" class="cl-divider-title" placeholder="제목 (선택)" value="${esc(line.title||'')}" oninput="updateLine('${target}',${i},'title',this.value)" style="max-width:220px">
            <button class="cbtn-danger" onclick="deleteLine('${target}',${i})">삭제</button>
          </div>
          ${line.images.map((im, j) => `
            <div class="cl-img-row">
              <span class="cl-img-label">번호</span>
              <input type="number" class="cl-img-input" min="1" max="99" value="${im.img||1}" oninput="updateImageItem('${target}',${i},${j},'img',+this.value)">
              <input type="text" class="cl-divider-title" placeholder="캡션 (선택)" value="${esc(im.caption||'')}" oninput="updateImageItem('${target}',${i},${j},'caption',this.value)" style="max-width:180px">
              ${line.images.length > 1 ? `<button class="cbtn-sm" onclick="removeImageItem('${target}',${i},${j})">이 이미지 제거</button>` : ''}
            </div>`).join('')}
          <button class="cbtn-sm" onclick="addImageItem('${target}',${i})">+ 이미지 추가 (그리드 배치)</button>
          <div class="cl-img-row">
            <span class="cl-img-label">화면 차지 비율</span>
            <input type="number" class="cl-img-input" min="10" max="100" value="${line.size != null ? line.size : 100}" oninput="updateLine('${target}',${i},'size',+this.value)">
            <span class="cl-img-label" style="font-weight:400;color:var(--stone)">%</span>
          </div>
        </div>`;
    }
    if (group.type === 'fullimage') {
      const i = group.idx, line = lines[i];
      const pg = ++pageNum;
      const legacy = line.img == null && line.url; // 예전 업로드분
      return `
        <div class="cl-image" data-idx="${i}">
          <div class="cl-divider-top">
            <span class="cl-handle">⋮⋮</span>
            <span class="cl-slide-meta">${pg}페이지 <span class="cl-meta-sep">｜</span> 전면 이미지</span>
            <button class="cbtn-danger" onclick="deleteFullImage('${target}',${i})">삭제</button>
          </div>
          <div class="cl-img-row">
            <span class="cl-img-label">이미지 번호</span>
            <input type="number" class="cl-img-input" min="1" max="99" value="${line.img != null ? line.img : 1}" oninput="updateLine('${target}',${i},'img',+this.value)">
            <span class="cl-img-label">화면 차지 비율</span>
            <input type="number" class="cl-img-input" min="10" max="100" value="${line.size != null ? line.size : 100}" oninput="updateLine('${target}',${i},'size',+this.value)">
            <span class="cl-img-label" style="font-weight:400;color:var(--stone)">%</span>
          </div>
          ${legacy ? `<div style="padding:0 12px 8px;color:var(--stone);font-size:12px">※ 예전에 업로드한 이미지가 남아 있습니다. 번호를 입력하면 그 이미지로 교체됩니다.</div>` : ''}
        </div>`;
    }
    if (group.type === 'video') {
      const i = group.idx, line = lines[i];
      const pg = ++pageNum;
      return `
        <div class="cl-image" data-idx="${i}">
          <div class="cl-divider-top">
            <span class="cl-handle">⋮⋮</span>
            <span class="cl-slide-meta">${pg}페이지 <span class="cl-meta-sep">｜</span> 영상</span>
            <input type="text" class="cl-divider-title" placeholder="유튜브 URL 붙여넣기" value="${esc(line.url||'')}" onchange="updateVideoUrl('${target}',${i},this.value)" style="flex:1;max-width:none">
            <button class="cbtn-danger" onclick="deleteLine('${target}',${i})">삭제</button>
          </div>
          ${line.videoId
            ? `<div style="padding:8px 12px"><img src="https://img.youtube.com/vi/${line.videoId}/mqdefault.jpg" style="max-height:120px;border-radius:6px;border:1px solid var(--cborder)"></div>`
            : `<div style="padding:10px 12px;color:var(--stone);font-size:13px">유효한 유튜브 URL을 입력하면 미리보기가 표시됩니다.</div>`}
        </div>`;
    }
    if (group.type === 'slide-group') {
      const { title, slides } = group;
      const allDivIds = slides.map(s => s.divIdx);
      const slidesHtml = slides.map(({ divIdx, rowIndices }) => {
        const div = lines[divIdx];
        const hasImg = div.img != null, fmt = div.format || 'rows';
        // 내용이 빈 페이지는 슬라이드 렌더러가 덱에서 빼버린다(slide-render.js의 buildCheckSlides).
        // 편집기가 따로 판정하면 또 어긋나므로 그 함수를 그대로 불러 쓰고, 덱에 나오는 페이지에만
        // 번호를 준다. 그래야 여기 번호와 실제 슬라이드 번호가 항상 같다.
        const willRender = SlideRender.buildCheckSlides(
          [div, ...rowIndices.map(ri => lines[ri])], target === 'mission' ? 'mission' : 'concept'
        ).length > 0;
        const pg = willRender ? ++pageNum : null;
        // 페이지 단위 공통 액션바(가로, 페이지/형식 표시 옆) — 모든 형식에서 동일한 모양으로 쓴다.
        const blockEnd = divIdx + 1 + rowIndices.length;   // 이 페이지 블록의 끝(다음 블록 시작 인덱스)
        const canUp = divIdx > 0, canDown = blockEnd < lines.length;
        const pageActions = `
              <div class="cl-row-actions">
                <button class="cl-icon-btn" onclick="moveSlideBlock('${target}',${divIdx},-1)" ${canUp?'':'disabled'} title="페이지 위로 이동">${ceIconUp()}</button>
                <button class="cl-icon-btn" onclick="moveSlideBlock('${target}',${divIdx},1)" ${canDown?'':'disabled'} title="페이지 아래로 이동">${ceIconDown()}</button>
                <button class="cl-icon-btn" onclick="ceShowAddMenu(event,'${target}',${divIdx})" title="추가 (행/페이지)">${ceIconPlus()}</button>
                <button class="cl-icon-btn" onclick="toggleDividerImg('${target}',${divIdx})" title="${hasImg?'이미지 제거':'이미지 삽입'}">${ceIconImage()}</button>
                <button class="cl-icon-btn${fmt !== 'rows' ? ' active' : ''}" onclick="ceToggleFmt('${target}',${divIdx})" title="형식 변경">${ceIconSliders()}</button>
                <button class="cl-icon-btn danger" onclick="${slides.length > 1 ? `deletePair('${target}',${divIdx})` : `deleteGroup('${target}',${slides[0].divIdx})`}" title="이 페이지 삭제">${ceIconTrash()}</button>
              </div>`;
        // 한 페이지 안의 행(라벨+내용). 여러 행이면 행별 삭제 버튼만 인라인으로 둔다.
        const rowInner = (rowIdx) => {
          const row = lines[rowIdx];
          const rowDelete = rowIndices.length > 1
            ? `<button class="cl-icon-btn danger cl-row-del" onclick="deleteRow('${target}',${rowIdx})" title="행 삭제">${ceIconTrash()}</button>` : '';
          return `
              <div class="cl-row-inner" data-row-idx="${rowIdx}">
                <textarea class="cl-label" placeholder="라벨" oninput="updateLine('${target}',${rowIdx},'label',this.value);autoResizeTa(this)">${esc(row.label)}</textarea>
                <textarea class="cl-items" placeholder="{단어}는 빈칸, **굵게**, 엔터로 항목 구분, Shift+Enter로 같은 항목 안 줄바꿈 (a./b./c. 줄은 하위 항목)" oninput="updateLineItems('${target}',${rowIdx},this.value);autoResizeTa(this)" onkeydown="handleItemsKeydown(event)">${esc(row.items.map(it => it.replace(new RegExp(String.fromCharCode(0x2028), 'g'), '\n' + String.fromCharCode(0x200B)).replace(/<\/?br\s*\/?>/gi, '\n')).join('\n'))}</textarea>
                ${rowDelete}
              </div>`;
        };
        // 본문 내용: 행 나열은 행들, 그 외(사료·연표 등)는 형식 편집기. 어느 형식이든 래퍼+우측 세로 액션바는 동일.
        const contentInner = fmt !== 'rows'
          ? ceFormatPanelBody(target, divIdx, div)
          : (rowIndices.length ? rowIndices.map(rowInner).join('') : `<div class="cl-norow-hint">내용이 없는 페이지입니다. 행을 추가하세요.</div>`);
        const bodyHtml = `<div class="cl-slide-row cl-slide-special"><div class="cl-special-editor">${contentInner}</div></div>`;
        const pageHandle = slides.length > 1 ? `<span class="cl-handle cl-page-handle" title="페이지 순서 변경">⋮⋮</span>` : '';
        const imgLayout = div.imgLayout || 'right';
        // 텍스트 폭(%)은 우측 배치에서만 의미가 있음. 나머지 폭을 이미지가 세로로 꽉 채움.
        // 저장값 imgSize는 '이미지 칸 폭%'이라, 입력은 텍스트 폭(=100-imgSize)으로 주고받는다.
        const textWidth = 100 - (div.imgSize != null ? div.imgSize : 50);
        const sizeInput = imgLayout === 'right' ? `
              <span class="cl-img-label">텍스트 폭</span>
              <input type="number" class="cl-img-input" min="40" max="90" value="${textWidth}" oninput="updateLine('${target}',${divIdx},'imgSize',100-(+this.value))">
              <span class="cl-img-label">%</span>` : '';
        const imgRow = hasImg ? `
            <div class="cl-img-row" style="padding:6px 12px 8px 12px;border-top:1px solid #eee;margin-top:4px">
              <span class="cl-img-label">이미지 번호</span>
              <input type="number" class="cl-img-input" min="1" max="99" value="${div.img}" oninput="updateLine('${target}',${divIdx},'img',+this.value)">
              <span class="cl-img-label">배치</span>
              <select class="cl-img-select" onchange="updateImgLayout('${target}',${divIdx},this.value)">
                <option value="right" ${imgLayout==='right'?'selected':''}>우측</option>
                <option value="bottom" ${imgLayout==='bottom'?'selected':''}>하단</option>
              </select>${sizeInput}
            </div>` : '';
        return `
          <div class="cl-slide-item" data-div-idx="${divIdx}">
            <div class="cl-slide-head">
              ${pageHandle}
              <span class="cl-slide-meta${pg ? '' : ' cl-slide-ghost'}">${pg ? `${pg}페이지` : '슬라이드 없음'} <span class="cl-meta-sep">｜</span> ${CE_FORMAT_LABELS[fmt]}</span>
              ${pageActions}
            </div>
            <details class="cl-fmt-details" style="margin:0 12px 6px">
              <summary class="cl-fmt-summary">형식 변경 / 페이지 설정</summary>
              <div class="cl-fmt-panel">
                <div class="cl-fmt-chips">${ceFormatChips(target,divIdx,fmt)}</div>
                <div class="cl-fmt-opts">
                  ${fmt === 'rows' ? `<label class="cl-opt"><input type="checkbox" class="cl-opt-labelpos" ${div.labelPos === 'left' ? 'checked' : ''} onclick="event.stopPropagation();toggleLabelPos('${target}',${divIdx},this.checked)"> 라벨 좌측</label>` : ''}
                  ${fmt !== 'notice' ? `<label class="cl-opt"><input type="checkbox" ${div.hideBadge ? 'checked' : ''} onclick="event.stopPropagation();toggleHideBadge('${target}',${divIdx},this.checked)"> 배지 숨김</label>` : ''}
                  <label class="cl-opt">${fmt === 'cols' ? '글자 크기(소제목/내용)' : '글자 크기'} <input type="number" min="10" max="140" placeholder="기본" value="${div.fontSize != null ? div.fontSize : ''}" oninput="setLineFontSize('${target}',${divIdx},this.value)"> px</label>
                  ${fmt === 'cols' ? `<label class="cl-opt">글자 크기(대제목) <input type="number" min="10" max="200" placeholder="기본" value="${div.colsTitleSize != null ? div.colsTitleSize : ''}" oninput="setColsTitleSize('${target}',${divIdx},this.value)"> px</label>` : ''}
                </div>
                ${fmt === 'rows' ? ceBottomQuoteEditor(target,divIdx,div) : ''}
              </div>
            </details>
            <div class="cl-slide-body">${bodyHtml}</div>
            ${imgRow}
          </div>`;
      }).join('');
      return `
        <div class="cl-group" data-first-div="${slides[0].divIdx}">
          <div class="cl-group-header">
            <span class="cl-handle">⋮⋮</span>
            <input type="text" class="cl-divider-title" placeholder="슬라이드 제목" value="${esc(title)}" oninput="updateGroupTitle('${target}',[${allDivIds.join(',')}],this.value)">
            <div class="cl-row-actions">
              <button class="cl-icon-btn danger" onclick="deleteGroup('${target}',${slides[0].divIdx})" title="전체 삭제">${ceIconTrash()}</button>
            </div>
          </div>
          <div class="cl-group-body">${slidesHtml}</div>
        </div>`;
    }
    return '';
  }).join('');
  ceWireDragEvents(target);
  requestAnimationFrame(() => requestAnimationFrame(() => container.querySelectorAll('textarea').forEach(autoResizeTa)));
  // 페이지 번호가 전역이므로, 한 섹션을 다시 그리면 반대 섹션 번호도 즉시 갱신되도록 1회 동기화한다.
  if (!_ceSyncing) {
    _ceSyncing = true;
    const other = target === 'concept' ? 'mission' : 'concept';
    if (document.getElementById(ceContainerIdFor(other))) ceRenderContentLines(other);
    _ceSyncing = false;
  }
}

/* ── 슬라이드 그룹 헬퍼 ── */
function ceBuildGroups(lines) {
  const groups = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.type === 'image') {
      groups.push({ type: 'image', idx: i++ });
    } else if (line.type === 'fullimage') {
      groups.push({ type: 'fullimage', idx: i++ });
    } else if (line.type === 'video') {
      groups.push({ type: 'video', idx: i++ });
    } else if (line.type === 'divider') {
      const title = line.title;
      const slides = [];
      while (i < lines.length && lines[i].type === 'divider' && lines[i].title === title) {
        const divIdx = i++;
        const rowIndices = [];
        while (i < lines.length && lines[i].type === 'row') rowIndices.push(i++);
        slides.push({ divIdx, rowIndices });
      }
      groups.push({ type: 'slide-group', title, slides });
    } else { i++; }
  }
  return groups;
}

const _svgPlus    = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="8" y1="3" x2="8" y2="13"/><line x1="3" y1="8" x2="13" y2="8"/></svg>`;
const _svgImage   = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="12" height="10" rx="1.5"/><circle cx="5.5" cy="6.5" r="1"/><polyline points="2,12 5,8.5 7.5,11 10,8 14,12"/></svg>`;
const _svgSliders = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><line x1="2" y1="5" x2="14" y2="5"/><line x1="2" y1="11" x2="14" y2="11"/><circle cx="6" cy="5" r="1.8" fill="white" stroke="currentColor"/><circle cx="10" cy="11" r="1.8" fill="white" stroke="currentColor"/></svg>`;
const _svgTrash   = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="3,4 13,4"/><path d="M5,4V3a1,1,0,0,1,1-1h4a1,1,0,0,1,1,1V4"/><path d="M6,7v4M10,7v4"/><rect x="4" y="4" width="8" height="9" rx="1"/></svg>`;
const _svgUp   = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4,10 8,6 12,10"/></svg>`;
const _svgDown = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4,6 8,10 12,6"/></svg>`;
function ceIconPlus()    { return _svgPlus; }
function ceIconImage()   { return _svgImage; }
function ceIconSliders() { return _svgSliders; }
function ceIconTrash()   { return _svgTrash; }
function ceIconUp()      { return _svgUp; }
function ceIconDown()    { return _svgDown; }

/* 페이지(=divider + 딸린 row들)를 한 덩어리로 위/아래 인접 블록과 자리 바꾼다.
   그룹(제목) 경계도 넘나들 수 있어, 원하는 순서로 페이지를 재배치할 수 있다.
   dir: -1(위) / +1(아래). 이미지·영상 등 단일 라인 블록과도 자리 바꿈이 된다. */
function moveSlideBlock(target, divIdx, dir) {
  const lines = ceLinesFor(target);
  if (!lines[divIdx] || lines[divIdx].type !== 'divider') return;
  let count = 1;
  while (divIdx + count < lines.length && lines[divIdx + count].type === 'row') count++;
  if (dir < 0) {
    if (divIdx === 0) return;
    let p = divIdx - 1;                          // 앞 블록의 시작 지점을 찾는다
    while (p > 0 && lines[p].type === 'row') p--;
    const moved = lines.splice(divIdx, count);
    lines.splice(p, 0, ...moved);
  } else {
    const nextStart = divIdx + count;
    if (nextStart >= lines.length) return;
    let nextCount = 1;
    if (lines[nextStart].type === 'divider') {
      while (nextStart + nextCount < lines.length && lines[nextStart + nextCount].type === 'row') nextCount++;
    }
    const moved = lines.splice(divIdx, count);
    lines.splice(divIdx + nextCount, 0, ...moved);
  }
  ceRenderContentLines(target); ceRenderPreview();
}

function updateGroupTitle(target, indices, v) {
  const lines = ceLinesFor(target);
  indices.forEach(i => { lines[i].title = v; });
  ceRenderPreview();
}

function addRowToGroup(target, divIdx) {
  const lines = ceLinesFor(target);
  let insertAt = divIdx + 1;
  while (insertAt < lines.length && lines[insertAt].type === 'row') insertAt++;
  lines.splice(insertAt, 0, { type: 'row', label: '', items: [] });
  ceRenderContentLines(target); ceRenderPreview();
}

function deletePair(target, divIdx) {
  const lines = ceLinesFor(target);
  let count = 1;
  while (divIdx + count < lines.length && lines[divIdx + count].type === 'row') count++;
  lines.splice(divIdx, count);
  ceRenderContentLines(target); ceRenderPreview();
}

function deleteRow(target, rowIdx) {
  ceLinesFor(target).splice(rowIdx, 1);
  ceRenderContentLines(target); ceRenderPreview();
}

function addSlide(target) {
  ceLinesFor(target).push(
    { type: 'divider', title: '새 슬라이드' },
    { type: 'row', label: '', items: [] }
  );
  ceRenderContentLines(target); ceRenderPreview();
}

function ceToggleFmt(target, divIdx) {
  const container = document.getElementById(ceContainerIdFor(target));
  const item = container.querySelector(`.cl-slide-item[data-div-idx="${divIdx}"]`);
  if (!item) return;
  const details = item.querySelector('.cl-fmt-details');
  if (details) details.open = !details.open;
}

function addPageToGroup(target, lastDivIdx) {
  const lines = ceLinesFor(target);
  const title = lines[lastDivIdx].title;
  let insertAt = lastDivIdx + 1;
  while (insertAt < lines.length && lines[insertAt].type === 'row') insertAt++;
  lines.splice(insertAt, 0,
    { type: 'divider', title },
    { type: 'row', label: '', items: [] }
  );
  ceRenderContentLines(target); ceRenderPreview();
}

/* 다른 제목의 새 페이지(=새 슬라이드 그룹)를 이 그룹 바로 뒤에 만든다.
   제목이 그룹 기준이라, 같은 제목이면 한 그룹으로 묶여버리므로 새 제목을 주려면
   그룹 전체가 끝난 지점에 별도 제목의 divider를 넣어야 한다. */
function addTitledPageAfter(target, divIdx) {
  const lines = ceLinesFor(target);
  const title = lines[divIdx].title;
  // 이 그룹(같은 제목의 연속 divider + 각자의 row들)의 끝 지점을 찾는다.
  let end = divIdx;
  while (end < lines.length) {
    if (lines[end].type === 'row') { end++; continue; }
    if (lines[end].type === 'divider' && lines[end].title === title) { end++; continue; }
    break;
  }
  // 그룹은 "제목이 같으면" 합쳐지므로, 새 페이지 제목이 앞(현재 그룹)이나 뒤 그룹 제목과
  // 같으면 별도 그룹이 되지 않는다. 앞뒤와 겹치지 않는 기본 제목을 만들어 준다.
  const afterTitle = (lines[end] && lines[end].type === 'divider') ? lines[end].title : null;
  const base = '새 슬라이드';
  let newTitle = base, n = 2;
  while (newTitle === title || newTitle === afterTitle) newTitle = `${base} ${n++}`;
  lines.splice(end, 0,
    { type: 'divider', title: newTitle },
    { type: 'row', label: '', items: [] }
  );
  ceRenderContentLines(target); ceRenderPreview();
}

/* 액션바의 + 버튼: 누르면 "행 추가 / 페이지 추가(같은 제목) / 새 페이지(다른 제목)"를
   고를 수 있는 작은 메뉴를 연다. 행 추가는 이 페이지에 행 하나를, 같은 제목 페이지 추가는
   같은 그룹에 새 페이지를, 다른 제목 새 페이지는 이 그룹 뒤에 별도 제목의 새 그룹을 만든다. */
function ceShowAddMenu(ev, target, divIdx) {
  ev.stopPropagation();
  document.querySelectorAll('.cl-add-menu').forEach(m => m.remove());
  const btn = ev.currentTarget || (ev.target && ev.target.closest('button'));
  if (!btn) return;
  const menu = document.createElement('div');
  menu.className = 'cl-add-menu';
  const mkBtn = (label, fn) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.addEventListener('click', () => { menu.remove(); fn(); });
    return b;
  };
  menu.appendChild(mkBtn('행 추가', () => addRowToGroup(target, divIdx)));
  menu.appendChild(mkBtn('페이지 추가 (같은 제목)', () => addPageToGroup(target, divIdx)));
  menu.appendChild(mkBtn('새 페이지 (다른 제목)', () => addTitledPageAfter(target, divIdx)));
  document.body.appendChild(menu);
  const r = btn.getBoundingClientRect();
  const left = Math.max(8, window.scrollX + r.right - menu.offsetWidth);
  menu.style.top  = `${window.scrollY + r.bottom + 4}px`;
  menu.style.left = `${left}px`;
  const off = e => { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('mousedown', off); } };
  setTimeout(() => document.addEventListener('mousedown', off), 0);
}

function deleteGroup(target, firstDivIdx) {
  const lines = ceLinesFor(target);
  const title = lines[firstDivIdx].title;
  let end = firstDivIdx;
  while (end < lines.length) {
    if ((lines[end].type === 'divider' && lines[end].title === title) || lines[end].type === 'row') { end++; }
    else break;
  }
  lines.splice(firstDivIdx, end - firstDivIdx);
  ceRenderContentLines(target); ceRenderPreview();
}

function updateLine(target,i,f,v)    { ceLinesFor(target)[i][f]=v; ceRenderPreview(); }
// 배치 변경 시 '텍스트 폭' 입력 노출 여부가 바뀌므로 편집기까지 다시 그린다.
function updateImgLayout(target,i,v) { const l=ceLinesFor(target)[i]; l.imgLayout=v; ceRenderContentLines(target); ceRenderPreview(); }
function updateLineItems(target,i,v) {
  // 규칙: 일반 엔터(\n) = 새 항목. ZWSP(U+200B)로 시작하는 줄 = 같은 항목 안 줄바꿈(Shift+Enter,
  //   → U+2028로 이어 붙임). a./b./c. 로 시작하는 줄 = 하위 항목(<br>로 이어 붙임).
  const LS = String.fromCharCode(0x2028);
  const ZWSP = String.fromCharCode(0x200B);
  const LEADING_ZWSP_RE = new RegExp('^' + ZWSP + '+');
  const lines = v.split('\n');
  const items = [];
  let cur = null;
  for (const raw of lines) {
    const soft = raw.charCodeAt(0) === 0x200B;
    // ZWSP가 한 개가 아니라 여러 개 연달아 남아있는 경우(예전 버그로 실제 저장된 데이터에서
    // 확인됨)에도 전부 걷어낸다 — 하나만 벗기면 남은 ZWSP 때문에 a./b. 마커 검사가 실패한다.
    const ln = soft ? raw.replace(LEADING_ZWSP_RE, '') : raw;
    // a./b./c. 줄은 Shift+Enter(soft)로 넘어왔든 그냥 Enter로 넘어왔든 항상 하위 항목으로
    // 취급한다. soft만 먼저 걸러 무조건 LS로 이어붙이면, a. 다음 줄을 Shift+Enter로 쳤을 때
    // b.가 하위 항목(<br>)이 아니라 그냥 이어지는 일반 줄(굵게 표시 안 됨)로 저장되는 버그가 있었다.
    if (/^[a-z]\.\s/.test(ln) && cur !== null) {       // 하위 항목
      cur += '<br>' + ln;
      continue;
    }
    if (soft) {                                       // 같은 항목 안 줄바꿈
      cur = (cur === null) ? ln : cur + LS + ln;
      continue;
    }
    if (ln === '') continue;                           // 일반 빈 줄은 버림
    if (cur !== null) items.push(cur);
    cur = ln;
  }
  if (cur !== null) items.push(cur);
  ceLinesFor(target)[i].items = items;
  ceRenderPreview();
}
function deleteLine(target,i)        { ceLinesFor(target).splice(i,1); ceRenderContentLines(target); ceRenderPreview(); }
function addDivider(target)          { ceLinesFor(target).push({ type:'divider', title:'새 슬라이드' }); ceRenderContentLines(target); ceRenderPreview(); }
function toggleDividerImg(target,i) {
  const line = ceLinesFor(target)[i];
  if (line.img != null) {
    delete line.img; delete line.imgLayout; delete line.imgSize;
  } else {
    line.img = 1; line.imgLayout = 'right'; line.imgSize = 50;
  }
  ceRenderContentLines(target); ceRenderPreview();
}
function addContentRow(target)      { ceLinesFor(target).push({ type:'row', label:'새 라벨', items:['내용을 입력하세요'] }); ceRenderContentLines(target); ceRenderPreview(); }
function addImageSlide(target)      { ceLinesFor(target).push({ type:'image', images:[{ img:1, caption:'' }], title:'' }); ceRenderContentLines(target); ceRenderPreview(); }
function updateImageItem(target,li,ii,f,v) { ceLinesFor(target)[li].images[ii][f] = v; ceRenderPreview(); }
function addImageItem(target,li)     { ceLinesFor(target)[li].images.push({ img:1, caption:'' }); ceRenderContentLines(target); ceRenderPreview(); }
function removeImageItem(target,li,ii) { ceLinesFor(target)[li].images.splice(ii,1); ceRenderContentLines(target); ceRenderPreview(); }

// ── 전면 이미지 슬라이드 (이미지 슬라이드처럼 번호로 참조) ──
// 이미지 슬라이드와 동일하게 img:숫자(=/hoistory/lms/img/{강번호}_{번호}.png)를 참조한다.
// 화면을 꽉 채우는 슬라이드로 렌더된다. (예전 Storage 업로드분은 line.url로 계속 표시된다.)
function addFullImageSlide(target) {
  ceLinesFor(target).push({ type:'fullimage', img:1 });
  ceRenderContentLines(target); ceRenderPreview();
}
function deleteFullImage(target, i) {
  const line = ceLinesFor(target)[i];
  if (line.storagePath) deleteObject(sRef(storage, line.storagePath)).catch(() => {}); // 예전 업로드분 정리
  ceLinesFor(target).splice(i, 1);
  ceRenderContentLines(target); ceRenderPreview();
}

// ── 영상 슬라이드 (유튜브 임베드) ──
function ceParseYouTubeId(url) {
  if (!url) return '';
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/))([A-Za-z0-9_-]{11})/);
  if (m) return m[1];
  const m2 = url.match(/[?&]v=([A-Za-z0-9_-]{11})/);
  if (m2) return m2[1];
  if (/^[A-Za-z0-9_-]{11}$/.test(url.trim())) return url.trim();
  return '';
}

// 유튜브 주소에 붙은 시작 시간(t 또는 start)을 초로 바꾼다.
// "공유"로 복사하면 t=90 또는 t=90s, 주소창에서 그대로 가져오면 t=1m30s / t=1h2m3s 형태다.
// 시작 시간이 없으면 0.
function ceParseYouTubeStart(url) {
  if (!url) return 0;
  const m = String(url).match(/[?&#](?:t|start)=([0-9hms]+)/i);
  if (!m) return 0;
  const raw = m[1].toLowerCase();
  if (/^\d+s?$/.test(raw)) return parseInt(raw, 10) || 0;
  const hms = raw.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!hms) return 0;
  return (+(hms[1] || 0)) * 3600 + (+(hms[2] || 0)) * 60 + (+(hms[3] || 0));
}
function addVideoSlide(target) {
  ceLinesFor(target).push({ type:'video', url:'', videoId:'', videoStart:0 });
  ceRenderContentLines(target); ceRenderPreview();
}
function updateVideoUrl(target, i, v) {
  const line = ceLinesFor(target)[i];
  line.url = v.trim();
  line.videoId = ceParseYouTubeId(v);
  line.videoStart = ceParseYouTubeStart(v); // 주소에 시작 시간이 있으면 그 지점부터 재생한다
  if (v.trim() && !line.videoId) alert('유효한 유튜브 URL을 인식하지 못했습니다. 주소를 확인해 주세요.');
  ceRenderContentLines(target); ceRenderPreview();
}

let ceDragSrcIdx = null;
let ceDragSrcTarget = null;
function ceWireDragEvents(target) {
  const containerId = ceContainerIdFor(target);

  function wireGroup(el, getFirstIdx, countLines) {
    const handle = el.querySelector(':scope > .cl-group-header > .cl-handle, :scope > .cl-divider-top > .cl-handle');
    if (handle) {
      handle.style.cursor = 'grab';
      handle.addEventListener('mousedown', () => el.setAttribute('draggable', 'true'));
      handle.addEventListener('mouseup',   () => el.setAttribute('draggable', 'false'));
    }
    el.addEventListener('dragstart', e => {
      ceDragSrcIdx = getFirstIdx(el);
      ceDragSrcTarget = target;
      el.classList.add('dragging');
      e.stopPropagation();
    });
    el.addEventListener('dragend', () => {
      el.classList.remove('dragging');
      el.setAttribute('draggable', 'false');
    });
    el.addEventListener('dragover', e => e.preventDefault());
    el.addEventListener('drop', e => {
      e.preventDefault();
      e.stopPropagation();
      if (ceDragSrcTarget !== target) return;
      const lines = ceLinesFor(target);
      const src = ceDragSrcIdx;
      const dst = getFirstIdx(el);
      if (src === null || src === dst) return;
      const count = countLines(lines, src);
      const moved = lines.splice(src, count);
      lines.splice(src < dst ? dst - count : dst, 0, ...moved);
      ceDragSrcIdx = null;
      ceRenderContentLines(target);
      ceRenderPreview();
    });
  }

  // 그룹 드래그
  document.querySelectorAll(`#${containerId} .cl-group[data-first-div]`).forEach(el => {
    wireGroup(
      el,
      el => +el.dataset.firstDiv,
      (lines, src) => {
        const title = lines[src].title;
        let c = 0, j = src;
        while (j < lines.length && ((lines[j].type === 'divider' && lines[j].title === title) || lines[j].type === 'row')) { j++; c++; }
        return c;
      }
    );
  });

  // 이미지 슬라이드 드래그
  document.querySelectorAll(`#${containerId} .cl-image`).forEach(el => {
    wireGroup(
      el,
      el => +el.dataset.idx,
      (_lines, _src) => 1
    );
  });

  // 페이지 순서 변경 드래그 (같은 그룹 내)
  document.querySelectorAll(`#${containerId} .cl-slide-item[data-div-idx]`).forEach(el => {
    const handle = el.querySelector('.cl-page-handle');
    if (!handle) return;
    handle.addEventListener('mousedown', () => el.setAttribute('draggable', 'true'));
    handle.addEventListener('mouseup',   () => el.setAttribute('draggable', 'false'));
    el.addEventListener('dragstart', e => {
      ceDragSrcIdx = +el.dataset.divIdx;
      ceDragSrcTarget = target;
      el.classList.add('dragging');
      e.stopPropagation();
    });
    el.addEventListener('dragend', () => { el.classList.remove('dragging'); el.setAttribute('draggable', 'false'); });
    el.addEventListener('dragover', e => e.preventDefault());
    el.addEventListener('drop', e => {
      e.preventDefault(); e.stopPropagation();
      if (ceDragSrcTarget !== target) return;
      const lines = ceLinesFor(target);
      const srcDiv = ceDragSrcIdx, dstDiv = +el.dataset.divIdx;
      if (srcDiv === null || srcDiv === dstDiv) return;
      let srcCount = 1;
      while (srcDiv + srcCount < lines.length && lines[srcDiv + srcCount].type === 'row') srcCount++;
      const moved = lines.splice(srcDiv, srcCount);
      lines.splice(srcDiv < dstDiv ? dstDiv - srcCount : dstDiv, 0, ...moved);
      ceDragSrcIdx = null;
      ceRenderContentLines(target); ceRenderPreview();
    });
  });
}

// ── Opening Question 폼 (안내 문구 = 질문 하나만) ──
// 사료처럼 양끝 따옴표 + Paperlogy 굵게로 질문만 크게 띄우므로, 질문 한 칸만 받는다.
function ceRenderDiveForm() {
  const d = ceCd.dive;
  const el = document.getElementById('dive-form');
  // 토글: 질문 내용이 있을 때만 활성. 없으면 비활성 표시.
  const hasContent = !!(d.guide || d.title || d.img != null);
  const tog = document.getElementById('opening-toggle');
  if (tog) {
    tog.classList.toggle('on', d.openingEnabled !== false && hasContent);
    tog.classList.toggle('disabled', !hasContent);
  }
  el.innerHTML = ceFTextarea('질문', d.guide || d.title || '', `updateDive('guide',this.value)`, 3, '사료처럼 큰 따옴표와 함께 크게 표시됩니다.');
  ceRenderChosungForm();
}
function updateDive(f,v){ ceCd.dive[f]=v; ceRenderPreview(); }
function updateDiveImg(v){ ceCd.dive.img = v.trim()==='' ? null : +v; ceRenderPreview(); }
function toggleOpeningEnabled() {
  const d = ceCd.dive;
  if (!(d.title || d.guide || d.img != null)) return; // 내용 없으면 토글 비활성
  updateOpeningEnabled(!(d.openingEnabled !== false));
}
function updateOpeningEnabled(v) { ceCd.dive.openingEnabled = v; ceRenderDiveForm(); ceRenderPreview(); }

function ceRenderChosungForm() {
  const d = ceCd.dive;
  const tog = document.getElementById('chosung-toggle');
  if (tog) tog.classList.toggle('on', !!d.chosungEnabled);
  const el = document.getElementById('chosung-form');
  el.innerHTML = d.chosungEnabled
    ? ceFTextarea('초성 퀴즈 항목', d.chosungItems.join('\n'), `updateChosungItems(this.value)`, 4, '한 줄 = 항목 하나, 학습 목표 슬라이드와 같은 번호 목록으로 표시됩니다.')
    : '';
}
function toggleChosungEnabled()  { updateChosungEnabled(!ceCd.dive.chosungEnabled); }
function updateChosungEnabled(v) { ceCd.dive.chosungEnabled = v; ceRenderChosungForm(); ceRenderPreview(); }
function updateChosungItems(v)   { ceCd.dive.chosungItems = v.split('\n').filter(s=>s.trim()!==''); ceRenderPreview(); }

// ── 생각 Check 폼 ──
function ceRenderThinkForm() {
  const t = ceCd.think;
  const el = document.getElementById('think-form');
  el.innerHTML = `
    ${ceFTextarea('오늘의 질문', t.question, `updateThink('question',this.value)`, 3)}
    ${ceFTextarea('안내 문구', t.guide, `updateThink('guide',this.value)`, 3)}`;
}
function updateThink(f,v){ ceCd.think[f]=v; ceRenderPreview(); }

function ceFInputInline(label, val, handler) {
  return `<div class="field-inline"><label class="field-inline-label">${label}</label><input class="field-input" type="text" value="${esc(val)}" oninput="${handler}"></div>`;
}
function ceFTextarea(label, val, handler, rows=2, hint='') {
  const h = hint ? ` <span class="field-hint">${hint}</span>` : '';
  return `<div class="field-group"><div class="field-label">${label}${h}</div><textarea class="field-input" rows="${rows}" oninput="${handler};autoResizeTa(this)">${esc(val)}</textarea></div>`;
}

// ceCd({lesson, contentLines, think})를 현재 강의의 Firestore 문서에 그대로 저장.
// 학생 페이지(lesson.html)는 이 content 필드를 읽어서 SlideRender.buildSlidesFromData로
// 직접 slides를 만들기 때문에, 여기서 slides를 미리 계산해서 같이 저장할 필요는 없다.
async function ceSaveContentToFirestore(docId, cd) {
  await updateDoc(doc(db, 'class_lessons', docId), {
    num: cd.lesson.num,
    title: cd.lesson.title,
    unit: cd.lesson.unit,
    content: { lesson: cd.lesson, dive: cd.dive, contentLines: cd.contentLines, mission: cd.mission, think: cd.think }
  });
}

async function saveContent() {
  ['concept', 'mission'].forEach(target => {
    document.querySelectorAll(`#${ceContainerIdFor(target)} .cl-opt-labelpos`).forEach(cb => {
      const item = cb.closest('[data-div-idx]');
      if (!item) return;
      const line = ceLinesFor(target)[+item.dataset.divIdx];
      if (!line) return;
      if (cb.checked) line.labelPos = 'left';
      else delete line.labelPos;
    });
  });
  const lesson = ceLessonsCache.find(l => l.num === ceCurrentLessonNum);
  if (!lesson) return;
  await ceSaveContentToFirestore(lesson.docId, ceCd);
  await ceSyncThinkLecture(ceCd);   // 생각 체크 질문이 있으면 생각 체크 강의를 자동 생성/동기화
  await ceGetLessonsFromFirestore();
  ceCurrentLessonNum = ceCd.lesson.num;
  cePopulateLessonSelect();
  ceShowToast('toast-content');
}

// 저장 시, 콘텐츠의 생각 체크 질문으로 think_lectures 강의를 자동 생성(강의당 1개, 비공개)하고
// 성적 설정(grade_lecture_config.thinkLectureDocId)에 연결까지 해둔다. 이미 연결돼 있으면 제목·질문만 갱신.
async function ceSyncThinkLecture(cd) {
  const question = (cd?.think?.question || '').trim();
  const num = cd?.lesson?.num;
  if (!question || !num) return;
  const title = lecLabel(num, cd.lesson.title || '').trim();
  // 콘텐츠 생각 Check의 안내(보충설명, think.guide)를 활동의 설명(reference)으로 그대로 끌어온다.
  const reference = (cd?.think?.guide || '').trim();
  try {
    const cfgRef = doc(db, 'grade_lecture_config', num);
    const cfgSnap = await getDoc(cfgRef);
    let linkId = cfgSnap.exists() ? (cfgSnap.data().thinkLectureDocId || '') : '';
    if (linkId) {
      const exist = await getDoc(doc(db, 'think_lectures', linkId));
      if (!exist.exists()) linkId = ''; // 연결은 있는데 문서가 지워진 경우 새로 만든다
    }
    if (linkId) {
      await updateDoc(doc(db, 'think_lectures', linkId), { title, question, reference });
    } else {
      const ref = await addDoc(collection(db, 'think_lectures'), {
        title, question, reference, icon: num, order: lecOrderKey(num),
        isOpen: false, isArchived: false, createdAt: Date.now()
      });
      await setDoc(cfgRef, { thinkLectureDocId: ref.id, lessonTitle: cd.lesson.title || lecTag(num) }, { merge: true });
    }
  } catch (e) { console.warn('생각 체크 강의 자동 생성 실패', e); }
}
async function resetContent() {
  if (!confirm('기본값으로 초기화하시겠습니까?')) return;
  const lesson = ceLessonsCache.find(l => l.num === ceCurrentLessonNum);
  if (lesson) {
    await updateDoc(doc(db, 'class_lessons', lesson.docId), { content: null });
    await ceGetLessonsFromFirestore();
  }
  ceLoadLessonData(ceCurrentLessonNum);
}

// ── 활동지 파일(hwpx/pdf) 업로드로 새 강의 자동 생성 ──
// hwpx는 zip 안의 Preview/PrvText.txt(한글이 검색 색인용으로 만들어두는 순수 텍스트)를
// 우선 사용하고, 없으면 Contents/section*.xml에서 태그만 제거해 텍스트를 뽑아낸다.
// pdf는 텍스트 추출 없이 파일 그대로 Claude에 문서로 전달한다(Claude가 PDF를 직접 읽을 수 있음).
async function ceExtractHwpxText(file) {
  const zip = await JSZip.loadAsync(file);
  // Preview/PrvText.txt는 한글이 미리보기·검색 색인용으로 만드는 요약 텍스트라
  // 문서가 길면 중간에서 잘려 있을 수 있다. 전체 본문이 들어있는 section*.xml을
  // 먼저 시도하고, 그게 비어 있을 때만 PrvText.txt로 대체한다.
  const sectionNames = Object.keys(zip.files)
    .filter(n => /^Contents\/section\d+\.xml$/.test(n))
    .sort();
  let text = '';
  for (const name of sectionNames) {
    const xml = await zip.file(name).async('string');
    text += xml.replace(/<[^>]+>/g, '\n').replace(/\n{2,}/g, '\n') + '\n';
  }
  if (text.trim()) return text;

  const preview = zip.file('Preview/PrvText.txt');
  if (preview) {
    const previewText = await preview.async('string');
    if (previewText.trim()) return previewText;
  }
  return text;
}

function ceFileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const CE_LESSON_JSON_SCHEMA = `{
  "lesson": { "title": "수업 제목", "unit": "학습 단원 (예: Ⅲ-4. 고려의 생활과 문화)", "page": "교과서 페이지", "objectives": ["학습 목표 문장(번호 없이)", "..."] },
  "dive": { "title": "", "guide": "수업 여는 질문(Opening Question) 문장 하나 (없으면 빈 문자열)" },
  "chosungItems": ["초성 퀴즈 문제/정답 한 줄(번호 없이) (초성 퀴즈가 없으면 빈 배열)", "..."],
  "conceptContentLines": [
    { "type": "divider", "title": "슬라이드 제목" },
    { "type": "row", "label": "회색 칸(행 라벨) 텍스트", "items": ["원문자(①②③) 단위 항목. 하위 a.b.c. 줄은 <br>로 이어붙임", "..."] },
    { "type": "divider", "title": "전체 슬라이드 제목", "format": "quote", "quoteLabel": "사료 소제목((가)/① 등, 없으면 빈 문자열)", "quoteText": "사료 원문 텍스트 (빈칸은 {정답} 표기)", "quoteSource": "출처 (예: 「삼국사기」)" }
  ],
  "missionContentLines": [
    { "type": "divider", "title": "슬라이드 제목" },
    { "type": "row", "label": "회색 칸(행 라벨) 텍스트", "items": ["원문자(①②③) 단위 항목. 하위 a.b.c. 줄은 <br>로 이어붙임", "..."] },
    { "type": "divider", "title": "전체 슬라이드 제목", "format": "quote", "quoteLabel": "사료 소제목((가)/① 등, 없으면 빈 문자열)", "quoteText": "사료 원문 텍스트 (빈칸은 {정답} 표기)", "quoteSource": "출처 (예: 「삼국사기」)" }
  ],
  "think": { "question": "오늘의 생각 질문", "guide": "답변 안내 문구" }
}`;

const CE_LESSON_JSON_INSTRUCTION = `다음은 중학교 역사 수업 활동지 내용이다. 이 내용을 아래 JSON 스키마로 옮겨 적어줘.

가장 중요한 원칙: 이건 활동지를 그대로 옮기는 "전사" 작업이다. 활동지에 없는 문장·설명·예시·학습 목표를 새로 만들어서 추가하지 마라. 활동지에 적힌 텍스트만 그대로 옮겨라. 아래 "빈칸 채우기"만 유일한 예외다(빈칸에 들어갈 정답을 채워 넣는 것).

활동지 내용은 성격에 따라 나눠 담아야 한다:
- dive(Opening Question): 수업을 여는 질문. 활동지에 "오프닝 퀘스천" 또는 수업 시작 질문이 있으면 그 질문 문장을 guide에 담아라(질문 하나만, 따옴표 없이). title은 빈 문자열("")로 둔다. 이런 질문이 없으면 guide도 빈 문자열로 둔다.
- chosungItems: 활동지에 초성 퀴즈(예: ㄱㄴㄷ으로 단어 맞히기)가 있으면 문제를 한 줄씩 배열로 그대로 옮겨라. 없으면 빈 배열로 둬라.
- conceptContentLines: 개념 설명, 빈칸 채우기, 용어 정리 등 "배우는" 내용.
- missionContentLines: 학생이 직접 해보는 활동·과제·퀘스트·게임형 미션 내용.
- think: 수업 마무리에 학생 스스로 생각해서 답하는 서술형 질문.

conceptContentLines·missionContentLines 규칙 (정확히 지켜라. 표 하나를 예로 설명한다):
활동지의 표는 왼쪽에 회색(음영) 칸, 오른쪽에 실제 내용이 있는 구조다.
- 회색 칸 하나(행 라벨, 예: "1. 태조")가 슬라이드 하나에 대응한다. 회색 칸이 바뀔 때마다 반드시 새로 {"type":"divider","title":"..."}를 만들고 바로 뒤에 row 하나를 배치해라. 구분선 1개 + row 1개가 항상 짝을 이뤄 반복돼야 한다 — 회색 칸이 여러 개면 divider도 그 개수만큼 반복해서 각각 넣어라. 절대 두 개 이상의 row를 하나의 divider 아래 연달아 두지 마라.
- divider의 title은 그 표가 속한 절/구역의 부제목(활동지에서 "개념 체크" 뒤에 적힌 소제목)을 그대로 옮겨 적어라. 같은 부제 아래 회색 칸이 여러 개면 그 부제를 각 슬라이드 title에 반복해서 써라.
- row의 label은 회색 칸에 적힌 텍스트를 그대로 옮겨라.
- row의 items 배열은 원문자(①②③...) 단위로 하나씩 나눠 담아라 — ①로 시작하는 내용 전체가 items의 원소 하나, ②로 시작하는 내용이 다음 원소, 이런 식이다.
- 원문자 뒤에 a. b. c. 같은 하위 글자 목록이나 "→"로 이어지는 줄이 붙어 있으면, 그 하위 줄들은 새 item으로 쪼개지 말고 같은 item 문자열 안에 <br>로 이어붙여서 한 줄씩 표시되게 해라. (예: "① 건국 과정 : a. {이성계} : {위화도 회군} 이후 정권 장악<br>b. {과전법} 실시(1391) : 경기 지역의 토지에 한해 관직 복무 대가로 {수조권} 지급<br>c. 국가 통치 이념으로 {성리학}을 내세우고, {온건파} 사대부를 숙청 → {조선} 건국(1392)") <br> 태그는 한 번에 하나씩만 써라(<br><br> 같은 중복 금지).
- 빈칸 처리: 활동지에 실제로 비어 있는 칸(밑줄 ___, 괄호 ( ), ○○, 네모칸 등 학생이 채워 넣도록 비워 둔 자리)에 대해서만 정답을 중괄호 한 겹으로 감싸라: {정답}. 이미 인쇄되어 있는(비어 있지 않은) 단어·문장은 그게 정답에 해당하더라도 절대 {}로 감싸지 마라 — 원문 그대로 둬라. 즉 원래 빈칸이 아닌 것을 빈칸으로 만들면 안 된다. 중괄호를 두 겹({{정답}})으로 쓰지 마라 — 항상 한 겹만. 빈칸의 정답을 확신할 수 없으면 빈칸 표시 없이 원문 그대로 둬라(추측해서 틀린 답을 넣지 마라).
- 빈칸을 채우는 것 외에는 원문에 있는 문구를 고치거나 다듬지 말고 그대로 옮겨라.
- 활동지에 점선 테두리 박스(사료 인용)가 있으면 {"type":"divider","title":"슬라이드 제목","format":"quote","quoteText":"박스 안 원문","quoteSource":"출처(있을 경우)"} 형식으로 표현해라. 이 경우 row를 추가하지 않는다.
  - 사료 title/quoteLabel 규칙: title에는 그 사료가 속한 "전체 슬라이드 제목"(활동지의 구역·소단원 제목, 예: "사료를 통해 바라본 조선 초기 국왕들의 모습")을 넣어라. 같은 구역에 속한 여러 사료는 title을 똑같이 맞춰라(그래야 한 묶음으로 표시된다). 사료 앞에 (가)/(나)/(다) 또는 ①/②/③ 같은 글머리 기호(그 뒤에 소제목이 붙어 있으면 소제목까지)가 있으면 그 부분을 quoteLabel에 넣고 quoteText에서는 뺀다. 예: 구역 제목 "…국왕들의 모습" 아래 "(가) 조선의 통치제도\n의정부의 여러 일을…" → title="…국왕들의 모습", quoteLabel="(가) 조선의 통치제도", quoteText="의정부의 여러 일을…". 글머리 기호가 없으면 quoteLabel은 빈 문자열("")로 둔다.
- 표 안의 그림·도식은 텍스트로 옮길 수 없으면 생략해도 된다.
- 해당하는 내용이 활동지에 없으면 빈 배열 []로 둬라.

- objectives(학습 목표)와 chosungItems(초성 퀴즈 항목)는 화면에 표시할 때 자동으로 번호가 매겨지므로, 활동지에 적힌 번호(1. / ① / 가. 등)는 결과에 포함하지 말고 번호를 뗀 내용만 적어라.
- 학습 목표가 활동지에 명시적으로 적혀 있지 않으면 objectives를 빈 배열로 둬라. 추측해서 만들어내지 마라.
- 다른 설명 없이 아래 스키마와 동일한 구조의 JSON만 출력해줘.

스키마:
${CE_LESSON_JSON_SCHEMA}

활동지 내용:
`;

async function ceRequestLessonJson(content) {
  const messageContent = typeof content === 'string'
    ? [{ type: 'text', text: CE_LESSON_JSON_INSTRUCTION + content }]
    : [
        { type: 'text', text: CE_LESSON_JSON_INSTRUCTION },
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: content.data } }
      ];
  const res = await fetch(CLAUDE_PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type':'application/json' },
    body: JSON.stringify({ model:'claude-opus-4-8', max_tokens:16000, messages:[{ role:'user', content: messageContent }] })
  });
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json())?.error?.message || ''; } catch(e) {}
    throw new Error(`API 오류 ${res.status}${detail ? ' - ' + detail : ''}`);
  }
  const data = await res.json();
  if (data.stop_reason === 'max_tokens') {
    throw new Error('활동지 내용이 길어서 응답이 중간에 잘렸습니다. 활동지를 나눠서 올려주세요.');
  }
  const raw = (data.content?.[0]?.text || '').replace(/```json|```/g,'').trim();
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('AI 응답에서 JSON을 찾을 수 없습니다.');
  return ceSanitizeParsedLesson(JSON.parse(jsonMatch[0]));
}

// AI가 프롬프트를 어기고 실수하는 것들을 코드에서 한 번 더 바로잡는다:
// 1) 강조 중괄호를 {{정답}}처럼 두 겹으로 쓰는 경우 -> {정답}로 축소
// 2) 하위 글자 목록(a. b. c.) 앞에 <br>을 빼먹은 경우 -> 자동으로 끼워 넣고, <br>이 중복된 경우 하나로 정리
// 3) 회색 칸(행)마다 새 divider를 안 만들고 여러 row를 divider 하나에 몰아넣은 경우 -> row 앞에 divider가 없으면 자동으로 끼워 넣어서 슬라이드를 분리
// 4) 학습 목표·초성 퀴즈 앞에 번호(1. / ① 등)가 남아있는 경우 -> 제거(화면에서 자동으로 번호가 붙으므로)
function ceSanitizeParsedLesson(d) {
  const fixBraces = s => typeof s === 'string' ? s.replace(/\{{2,}/g, '{').replace(/\}{2,}/g, '}') : s;
  const fixBreaks = s => {
    if (typeof s !== 'string') return s;
    let out = fixBraces(s).replace(/(<br\s*\/?>|<\/br>)+/gi, '<br>');
    // b. c. d. ...(a.는 제외 — 항상 첫 하위 항목이라 앞에 줄바꿈이 필요 없음) 앞에
    // <br>이 빠져 있으면 자동으로 끼워 넣는다.
    out = out.replace(/(?<!<br>)\s+([b-z]\.\s)/g, '<br>$1');
    return out;
  };
  const stripLeadingNumber = s => typeof s === 'string'
    ? s.replace(/^\s*(?:[0-9]+[.)]|[①-⑳])\s*/, '')
    : s;
  const fixLines = lines => (lines || []).map(line => {
    if (line.type === 'row') return { ...line, label: fixBraces(line.label) || '', items: (line.items||[]).map(fixBreaks) };
    if (line.type === 'divider') {
      const out = { ...line, title: fixBraces(line.title) || '' };
      // 사료 인용(quote) 슬라이드가 아니면 quoteText/quoteSource 키 자체가 없다.
      // 없는 값에 fix 함수를 돌리면 undefined가 생겨 Firestore 저장이 실패하므로, 있을 때만 넣는다.
      if (line.quoteText   !== undefined) out.quoteText   = fixBreaks(line.quoteText);
      if (line.quoteSource !== undefined) out.quoteSource = fixBraces(line.quoteSource);
      if (line.quoteLabel  !== undefined) out.quoteLabel  = fixBraces(line.quoteLabel);
      if (line.noticeText  !== undefined) out.noticeText  = fixBreaks(line.noticeText);
      return out;
    }
    return line;
  });
  // 행(row) 하나 = 슬라이드 하나가 기본값이므로, row 앞에 divider가 없으면 자동으로 끼워 넣는다.
  const enforceOnePerSlide = lines => {
    const out = [];
    let lastTitle = '';
    let prevWasDivider = false;
    for (const line of fixLines(lines)) {
      if (line.type === 'divider') {
        lastTitle = line.title || lastTitle;
        out.push(line);
        prevWasDivider = true;
      } else if (line.type === 'row') {
        if (!prevWasDivider) out.push({ type: 'divider', title: lastTitle });
        out.push(line);
        prevWasDivider = false;
      } else {
        out.push(line);
        prevWasDivider = false;
      }
    }
    return out;
  };
  // enforceOnePerSlide 뒤에 남는 "빈 divider"(뒤에 행도 없고 사료 텍스트·이미지·특수형식 데이터도 없이
  // 제목만 있는 슬라이드)를 제거한다. AI가 사료 앞에 구역 제목용 빈 divider를 하나 더 만들어
  // 빈 페이지가 생기던 것을 막는다.
  const dropEmptyDividers = lines => lines.filter((line, k) => {
    if (line.type !== 'divider') return true;
    const next = lines[k + 1];
    if (next && next.type === 'row') return true;   // 뒤에 행이 있으면 내용 있음
    if (line.img != null) return true;              // 이미지 있음
    const fmt = line.format;
    if (fmt === 'notice') return !!(line.noticeText && line.noticeText.trim());
    if (fmt === 'cols') return !!(line.colsTitle && line.colsTitle.trim()) || (line.cols || []).some(c => (c.head && c.head.trim()) || (c.body && c.body.trim()));
    if (fmt === 'quote') return !!(line.quoteText && line.quoteText.trim());
    if (fmt === 'timeline-h' || fmt === 'timeline-v') return (line.events || []).length > 0;
    if (fmt === 'compare') return (((line.left && line.left.items) || []).length + ((line.right && line.right.items) || []).length) > 0;
    if (fmt === 'flow-h' || fmt === 'flow-v') return (line.stages || []).length > 0;
    if (line.quoteText && line.quoteText.trim()) return true;  // rows + 하단 사료만 있는 페이지
    return false;                                   // rows 형식인데 뒤에 행 없음 → 빈 슬라이드, 제거
  });
  if (d.conceptContentLines) d.conceptContentLines = dropEmptyDividers(enforceOnePerSlide(d.conceptContentLines));
  if (d.missionContentLines) d.missionContentLines = dropEmptyDividers(enforceOnePerSlide(d.missionContentLines));
  if (d.dive) { d.dive.title = fixBraces(d.dive.title); d.dive.guide = fixBraces(d.dive.guide); }
  if (d.lesson?.objectives) d.lesson.objectives = d.lesson.objectives.map(stripLeadingNumber);
  if (d.chosungItems) d.chosungItems = d.chosungItems.map(s => stripLeadingNumber(fixBraces(s)));
  if (d.think) { d.think.question = fixBraces(d.think.question); d.think.guide = fixBraces(d.think.guide); }
  return d;
}

// Firestore는 undefined 필드를 거부한다. AI 응답에서 넘어온 객체/배열을 재귀적으로 훑어 undefined 값을 제거한다(안전망).
function ceStripUndefined(v) {
  if (Array.isArray(v)) return v.map(ceStripUndefined);
  if (v && typeof v === 'object') {
    const o = {};
    for (const k in v) if (v[k] !== undefined) o[k] = ceStripUndefined(v[k]);
    return o;
  }
  return v;
}

function ceValidateParsedLesson(d) {
  const validLines = ls => Array.isArray(ls) && ls.every(l => l && (l.type==='divider'||l.type==='row'||l.type==='image'));
  return !!d && d.lesson && typeof d.lesson === 'object'
    && Array.isArray(d.lesson.objectives)
    && validLines(d.conceptContentLines)
    && validLines(d.missionContentLines)
    && d.dive && typeof d.dive === 'object'
    && Array.isArray(d.chosungItems)
    && d.think && typeof d.think === 'object';
}

async function ceHandleFileUpload(file) {
  if (!file) return;
  const ext = file.name.split('.').pop().toLowerCase();
  const statusEl = document.getElementById('ce-file-status');
  const btnEl = document.getElementById('ce-file-btn');
  const inputEl = document.getElementById('ce-file-input');
  if (ext !== 'hwpx' && ext !== 'pdf') {
    alert('.hwpx 또는 .pdf 파일만 지원합니다.');
    inputEl.value = '';
    return;
  }

  // 파일명에 보통 "24. 제목" 또는 "24강 …"처럼 강 번호가 들어 있으므로 자동으로 뽑아 쓴다. 못 찾을 때만 직접 입력받는다.
  const base = file.name.replace(/\.[^.]+$/, ''); // 확장자 제거
  // "N강" 우선, 없으면 맨 앞 숫자(구분자 . ) 공백 전각마침표 등 무관)를 강 번호로 사용
  const m = base.match(/(\d+)\s*강/) || base.match(/^\s*(\d+)/);
  let num = m ? m[1] : '';
  if (!num) {
    num = (prompt('파일명에서 강 번호를 찾지 못했습니다. 강 번호를 입력하세요 (예: 24)') || '').trim();
    if (!num) { inputEl.value = ''; return; }
  }
  if (ceLessonsCache.find(l => l.num === num)) { alert(num + '강은 이미 있습니다.'); inputEl.value = ''; return; }

  btnEl.disabled = true;
  if (statusEl) statusEl.textContent = '파일 분석 중… (최대 1분 정도 걸릴 수 있습니다)';

  try {
    let parsed;
    if (ext === 'hwpx') {
      const text = await ceExtractHwpxText(file);
      if (!text.trim()) throw new Error('파일에서 텍스트를 찾지 못했습니다.');
      parsed = await ceRequestLessonJson(text);
    } else {
      const base64 = await ceFileToBase64(file);
      parsed = await ceRequestLessonJson({ data: base64 });
    }
    if (!ceValidateParsedLesson(parsed)) throw new Error('AI 응답 구조가 올바르지 않습니다.');

    const order = lecOrderKey(num); // 강 번호 기준(큰 번호가 위)
    const content = {
      lesson: {
        num, title: parsed.lesson.title || '새 강의', unit: parsed.lesson.unit || '', page: parsed.lesson.page || '',
        objectives: parsed.lesson.objectives.length ? parsed.lesson.objectives : ['학습 목표를 입력하세요']
      },
      dive: {
        title: parsed.dive.title || '', guide: parsed.dive.guide || '',
        chosungEnabled: parsed.chosungItems.length > 0, chosungItems: parsed.chosungItems
      },
      contentLines: parsed.conceptContentLines,
      mission: { contentLines: parsed.missionContentLines },
      think: { question: parsed.think.question || '', guide: parsed.think.guide || '' }
    };
    await addDoc(collection(db, 'class_lessons'), ceStripUndefined({
      num, title: content.lesson.title, unit: content.lesson.unit, year: '2026', order, isOpen: false, content
    }));
    // 업로드로 "생성"만 하고 저장을 안 거치면 생각 체크 활동(think_lectures)·성적 연결이
    // 안 만들어져 학생 화면에 생각 체크가 안 뜬다. 생성 시점에도 함께 동기화해 둔다.
    await ceSyncThinkLecture(content);
    await ceGetLessonsFromFirestore();
    ceCurrentLessonNum = num;
    cePopulateLessonSelect();
    renderCeLessonOrder();
    ceLoadLessonData(num);
    const area = document.getElementById('ce-editor-area');
    if (area) area.style.display = '';
    const prevBtn2 = document.getElementById('ce-preview-btn');
    if (prevBtn2) prevBtn2.style.display = '';
    if (statusEl) statusEl.textContent = '생성되었습니다. 내용을 검토하고 저장해주세요.';
  } catch (e) {
    if (statusEl) statusEl.textContent = '';
    alert('강의 생성 실패: ' + e.message);
  } finally {
    btnEl.disabled = false;
    inputEl.value = '';
  }
}

// 예시 슬라이드 미리보기 (개념 Check 슬라이드 1개, 없으면 표지)
// 실제 페이지(lesson.html)와 완전히 동일한 slide-render.js로 그려서 미리보기와
// 실제 화면이 항상 100% 일치하도록 한다.
function ceRenderPreview(pickSample) {
  const inner = document.getElementById('design-pv-inner');
  if (!inner || !ceCd.contentLines) return;
  // 슬라이드 폰트가 아직 안 받아졌으면 초성 퀴즈 쪽 나눔이 대체 폰트 기준으로 잡힌다.
  // 처음 한 번만 기다렸다가 다시 그린다(그 뒤로는 즉시 통과).
  if (!ceFontsReady) {
    SlideRender.ensureSlideFonts().then(() => { ceFontsReady = true; ceRenderPreview(pickSample); });
    return;
  }
  const slides = SlideRender.buildSlidesFromData(ceCd);
  const sample = pickSample ? pickSample(slides) : (slides.find(s => s.type === 'concept') || slides[0]);
  inner.innerHTML = SlideRender.renderSlideHTML(sample, ceCd.lesson);
  // 미리보기에서는 영상이 바로 보이도록 iframe src를 채운다(발표 화면은 lecture.html이 관리).
  inner.querySelectorAll('iframe[data-vsrc]').forEach(f => f.setAttribute('src', f.dataset.vsrc));
  SlideRender.wireLightbox(inner);
  ceApplyDesignPreview();
  requestAnimationFrame(rescalePreview);
}

// ── 유틸 ──
function ceDeepCopy(o) { return JSON.parse(JSON.stringify(o)); }
function ceDeepMerge(def, src) {
  const r = ceDeepCopy(def);
  for (const k in src) {
    if (src[k] !== null && typeof src[k] === 'object' && !Array.isArray(src[k])) {
      r[k] = ceDeepMerge(def[k] || {}, src[k]);
    } else { r[k] = src[k]; }
  }
  return r;
}

let ceToastTimers = {};
function ceShowToast(id) {
  const el = document.getElementById(id);
  el.classList.add('show');
  clearTimeout(ceToastTimers[id]);
  ceToastTimers[id] = setTimeout(() => el.classList.remove('show'), 2500);
}

// ── 미션 체크 탭 ──────────────────────────────────────────────────────
let missionSelectedSvg = '';

async function initMissionTab() {
  let cat = '';
  try {
    const cfg = await getDoc(doc(db, 'settings', 'lms_config'));
    cat = cfg.exists() ? (cfg.data().mission_category || '') : '';
  } catch(_) {}
  if (!cat) {
    cat = 'mission_check';
    try { await setDoc(doc(db, 'settings', 'lms_config'), { mission_category: cat }, { merge: true }); } catch(_) {}
  }

  // 아이콘 미리보기 영역 자체를 클릭하면 선택창이 뜬다(별도 "아이콘 선택" 버튼 없음).
  const missionIconPreview = document.getElementById('missionIconPreview');
  mountIconPicker({
    triggerEl: missionIconPreview,
    previewEl:  missionIconPreview,
    onSelect:  (svg) => { missionSelectedSvg = svg; },
    storeSize: 28,
  });

  document.getElementById('missionAddCardBtn').addEventListener('click', async () => {
    const emoji    = missionSelectedSvg;
    const title    = document.getElementById('missionCardTitle').value.trim();
    const url      = document.getElementById('missionCardUrl').value.trim();
    const adminUrl = document.getElementById('missionCardAdminUrl').value.trim();
    const lessonNum = document.getElementById('missionCardLesson').value.trim();
    if (!title || !url) { alert('제목과 웹앱 주소를 입력해 주세요.'); return; }
    const btn = document.getElementById('missionAddCardBtn');
    btn.disabled = true;
    try {
      const snap  = await getDocs(query(collection(db, 'cards'), where('category','==',cat)));
      const order = snap.docs.length ? Math.max(...snap.docs.map(d => d.data().order || 0)) + 1 : 0;
      // 미션 카드는 비공개로 만들어 둔다 — 연결 강의의 수업일이 되면 대시보드가 자동으로 공개하고,
      // 급하면 공개 관리 토글로 바로 열 수 있다(dbAutoOpenBySchedule 참고).
      const cardData = { emoji, title, desc: '', url, category: cat, locked: true, order };
      if (adminUrl) cardData.adminUrl = adminUrl;
      if (lessonNum) cardData.lessonNum = lessonNum; // 연결할 개념체크 강의 번호
      await addDoc(collection(db, 'cards'), cardData);

      // 아카이브 정보 저장 (appKey = URL 두 번째 세그먼트)
      const topic   = document.getElementById('missionArchiveTopic').value.trim();
      const intent  = document.getElementById('missionArchiveIntent').value.trim();
      const content = document.getElementById('missionArchiveContent').value.trim();
      if (topic || intent || content) {
        const appKey = url.split('/')[1];
        if (appKey) await set(ref(rtdb, `adminConfig/${appKey}/archive`), { topic, intent, content });
      }

      missionSelectedSvg = '';
      const prev = document.getElementById('missionIconPreview');
      if (prev) { prev.innerHTML = ''; prev.classList.add('empty'); }
      document.getElementById('missionCardTitle').value = '';
      document.getElementById('missionCardUrl').value = '';
      document.getElementById('missionCardAdminUrl').value = '';
      document.getElementById('missionCardLesson').value = '';
      document.getElementById('missionArchiveTopic').value = '';
      document.getElementById('missionArchiveIntent').value = '';
      document.getElementById('missionArchiveContent').value = '';
      const arcPanel = document.getElementById('missionArchivePanel');
      const arcBtn = document.getElementById('missionArchiveToggleBtn');
      if (arcPanel) arcPanel.style.display = 'none';
      if (arcBtn) arcBtn.classList.remove('active');
      updateMissionArchiveDot();
      renderMissionPreview(cat);
      alert('카드가 추가되었습니다.');
    } catch(e) {
      alert('추가 실패: ' + e.message);
    } finally {
      btn.disabled = false;
    }
  });

  renderMissionPreview(cat);
}

// 미션 카드 중 어드민 URL이 연결된 것만 사이드바의 "미션 체크" 서브메뉴로 뽑아 보여준다.
function renderMissionSidebarSubnav(items) {
  const sub = document.getElementById('subnav-mission');
  if (!sub) return;
  const linked = items.filter(i => i.adminUrl);
  const prevActive = sub.querySelector('.nav-sub-item.active')?.dataset.appadmin;
  if (!linked.length) {
    sub.innerHTML = '<div class="nav-sub-item empty">연결된 어드민 없음</div>';
    return;
  }
  sub.innerHTML = linked.map(item =>
    `<div class="nav-sub-item${item.adminUrl===prevActive?' active':''}" data-appadmin="${esc(item.adminUrl)}">${esc(item.title||'(제목 없음)')}</div>`
  ).join('');
}

// 카드 목록 액션 버튼용 SVG(라인 아이콘) — 미션·각종 콘텐츠·아카이브가 모두 같은 세트를 쓴다.
const MI_ICONS = {
  eye:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
  eyeOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>',
  gear:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  up:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>',
  down:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>',
  pencil: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
  trash:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3,6 21,6"/><path d="M8,6V4a1,1,0,0,1,1-1h6a1,1,0,0,1,1,1V6"/><path d="M10,11v6M14,11v6"/><rect x="5" y="6" width="14" height="15" rx="1"/></svg>',
};

async function renderMissionPreview(cat) {
  const container = document.getElementById('missionPreviewList');
  if (!cat) { container.innerHTML = ''; return; }
  try {
    const snap  = await getDocs(query(collection(db, 'cards'), where('category','==',cat)));
    const items = snap.docs.map(d => ({ docId: d.id, ...d.data() })).sort((a,b) => (a.order??999)-(b.order??999));
    window._missionItems = items;
    window._missionCat   = cat;
    if (!items.length) { container.innerHTML = '<div class="empty-panel">연결된 미션이 없습니다.</div>'; return; }
    container.innerHTML = '';
    const S = MI_ICONS;
    items.forEach((item, idx) => {
      const row = document.createElement('div');
      row.className = 'item-row';
      row.id = `mission-row-${item.docId}`;
      const iconStr = String(item.emoji||'');
      const isSvg = iconStr.startsWith('<svg');
      const isLocked = !!item.locked;
      row.innerHTML = `
        <div class="item-icon-preview preview-mission">${isSvg ? iconStr : esc(iconStr) || '—'}</div>
        <div class="item-info">
          <div class="item-label">${esc(item.title||'')}</div>
        </div>
        <div class="item-meta">
          <button class="mi-act ${isLocked?'locked':'open'}" title="${isLocked?'비공개 (클릭 시 공개)':'공개 (클릭 시 비공개)'}" onclick="missionToggleLocked('${item.docId}',${isLocked})">${isLocked?S.eyeOff:S.eye}</button>
          ${item.adminUrl ? `<button class="mi-act" title="웹앱 어드민 열기" onclick="openAppAdmin('${esc(item.adminUrl)}')">${S.gear}</button>` : ''}
          <button class="mi-act" ${idx===0?'disabled':''} title="위로 이동" onclick="missionMoveCard('${item.docId}','up',${idx})">${S.up}</button>
          <button class="mi-act" ${idx===items.length-1?'disabled':''} title="아래로 이동" onclick="missionMoveCard('${item.docId}','down',${idx})">${S.down}</button>
          <button class="mi-act" title="수정" onclick="missionStartEdit('${item.docId}')">${S.pencil}</button>
          <button class="mi-act mi-act-danger" title="삭제" onclick="missionDeleteCard('${item.docId}')">${S.trash}</button>
        </div>`;
      container.appendChild(row);
    });
  } catch(e) { console.warn(e); }
}

window.missionStartEdit = async function(docId) {
  const item = (window._missionItems||[]).find(i => i.docId === docId);
  if (!item) return;
  const row = document.getElementById(`mission-row-${docId}`);
  if (!row) return;

  // 기존 아카이브 정보 로드
  let existingTopic = '', existingIntent = '', existingContent = '';
  const appKey = (item.url||'').split('/')[1];
  if (appKey) {
    try {
      const snap = await get(ref(rtdb, `adminConfig/${appKey}/archive`));
      if (snap.exists()) {
        existingTopic = snap.val().topic||''; existingIntent = snap.val().intent||''; existingContent = snap.val().content||'';
      }
    } catch(e) {}
  }

  // .item-row는 기본 display:flex(가로)라서, 수정 모드는 위(카드 내용)/아래(아카이브 정보)로
  // 세로로 쌓이도록 이 행에서만 block으로 덮어쓴다.
  row.style.display = 'block';
  const existingSvg = String(item.emoji || '');
  row.innerHTML = `
    <div style="font-size:11px;font-weight:700;color:var(--sub);letter-spacing:1px;margin-bottom:10px;">카드 내용</div>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;width:100%;padding-bottom:14px;margin-bottom:14px;border-bottom:1px dashed var(--border);">
      <div class="icon-picker-wrap">
        <div class="icon-picker-preview${existingSvg ? '' : ' empty'}" id="me-icon-preview-${docId}">${existingSvg.startsWith('<svg') ? existingSvg : ''}</div>
        <button type="button" class="icon-picker-trigger" id="me-icon-trigger-${docId}">아이콘 선택</button>
      </div>
      <input id="me-title-${docId}" class="form-input" value="${esc(item.title||'')}" placeholder="제목" style="flex:1;min-width:100px">
      <input id="me-url-${docId}" class="form-input" value="${esc(item.url||'')}" placeholder="웹앱 URL" style="flex:2;min-width:140px">
      <input id="me-adminurl-${docId}" class="form-input" value="${esc(item.adminUrl||'')}" placeholder="어드민 URL (선택)" style="flex:2;min-width:140px">
      <input id="me-lesson-${docId}" class="form-input" value="${esc(item.lessonNum||'')}" placeholder="연결 강의번호" style="flex:none;width:120px">
      <button class="btn-save" style="flex:none;padding:8px 20px;background:var(--c3)" onclick="missionSaveEdit('${docId}')">저장</button>
      <button class="btn-cancel" style="flex:none;padding:8px 20px" onclick="renderMissionPreview(window._missionCat)">취소</button>
    </div>
    <div style="padding:12px 14px;background:var(--bg2);border:1px solid var(--border);border-radius:8px;display:flex;flex-direction:column;gap:10px;">
      <div style="font-size:11px;font-weight:700;color:var(--c3);letter-spacing:1px;">아카이브 정보</div>
      <div style="display:flex;align-items:flex-start;gap:10px;">
        <label style="font-size:11px;font-weight:600;color:var(--sub);width:60px;flex-shrink:0;padding-top:9px;">수업 주제</label>
        <input id="me-archive-topic-${docId}" class="form-input" value="${esc(existingTopic)}" placeholder="수업 주제를 입력하세요" style="flex:1;">
      </div>
      <div style="display:flex;align-items:flex-start;gap:10px;">
        <label style="font-size:11px;font-weight:600;color:var(--sub);width:60px;flex-shrink:0;padding-top:9px;">활동 의도</label>
        <textarea id="me-archive-intent-${docId}" class="form-input" placeholder="활동 의도를 입력하세요" style="flex:1;min-height:60px;height:auto;padding:10px 14px;resize:vertical;">${esc(existingIntent)}</textarea>
      </div>
      <div style="display:flex;align-items:flex-start;gap:10px;">
        <label style="font-size:11px;font-weight:600;color:var(--sub);width:60px;flex-shrink:0;padding-top:9px;">아카이브 내용</label>
        <textarea id="me-archive-content-${docId}" class="form-input" placeholder="아카이브 내용을 입력하세요" style="flex:1;min-height:60px;height:auto;padding:10px 14px;resize:vertical;">${esc(existingContent)}</textarea>
      </div>
    </div>`;

  // SVG 피커 마운트 (수정 행 DOM이 붙은 뒤 실행)
  requestAnimationFrame(() => {
    mountIconPicker({
      triggerEl: document.getElementById(`me-icon-trigger-${docId}`),
      previewEl:  document.getElementById(`me-icon-preview-${docId}`),
      onSelect:  (svg) => { row.dataset.svgEdit = svg; },
      storeSize: 28,
      initialSvg: existingSvg.startsWith('<svg') ? existingSvg : '',
    });
    if (existingSvg) row.dataset.svgEdit = existingSvg;
  });
};

window.missionSaveEdit = async function(docId) {
  const row   = document.getElementById(`mission-row-${docId}`);
  const emoji = row?.dataset.svgEdit ?? '';
  const title    = document.getElementById(`me-title-${docId}`)?.value.trim();
  const url      = document.getElementById(`me-url-${docId}`)?.value.trim();
  const adminUrl = document.getElementById(`me-adminurl-${docId}`)?.value.trim() || '';
  const lessonNum = document.getElementById(`me-lesson-${docId}`)?.value.trim() || '';
  if (!title) { alert('제목을 입력하세요.'); return; }
  try {
    await updateDoc(doc(db, 'cards', docId), { emoji, title, url, adminUrl, lessonNum });

    // 아카이브 정보 저장
    const topic   = document.getElementById(`me-archive-topic-${docId}`)?.value.trim() || '';
    const intent  = document.getElementById(`me-archive-intent-${docId}`)?.value.trim() || '';
    const content = document.getElementById(`me-archive-content-${docId}`)?.value.trim() || '';
    const appKey = url.split('/')[1];
    if (appKey) await set(ref(rtdb, `adminConfig/${appKey}/archive`), { topic, intent, content });

    renderMissionPreview(window._missionCat);
  } catch(e) { alert('저장 실패: ' + e.message); }
};

window.toggleMissionArchive = function() {
  const panel = document.getElementById('missionArchivePanel');
  const btn   = document.getElementById('missionArchiveToggleBtn');
  const open  = panel.style.display === 'none';
  panel.style.display = open ? 'block' : 'none';
  if (btn) btn.classList.toggle('active', open);
};

window.updateMissionArchiveDot = function() {
  const topic   = document.getElementById('missionArchiveTopic')?.value.trim();
  const intent  = document.getElementById('missionArchiveIntent')?.value.trim();
  const content = document.getElementById('missionArchiveContent')?.value.trim();
  // 아카이브 내용이 있으면 아카이브 버튼을 채워진 상태로 표시.
  const btn = document.getElementById('missionArchiveToggleBtn');
  if (btn) btn.classList.toggle('filled', !!(topic || intent || content));
};

window.missionToggleLocked = async function(docId, currentLocked) {
  try {
    await updateDoc(doc(db, 'cards', docId), { locked: !currentLocked });
    renderMissionPreview(window._missionCat);
  } catch(e) { alert('변경 실패: ' + e.message); }
};

window.openAppAdmin = function(adminUrl) {
  const frame = document.getElementById('app-admin-frame');
  const bar = document.querySelector('.app-admin-bar');
  bar.style.display = '';
  // 임베드된 페이지가 <html class="has-own-back">를 스스로 달아두면(예: interview/admin.html)
  // 그 페이지 자체 헤더에 "목록으로" 버튼이 이미 있다는 뜻이므로, 위쪽의 중복 바는 숨긴다.
  // (같은 origin이라 접근 가능. 접근 실패하면 안전하게 기존 바를 그대로 둔다.)
  frame.onload = function() {
    try {
      const html = frame.contentDocument && frame.contentDocument.documentElement;
      if (html && html.classList.contains('has-own-back')) bar.style.display = 'none';
    } catch (e) {}
  };
  frame.src = resolveAppUrl(adminUrl);
  document.getElementById('app-admin-overlay').classList.add('open');
  document.querySelector('.adm-content').style.display = 'none';
};

window.closeAppAdmin = function() {
  document.getElementById('app-admin-overlay').classList.remove('open');
  document.getElementById('app-admin-frame').src = 'about:blank';
  document.querySelector('.adm-content').style.display = '';
  document.querySelector('.app-admin-bar').style.display = '';
};

window.missionDeleteCard = async function(docId) {
  const item = (window._missionItems||[]).find(i => i.docId === docId);
  if (!confirm(`"${item?.title||'이 카드'}"를 삭제하시겠습니까?`)) return;
  try {
    await deleteDoc(doc(db, 'cards', docId));
    renderMissionPreview(window._missionCat);
  } catch(e) { alert('삭제 실패: ' + e.message); }
};

window.missionMoveCard = async function(docId, dir, idx) {
  const items = window._missionItems;
  if (!items) return;
  const targetIdx = dir === 'up' ? idx - 1 : idx + 1;
  if (targetIdx < 0 || targetIdx >= items.length) return;
  const cur    = items[idx];
  const target = items[targetIdx];
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'cards', cur.docId),    { order: target.order ?? targetIdx });
    batch.update(doc(db, 'cards', target.docId), { order: cur.order ?? idx });
    await batch.commit();
    renderMissionPreview(window._missionCat);
  } catch(e) { alert('순서 변경 실패: ' + e.message); }
};

// ══════════ 각종 콘텐츠 ══════════
let contentsSelectedSvg = '';

async function initContentsTab() {
  let cat = '';
  try {
    const cfg = await getDoc(doc(db, 'settings', 'lms_config'));
    cat = cfg.exists() ? (cfg.data().contents_category || '') : '';
  } catch(_) {}
  if (!cat) {
    cat = 'general_content';
    try { await setDoc(doc(db, 'settings', 'lms_config'), { contents_category: cat }, { merge: true }); } catch(_) {}
  }

  mountIconPicker({
    triggerEl: document.getElementById('contentsIconPreview'),
    previewEl:  document.getElementById('contentsIconPreview'),
    onSelect:  (svg) => { contentsSelectedSvg = svg; },
    storeSize: 28,
  });

  document.getElementById('contentsAddCardBtn').addEventListener('click', async () => {
    const emoji    = contentsSelectedSvg;
    const title    = document.getElementById('contentsCardTitle').value.trim();
    const url      = document.getElementById('contentsCardUrl').value.trim();
    const adminUrl = document.getElementById('contentsCardAdminUrl').value.trim();
    const openInModal = document.getElementById('contentsCardModal').checked;
    if (!title || !url) { alert('제목과 웹앱 주소를 입력해 주세요.'); return; }
    const btn = document.getElementById('contentsAddCardBtn');
    btn.disabled = true;
    try {
      const snap  = await getDocs(query(collection(db, 'cards'), where('category','==',cat)));
      const order = snap.docs.length ? Math.max(...snap.docs.map(d => d.data().order || 0)) + 1 : 0;
      const cardData = { emoji, title, desc: '', url, category: cat, locked: false, order, openInModal };
      if (adminUrl) cardData.adminUrl = adminUrl;
      await addDoc(collection(db, 'cards'), cardData);
      contentsSelectedSvg = '';
      const prev = document.getElementById('contentsIconPreview');
      if (prev) { prev.innerHTML = ''; prev.classList.add('empty'); }
      document.getElementById('contentsCardTitle').value = '';
      document.getElementById('contentsCardUrl').value = '';
      document.getElementById('contentsCardAdminUrl').value = '';
      document.getElementById('contentsCardModal').checked = false;
      renderContentsPreview(cat);
      alert('카드가 추가되었습니다.');
    } catch(e) {
      alert('추가 실패: ' + e.message);
    } finally {
      btn.disabled = false;
    }
  });

  renderContentsPreview(cat);
}

function renderContentsSidebarSubnav(items) {
  const sub = document.getElementById('subnav-contents');
  if (!sub) return;
  const linked = items.filter(i => i.adminUrl);
  const prevActive = sub.querySelector('.nav-sub-item.active')?.dataset.appadmin;
  if (!linked.length) {
    sub.innerHTML = '<div class="nav-sub-item empty">연결된 어드민 없음</div>';
    return;
  }
  sub.innerHTML = linked.map(item =>
    `<div class="nav-sub-item${item.adminUrl===prevActive?' active':''}" data-appadmin="${esc(item.adminUrl)}">${esc(item.title||'(제목 없음)')}</div>`
  ).join('');
}

async function renderContentsPreview(cat) {
  const container = document.getElementById('contentsPreviewList');
  if (!cat) { container.innerHTML = ''; return; }
  try {
    const snap  = await getDocs(query(collection(db, 'cards'), where('category','==',cat)));
    const items = snap.docs.map(d => ({ docId: d.id, ...d.data() })).sort((a,b) => (a.order??999)-(b.order??999));
    window._contentsItems = items;
    window._contentsCat   = cat;
    renderContentsSidebarSubnav(items);
    if (!items.length) { container.innerHTML = '<div class="empty-panel">이 카테고리에 카드가 없습니다.</div>'; return; }
    container.innerHTML = `<p style="font-size:13px;color:var(--sub);margin-bottom:10px">카드 ${items.length}개</p>`;
    const S = MI_ICONS;
    items.forEach((item, idx) => {
      const row = document.createElement('div');
      row.className = 'item-row';
      row.id = `contents-row-${item.docId}`;
      const iconStr = String(item.emoji||'');
      const isSvg = iconStr.startsWith('<svg');
      const isLocked = !!item.locked;
      row.innerHTML = `
        <div class="item-icon-preview preview-contents">${isSvg ? iconStr : esc(iconStr) || '—'}</div>
        <div class="item-info">
          <div class="item-label">${esc(item.title||'')}</div>
        </div>
        <div class="item-meta">
          <button class="mi-act ${isLocked?'locked':'open'}" title="${isLocked?'비공개 (클릭 시 공개)':'공개 (클릭 시 비공개)'}" onclick="contentsToggleLocked('${item.docId}',${isLocked})">${isLocked?S.eyeOff:S.eye}</button>
          ${item.adminUrl ? `<button class="mi-act" title="웹앱 어드민 열기" onclick="openAppAdmin('${esc(item.adminUrl)}')">${S.gear}</button>` : ''}
          <button class="mi-act" ${idx===0?'disabled':''} title="위로 이동" onclick="contentsMoveCard('${item.docId}','up',${idx})">${S.up}</button>
          <button class="mi-act" ${idx===items.length-1?'disabled':''} title="아래로 이동" onclick="contentsMoveCard('${item.docId}','down',${idx})">${S.down}</button>
          <button class="mi-act" title="수정" onclick="contentsStartEdit('${item.docId}')">${S.pencil}</button>
          <button class="mi-act mi-act-danger" title="삭제" onclick="contentsDeleteCard('${item.docId}')">${S.trash}</button>
        </div>`;
      container.appendChild(row);
    });
  } catch(e) { console.warn(e); }
}

window.contentsStartEdit = function(docId) {
  const item = (window._contentsItems||[]).find(i => i.docId === docId);
  if (!item) return;
  const row = document.getElementById(`contents-row-${docId}`);
  if (!row) return;
  const existingSvg = String(item.emoji || '');
  row.innerHTML = `
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;width:100%;padding:4px 0">
      <div class="icon-picker-wrap">
        <div class="icon-picker-preview${existingSvg ? '' : ' empty'}" id="ce-icon-preview-${docId}">${existingSvg.startsWith('<svg') ? existingSvg : ''}</div>
        <button type="button" class="icon-picker-trigger" id="ce-icon-trigger-${docId}">아이콘 선택</button>
      </div>
      <input id="ce-title-${docId}" class="form-input" value="${esc(item.title||'')}" placeholder="제목" style="flex:1;min-width:100px">
      <input id="ce-url-${docId}" class="form-input" value="${esc(item.url||'')}" placeholder="웹앱 URL" style="flex:2;min-width:140px">
      <input id="ce-adminurl-${docId}" class="form-input" value="${esc(item.adminUrl||'')}" placeholder="어드민 URL (선택)" style="flex:2;min-width:140px">
      <label class="grade-na-toggle"><input type="checkbox" id="ce-modal-${docId}" ${item.openInModal?'checked':''}> 팝업으로 열기</label>
      <button class="btn-save" style="flex:none;padding:7px 16px;background:var(--c3)" onclick="contentsSaveEdit('${docId}')">저장</button>
      <button class="btn-cancel" onclick="renderContentsPreview(window._contentsCat)">취소</button>
    </div>`;

  requestAnimationFrame(() => {
    mountIconPicker({
      triggerEl: document.getElementById(`ce-icon-trigger-${docId}`),
      previewEl:  document.getElementById(`ce-icon-preview-${docId}`),
      onSelect:  (svg) => { row.dataset.svgEdit = svg; },
      storeSize: 28,
      initialSvg: existingSvg.startsWith('<svg') ? existingSvg : '',
    });
    if (existingSvg) row.dataset.svgEdit = existingSvg;
  });
};

window.contentsSaveEdit = async function(docId) {
  const row   = document.getElementById(`contents-row-${docId}`);
  const emoji = row?.dataset.svgEdit ?? '';
  const title    = document.getElementById(`ce-title-${docId}`)?.value.trim();
  const url      = document.getElementById(`ce-url-${docId}`)?.value.trim();
  const adminUrl = document.getElementById(`ce-adminurl-${docId}`)?.value.trim() || '';
  const openInModal = document.getElementById(`ce-modal-${docId}`)?.checked || false;
  if (!title) { alert('제목을 입력하세요.'); return; }
  try {
    await updateDoc(doc(db, 'cards', docId), { emoji, title, url, adminUrl, openInModal });
    renderContentsPreview(window._contentsCat);
  } catch(e) { alert('저장 실패: ' + e.message); }
};

window.contentsToggleLocked = async function(docId, currentLocked) {
  try {
    await updateDoc(doc(db, 'cards', docId), { locked: !currentLocked });
    renderContentsPreview(window._contentsCat);
  } catch(e) { alert('변경 실패: ' + e.message); }
};

window.contentsDeleteCard = async function(docId) {
  const item = (window._contentsItems||[]).find(i => i.docId === docId);
  if (!confirm(`"${item?.title||'이 카드'}"를 삭제하시겠습니까?`)) return;
  try {
    await deleteDoc(doc(db, 'cards', docId));
    renderContentsPreview(window._contentsCat);
  } catch(e) { alert('삭제 실패: ' + e.message); }
};

window.contentsMoveCard = async function(docId, dir, idx) {
  const items = window._contentsItems;
  if (!items) return;
  const targetIdx = dir === 'up' ? idx - 1 : idx + 1;
  if (targetIdx < 0 || targetIdx >= items.length) return;
  const cur    = items[idx];
  const target = items[targetIdx];
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'cards', cur.docId),    { order: target.order ?? targetIdx });
    batch.update(doc(db, 'cards', target.docId), { order: cur.order ?? idx });
    await batch.commit();
    renderContentsPreview(window._contentsCat);
  } catch(e) { alert('순서 변경 실패: ' + e.message); }
};

/* ============================================
 * 아카이브 (루트 홈페이지 hoseong911.github.io/hoistory 카드 관리)
 * cards 컬렉션을 미션 체크(mission_category)·각종 콘텐츠(contents_category)와
 * 함께 공유하되, settings/categories에 등록된 카테고리 키를 가진 문서만 루트에 노출된다.
 * ============================================ */
let archiveAddSvg = '';
const ARCHIVE_MAX_CATEGORIES = 4;
window._archiveTempCats = null;

async function getArchiveCategories() {
  try {
    const snap = await getDoc(doc(db, 'settings', 'categories'));
    return snap.exists() && Array.isArray(snap.data().list) ? snap.data().list : [];
  } catch (e) { return []; }
}

async function getMissionCategoryKey() {
  try {
    const cfg = await getDoc(doc(db, 'settings', 'lms_config'));
    return cfg.exists() ? (cfg.data().mission_category || '') : '';
  } catch (e) { return ''; }
}

async function initArchiveTab() {
  mountIconPicker({
    triggerEl: document.getElementById('archiveAddIconPreview'),
    previewEl:  document.getElementById('archiveAddIconPreview'),
    onSelect:  (svg) => { archiveAddSvg = svg; },
    storeSize: 28,
  });
  document.getElementById('archiveAddBtn').addEventListener('click', archiveAddCard);
  await renderArchiveCards();
  await renderArchiveCategoryEditor();
}

async function renderArchiveCards() {
  const cats = await getArchiveCategories();
  const missionCat = await getMissionCategoryKey();
  window._archiveCats = cats;

  const allSnap = await getDocs(collection(db, 'cards'));
  const allCards = allSnap.docs.map(d => ({ docId: d.id, ...d.data() }));
  window._archiveAllCards = allCards;

  const catKeys = new Set(cats.map(c => c.key));
  const published = allCards.filter(c => catKeys.has(c.category)).sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
  const pending = allCards.filter(c => missionCat && c.category === missionCat && !c.locked);

  renderArchivePendingList(pending, published, cats);
  renderArchiveCardsList(published, cats);

  const addSel = document.getElementById('archiveAddCategory');
  if (addSel) {
    addSel.innerHTML = cats.length
      ? cats.map(c => `<option value="${esc(c.key)}">${esc(c.en)}${c.ko ? ' / ' + esc(c.ko) : ''}</option>`).join('')
      : '<option value="">카테고리를 먼저 만들어주세요</option>';
  }
}

function renderArchivePendingList(pending, published, cats) {
  const wrap = document.getElementById('archivePendingList');
  if (!wrap) return;
  if (pending.length === 0) {
    wrap.innerHTML = '<div class="empty-panel">LMS에 공개된 미션 카드가 없습니다.</div>';
    return;
  }
  wrap.innerHTML = pending.map(card => {
    const iconStr = String(card.emoji || '');
    const isSvg = iconStr.startsWith('<svg');
    const isPublished = published.some(c => c.sourceMissionId === card.docId);
    return `
    <div class="item-row">
      <div class="item-icon-preview preview-mission">${isSvg ? iconStr : esc(iconStr) || '—'}</div>
      <div class="item-info">
        <div class="item-label">${esc(card.title || '')}</div>
      </div>
      <div class="item-meta">
        ${isPublished
          ? `<span class="open-badge">✓ 공개됨</span>`
          : `<button class="edit-btn" onclick="archiveTogglePublishForm('${card.docId}')">아카이브에 공개</button>`
        }
      </div>
    </div>
    <div id="archivePubForm-${card.docId}" class="stu-card" style="display:none;margin:-4px 0 14px;background:var(--surface)">
      <div class="stu-card-body">
        <div class="stu-add-row">
          <div class="stu-field" style="flex:1">
            <label>공개할 카테고리</label>
            <select class="grade-config-sel" id="archivePubCat-${card.docId}" style="height:44px;width:100%">
              ${cats.map(c => `<option value="${esc(c.key)}">${esc(c.en)}${c.ko ? ' / ' + esc(c.ko) : ''}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="stu-add-row" style="margin-top:10px">
          <div class="stu-field" style="flex:1">
            <label>설명</label>
            <textarea class="form-textarea" id="archivePubDesc-${card.docId}" style="width:100%" placeholder="불러오는 중…"></textarea>
          </div>
        </div>
        <div class="stu-add-row" style="margin-top:10px">
          <button class="add-btn g" onclick="archiveConfirmPublish('${card.docId}')">게시하기</button>
          <button class="btn-cancel" onclick="archiveTogglePublishForm('${card.docId}')">취소</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

window.archiveTogglePublishForm = async function(missionId) {
  const form = document.getElementById(`archivePubForm-${missionId}`);
  if (!form) return;
  const opening = form.style.display === 'none';
  form.style.display = opening ? 'block' : 'none';
  if (!opening) return;

  const card = (window._archiveAllCards || []).find(c => c.docId === missionId);
  const descEl = document.getElementById(`archivePubDesc-${missionId}`);
  let desc = '';
  try {
    const appKey = (card?.url || '').split('/')[1];
    if (appKey) {
      const snap = await get(ref(rtdb, `adminConfig/${appKey}/archive`));
      if (snap.exists()) {
        const { topic = '', intent = '', content = '' } = snap.val() || {};
        desc = [topic, intent, content].filter(Boolean).join('\n');
      }
    }
  } catch (e) { /* 조회 실패해도 무시 — 직접 입력 가능 */ }
  if (descEl) descEl.value = desc;
};

window.archiveConfirmPublish = async function(missionId) {
  const card = (window._archiveAllCards || []).find(c => c.docId === missionId);
  if (!card) return;
  const category = document.getElementById(`archivePubCat-${missionId}`)?.value || '';
  const desc = document.getElementById(`archivePubDesc-${missionId}`)?.value.trim() || '';
  if (!category) { alert('카테고리를 먼저 만들어주세요.'); return; }
  try {
    const cats = window._archiveCats || [];
    const published = (window._archiveAllCards || []).filter(c => cats.some(cat => cat.key === c.category));
    const order = published.length ? Math.max(...published.map(c => c.order || 0)) + 1 : 0;
    // 앱 자체에 아카이브 뷰가 있으면 ?archive=1로 바로 진입시킨다(없는 앱은 파라미터를 무시하고 평소대로 로그인 화면을 보여줌).
    const baseUrl = card.url || '';
    const archiveUrl = baseUrl ? baseUrl + (baseUrl.includes('?') ? '&' : '?') + 'archive=1' : '';
    await addDoc(collection(db, 'cards'), {
      emoji: card.emoji || '', title: card.title || '', url: archiveUrl,
      desc, category, locked: false, sourceMissionId: missionId, order
    });
    alert('아카이브에 공개되었습니다.');
    renderArchiveCards();
  } catch (e) { alert('오류: ' + e.message); }
};

function renderArchiveCardsList(published, cats) {
  const wrap = document.getElementById('archiveCardsList');
  if (!wrap) return;
  if (published.length === 0) {
    wrap.innerHTML = '<div class="empty-panel">공개된 아카이브 카드가 없습니다.</div>';
    return;
  }
  wrap.innerHTML = '';
  const S = MI_ICONS;
  published.forEach(card => {
    const row = document.createElement('div');
    row.className = 'item-row';
    row.id = `archive-row-${card.docId}`;
    const iconStr = String(card.emoji || '');
    const isSvg = iconStr.startsWith('<svg');
    const isLocked = !!card.locked;
    row.innerHTML = `
      <div class="item-icon-preview preview-contents">${isSvg ? iconStr : esc(iconStr) || '—'}</div>
      <div class="item-info">
        <div class="item-label">${esc(card.title || '')}</div>
      </div>
      <div class="item-meta">
        <button class="mi-act ${isLocked ? 'locked' : 'open'}" title="${isLocked?'비공개 (클릭 시 공개)':'공개 (클릭 시 비공개)'}" onclick="archiveToggleLocked('${card.docId}',${isLocked})">${isLocked ? S.eyeOff : S.eye}</button>
        <button class="mi-act" title="수정" onclick="archiveStartEdit('${card.docId}')">${S.pencil}</button>
        <button class="mi-act mi-act-danger" title="삭제" onclick="archiveDeleteCard('${card.docId}')">${S.trash}</button>
      </div>`;
    wrap.appendChild(row);
  });
}

window.archiveToggleLocked = async function(docId, currentLocked) {
  try { await updateDoc(doc(db, 'cards', docId), { locked: !currentLocked }); renderArchiveCards(); }
  catch (e) { alert('변경 실패: ' + e.message); }
};

window.archiveDeleteCard = async function(docId) {
  const card = (window._archiveAllCards || []).find(c => c.docId === docId);
  if (!confirm(`"${card?.title || '이 카드'}"를 삭제하시겠습니까?`)) return;
  try { await deleteDoc(doc(db, 'cards', docId)); renderArchiveCards(); }
  catch (e) { alert('삭제 실패: ' + e.message); }
};

window.archiveStartEdit = function(docId) {
  const card = (window._archiveAllCards || []).find(c => c.docId === docId);
  if (!card) return;
  const row = document.getElementById(`archive-row-${docId}`);
  if (!row) return;
  const cats = window._archiveCats || [];
  const existingSvg = String(card.emoji || '');
  row.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:8px;width:100%;padding:4px 0">
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <div class="icon-picker-wrap">
          <div class="icon-picker-preview${existingSvg ? '' : ' empty'}" id="ae-icon-preview-${docId}">${existingSvg.startsWith('<svg') ? existingSvg : ''}</div>
          <button type="button" class="icon-picker-trigger" id="ae-icon-trigger-${docId}">아이콘 선택</button>
        </div>
        <select class="grade-config-sel" id="ae-cat-${docId}" style="height:44px">
          ${cats.map(c => `<option value="${esc(c.key)}" ${c.key === card.category ? 'selected' : ''}>${esc(c.en)}${c.ko ? ' / ' + esc(c.ko) : ''}</option>`).join('')}
        </select>
        <input id="ae-title-${docId}" class="form-input" value="${esc(card.title || '')}" placeholder="제목" style="flex:1;min-width:120px">
      </div>
      <textarea id="ae-desc-${docId}" class="form-textarea" placeholder="설명" style="width:100%">${esc(card.desc || '')}</textarea>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <input id="ae-url-${docId}" class="form-input" value="${esc(card.url || '')}" placeholder="URL" style="flex:1;min-width:140px">
        <button class="btn-save" style="flex:none;padding:7px 16px;background:var(--c2)" onclick="archiveSaveEdit('${docId}')">저장</button>
        <button class="btn-cancel" onclick="renderArchiveCards()">취소</button>
      </div>
    </div>`;
  requestAnimationFrame(() => {
    mountIconPicker({
      triggerEl: document.getElementById(`ae-icon-trigger-${docId}`),
      previewEl:  document.getElementById(`ae-icon-preview-${docId}`),
      onSelect:  (svg) => { row.dataset.svgEdit = svg; },
      storeSize: 28,
      initialSvg: existingSvg.startsWith('<svg') ? existingSvg : '',
    });
    if (existingSvg) row.dataset.svgEdit = existingSvg;
  });
};

window.archiveSaveEdit = async function(docId) {
  const row = document.getElementById(`archive-row-${docId}`);
  const emoji = row?.dataset.svgEdit ?? '';
  const title = document.getElementById(`ae-title-${docId}`)?.value.trim();
  const desc = document.getElementById(`ae-desc-${docId}`)?.value.trim() || '';
  const url = document.getElementById(`ae-url-${docId}`)?.value.trim();
  const category = document.getElementById(`ae-cat-${docId}`)?.value;
  if (!title || !url) { alert('제목과 URL을 입력하세요.'); return; }
  try {
    await updateDoc(doc(db, 'cards', docId), { emoji, title, desc, url, category });
    renderArchiveCards();
  } catch (e) { alert('저장 실패: ' + e.message); }
};

/* ── 카테고리 관리 ── */
async function renderArchiveCategoryEditor() {
  const wrap = document.getElementById('archiveCatEditList');
  if (!wrap) return;
  const list = window._archiveTempCats !== null ? window._archiveTempCats : (window._archiveCats || await getArchiveCategories());
  const countInfo = `${list.length} / ${ARCHIVE_MAX_CATEGORIES}`;
  if (list.length === 0) {
    wrap.innerHTML = `<div class="empty-panel">아직 카테고리가 없습니다. "+ 카테고리 추가"로 시작하세요. (${countInfo})</div>`;
    return;
  }
  wrap.innerHTML = `<p style="font-size:12px;color:var(--sub);margin-bottom:10px">${countInfo}</p>` + list.map((cat, idx) => `
    <div class="stu-add-row" style="margin-bottom:10px;padding-bottom:10px;border-bottom:1px solid var(--hairline-soft)">
      <div class="stu-field" style="flex:1">
        <label>영문 이름 ${idx + 1}</label>
        <input class="form-input" type="text" value="${esc(cat.en || '')}" placeholder="예: Next Dive" oninput="archiveUpdateTempCat(${idx},'en',this.value)" style="width:100%">
      </div>
      <div class="stu-field" style="flex:1">
        <label>한글 부제</label>
        <input class="form-input" type="text" value="${esc(cat.ko || '')}" placeholder="예: 곧 만날 이야기" oninput="archiveUpdateTempCat(${idx},'ko',this.value)" style="width:100%">
      </div>
      <button class="del-btn" style="margin-top:auto" onclick="archiveRemoveCategoryRow(${idx})">삭제</button>
    </div>
  `).join('');
}

window.archiveUpdateTempCat = function(idx, field, value) {
  if (window._archiveTempCats === null) window._archiveTempCats = (window._archiveCats || []).map(c => ({...c}));
  if (window._archiveTempCats[idx]) window._archiveTempCats[idx][field] = value;
};

window.archiveAddCategoryRow = function() {
  if (window._archiveTempCats === null) window._archiveTempCats = (window._archiveCats || []).map(c => ({...c}));
  if (window._archiveTempCats.length >= ARCHIVE_MAX_CATEGORIES) { alert(`최대 ${ARCHIVE_MAX_CATEGORIES}개까지만 가능합니다.`); return; }
  window._archiveTempCats.push({ key: 'cat_' + Math.random().toString(36).substring(2, 10), en: '', ko: '' });
  renderArchiveCategoryEditor();
};

window.archiveRemoveCategoryRow = function(idx) {
  if (window._archiveTempCats === null) window._archiveTempCats = (window._archiveCats || []).map(c => ({...c}));
  const cat = window._archiveTempCats[idx];
  if (!cat) return;
  const inUse = (window._archiveAllCards || []).filter(c => c.category === cat.key).length;
  const msg = inUse > 0
    ? `이 카테고리에 카드 ${inUse}개가 있습니다.\n삭제해도 카드는 사라지지 않고 "분류 없음" 상태가 됩니다. 진행할까요?`
    : '이 카테고리를 삭제할까요?';
  if (!confirm(msg)) return;
  window._archiveTempCats.splice(idx, 1);
  renderArchiveCategoryEditor();
};

window.archiveSaveCategories = async function() {
  const list = window._archiveTempCats !== null ? window._archiveTempCats : (window._archiveCats || []);
  if (list.some(c => !c.en || !c.en.trim())) { alert('카테고리 영문 이름은 비울 수 없습니다.'); return; }
  const clean = list.map(c => ({ key: c.key, en: (c.en || '').trim(), ko: (c.ko || '').trim() }));
  try {
    await setDoc(doc(db, 'settings', 'categories'), { list: clean });
    window._archiveTempCats = null;
    alert('카테고리가 저장되었습니다.');
    renderArchiveCards();
    renderArchiveCategoryEditor();
  } catch (e) { alert('저장 실패: ' + e.message); }
};

/* ── 직접 추가 ── */
async function archiveAddCard() {
  const title = document.getElementById('archiveAddTitle').value.trim();
  const desc = document.getElementById('archiveAddDesc').value.trim();
  const url = document.getElementById('archiveAddUrl').value.trim();
  const category = document.getElementById('archiveAddCategory').value;
  if (!title || !url) { alert('제목과 URL을 입력해 주세요.'); return; }
  if (!category) { alert('카테고리를 먼저 만들어주세요.'); return; }
  const btn = document.getElementById('archiveAddBtn');
  btn.disabled = true;
  try {
    const cats = window._archiveCats || [];
    const published = (window._archiveAllCards || []).filter(c => cats.some(cat => cat.key === c.category));
    const order = published.length ? Math.max(...published.map(c => c.order || 0)) + 1 : 0;
    await addDoc(collection(db, 'cards'), { emoji: archiveAddSvg, title, desc, url, category, locked: false, order });
    archiveAddSvg = '';
    const prev = document.getElementById('archiveAddIconPreview');
    if (prev) { prev.innerHTML = ''; prev.classList.add('empty'); }
    document.getElementById('archiveAddTitle').value = '';
    document.getElementById('archiveAddDesc').value = '';
    document.getElementById('archiveAddUrl').value = '';
    alert('카드가 추가되었습니다.');
    renderArchiveCards();
  } catch (e) { alert('추가 실패: ' + e.message); }
  finally { btn.disabled = false; }
}

function renderList(sec, items) {
  const container = document.getElementById(`list-${sec}`);
  if (!items.length) {
    container.innerHTML = '<div class="empty-panel">아직 항목이 없습니다. 항목을 추가해 보세요.</div>';
    return;
  }
  container.innerHTML = '';
  items.forEach(item => {
    const row = document.createElement('div');
    row.className = 'item-row';
    const iconStr = String(item.icon || '?').trim();
    const iconSize = iconStr.length <= 2 ? '20px' : iconStr.length <= 3 ? '17px' : '13px';
    row.innerHTML = `
      <div class="item-icon-preview ${SECTION_MAP[sec]?.previewClass || ''}" style="font-size:${iconSize}">${esc(iconStr)}</div>
      <div class="item-info">
        <div class="item-label">${esc(item.label || '')}</div>
        ${item.sublabel ? `<div class="item-sublabel">${esc(item.sublabel)}</div>` : ''}
        <div class="item-url">${esc(item.url || '')}</div>
      </div>
      <div class="item-meta">
        <span class="order-num">${item.order ?? 0}</span>
        <span class="${item.locked ? 'locked-badge' : 'open-badge'}">${item.locked ? '잠금' : '공개'}</span>
        <button class="edit-btn" data-id="${item.docId}">수정</button>
        <button class="del-btn" data-id="${item.docId}">삭제</button>
      </div>`;
    row.querySelector('.edit-btn').addEventListener('click', () => openModal(sec, item));
    row.querySelector('.del-btn').addEventListener('click', () => deleteItem(item.docId));
    container.appendChild(row);
  });
}

// ── 삭제 ──
async function deleteItem(docId) {
  if (!confirm('이 항목을 삭제할까요?')) return;
  await deleteDoc(doc(db, 'lms_items', docId));
}

// ── 모달 ──
let _currentSection = 'concept';
let _editDocId       = null;
let _locked          = false;

window.openModal = function(sec, item = null) {
  _currentSection = sec;
  _editDocId      = item ? item.docId : null;
  _locked         = item ? !!item.locked : false;

  document.getElementById('modalTitle').textContent = item ? '항목 수정' : '항목 추가';
  document.getElementById('fIcon').value     = item?.icon     || '';
  document.getElementById('fLabel').value    = item?.label    || '';
  document.getElementById('fSublabel').value = item?.sublabel || '';
  document.getElementById('fUrl').value      = item?.url      || '';
  document.getElementById('fOrder').value    = item?.order    ?? _items.filter(i => i.section === sec).length;

  const modal = document.getElementById('modalBox');
  modal.className = `modal for-${sec}`;
  updatePreview();
  updateToggleUI();
  document.getElementById('modalBackdrop').classList.add('open');
  setTimeout(() => document.getElementById('fIcon').focus(), 100);
};

window.closeModal = function() {
  document.getElementById('modalBackdrop').classList.remove('open');
};

window.toggleLocked = function() {
  _locked = !_locked;
  updateToggleUI();
};

function updateToggleUI() {
  document.getElementById('toggleSw').className    = `toggle-switch${_locked ? ' on' : ''}`;
  document.getElementById('toggleLabel').textContent = _locked ? '잠금' : '공개';
}

window.saveItem = async function() {
  const icon     = document.getElementById('fIcon').value.trim();
  const label    = document.getElementById('fLabel').value.trim();
  const sublabel = document.getElementById('fSublabel').value.trim();
  const url      = document.getElementById('fUrl').value.trim();
  const order    = parseInt(document.getElementById('fOrder').value, 10) || 0;

  if (!icon || !label) { alert('아이콘과 제목은 필수입니다.'); return; }

  const data = { section:_currentSection, icon, label, sublabel, url, order, locked:_locked };

  const btn = document.getElementById('saveBtn');
  btn.disabled = true; btn.textContent = '저장 중...';
  try {
    if (_editDocId) await updateDoc(doc(db, 'lms_items', _editDocId), data);
    else            await addDoc(collection(db, 'lms_items'), data);
    closeModal();
  } catch (e) {
    alert('저장 실패: ' + e.message);
  } finally {
    btn.disabled = false; btn.textContent = '저장';
  }
};

// 아이콘 미리보기 실시간 업데이트
document.getElementById('fIcon').addEventListener('input', updatePreview);
function updatePreview() {
  const val = document.getElementById('fIcon').value.trim();
  const preview = document.getElementById('iconPreview');
  preview.textContent = val || '?';
  const previewClass = SECTION_MAP[_currentSection]?.previewClass || 'preview-concept';
  preview.className  = `icon-preview-box ${previewClass}`;
  preview.style.fontSize = val.length <= 2 ? '22px' : val.length <= 3 ? '18px' : '14px';
}

// 모달 배경 클릭 시 닫기
document.getElementById('modalBackdrop').addEventListener('click', function(e) {
  if (e.target === this) closeModal();
});

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// 강의 제목을 평문(드롭다운·목록 등)으로 보여줄 때 편집 마크업(**강조**, {빈칸})을 떼어낸다.
// 커버 슬라이드는 이 마크업을 굵게/빈칸으로 렌더하므로 저장값 자체에는 남겨 둔다.
function cleanTitle(t) { return String(t || '').replace(/\*\*/g, '').replace(/[{}]/g, ''); }
// 강 번호 표기 규칙: 숫자면 "N강"/"N강. 제목", 문자(OT 등)면 "강" 없이 / 제목과 함께면 콜론.
function lecIsNum(n) { return /^\d+$/.test(String(n == null ? '' : n).trim()); }
function lecTag(n) { return lecIsNum(n) ? `${n}강` : `${n}`; }
function lecLabel(n, title) { return lecIsNum(n) ? `${n}강. ${title}` : `${n}: ${title}`; }
// 강 번호 정렬 키: 앞머리 숫자("24"·"28강. ..."→24·28), OT 등 비숫자는 맨 아래(-1).
// order 필드를 이 값으로 두고 내림차순 정렬하면 강 번호 큰(최신) 강의가 맨 위로 온다.
function lecOrderKey(v) { const m = String(v == null ? '' : v).trim().match(/^(\d+)/); return m ? parseInt(m[1], 10) : -1; }

// 미션 카드 URL은 hoistory 루트 기준 상대경로(예: interview/admin.html)로 입력받는다.
// 이 페이지 자체가 lms/ 하위에 있어 그대로 쓰면 lms/interview/... 로 잘못 풀리므로 루트 기준으로 보정한다.
function resolveAppUrl(u) {
  if (!u) return u;
  if (/^(https?:)?\/\//i.test(u) || u.startsWith('/') || u.startsWith('#')) return u;
  const root = location.pathname.replace(/\/lms\/.*$/, '/');
  return root + u;
}

// ── 성적 체크 ──
let _gradeStudents    = [];
let _gradeLessons     = [];
let _gradeRecords     = {};
let _gradeThinkTimes  = {};
let _gradeMissionTimes = {};
let _gradeLessonKey   = '';
let _gradeThinkDocId  = '';   // 현재 성적 표에 로드된 생각 체크 강의 docId (이탈 토글 즉시 반영용)
let _gradeEnabled     = { concept: true, mission: true, think: true };
let _publishStatus    = {};   // { classNum: boolean }
let _publishedAt      = {};   // { classNum: ms } 마지막 반영(갱신) 시각 — 반영 바에 함께 표시
let _currentGradeClass = null;
// 생각 체크 강의 캐시({docId,icon,title}[]) — "생각 체크" 관리 블록 안의 thLectures를
// 이 바깥(성적 체크)에서 직접 읽을 수 없어서, thPopulateSelects()가 갱신될 때마다
// 여기로 복사해 둔다. gradeFindMatchingThinkLec()/gradeUpdateThinkLabel()이 사용.
let _thLecCache = [];

// think_lectures의 icon(강의수 "24"·"OT" 등)과 class_progress(수업 스케줄)의 강의 라벨을
// 매칭해, 그 반이 이 강의를 실제로 들은 날짜(M/D)를 찾아 Date로 돌려준다. 스케줄에 없으면
// null(정보 부족 — 지연 여부를 판단하지 않고 안전하게 넘어간다).
function thScheduledDate(icon, classNum) {
  if (!icon || !classNum) return null;
  const label = /^\d+$/.test(String(icon).trim()) ? `${icon}강` : String(icon).trim();
  const row = (_plData.rows || []).find(r => r.label === label);
  if (!row) return null;
  const cell = row.cells && row.cells['c' + classNum];
  if (!cell) return null;
  return plResolveDate(cell, plToday());
}

// ── 미션 체크 자동 연동 ──
// 미션 카드의 "연결 강의번호"(lessonNum)가 성적 체크에서 고른 강의와 같으면, 그 카드가 가리키는
// 웹앱의 제출 데이터를 읽어 미션 달성·기한을 자동으로 채운다. 앱마다 컬렉션 이름과 문서 모양이
// 달라서 여기 한 곳에 표로 모아 둔다(새 앱을 연동하려면 이 표에 한 줄 추가).
//   coll       : 학생 제출물이 쌓이는 Firestore 컬렉션
//   timeFields : 제출 시각 필드 — 앞에서부터 먼저 값이 있는 걸 쓴다(기한 판정과 제출시간 표시용)
//   graded     : true면 status('pass'/'fail') 채점 결과를 따르고, 아직 채점 안 된 학생은
//                건드리지 않는다(선생님이 직접 판단하도록 빈칸으로 남김).
//                false면 채점 기능이 없는 앱이라 제출 자체를 달성으로 본다.
const MISSION_SOURCES = {
  j_interview:   { coll: 'interview_joseon_answers', timeFields: ['submittedAt'],            graded: true  },
  j_wartimeline: { coll: 'j_wartimeline_results',    timeFields: ['submittedAt'],            graded: true  },
  // 네컷은 작품 문서(fourcut_works)에 base64 이미지가 통째로 들어 있어 전량 조회가 너무 무겁다.
  // 네컷 어드민이 통과/미흡을 누를 때 학번당 1문서로 합산해 두는 요약 문서만 읽는다.
  j_4cut:        { coll: 'fourcut_submissions',      timeFields: ['createdAt'],              graded: true  },
};

// 미션 카드 url("apps/j_interview/index.html")에서 앱 폴더 이름을 뽑는다.
function missionAppKey(url) {
  const parts = String(url || '').split('/').filter(Boolean);
  const i = parts.indexOf('apps');
  return i >= 0 ? (parts[i + 1] || '') : (parts[1] || '');
}

function missionToDate(v) {
  if (!v) return null;
  if (v.toDate) return v.toDate();
  const d = new Date(v);
  return isNaN(d) ? null : d;
}

// 이 강의(lessonKey)에 연결된 미션 앱들의 제출 데이터를 읽어 학생별 판정을 돌려준다.
// 반환값: { map: { [학번]: { achieved, onTime, at } }, apps: [연동된 앱 이름] }
// map에서 빠져 있는 학번은 "빈칸"(아직 채점 전이라 선생님 판단으로 남긴 것).
async function missionAutoDetect(lessonKey) {
  const empty = { map: {}, apps: [] };
  const cat = await getMissionCategoryKey();
  if (!cat) return empty;

  let cards = [];
  try {
    const snap = await getDocs(query(collection(db, 'cards'), where('category', '==', cat)));
    cards = snap.docs.map(d => d.data());
  } catch (e) { return empty; }

  // lessonNum이 비어 있는 카드는 어느 강의 건지 알 수 없으므로 자동 연동 대상이 아니다.
  const matched = cards
    .filter(c => String(c.lessonNum || '') === String(lessonKey))
    .map(c => ({ card: c, src: MISSION_SOURCES[missionAppKey(c.url)] }))
    .filter(x => x.src);
  if (!matched.length) return empty;
  const sources = matched.map(x => x.src);
  const apps = matched.map(x => x.card.title || missionAppKey(x.card.url));

  await plEnsureLoaded(); // 기한 판정에 필요한 수업 스케줄(class_progress)

  const perSource = await Promise.all(sources.map(async src => {
    const byStudent = {};
    try {
      const snap = await getDocs(collection(db, src.coll));
      snap.docs.forEach(d => {
        const data = d.data();
        const sid = String(data.studentId || d.id || '');
        if (!_gradeRecords[sid]) return; // 로스터에 없는 학번(테스트 계정 등)은 무시
        (byStudent[sid] || (byStudent[sid] = [])).push(data);
      });
    } catch (e) { return { src, byStudent: {}, failed: true }; }
    return { src, byStudent };
  }));

  const out = {};
  Object.keys(_gradeRecords).forEach(sid => {
    if (sid === '00000') return;
    const classNum = sid.length >= 3 ? parseInt(sid.slice(1, 3), 10) : null;
    const sched = thScheduledDate(lessonKey, classNum);
    let achieved = true, onTime = true, at = null, blank = false;

    for (const { src, byStudent, failed } of perSource) {
      if (failed) { blank = true; break; } // 읽기 실패한 앱이 있으면 판정하지 않는다
      const docs = byStudent[sid] || [];
      if (!docs.length) { achieved = false; onTime = false; continue; } // 미제출

      if (src.graded) {
        const statuses = docs.map(d => d.status);
        // 하나라도 아직 채점 전(pending 등)이면 선생님 판단으로 남긴다.
        if (statuses.some(st => st !== 'pass' && st !== 'fail')) { blank = true; break; }
        if (!statuses.every(st => st === 'pass')) achieved = false; // 전부 통과해야 달성
      }

      // 제출 시각은 가장 이른 것을 기준으로 삼는다 — 수업 시간에 한 번 냈으면, 나중에
      // 작품을 하나 더 올렸다고 지각으로 뒤집히면 안 된다.
      let first = null;
      docs.forEach(d => {
        const t = missionToDate(src.timeFields.map(f => d[f]).find(v => v != null));
        if (t && (!first || t < first)) first = t;
      });
      if (first && (!at || first < at)) at = first;
      if (first && sched) {
        const dayOnly = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
        if (dayOnly(first) > dayOnly(sched)) onTime = false; // 수업일보다 늦게 제출
      }
    }

    if (!blank) out[sid] = { achieved, onTime, at };
  });

  return { map: out, apps };
}

// 미션 자동 연동이 실제로 걸렸는지 강의 선택 줄 아래에 알려 준다. 연결이 안 됐는데 표가
// 전부 빈칸으로 보이면 선생님이 원인을 알 수 없어서, 왜 비었는지까지 문구로 남긴다.
function renderMissionLinkNote(apps, filledCount) {
  const el = document.getElementById('gradeMissionLinkNote');
  if (!el) return;
  if (!apps || !apps.length) {
    el.style.display = 'none';
    el.textContent = '';
    return;
  }
  const total = _gradeStudents.filter(s => s.id !== '00000').length;
  const pending = Math.max(0, total - filledCount);
  el.style.display = '';
  el.textContent = `미션체크 자동 연동: ${apps.join(', ')}`
    + (pending ? ` (아직 채점 전인 ${pending}명은 빈칸으로 두었습니다)` : '');
}

// 생각 체크 최종 판정: 문구(verdict)·달성(achieved)·기한(onTime) 세 가지를 한 번에 계산한다.
// 우선순위(동시에 여러 개 어겨도 하나만 표시): 이탈 5회↑ > 50자 미만 > AI 미흡(조금 미흡)
// > 지연 제출 > 통과. 각 사유별 표시 규칙은 다음과 같다(사용자 확정 기준):
//   통과              → achieved✓ onTime✓
//   미흡(지연 제출)    → achieved✓ onTime✗ (내용·분량·AI 채점은 통과했으나 당일 제출 못함)
//   조금 미흡          → achieved✗ onTime✓ (AI 채점 기준 미달)
//   미흡(50자 미만)    → achieved✗ onTime✓
//   미흡(이탈)         → achieved✗ onTime✓ (이탈 5회 이상)
//   미흡(미제출)       → achieved✗ onTime✗ (호출 쪽에서 sub 자체가 없을 때 처리)
// overrideVal(교사 수동 토글, gradeOverrides)이 있으면 이유와 무관하게 achieved만 덮어쓴다
// — 포인트는 채점 시 이미 확정된 값 그대로이고, 토글로 새 포인트가 생기지는 않는다.
// 제출 시각이 그 반의 수업일(class_progress 스케줄)보다 늦으면 true. 스케줄 정보가 없으면
// 판단 보류(false) — 정보 부족으로 불이익을 주지 않는다. thinkVerdict()와 thRunGrading() 둘 다 씀.
function thIsLateSubmission(sub, lec) {
  const classNum = sub.id && String(sub.id).length >= 3 ? parseInt(String(sub.id).slice(1, 3), 10) : null;
  const sched = thScheduledDate(lec && lec.icon, classNum);
  const subDate = sub.createdAt ? (sub.createdAt.toDate ? sub.createdAt.toDate() : new Date(sub.createdAt)) : null;
  if (!sched || !subDate) return false;
  const dayOnly = d => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return dayOnly(subDate) > dayOnly(sched);
}

function thinkVerdict(sub, lec, overrideVal) {
  const late = thIsLateSubmission(sub, lec);
  let verdict, achieved, onTime;
  const v = sub.aiVerdict;
  if ((sub.cheatCount || 0) >= 5) {
    verdict = '미흡(이탈)'; achieved = false; onTime = true;
  } else if ((sub.textLength || 0) < 50) {
    verdict = '미흡(50자 미만)'; achieved = false; onTime = true;
  } else if (sub.thGraded && v === '조금 미흡') {
    // 정확히 '조금 미흡'(AI 품질 미달)일 때만 여기서 잡는다. 넓게 "미흡" 포함 여부로
    // 검사하면 '미흡(지연 제출)'도 걸려버려(문자열에 "미흡"이 들어있음) 지연 제출인데도
    // achieved가 꺼지는 오류가 생긴다.
    verdict = '조금 미흡'; achieved = false; onTime = true;
  } else if (late) {
    verdict = '미흡(지연 제출)'; achieved = true; onTime = false;
  } else {
    verdict = '통과'; achieved = true; onTime = true;
  }

  if (overrideVal === 'pass') achieved = true;
  else if (overrideVal === 'fail') achieved = false;

  return { verdict, achieved, onTime };
}

async function initGradeTab() {
  // 개념 체크 강의 선택(gradeLessonSel)은 class_lessons(개념 체크에서 만든 강의)에서,
  // 생각 체크 연결(gradeThinkSel)은 lectures(생각 체크 강의)에서 따로 가져온다.
  // 예전엔 둘 다 lectures를 같이 썼는데, 그러면 개념 체크와 무관한 강의까지 섞여 나왔다.
  try {
    const snap = await getDocs(collection(db, 'class_lessons'));
    _gradeLessons = snap.docs
      .map(d => ({ docId: d.id, ...d.data() }))
      .filter(l => l.num)
      .sort(lecSortByOrderDesc); // 개념·생각 드롭다운과 동일한 공통 정렬(order 내림차순)

    const lessonSel = document.getElementById('gradeLessonSel');
    _gradeLessons.forEach(l => {
      const o = document.createElement('option');
      o.value = l.num;
      o.textContent = lecLabel(l.num, cleanTitle(l.title));
      lessonSel.appendChild(o);
    });
    lessonSel.addEventListener('change', onGradeLessonChange);
  } catch(e) {}

  // 생각 체크 연결(gradeThinkSel)은 thPopulateSelects()가 think_lectures onSnapshot으로
  // 이미 채우고 있어서(자동 시작 시점부터 계속 동기화) 여기서 또 채우면 중복 추가된다. 손대지 않는다.

  // 학생 명단 (RTDB)
  try {
    const snap = await get(ref(rtdb, 'students'));
    const data = snap.val();
    if (data) {
      const map = {};
      Object.values(data).forEach(s => {
        if (!s) return;
        const sid   = String(s.studentId || s.id || '').trim();
        const sname = (s.name || s.studentName || '').trim();
        if (sid && sname && !isTestId(sid)) map[sid] = sname; // 테스트 학생은 GRADE 목록/평균에서 제외
      });
      _gradeStudents = Object.entries(map)
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.id.localeCompare(b.id));
    }
  } catch(e) {}

  renderGradeClassTags(); // 반 선택 태그는 불러오기 전에도 항상 표시한다

  document.getElementById('gradeLoadBtn').addEventListener('click', loadGradeData);
  document.getElementById('gradeSaveBtn').addEventListener('click', saveGradeRecords);
  document.getElementById('gradeScoreLoadBtn').addEventListener('click', loadScoreData);
  document.getElementById('gradeExportBtn').addEventListener('click', exportScoreCSV);

  await loadFeedbackTemplates();
}

async function onGradeLessonChange() {
  const key = document.getElementById('gradeLessonSel').value;
  if (!key) return;
  try {
    const cfg = await getDoc(doc(db, 'grade_lecture_config', key));
    if (cfg.exists()) {
      const d = cfg.data();
      document.getElementById('gradeThinkSel').value = d.thinkLectureDocId || '';
      gradeUpdateThinkLabel(d.thinkLectureDocId || '');
      document.getElementById('gradeConceptOn').checked = d.conceptEnabled !== false;
      document.getElementById('gradeMissionOn').checked = d.missionEnabled !== false;
      document.getElementById('gradeThinkOn').checked   = d.thinkEnabled   !== false;
      document.getElementById('gradeConceptWeight').value = String(d.conceptWeight || 1);
      document.getElementById('gradeMissionWeight').value = String(d.missionWeight || 1);
      document.getElementById('gradeThinkWeight').value   = String(d.thinkWeight   || 1);
    } else {
      // 저장된 연결 설정이 아직 없으면(이 강의를 성적 체크에서 처음 고른 경우), 강의수
      // 번호(class_lessons.num == think_lectures.icon)가 같은 생각 체크 강의를 자동으로
      // 찾아 연결한다(수동 선택 UI 없음 — 못 찾으면 빈 채로 둔다).
      const matched = gradeFindMatchingThinkLec(key);
      document.getElementById('gradeThinkSel').value = matched ? matched.docId : '';
      gradeUpdateThinkLabel(matched ? matched.docId : '');
      document.getElementById('gradeConceptOn').checked = true;
      document.getElementById('gradeMissionOn').checked = true;
      document.getElementById('gradeThinkOn').checked   = true;
      document.getElementById('gradeConceptWeight').value = '1';
      document.getElementById('gradeMissionWeight').value = '1';
      document.getElementById('gradeThinkWeight').value   = '1';
    }
  } catch(e) {}
}

// class_lessons.num(예: "24")과 icon이 같은 think_lectures 강의를 찾아 {docId,title}을
// 돌려준다(없으면 null). "생각 체크" 관리 블록 안의 thLectures는 그 블록 밖(여기)에서
// 직접 못 읽으므로, thPopulateSelects()가 갱신할 때마다 _thLecCache에 복사해 둔 걸 쓴다.
function gradeFindMatchingThinkLec(num) {
  const lec = _thLecCache.find(l => l.icon && l.icon === String(num));
  return lec ? { docId: lec.docId, title: lec.title } : null;
}

// "자동 연결: OO강 제목" 상태 표시를 갱신한다(고르는 UI 없이 확인만 할 수 있게).
function gradeUpdateThinkLabel(docId) {
  const label = document.getElementById('gradeThinkAutoLabel');
  if (!label) return;
  if (!docId) { label.textContent = '연결된 생각 체크 강의를 찾지 못했습니다'; return; }
  const lec = _thLecCache.find(l => l.docId === docId);
  label.textContent = lec ? `생각체크 자동 연결: ${cleanTitle(lec.title)}` : '생각체크 자동 연결됨';
}

// 학생 명단(_gradeStudents)에서 반 번호 목록을 뽑는다(00000·범위 밖 제외).
function gradeClassNums() {
  const set = new Set();
  _gradeStudents.forEach(s => {
    if (s.id === '00000') return;
    const c = Math.floor((parseInt(s.id) - 30000) / 100);
    if (c >= 1 && c <= 9) set.add(c);
  });
  return [...set].sort((a, b) => a - b);
}

// 반 선택 태그(gradeSubtabBar)를 그린다. 불러오기 전에도 항상 보이며(강의 선택 바로 아래),
// 클릭하면 현재 반(_currentGradeClass)을 바꾸고 표 필터·통계·반영 바를 갱신한다.
function renderGradeClassTags() {
  const bar = document.getElementById('gradeSubtabBar');
  if (!bar) return;
  const nums = gradeClassNums();
  if (!nums.length) { bar.style.display = 'none'; return; }
  // "전체" 탭 없이 반 태그만 둔다. 기본값은 첫 반(예: 1반).
  if (_currentGradeClass == null || _currentGradeClass === 'all' || !nums.includes(_currentGradeClass)) {
    _currentGradeClass = nums[0];
  }

  bar.innerHTML = nums.map(cls =>
    `<button class="grade-subtab${cls === _currentGradeClass ? ' active' : ''}" data-cls="${cls}">${cls}반</button>`
  ).join('');
  bar.style.display = 'flex';

  bar.querySelectorAll('.grade-subtab').forEach(btn => {
    btn.addEventListener('click', () => {
      const cls = parseInt(btn.dataset.cls);
      _currentGradeClass = cls;
      bar.querySelectorAll('.grade-subtab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (!_gradeLessonKey) return; // 아직 불러오기 전이면 필터만 바꾸고 통계·반영 바는 건드리지 않는다
      document.querySelectorAll('#gradeTableWrap tr[data-cls]').forEach(row => {
        row.style.display = (parseInt(row.dataset.cls) === cls) ? '' : 'none';
      });
      syncGradeAllCb();
      renderGradeStats();
      renderGradePublishBar(cls);
    });
  });
}

async function loadGradeData() {
  const lessonNum = document.getElementById('gradeLessonSel').value;
  if (!lessonNum) { alert('강의를 먼저 선택해 주세요.'); return; }

  _gradeLessonKey = lessonNum;

  const thinkDocId  = document.getElementById('gradeThinkSel').value;
  _gradeThinkDocId  = thinkDocId;
  // 미션 체크는 강의에 연결된 미션 카드(lessonNum)를 따라가 자동 감지한다 — MISSION_SOURCES 참고.
  // 연결된 카드가 없거나 표에 없는 앱이면 예전처럼 표에서 직접 체크하면 된다.
  const conceptEnabled = document.getElementById('gradeConceptOn').checked;
  const missionEnabled = document.getElementById('gradeMissionOn').checked;
  const thinkEnabled   = document.getElementById('gradeThinkOn').checked;
  const conceptWeight  = parseInt(document.getElementById('gradeConceptWeight').value) || 1;
  const missionWeight  = parseInt(document.getElementById('gradeMissionWeight').value) || 1;
  const thinkWeight    = parseInt(document.getElementById('gradeThinkWeight').value)   || 1;
  _gradeEnabled = { concept: conceptEnabled, mission: missionEnabled, think: thinkEnabled };

  // 설정 저장
  try {
    const lesson = _gradeLessons.find(l => l.num === _gradeLessonKey);
    await setDoc(doc(db, 'grade_lecture_config', _gradeLessonKey), {
      thinkLectureDocId: thinkDocId,
      lessonTitle: lesson?.title || lecTag(_gradeLessonKey),
      conceptEnabled, missionEnabled, thinkEnabled,
      conceptWeight, missionWeight, thinkWeight,
    });
  } catch(e) {}

  const btn = document.getElementById('gradeLoadBtn');
  btn.disabled = true; btn.textContent = '불러오는 중…';

  try {
    // 기본값 초기화
    _gradeRecords      = {};
    _gradeThinkTimes   = {};
    _gradeMissionTimes = {};
    _gradeStudents.forEach(s => {
      _gradeRecords[s.id] = {
        concept: { achieved: false, onTime: false },
        mission: { achieved: false, onTime: false },
        think:   { achieved: false, onTime: false },
        absent:  false,
        feedback: '',
      };
    });

    // 기존 저장 기록 로드
    const existing = await getDocs(query(
      collection(db, 'grade_records'),
      where('lessonKey', '==', _gradeLessonKey)
    ));
    const savedSet = new Set();
    existing.docs.forEach(d => {
      const r = d.data();
      if (_gradeRecords[r.studentId]) {
        _gradeRecords[r.studentId] = {
          concept: r.concept || { achieved: false, onTime: false },
          mission: r.mission || { achieved: false, onTime: false },
          think:   r.think   || { achieved: false, onTime: false },
          absent:  r.absent  || false,
          feedback: r.feedback || '',
        };
        // 피드백만 먼저 저장된 문서(concept/mission/think 없음)는 "채점 저장됨"으로 치지 않는다.
        // 여기에 넣어버리면 아래 자동감지가 onTime을 건너뛰어 제출했는데도 기한 체크가 빠진다.
        if (r.concept || r.mission || r.think) savedSet.add(r.studentId);
      }
    });

    // 생각체크 자동감지 (제출시간 수집)
    // thinkVerdict() 기준대로 달성(achieved)·기한(onTime)을 함께 계산한다(통과/미흡(지연 제출)/
    // 조금 미흡/미흡(50자 미만)/미흡(이탈)/미흡(미제출) 6가지 — 자세한 규칙은 thinkVerdict 주석 참고).
    // 아예 미제출이면 달성·기한 모두 기본값(false)으로 남는다.
    if (thinkDocId) {
      await plEnsureLoaded(); // 지연 제출 판정에 필요한 수업 스케줄(class_progress) 데이터
      let thinkLec = null;
      try {
        const lecSnap = await getDoc(doc(db, 'think_lectures', thinkDocId));
        if (lecSnap.exists()) thinkLec = lecSnap.data();
      } catch (e) {}

      const thinkOverrides = {};
      await Promise.all([1,2,3,4,5,6].map(async cls => {
        try {
          const ovSnap = await getDoc(doc(db, 'gradeOverrides', `${thinkDocId}_${cls}`));
          if (ovSnap.exists()) Object.assign(thinkOverrides, ovSnap.data());
        } catch(e) {}
      }));

      const tSnap = await getDocs(query(
        collection(db, 'think_submissions'),
        where('lectureDocId', '==', thinkDocId)
      ));
      tSnap.docs.forEach(d => {
        const sub = d.data();
        if (!_gradeRecords[sub.id]) return;
        const { achieved, onTime } = thinkVerdict(sub, thinkLec, thinkOverrides[d.id]);
        _gradeRecords[sub.id].think.achieved = achieved;
        if (!savedSet.has(sub.id)) _gradeRecords[sub.id].think.onTime = onTime;
        const ts = sub.createdAt;
        if (ts) _gradeThinkTimes[sub.id] = ts.toDate ? ts.toDate() : new Date(ts);
      });
    }

    // 미션체크 자동감지 — 연결된 미션 앱(MISSION_SOURCES)의 제출·채점 결과를 그대로 가져온다.
    // 이미 저장된 채점 기록이 있는 학생(savedSet)은 선생님이 손으로 고친 값일 수 있어 덮어쓰지 않는다.
    if (missionEnabled) {
      try {
        const { map, apps } = await missionAutoDetect(_gradeLessonKey);
        Object.entries(map).forEach(([sid, v]) => {
          if (v.at) _gradeMissionTimes[sid] = v.at;
          if (savedSet.has(sid) || _gradeRecords[sid].absent) return; // 결석은 미달성 고정
          _gradeRecords[sid].mission.achieved = v.achieved;
          _gradeRecords[sid].mission.onTime   = v.onTime;
        });
        renderMissionLinkNote(apps, Object.keys(map).length);
      } catch(e) { renderMissionLinkNote([], 0); }
    } else {
      renderMissionLinkNote([], 0);
    }

    // 반영 상태 로드
    _publishStatus = {};
    _publishedAt   = {};
    try {
      const pubSnap = await getDocs(query(
        collection(db, 'grade_publish_status'),
        where('lessonKey', '==', _gradeLessonKey)
      ));
      pubSnap.docs.forEach(d => {
        const pd = d.data();
        if (!pd.published) return;
        _publishStatus[pd.classNum] = true;
        if (pd.publishedAt?.seconds) _publishedAt[pd.classNum] = pd.publishedAt.seconds * 1000;
      });
    } catch(e) {}

    renderGradeTable();
    // 반 태그는 이미 항상 떠 있으므로 여기선 반영 상태(뱃지)만 갱신하고,
    // 현재 선택된 반 기준으로 표 필터·통계·반영 바를 맞춘다.
    renderGradeClassTags(); // 반 태그 갱신 + 기본 반(첫 반) 확정
    const cur = _currentGradeClass;
    document.querySelectorAll('#gradeTableWrap tr[data-cls]').forEach(row => {
      row.style.display = (parseInt(row.dataset.cls) === cur) ? '' : 'none';
    });
    syncGradeAllCb();
    renderGradeStats();
    renderGradePublishBar(cur);
    document.getElementById('gradeCheckActions').style.display = 'flex';
    refreshGradeSettingsLectures();
  } catch(e) {
    alert('불러오기 실패: ' + e.message);
  } finally {
    btn.disabled = false; btn.textContent = '불러오기';
  }
}

// ── 강의별 학생 피드백 ──
// 체크(개념/미션/생각)는 메모리(_gradeRecords)에만 두고 "임시 저장"/"반영하기" 흐름을 타지만,
// 피드백만은 예외로 작성 즉시 Firestore에 저장한다(반영하기를 누르지 않아도 학생에게 보임).
// 학생 index.js도 미반영 강의의 피드백을 따로 모아 보여주도록 맞춰져 있다.
let _gradeFeedbackSid = null;

// 피드백 필드만 grade_records에 즉시 병합 저장한다. 채점 결과(concept/mission/think)는
// 건드리지 않으므로 "임시 저장"/"반영하기" 흐름과 충돌하지 않는다.
async function persistFeedbackOnly(entries) {
  if (!_gradeLessonKey || !entries.length) return;
  const lesson = _gradeLessons.find(l => l.num === _gradeLessonKey);
  const lessonTitle = lesson?.title || '';
  await Promise.all(entries.map(({ sid, feedback }) => {
    const stu = _gradeStudents.find(s => s.id === sid);
    return setDoc(doc(db, 'grade_records', `${_gradeLessonKey}_${sid}`), {
      lessonKey: _gradeLessonKey, lessonTitle,
      studentId: sid, studentName: stu?.name || '',
      feedback, updatedAt: serverTimestamp(),
    }, { merge: true });
  }));
}
function openGradeFeedbackModal(sid, name) {
  if (!_gradeRecords[sid]) return;
  _gradeFeedbackSid = sid;
  document.getElementById('gradeFeedbackTitle').textContent = `${name} 학생 피드백`;
  document.getElementById('gradeFeedbackInput').value = _gradeRecords[sid].feedback || '';
  document.getElementById('gradeFeedbackBackdrop').classList.add('open');
}
function closeGradeFeedbackModal() {
  document.getElementById('gradeFeedbackBackdrop').classList.remove('open');
  _gradeFeedbackSid = null;
}
async function saveGradeFeedback() {
  if (!_gradeFeedbackSid) return;
  const sid = _gradeFeedbackSid;
  const val = document.getElementById('gradeFeedbackInput').value.trim();
  const prev = _gradeRecords[sid]?.feedback || '';
  if (_gradeRecords[sid]) _gradeRecords[sid].feedback = val;
  closeGradeFeedbackModal();
  renderGradeTable();
  try {
    await persistFeedbackOnly([{ sid, feedback: val }]);
  } catch (e) {
    if (_gradeRecords[sid]) _gradeRecords[sid].feedback = prev; // 저장 실패 시 화면도 되돌린다
    renderGradeTable();
    alert('피드백 저장 실패: ' + e.message);
  }
}

// ── 피드백 템플릿 (템플릿 설정도, 학생별 적용도 즉시 Firestore에 저장된다) ──
let _feedbackTemplates = [];
let _editingTemplateId = null;

async function loadFeedbackTemplates() {
  try {
    const snap = await getDoc(doc(db, 'settings', 'feedback_templates'));
    _feedbackTemplates = snap.exists() ? (snap.data().list || []) : [];
  } catch (e) { _feedbackTemplates = []; }
}

function openFeedbackTemplateModal() {
  resetTemplateForm();
  renderFeedbackTemplateList();
  renderFeedbackTemplateApplySelect();
  document.getElementById('feedbackTemplateBackdrop').classList.add('open');
}
function closeFeedbackTemplateModal() {
  document.getElementById('feedbackTemplateBackdrop').classList.remove('open');
}

function renderFeedbackTemplateList() {
  const wrap = document.getElementById('feedbackTemplateList');
  if (!_feedbackTemplates.length) {
    wrap.innerHTML = '<div class="field-hint">저장된 템플릿이 없습니다.</div>';
    return;
  }
  wrap.innerHTML = _feedbackTemplates.map(t => `
    <div class="template-row">
      <div class="template-row-label">${esc(t.label)}</div>
      <div class="template-row-text" title="${esc(t.text)}">${esc(t.text)}</div>
      <button class="stu-btn stu-btn-edit" onclick="editFeedbackTemplate('${esc(t.id)}')">수정</button>
      <button class="stu-btn stu-btn-del" onclick="deleteFeedbackTemplate('${esc(t.id)}')">삭제</button>
    </div>
  `).join('');
}

function editFeedbackTemplate(id) {
  const t = _feedbackTemplates.find(x => x.id === id);
  if (!t) return;
  _editingTemplateId = id;
  document.getElementById('templateFormLabel').textContent = '템플릿 수정';
  document.getElementById('templateLabelInput').value = t.label;
  document.getElementById('templateTextInput').value = t.text;
}
function resetTemplateForm() {
  _editingTemplateId = null;
  document.getElementById('templateFormLabel').textContent = '새 템플릿 추가';
  document.getElementById('templateLabelInput').value = '';
  document.getElementById('templateTextInput').value = '';
}

async function saveFeedbackTemplate() {
  const label = document.getElementById('templateLabelInput').value.trim();
  const text = document.getElementById('templateTextInput').value.trim();
  if (!label || !text) { alert('템플릿 이름과 문구를 모두 입력해주세요.'); return; }
  if (_editingTemplateId) {
    const t = _feedbackTemplates.find(x => x.id === _editingTemplateId);
    if (t) { t.label = label; t.text = text; }
  } else {
    _feedbackTemplates.push({ id: 'tpl_' + Date.now(), label, text });
  }
  try {
    await setDoc(doc(db, 'settings', 'feedback_templates'), { list: _feedbackTemplates });
  } catch (e) { alert('저장 실패: ' + e.message); return; }
  resetTemplateForm();
  renderFeedbackTemplateList();
  renderFeedbackTemplateApplySelect();
}

async function deleteFeedbackTemplate(id) {
  if (!confirm('이 템플릿을 삭제하시겠습니까?')) return;
  _feedbackTemplates = _feedbackTemplates.filter(x => x.id !== id);
  try { await setDoc(doc(db, 'settings', 'feedback_templates'), { list: _feedbackTemplates }); } catch (e) {}
  renderFeedbackTemplateList();
  renderFeedbackTemplateApplySelect();
}

function renderFeedbackTemplateApplySelect() {
  const sel = document.getElementById('templateApplySel');
  sel.innerHTML = '<option value="">-- 템플릿 선택 --</option>' +
    _feedbackTemplates.map(t => `<option value="${esc(t.id)}">${esc(t.label)}</option>`).join('');
}

async function applyFeedbackTemplate() {
  const tplId = document.getElementById('templateApplySel').value;
  const target = document.getElementById('templateApplyTarget').value;
  const tpl = _feedbackTemplates.find(t => t.id === tplId);
  if (!tpl) { alert('적용할 템플릿을 선택해주세요.'); return; }

  const catKeys = [];
  if (_gradeEnabled.concept) catKeys.push('concept');
  if (_gradeEnabled.mission) catKeys.push('mission');
  if (_gradeEnabled.think) catKeys.push('think');

  let targets = _gradeStudents.filter(s => s.id !== '00000');
  if (_currentGradeClass != null && _currentGradeClass !== 'all') {
    targets = targets.filter(s => Math.floor((parseInt(s.id) - 30000) / 100) === _currentGradeClass);
  }

  const applied = [];
  targets.forEach(s => {
    const r = _gradeRecords[s.id];
    if (!r || (r.feedback && r.feedback.trim())) return; // 비어있는 학생만
    const matches =
      target === 'all'     ? true :
      target === 'absent'  ? r.absent :
      target === 'missing' ? (!r.absent && catKeys.some(k => !r[k].achieved)) :
      target === 'pass'    ? (!r.absent && catKeys.every(k => r[k].achieved)) :
      false;
    if (!matches) return;
    r.feedback = tpl.text;
    applied.push({ sid: s.id, feedback: tpl.text });
  });

  closeFeedbackTemplateModal();
  renderGradeTable();
  try {
    await persistFeedbackOnly(applied);
    alert(`${applied.length}명에게 적용했습니다. 학생 화면에 바로 보입니다.`);
  } catch (e) {
    applied.forEach(({ sid }) => { if (_gradeRecords[sid]) _gradeRecords[sid].feedback = ''; });
    renderGradeTable();
    alert('피드백 저장 실패: ' + e.message);
  }
}

function syncGradeAllCb() {
  const wrap = document.getElementById('gradeTableWrap');
  if (!wrap) return;
  wrap.querySelectorAll('.grade-all-cb').forEach(allCb => {
    const { t, f } = allCb.dataset;
    const boxes = Array.from(wrap.querySelectorAll(`.grade-cb.${t}[data-f="${f}"]`)).filter(c => {
      if (c.disabled) return false;
      const row = c.closest('tr');
      return _currentGradeClass === 'all' || parseInt(row.dataset.cls) === _currentGradeClass;
    });
    allCb.checked = boxes.length > 0 && boxes.every(c => c.checked);
  });
}

function renderGradeTable() {
  const wrap = document.getElementById('gradeTableWrap');
  if (!_gradeStudents.length) {
    wrap.innerHTML = '<div class="empty-panel">학생 명단이 없습니다.</div>';
    return;
  }

  function fmtTime(d) {
    if (!d) return '—';
    const M = d.getMonth()+1, D = d.getDate();
    const h = String(d.getHours()).padStart(2,'0'), m = String(d.getMinutes()).padStart(2,'0');
    return `${M}/${D} ${h}:${m}`;
  }
  function dayKey(d) {
    return d ? `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` : '';
  }
  function majorityDay(timesMap, students) {
    const cnt = {};
    students.forEach(s => { const k = dayKey(timesMap[s.id]); if (k) cnt[k] = (cnt[k]||0)+1; });
    const keys = Object.keys(cnt);
    return keys.length ? keys.sort((a,b) => cnt[b]-cnt[a])[0] : null;
  }

  // 반별 그룹핑 (00000 제외)
  const classes = {};
  _gradeStudents.filter(s => s.id !== '00000').forEach(s => {
    const cls = Math.floor((parseInt(s.id) - 30000) / 100);
    if (cls < 1 || cls > 9) return;
    if (!classes[cls]) classes[cls] = [];
    classes[cls].push(s);
  });
  const classNums = Object.keys(classes).map(Number).sort((a,b) => a-b);

  const cE = _gradeEnabled.concept;
  const mE = _gradeEnabled.mission;
  const tE = _gradeEnabled.think;

  const allCb = (t, f) =>
    `<input type="checkbox" class="grade-all-cb" data-t="${t}" data-f="${f}" title="전체 선택/해제 (현재 반에만 적용)">`;
  const chk = (sid, type, field, checked, disabled) =>
    `<input type="checkbox" class="grade-cb ${type}" data-sid="${esc(sid)}" data-t="${type}" data-f="${field}" ${checked?'checked':''} ${disabled?'disabled title="결석 처리된 학생은 미달성으로 고정됩니다"':''}>`;
  const timeSpan = (d, isLate) =>
    `<span style="font-size:12px" class="${isLate?'grade-time-late':''}">${esc(fmtTime(d))}</span>`;

  // colgroup으로 열 폭을 고정한다 → 실시/미실시(열 개수)를 바꿔도 각 칸 폭이 그대로 유지된다.
  let cols = '<col style="width:82px"><col style="width:104px">';
  if (cE) cols += '<col style="width:80px"><col style="width:80px">';
  if (mE) cols += '<col style="width:80px"><col style="width:80px"><col style="width:112px">';
  if (tE) cols += '<col style="width:80px"><col style="width:80px"><col style="width:112px">';
  cols += '<col style="width:110px">';

  let html = `<div class="grade-table-wrap"><table class="grade-table grade-table-fixed">
    <colgroup>${cols}</colgroup>
    <thead>
      <tr>
        <th rowspan="2">학번</th><th rowspan="2">이름</th>
        ${cE ? `<th colspan="2" class="gh-concept">개념체크</th>` : ''}
        ${mE ? `<th colspan="3" class="gh-mission">미션체크</th>` : ''}
        ${tE ? `<th colspan="3" class="gh-think">생각체크</th>` : ''}
        <th rowspan="2">피드백</th>
      </tr>
      <tr>
        ${cE ? `<th class="gh-concept">${allCb('concept','achieved')}달성</th><th class="gh-concept">${allCb('concept','onTime')}기한</th>` : ''}
        ${mE ? `<th class="gh-mission">${allCb('mission','achieved')}달성</th><th class="gh-mission">${allCb('mission','onTime')}기한</th><th class="gh-mission">제출시간</th>` : ''}
        ${tE ? `<th class="gh-think">${allCb('think','achieved')}달성</th><th class="gh-think">${allCb('think','onTime')}기한</th><th class="gh-think">제출시간</th>` : ''}
      </tr>
    </thead><tbody>`;

  classNums.forEach(cls => {
    const studs = classes[cls];
    const tMaj  = majorityDay(_gradeThinkTimes, studs);
    const mMaj  = majorityDay(_gradeMissionTimes, studs);
    studs.forEach(s => {
      const r  = _gradeRecords[s.id];
      const tD = _gradeThinkTimes[s.id] || null;
      const mD = _gradeMissionTimes[s.id] || null;
      html += `<tr data-cls="${cls}" data-sid="${esc(s.id)}" class="${r.absent ? 'absent-row' : ''}">
        <td class="tc-id">${esc(s.id)}</td>
        <td class="tc-name" data-sid="${esc(s.id)}" title="클릭하면 결석으로 표시/해제됩니다">${esc(s.name)}</td>
        ${cE ? `<td>${chk(s.id,'concept','achieved',r.concept.achieved,r.absent)}</td><td>${chk(s.id,'concept','onTime',r.concept.onTime,r.absent)}</td>` : ''}
        ${mE ? `<td>${chk(s.id,'mission','achieved',r.mission.achieved,r.absent)}</td><td>${chk(s.id,'mission','onTime',r.mission.onTime,r.absent)}</td><td>${timeSpan(mD,!!(mD&&mMaj&&dayKey(mD)!==mMaj))}</td>` : ''}
        ${tE ? `<td>${chk(s.id,'think','achieved',r.think.achieved,r.absent)}</td><td>${chk(s.id,'think','onTime',r.think.onTime,r.absent)}</td><td>${timeSpan(tD,!!(tD&&tMaj&&dayKey(tD)!==tMaj))}</td>` : ''}
        <td><button class="stu-btn stu-btn-edit" onclick="openGradeFeedbackModal('${esc(s.id)}','${esc(s.name)}')">${r.feedback ? '피드백 수정' : '피드백 작성'}</button></td>
      </tr>`;
    });
  });

  html += '</tbody></table></div>';
  wrap.innerHTML = html;

  // 이 함수가 다시 호출돼 표를 새로 그려도(예: 결석 토글) 이전에 선택돼 있던
  // 반 필터가 풀리지 않도록 다시 적용한다.
  if (_currentGradeClass != null) {
    wrap.querySelectorAll('tr[data-cls]').forEach(row => {
      row.style.display = (_currentGradeClass === 'all' || parseInt(row.dataset.cls) === _currentGradeClass) ? '' : 'none';
    });
  }

  wrap.querySelectorAll('.grade-cb').forEach(cb => {
    cb.addEventListener('change', e => {
      const { sid, t, f } = e.target.dataset;
      if (_gradeRecords[sid]) _gradeRecords[sid][t][f] = e.target.checked;
      syncGradeAllCb();
      if (f === 'achieved') renderGradeStats();
    });
  });

  // 전체 선택/해제 — 태그를 "전체"로 바꾸지 않은 이상 현재 보고 있는 반에만 적용,
  // 결석 처리된 학생은 미달성으로 고정돼야 하므로 전체 선택에서도 건너뛴다.
  wrap.querySelectorAll('.grade-all-cb').forEach(cb => {
    cb.addEventListener('change', e => {
      const { t, f } = e.target.dataset;
      const checked = e.target.checked;
      wrap.querySelectorAll(`.grade-cb.${t}[data-f="${f}"]`).forEach(c => {
        const sid = c.dataset.sid;
        const row = c.closest('tr');
        if (_currentGradeClass !== 'all' && parseInt(row.dataset.cls) !== _currentGradeClass) return;
        if (_gradeRecords[sid]?.absent) return;
        c.checked = checked;
        if (_gradeRecords[sid]) _gradeRecords[sid][t][f] = checked;
      });
      syncGradeAllCb();
      if (f === 'achieved') renderGradeStats();
    });
  });

  // 표제목의 "전체 선택" 체크박스를 현재 보이는 개별 체크박스 상태와 맞춘다
  // (결석으로 잠긴 체크박스는 판단에서 제외 — 전체 선택 자체가 결석 학생을 건너뛰므로).
  syncGradeAllCb();

  // 이름 클릭 -> 결석 표시/해제. 결석으로 표시하면 달성/기한을 전부 미달성으로 고정한다
  // (분모는 그대로 두고 미달성 처리만 — 그 강의를 들었다는 사실 자체는 바뀌지 않으므로).
  wrap.querySelectorAll('.tc-name').forEach(td => {
    td.addEventListener('click', () => {
      const sid = td.dataset.sid;
      const r = _gradeRecords[sid];
      if (!r) return;
      r.absent = !r.absent;
      if (r.absent) {
        r.concept.achieved = false; r.concept.onTime = false;
        r.mission.achieved = false; r.mission.onTime = false;
        r.think.achieved   = false; r.think.onTime   = false;
      }
      renderGradeTable();
      renderGradeStats();
    });
  });
}

// includeAllTab: 맨 앞에 "전체" 탭을 추가한다(성적 체크 입력에서만 사용).
// 기본 선택은 항상 첫 번째 반이라, "전체"를 직접 누르지 않는 이상 반별 적용이 우선된다.
function setupSubtabs(tableWrapId, barId, onClassChange = null, includeAllTab = false) {
  const bar = document.getElementById(barId);
  const clsSet = new Set();
  document.querySelectorAll(`#${tableWrapId} tr[data-cls]`).forEach(r => clsSet.add(parseInt(r.dataset.cls)));
  if (!clsSet.size) { bar.style.display = 'none'; return; }

  const nums = Array.from(clsSet).sort((a, b) => a - b);
  const tabs = includeAllTab ? ['all', ...nums] : nums;
  const defaultTab = includeAllTab ? nums[0] : nums[0];

  function showRows(cls) {
    document.querySelectorAll(`#${tableWrapId} tr[data-cls]`).forEach(row => {
      row.style.display = (cls === 'all' || parseInt(row.dataset.cls) === cls) ? '' : 'none';
    });
  }

  bar.innerHTML = tabs.map(cls =>
    `<button class="grade-subtab${cls === defaultTab ? ' active' : ''}" data-cls="${cls}">${cls === 'all' ? '전체' : cls + '반'}</button>`
  ).join('');
  showRows(defaultTab);

  bar.querySelectorAll('.grade-subtab').forEach(btn => {
    btn.addEventListener('click', () => {
      const raw = btn.dataset.cls;
      const cls = raw === 'all' ? 'all' : parseInt(raw);
      bar.querySelectorAll('.grade-subtab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      showRows(cls);
      if (onClassChange) onClassChange(cls);
    });
  });
  bar.style.display = 'flex';
  if (onClassChange) onClassChange(defaultTab);
}

function renderGradeStats() {
  const bar   = document.getElementById('gradeStatsBar');
  const cls   = _currentGradeClass;
  const entries = Object.entries(_gradeRecords).filter(([sid]) => {
    if (cls == null || cls === 'all') return true;
    return Math.floor((parseInt(sid) - 30000) / 100) === cls;
  });
  const total = entries.length;
  function chip(type, elId) {
    const el = document.getElementById(elId);
    if (!_gradeEnabled[type]) {
      el.innerHTML = '<span class="grade-stat-na">미실시</span>';
    } else {
      const n = entries.filter(([, r]) => r[type]?.achieved).length;
      el.textContent = `${n}/${total}`;
    }
  }
  chip('concept', 'statConcept');
  chip('mission', 'statMission');
  chip('think',   'statThink');
  bar.style.display = 'flex';
}

// ── 성적 조회 ──
let _scoreData = [];

async function loadScoreData() {
  const btn = document.getElementById('gradeScoreLoadBtn');
  btn.disabled = true; btn.textContent = '불러오는 중…';
  document.getElementById('gradeScoreWrap').innerHTML = '<div class="empty-panel">불러오는 중...</div>';
  document.getElementById('gradeExportBtn').style.display = 'none';

  try {
    const settingsSnap = await getDoc(doc(db, 'grade_settings', 'config'));
    if (!settingsSnap.exists()) throw new Error('성적 설정이 없습니다. 성적 설정을 먼저 저장해 주세요.');
    const { selectedLectures = [], bands = [] } = settingsSnap.data();
    if (!selectedLectures.length) throw new Error('반영할 강의가 선택되지 않았습니다.');
    if (!bands.length) throw new Error('급간 설정이 없습니다.');

    // 반별 "성적 반영하기" 여부 로드 — 실제로 반영 버튼을 누른 (강의, 반) 조합만 집계에 포함한다.
    const classNums = [...new Set(_gradeStudents.filter(s => s.id !== '00000').map(s => Math.floor((parseInt(s.id) - 30000) / 100)))];
    const publishedSet = new Set();
    await Promise.all(selectedLectures.flatMap(key => classNums.map(async cls => {
      try {
        const snap = await getDoc(doc(db, 'grade_publish_status', `${key}_${cls}`));
        if (snap.exists() && snap.data().published === true) publishedSet.add(`${key}_${cls}`);
      } catch(e) {}
    })));

    // 강의별 미실시 플래그 로드
    const enabledMap = {};
    await Promise.all(selectedLectures.map(async key => {
      try {
        const snap = await getDoc(doc(db, 'grade_lecture_config', key));
        const d = snap.exists() ? snap.data() : {};
        enabledMap[key] = {
          concept: d.conceptEnabled !== false,
          mission: d.missionEnabled !== false,
          think:   d.thinkEnabled   !== false,
          conceptWeight: parseInt(d.conceptWeight) || 1,
          missionWeight: parseInt(d.missionWeight) || 1,
          thinkWeight:   parseInt(d.thinkWeight)   || 1,
        };
      } catch(e) { enabledMap[key] = { concept:true, mission:true, think:true, conceptWeight:1, missionWeight:1, thinkWeight:1 }; }
    }));

    // 강의별 grade_records 전체 로드
    const recByLec = {};
    await Promise.all(selectedLectures.map(async key => {
      try {
        const snap = await getDocs(query(collection(db, 'grade_records'), where('lessonKey','==',key)));
        recByLec[key] = {};
        snap.docs.forEach(d => { const r = d.data(); recByLec[key][r.studentId] = r; });
      } catch(e) {}
    }));

    function calcScore(achieved, total, type) {
      if (!total) return { achieved:0, total:0, pct:0, score:0 };
      const pct  = Math.round(achieved / total * 100);
      const band = bands.find(b => pct >= b.min) || bands[bands.length-1];
      return { achieved, total, pct, score: band ? (band[type]||0) : 0 };
    }

    _scoreData = _gradeStudents
      .filter(s => s.id !== '00000')
      .map(s => {
        const cls = Math.floor((parseInt(s.id) - 30000) / 100);
        let cA=0, cN=0, mA=0, mN=0, tA=0, tN=0;
        selectedLectures.forEach(key => {
          if (!publishedSet.has(`${key}_${cls}`)) return; // 미반영 강의 제외
          const en  = enabledMap[key];
          const rec = recByLec[key]?.[s.id];
          if (en.concept) { cN += 2*en.conceptWeight; if (rec?.concept?.achieved) cA += en.conceptWeight; if (rec?.concept?.onTime) cA += en.conceptWeight; }
          if (en.mission) { mN += 2*en.missionWeight; if (rec?.mission?.achieved) mA += en.missionWeight; if (rec?.mission?.onTime) mA += en.missionWeight; }
          if (en.think)   { tN += 2*en.thinkWeight;   if (rec?.think?.achieved)   tA += en.thinkWeight;   if (rec?.think?.onTime)   tA += en.thinkWeight; }
        });
        const concept = calcScore(cA, cN, 'concept');
        const mission = calcScore(mA, mN, 'mission');
        const think   = calcScore(tA, tN, 'think');
        return { id:s.id, name:s.name, cls, concept, mission, think,
          total: concept.score + mission.score + think.score };
      })
      .sort((a, b) => a.id.localeCompare(b.id));

    const maxScore = (bands[0]?.concept||0) + (bands[0]?.mission||0) + (bands[0]?.think||0);
    document.getElementById('gradeScoreInfo').textContent =
      `반영 강의 ${selectedLectures.length}개 기준, 최대 ${maxScore}점`;

    renderScoreTable(maxScore);
    setupSubtabs('gradeScoreWrap', 'gradeSubtabScore');
    document.getElementById('gradeExportBtn').style.display = '';
  } catch(e) {
    document.getElementById('gradeScoreWrap').innerHTML = `<div class="empty-panel">${esc(e.message)}</div>`;
  } finally {
    btn.disabled = false; btn.textContent = '불러오기';
  }
}

function renderScoreTable(maxScore) {
  if (!_scoreData.length) {
    document.getElementById('gradeScoreWrap').innerHTML = '<div class="empty-panel">성적 데이터가 없습니다.</div>';
    return;
  }
  const classes = {};
  _scoreData.forEach(s => { if (!classes[s.cls]) classes[s.cls]=[]; classes[s.cls].push(s); });

  let html = `<div class="grade-score-table-wrap"><table class="grade-score-table">
    <thead>
      <tr>
        <th rowspan="2">학번</th><th rowspan="2">이름</th>
        <th colspan="3" class="sh-c">개념체크</th>
        <th colspan="3" class="sh-m">미션체크</th>
        <th colspan="3" class="sh-t">생각체크</th>
        <th rowspan="2" class="sh-tot">총점<br><span style="font-size:10px;font-weight:400">/${maxScore}</span></th>
      </tr>
      <tr>
        <th class="sh-c">달성</th><th class="sh-c">%</th><th class="sh-c">점수</th>
        <th class="sh-m">달성</th><th class="sh-m">%</th><th class="sh-m">점수</th>
        <th class="sh-t">달성</th><th class="sh-t">%</th><th class="sh-t">점수</th>
      </tr>
    </thead><tbody>`;

  Object.keys(classes).sort((a,b)=>a-b).forEach(cls => {
    const studs = classes[cls];
    html += `<tr class="sc-cls-row" data-cls="${cls}"><td colspan="12">${cls}반 (${studs.length}명)</td></tr>`;
    studs.forEach(s => {
      const c=s.concept, m=s.mission, t=s.think;
      html += `<tr data-cls="${cls}">
        <td style="font-size:12px;color:var(--sub)">${esc(s.id)}</td>
        <td style="font-weight:600">${esc(s.name)}</td>
        <td>${c.total?`${c.achieved}/${c.total}`:'미실시'}</td><td>${c.total?c.pct+'%':'—'}</td><td style="font-weight:700;color:var(--c1)">${c.total?c.score:'—'}</td>
        <td>${m.total?`${m.achieved}/${m.total}`:'미실시'}</td><td>${m.total?m.pct+'%':'—'}</td><td style="font-weight:700;color:var(--c2)">${m.total?m.score:'—'}</td>
        <td>${t.total?`${t.achieved}/${t.total}`:'미실시'}</td><td>${t.total?t.pct+'%':'—'}</td><td style="font-weight:700;color:var(--c1)">${t.total?t.score:'—'}</td>
        <td style="font-weight:800;color:var(--c4)">${s.total}</td>
      </tr>`;
    });
  });
  html += '</tbody></table></div>';
  document.getElementById('gradeScoreWrap').innerHTML = html;
}

function exportScoreCSV() {
  if (!_scoreData.length) return;
  const BOM = '﻿';
  const headers = ['학번','이름','반','개념달성','개념총','개념%','개념점수','미션달성','미션총','미션%','미션점수','생각달성','생각총','생각%','생각점수','총점'];
  const rows = _scoreData.map(s => [
    s.id, s.name, `${s.cls}반`,
    s.concept.achieved, s.concept.total||'미실시', s.concept.total ? s.concept.pct+'%' : '—', s.concept.total ? s.concept.score : '—',
    s.mission.achieved, s.mission.total||'미실시', s.mission.total ? s.mission.pct+'%' : '—', s.mission.total ? s.mission.score : '—',
    s.think.achieved,   s.think.total  ||'미실시', s.think.total   ? s.think.pct+'%'   : '—', s.think.total   ? s.think.score   : '—',
    s.total,
  ]);
  const csv  = BOM + [headers, ...rows].map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type:'text/csv;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a'); a.href=url; a.download='성적조회.csv'; a.click();
  URL.revokeObjectURL(url);
}

// "반영할 강의" 후보는 이미 성적 체크에서 불러온(=grade_lecture_config가 있는) 강의로
// 제한하지 않고, 개념 체크에서 강의가 만들어진 시점(lectures 컬렉션에 있는 것)에 바로
// 고를 수 있어야 한다는 요청에 따라 lectures 컬렉션에서 직접 가져온다.
async function fetchAllConceptLectures() {
  const snap = await getDocs(collection(db, 'class_lessons'));
  return snap.docs
    .map(d => {
      const data = d.data();
      return { key: data.num, title: lecLabel(data.num, cleanTitle(data.title)) };
    })
    .filter(l => l.key)
    .sort((a, b) => parseInt(a.key || 0) - parseInt(b.key || 0));
}

async function refreshGradeSettingsLectures() {
  try { _allGradedLectures = await fetchAllConceptLectures(); } catch(e) {}
  if (_gradeSettings) renderGradeSettings();
}

// ── 성적 설정 ──
const DEFAULT_BANDS = [
  { min: 90, concept: 30, mission: 40, think: 30 },
  { min: 80, concept: 27, mission: 36, think: 27 },
  { min: 70, concept: 24, mission: 32, think: 24 },
  { min: 60, concept: 21, mission: 28, think: 21 },
  { min: 50, concept: 18, mission: 24, think: 18 },
  { min: 40, concept: 15, mission: 20, think: 15 },
  { min: 30, concept: 12, mission: 16, think: 12 },
  { min: 20, concept: 9,  mission: 12, think: 9  },
  { min: 10, concept: 6,  mission: 8,  think: 6  },
  { min: 0,  concept: 3,  mission: 4,  think: 3  },
];
let _gradeSettings        = null;
let _allGradedLectures    = [];

async function initGradeSettings() {
  try { _allGradedLectures = await fetchAllConceptLectures(); } catch(e) {}

  try {
    const snap = await getDoc(doc(db, 'grade_settings', 'config'));
    _gradeSettings = snap.exists() ? snap.data() : { selectedLectures: [], bands: DEFAULT_BANDS };
  } catch(e) {
    _gradeSettings = { selectedLectures: [], bands: DEFAULT_BANDS };
  }

  renderGradeSettings();
  document.getElementById('gradeSettingsSaveBtn').addEventListener('click', saveGradeSettings);
  // 드롭다운에서 강의를 고르면 '추가' 버튼 없이 바로 목록에 담는다.
  document.getElementById('gradeSettingsAddSel').addEventListener('change', (e) => {
    const key = e.target.value;
    if (!key) return;
    if (!_gradeSettings.selectedLectures) _gradeSettings.selectedLectures = [];
    if (!_gradeSettings.selectedLectures.includes(key)) _gradeSettings.selectedLectures.push(key);
    renderGradeSettings();
  });
}

// 반영할 강의를 드롭다운으로 골라 추가하면 그 아래에 목록으로 쌓인다. 각 줄의
// 삭제 버튼으로 바로 뺄 수 있다. 저장 전까지는 _gradeSettings만 바뀐다.
function renderGradeSettings() {
  const container = document.getElementById('gradeSettingsLectures');
  const selected  = _gradeSettings.selectedLectures || [];

  container.innerHTML = selected.length
    ? selected.map(key => {
        const lec = _allGradedLectures.find(l => l.key === key);
        return `<div class="lecture-list-item">${esc(String(lec?.title || lecTag(key)).replace(/\*\*/g, '').replace(/[{}]/g, ''))}<button class="lecture-list-remove" data-key="${esc(key)}">삭제</button></div>`;
      }).join('')
    : '<span style="font-size:13px;color:var(--sub)">반영할 강의가 없습니다. 위에서 추가해 주세요.</span>';

  container.querySelectorAll('.lecture-list-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      _gradeSettings.selectedLectures = (_gradeSettings.selectedLectures || []).filter(k => k !== btn.dataset.key);
      renderGradeSettings();
    });
  });

  const addSel = document.getElementById('gradeSettingsAddSel');
  const available = _allGradedLectures.filter(l => !selected.includes(l.key));
  addSel.innerHTML = `<option value="">${available.length ? '강의를 선택하면 바로 추가됩니다' : '추가할 강의 없음'}</option>` +
    available.map(l => `<option value="${esc(l.key)}">${esc(String(l.title || '').replace(/\*\*/g, '').replace(/[{}]/g, ''))}</option>`).join('');

  const bands = _gradeSettings.bands || DEFAULT_BANDS;
  document.getElementById('bandTableBody').innerHTML = bands.map((band, i) => {
    const nextMin = i === 0 ? 100 : bands[i - 1].min;
    const label   = i === 0 ? `${band.min}% 이상` : `${band.min}~${nextMin}%`;
    return `<tr>
      <td>${label}</td>
      <td><input type="number" class="band-input" data-idx="${i}" data-t="concept" value="${band.concept ?? 0}" min="0" max="9999"></td>
      <td><input type="number" class="band-input" data-idx="${i}" data-t="mission" value="${band.mission ?? 0}" min="0" max="9999"></td>
      <td><input type="number" class="band-input" data-idx="${i}" data-t="think"   value="${band.think   ?? 0}" min="0" max="9999"></td>
    </tr>`;
  }).join('');
}

// 반영 시각 표기 — mm/dd HH:MM
function gradePublishedAtText(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  if (isNaN(d.getTime())) return '';
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// ── 성적 반영 바 ──
function renderGradePublishBar(classNum) {
  const statusEl = document.getElementById('gradePublishStatusLbl');
  const btn = document.getElementById('publishActionBtn');
  const refreshBtn = document.getElementById('gradeRefreshBtn');
  if (!classNum || !_gradeLessonKey) {
    statusEl.textContent = '';
    statusEl.className = 'grade-publish-status-lbl';
    btn.style.display = 'none';
    if (refreshBtn) refreshBtn.style.display = 'none';
    return;
  }
  const published = !!_publishStatus[classNum];

  // 반영됨일 때는 마지막으로 반영(또는 갱신)한 시각을 옆에 붙여 준다.
  const at = published ? gradePublishedAtText(_publishedAt[classNum]) : '';
  statusEl.innerHTML = published
    ? `✓ 반영됨 (${classNum}반)${at ? ` <span class="grade-publish-time">${at}</span>` : ''}`
    : `미반영 (${classNum}반)`;
  statusEl.className = `grade-publish-status-lbl ${published ? 'published' : 'unpublished'}`;

  btn.style.display = '';
  btn.disabled = false; // 다른 반을 반영/취소한 뒤 탭을 옮겨와도 이 버튼은 항상 눌러진 상태로 시작해야 한다
  btn.className = published ? 'btn-unpublish' : 'btn-publish';
  btn.textContent = published ? '반영 취소' : '성적 반영하기';
  btn.onclick = () => published ? unpublishClassGrades(classNum) : publishClassGrades(classNum);

  // 갱신: 이미 반영된 반에서만 노출. 취소하지 않고 최신 편집 내용으로 다시 반영한다.
  if (refreshBtn) {
    refreshBtn.style.display = published ? '' : 'none';
    refreshBtn.disabled = false;
    refreshBtn.textContent = '갱신';
    refreshBtn.onclick = () => refreshClassGrades(classNum);
  }
}

// 반영을 취소하지 않고, 현재 편집 상태(개념/미션/생각/결석/피드백)를 학생 성적에 다시 덮어쓴다.
async function refreshClassGrades(classNum) {
  if (!_gradeLessonKey || !_publishStatus[classNum]) return;
  const studentsInClass = _gradeStudents.filter(s => {
    if (s.id === '00000') return false;
    return Math.floor((parseInt(s.id) - 30000) / 100) === classNum;
  });
  if (!confirm(`${classNum}반 ${studentsInClass.length}명의 성적을 지금 편집 내용으로 갱신(재반영)하시겠습니까?\n반영을 취소하지 않고 학생 성적 조회를 최신 상태로 덮어씁니다.`)) return;

  const btn = document.getElementById('gradeRefreshBtn');
  if (btn) { btn.disabled = true; btn.textContent = '갱신 중...'; }

  try {
    const lesson = _gradeLessons.find(l => l.num === _gradeLessonKey);
    const lessonTitle = lesson?.title || '';

    await Promise.all(studentsInClass.map(s =>
      setDoc(doc(db, 'grade_records', `${_gradeLessonKey}_${s.id}`), {
        lessonKey: _gradeLessonKey, lessonTitle,
        studentId: s.id, studentName: s.name,
        concept: _gradeRecords[s.id].concept,
        mission: _gradeRecords[s.id].mission,
        think:   _gradeRecords[s.id].think,
        absent:  _gradeRecords[s.id].absent || false,
        feedback: _gradeRecords[s.id].feedback || '',
        published: true,
        updatedAt: serverTimestamp(),
      }, { merge: true })
    ));

    await setDoc(doc(db, 'grade_publish_status', `${_gradeLessonKey}_${classNum}`), {
      published: true, publishedAt: serverTimestamp(),
      lessonKey: _gradeLessonKey, classNum,
    });

    _publishedAt[classNum] = Date.now(); // 서버 시각은 다음 로드 때 정확히 다시 읽는다
    renderGradePublishBar(classNum);
    alert(`${classNum}반 성적 갱신 완료!`);
  } catch(e) {
    alert('갱신 실패: ' + e.message);
    renderGradePublishBar(classNum);
  }
}

function updateSubtabPublishBadge(classNum, published) {
  const bar = document.getElementById('gradeSubtabBar');
  const btn = bar?.querySelector(`.grade-subtab[data-cls="${classNum}"]`);
  if (!btn) return;
  btn.className = `grade-subtab${btn.classList.contains('active') ? ' active' : ''}${published ? ' pub' : ''}`;
  btn.dataset.cls = classNum;
  btn.textContent = `${classNum}반`;
}

function updateAllSubtabBadges() {
  const bar = document.getElementById('gradeSubtabBar');
  bar?.querySelectorAll('.grade-subtab').forEach(btn => {
    const cls = parseInt(btn.dataset.cls);
    const active = btn.classList.contains('active');
    btn.className = `grade-subtab${active ? ' active' : ''}${_publishStatus[cls] ? ' pub' : ''}`;
  });
}

async function publishClassGrades(classNum) {
  if (!_gradeLessonKey) return;
  const studentsInClass = _gradeStudents.filter(s => {
    if (s.id === '00000') return false;
    return Math.floor((parseInt(s.id) - 30000) / 100) === classNum;
  });
  if (!confirm(`${classNum}반 ${studentsInClass.length}명의 성적을 반영하시겠습니까?\n학생 성적 조회에 즉시 표시됩니다.`)) return;

  const btn = document.getElementById('publishActionBtn');
  if (btn) { btn.disabled = true; btn.textContent = '반영 중...'; }

  try {
    const lesson = _gradeLessons.find(l => l.num === _gradeLessonKey);
    const lessonTitle = lesson?.title || '';

    await Promise.all(studentsInClass.map(s =>
      setDoc(doc(db, 'grade_records', `${_gradeLessonKey}_${s.id}`), {
        lessonKey: _gradeLessonKey, lessonTitle,
        studentId: s.id, studentName: s.name,
        concept: _gradeRecords[s.id].concept,
        mission: _gradeRecords[s.id].mission,
        think:   _gradeRecords[s.id].think,
        absent:  _gradeRecords[s.id].absent || false,
        feedback: _gradeRecords[s.id].feedback || '',
        published: true,
        updatedAt: serverTimestamp(),
      }, { merge: true })
    ));

    await setDoc(doc(db, 'grade_publish_status', `${_gradeLessonKey}_${classNum}`), {
      published: true, publishedAt: serverTimestamp(),
      lessonKey: _gradeLessonKey, classNum,
    });

    _publishStatus[classNum] = true;
    _publishedAt[classNum]   = Date.now(); // 서버 시각은 다음 로드 때 정확히 다시 읽는다
    renderGradePublishBar(classNum);
    updateSubtabPublishBadge(classNum, true);
    alert(`${classNum}반 성적 반영 완료!`);
  } catch(e) {
    alert('반영 실패: ' + e.message);
    renderGradePublishBar(classNum); // 실패해도 버튼을 다시 눌러진 상태로 되돌린다
  }
}

async function unpublishClassGrades(classNum) {
  if (!_gradeLessonKey) return;
  if (!confirm(`${classNum}반 성적 반영을 취소하시겠습니까?\n학생 성적 조회에서 제거됩니다.`)) return;

  const studentsInClass = _gradeStudents.filter(s => {
    if (s.id === '00000') return false;
    return Math.floor((parseInt(s.id) - 30000) / 100) === classNum;
  });

  const btn = document.getElementById('publishActionBtn');
  if (btn) { btn.disabled = true; btn.textContent = '취소 중...'; }

  try {
    await setDoc(doc(db, 'grade_publish_status', `${_gradeLessonKey}_${classNum}`), {
      published: false, updatedAt: serverTimestamp(),
      lessonKey: _gradeLessonKey, classNum,
    });

    await Promise.all(studentsInClass.map(s =>
      setDoc(doc(db, 'grade_records', `${_gradeLessonKey}_${s.id}`),
        { published: false, updatedAt: serverTimestamp() },
        { merge: true }
      )
    ));

    _publishStatus[classNum] = false;
    delete _publishedAt[classNum];
    renderGradePublishBar(classNum);
    updateSubtabPublishBadge(classNum, false);
    alert(`${classNum}반 성적 반영 취소 완료.`);
  } catch(e) {
    alert('취소 실패: ' + e.message);
    renderGradePublishBar(classNum); // 실패해도 버튼을 다시 눌러진 상태로 되돌린다
  }
}

async function saveGradeSettings() {
  const selectedLectures = _gradeSettings.selectedLectures || [];
  const base  = _gradeSettings.bands || DEFAULT_BANDS;
  const bands = base.map((band, i) => ({
    min:     band.min,
    concept: parseInt(document.querySelector(`.band-input[data-idx="${i}"][data-t="concept"]`)?.value ?? 0),
    mission: parseInt(document.querySelector(`.band-input[data-idx="${i}"][data-t="mission"]`)?.value ?? 0),
    think:   parseInt(document.querySelector(`.band-input[data-idx="${i}"][data-t="think"]`)?.value   ?? 0),
  }));

  const btn = document.getElementById('gradeSettingsSaveBtn');
  btn.disabled = true; btn.textContent = '저장 중…';
  try {
    await setDoc(doc(db, 'grade_settings', 'config'), { selectedLectures, bands });
    _gradeSettings = { selectedLectures, bands };
    alert('설정 저장 완료!');
  } catch(e) {
    alert('저장 실패: ' + e.message);
  } finally {
    btn.disabled = false; btn.textContent = '설정 저장';
  }
}

async function saveGradeRecords() {
  if (!_gradeLessonKey || !_gradeStudents.length) return;
  const lesson = _gradeLessons.find(l => l.num === _gradeLessonKey);
  const lessonTitle = lesson?.title || '';

  // 체크박스 전체선택/해제와 마찬가지로, 저장도 지금 보고 있는 반에만 적용된다
  // ("전체" 탭에서 누르면 학년 전체가 저장된다). 팝업에 뜨는 인원수도 실제로
  // 저장된 범위와 일치시킨다.
  const cls = _currentGradeClass;
  const targets = (cls == null || cls === 'all')
    ? _gradeStudents
    : _gradeStudents.filter(s => Math.floor((parseInt(s.id) - 30000) / 100) === cls);
  const scopeLabel = (cls == null || cls === 'all') ? '전체' : `${cls}반`;

  const btn = document.getElementById('gradeSaveBtn');
  btn.disabled = true; btn.textContent = '저장 중…';
  try {
    await Promise.all(targets.map(s =>
      setDoc(doc(db, 'grade_records', `${_gradeLessonKey}_${s.id}`), {
        lessonKey:   _gradeLessonKey,
        lessonTitle,
        studentId:   s.id,
        studentName: s.name,
        concept:     _gradeRecords[s.id].concept,
        mission:     _gradeRecords[s.id].mission,
        think:       _gradeRecords[s.id].think,
        absent:      _gradeRecords[s.id].absent || false,
        feedback:    _gradeRecords[s.id].feedback || '',
        updatedAt:   serverTimestamp(),
      }, { merge: true })
    ));
    alert(`${scopeLabel} ${targets.length}명 임시 저장 완료! (학생에게 미반영)`);
  } catch(e) {
    alert('저장 실패: ' + e.message);
  } finally {
    btn.disabled = false; btn.textContent = '임시 저장';
  }
}

// 개념 체크(콘텐츠·디자인) 탭은 class/admin.html에서 이식되며 onclick/onchange/oninput
// 인라인 핸들러를 그대로 쓰는데, 이 <script>는 type="module"이라 최상위 function 선언이
// window에 자동으로 붙지 않는다. 인라인 핸들러가 찾을 수 있도록 명시적으로 노출한다.
Object.assign(window, {
  switchSubTab, addLesson, deleteLesson, onLessonChange,
  addSlide, addDivider, addContentRow, addImageSlide, toggleDividerImg, deleteLine, deletePair, moveLine,
  addRowToGroup, addPageToGroup, addTitledPageAfter, moveSlideBlock, ceShowAddMenu, deleteGroup, deleteRow, updateGroupTitle, ceToggleFmt,
  setLineFormat, toggleLabelPos, toggleHideBadge, setLineFontSize, setColsTitleSize, updateImgLayout,
  updateEventField, updateEventContent, addEvent, removeEvent,
  updateCompareField, updateCompareItems,
  updateStageField, addStage, removeStage,
  updateColField, addCol, removeCol,
  updateImageItem, addImageItem, removeImageItem,
  addFullImageSlide, deleteFullImage, addVideoSlide, updateVideoUrl,
  updateLesson, updateObjectives, updateLine, updateLineItems, updateThink,
  updateDive, updateDiveImg, toggleOpeningEnabled, toggleChosungEnabled, updateChosungEnabled, updateChosungItems, ceToggleLessonOpen,
  resetContent, saveContent, ceHandleFileUpload,
  onFsSliderInput, onFsNumberInput, onLhSliderInput, onLhNumberInput,
  onLsSliderInput, onLsNumberInput, onTwSliderInput, onTwNumberInput,
  onColorChange, resetDesign, saveDesign,
  openGradeFeedbackModal, closeGradeFeedbackModal, saveGradeFeedback,
  handleContentKeydown, handleItemsKeydown,
  openFeedbackTemplateModal, closeFeedbackTemplateModal,
  editFeedbackTemplate, resetTemplateForm, saveFeedbackTemplate, deleteFeedbackTemplate,
  applyFeedbackTemplate,
  // 아래 다섯은 인라인 핸들러에서 부르는데 노출이 빠져 있어 눌러도 아무 일도 안 났다.
  // dbLoad = 대시보드 "새로고침", autoResizeTa = 콘텐츠 편집 textarea 자동 높이,
  // render*Preview / renderArchiveCards = 카드 편집 폼의 "취소".
  dbLoad, autoResizeTa, renderMissionPreview, renderContentsPreview, renderArchiveCards,
});

// 정적 HTML에 박아둔 아이콘 자리(data-icon)를 SVG로 채운다. (shared/icons.js 공용 헬퍼)
document.querySelectorAll('[data-icon]').forEach(el => {
  el.innerHTML = icon(el.dataset.icon, el.dataset.iconSize ? +el.dataset.iconSize : 24);
});

// 스크립트 최상위 const/let 선언이 모두 끝난 뒤에 호출해야 TDZ 에러가 안 난다.
initAdmin();
watchButtonWidths(); // 버튼 문구가 바뀌어도 폭이 흔들리지 않게 감시 시작

/* ════ 학생 관리 ════ */
{
  const stuRef = ref(rtdb, 'students');
  let stuList = [];
  let stuEditingId = null;
  let stuClsFilter = '';

  // 학반 태그(1~6반) 필터용 — 학년은 무시하고 학번 2~3번째 자리(반 번호)만 비교한다.
  function stuClassNum(sid) {
    if (!sid || sid.length < 3) return null;
    const c = parseInt(sid.slice(1, 3), 10);
    return isNaN(c) ? null : c;
  }

  function stuEsc(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#x27;');
  }

  function stuUpdateCount() {
    const el = document.getElementById('stu-count');
    if (el) el.textContent = `(${stuList.length}명)`;
  }

  window.stuSetClsFilter = function(cls) {
    stuClsFilter = cls;
    document.querySelectorAll('#stu-cls-tags .stu-cls-tag').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.cls === cls);
    });
    window.stuRenderTable();
  };

  window.stuRenderTable = function() {
    const q = (document.getElementById('stu-search')?.value || '').trim().toLowerCase();
    const filtered = stuList.filter(s => {
      if (stuClsFilter && stuClassNum(s.studentId) !== +stuClsFilter) return false;
      return !q || s.studentId.includes(q) || s.studentName.toLowerCase().includes(q);
    });
    const tbody = document.getElementById('stu-table-body');
    const empty = document.getElementById('stu-empty');
    if (!tbody) return;
    if (filtered.length === 0) {
      tbody.innerHTML = '';
      if (empty) empty.style.display = 'block';
      return;
    }
    if (empty) empty.style.display = 'none';
    tbody.innerHTML = filtered.map(s => {
      if (stuEditingId === s.studentId) {
        return `<tr>
          <td><input class="stu-edit-input" id="stu-edit-id" value="${stuEsc(s.studentId)}" maxlength="5" inputmode="numeric"></td>
          <td><input class="stu-edit-input" id="stu-edit-name" value="${stuEsc(s.studentName)}" onkeydown="if(event.key==='Enter') stuSaveEdit('${stuEsc(s.studentId)}','${stuEsc(s._key)}')"></td>
          <td><div class="stu-actions">
            <button class="stu-btn stu-btn-save" onclick="stuSaveEdit('${stuEsc(s.studentId)}','${stuEsc(s._key)}')">저장</button>
            <button class="stu-btn stu-btn-cancel" onclick="stuCancelEdit()">취소</button>
          </div></td>
        </tr>`;
      }
      return `<tr>
        <td class="stu-td-id">${stuEsc(s.studentId)}</td>
        <td style="font-weight:600">${stuEsc(s.studentName)}</td>
        <td><div class="stu-actions">
          <button class="stu-btn stu-btn-edit" onclick="stuStartEdit('${stuEsc(s.studentId)}')" title="수정">${icon('pencil', 15)}</button>
          <button class="stu-btn stu-btn-edit" onclick="stuResetPassword('${stuEsc(s.studentId)}','${stuEsc(s.studentName)}')" title="비밀번호 초기화">${icon('key', 15)}</button>
          <button class="stu-btn stu-btn-del" onclick="stuDelete('${stuEsc(s._key)}','${stuEsc(s.studentName)}')" title="삭제">${icon('trash-2', 15)}</button>
        </div></td>
      </tr>`;
    }).join('');
  };

  window.stuStartEdit = function(sid) { stuEditingId = sid; stuRenderTable(); setTimeout(() => document.getElementById('stu-edit-name')?.focus(), 50); };
  window.stuCancelEdit = function() { stuEditingId = null; stuRenderTable(); };

  window.stuSaveEdit = async function(origId, origKey) {
    const newId   = (document.getElementById('stu-edit-id')?.value || '').trim();
    const newName = (document.getElementById('stu-edit-name')?.value || '').trim();
    if (!newId || !newName) { alert('학번과 이름을 모두 입력하세요.'); return; }
    if (!/^\d{5}$/.test(newId)) { alert('학번은 숫자 5자리여야 합니다.'); return; }
    if (newId !== origId && stuList.find(s => s.studentId === newId)) { alert(`학번 ${newId}은 이미 존재합니다.`); return; }
    if (newId !== origId) {
      await remove(ref(rtdb, `students/${origKey}`));
      await set(push(stuRef), { studentId: newId, name: newName });
    } else {
      await update(ref(rtdb, `students/${origKey}`), { studentId: newId, name: newName });
    }
    stuEditingId = null;
  };

  window.stuAddStudent = async function() {
    const sid   = document.getElementById('stu-add-id')?.value.trim();
    const sname = document.getElementById('stu-add-name')?.value.trim();
    if (!sid || !sname || !/^\d{5}$/.test(sid)) return;
    const existing = stuList.find(s => s.studentId === sid);
    if (existing) {
      if (!confirm(`학번 ${sid}(${existing.studentName})이 이미 있습니다.\n이름을 "${sname}"으로 덮어쓰시겠습니까?`)) return;
      await update(ref(rtdb, `students/${existing._key}`), { studentId: sid, name: sname });
    } else {
      await set(push(stuRef), { studentId: sid, name: sname });
    }
    document.getElementById('stu-add-id').value = '';
    document.getElementById('stu-add-name').value = '';
    document.getElementById('stu-add-id')?.focus();
  };

  window.stuDelete = async function(key, sname) {
    if (!confirm(`${sname} 학생을 삭제하시겠습니까?`)) return;
    await remove(ref(rtdb, `students/${key}`));
  };

  // 학생이 LMS 로그인 때 직접 설정한 비밀번호(lms_auth/{studentId} 문서)를 초기화한다.
  // 문서를 통째로 지우면 다음 로그인 때 "첫 방문"으로 처리돼 새 비밀번호를 설정하게 된다.
  window.stuResetPassword = async function(sid, sname) {
    if (!confirm(`${sname}(${sid}) 학생의 비밀번호를 초기화하시겠습니까?\n다음 로그인 때 새 비밀번호를 설정하게 됩니다.`)) return;
    try {
      await deleteDoc(doc(db, 'lms_auth', sid));
      alert('비밀번호가 초기화되었습니다.');
    } catch (e) {
      alert('초기화 실패: ' + e.message);
    }
  };

  window.stuClearAll = async function() {
    if (!confirm(`전체 학생 명단(${stuList.length}명)을 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return;
    await remove(stuRef);
  };

  window.stuHandleFile = function(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async function(e) {
      const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      const parsed = rows.slice(1)
        .filter(r => r[0] !== '' && r[1] !== '')
        .map(r => ({ studentId: String(r[0]).trim(), name: String(r[1]).trim() }))
        .filter(s => /^\d{5}$/.test(s.studentId) && s.name);
      if (parsed.length === 0) return;
      if (!confirm(`총 ${parsed.length}명을 업로드하시겠습니까? (기존 명단 교체)`)) {
        document.getElementById('stu-file-input').value = ''; return;
      }
      await remove(stuRef);
      const updates = {};
      parsed.forEach((s, i) => { updates[`students/s${String(i).padStart(4,'0')}`] = { studentId: s.studentId, name: s.name }; });
      await update(ref(rtdb), updates);
      document.getElementById('stu-file-input').value = '';
    };
    reader.readAsArrayBuffer(file);
  };

  // 드래그앤드롭
  const zone = document.getElementById('stu-upload-zone');
  if (zone) {
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag'));
    zone.addEventListener('drop', e => {
      e.preventDefault(); zone.classList.remove('drag');
      const file = e.dataTransfer.files[0];
      if (file) stuHandleFile({ target: { files: [file] } });
    });
  }

  // Realtime DB 구독
  onValue(stuRef, snap => {
    const data = snap.val();
    stuList = [];
    if (data) {
      Object.entries(data).forEach(([key, val]) => {
        const sid = val.studentId || key;
        const sname = val.name || val.studentName || '';
        if (sid && sname) stuList.push({ studentId: sid, studentName: sname, _key: key });
      });
    }
    stuList.sort((a, b) => a.studentId.localeCompare(b.studentId));
    stuUpdateCount();
    stuRenderTable();
  });
}

/* ════ 설정 ════ */
{
  let lockData = { enabled: false, message: '' };
  let menuVis  = { concept: true, mission: true, think: true, grade: true, contents: true };

  const MENU_LABELS = [
    { key: 'concept',  label: '개념 Check' },
    { key: 'mission',  label: '미션 Check' },
    { key: 'think',    label: '생각 Check' },
    { key: 'grade',    label: '성적 Check' },
    { key: 'contents', label: '각종 콘텐츠' },
  ];

  function stRenderMenuList() {
    const wrap = document.getElementById('st-menu-list');
    if (!wrap) return;
    wrap.innerHTML = MENU_LABELS.map(m => `
      <div style="display:flex;align-items:center;justify-content:space-between">
        <span style="font-size:14px;color:var(--text);font-weight:600">${m.label}</span>
        <div class="toggle-switch${menuVis[m.key] !== false ? ' on' : ''}" data-menu="${m.key}"></div>
      </div>
    `).join('');
    wrap.querySelectorAll('.toggle-switch').forEach(sw => {
      sw.addEventListener('click', () => stToggleMenuVisibility(sw.dataset.menu));
    });
  }

  async function stToggleMenuVisibility(key) {
    menuVis[key] = menuVis[key] === false ? true : false;
    stRenderMenuList();
    try { await setDoc(doc(db, 'settings', 'menu_visibility'), menuVis, { merge: true }); } catch(e) {}
  }

  function stApplyLockdownToggleUI() {
    const tog = document.getElementById('st-lock-toggle');
    if (tog) tog.classList.toggle('on', !!lockData.enabled);
  }

  window.stSettingsToggleLockdown = async function() {
    lockData.enabled = !lockData.enabled;
    stApplyLockdownToggleUI();
    try { await setDoc(doc(db, 'settings', 'lockdown'), { enabled: lockData.enabled, message: lockData.message || '' }); } catch(e) {}
  };

  window.stSettingsSaveLockdown = async function() {
    lockData.message = document.getElementById('st-lock-text').value.trim();
    try {
      await setDoc(doc(db, 'settings', 'lockdown'), { enabled: lockData.enabled, message: lockData.message });
      alert('저장되었습니다.');
    } catch(e) { alert('저장에 실패했습니다.'); }
  };

  window.stSettingsRefreshRoster = async function() {
    const el = document.getElementById('st-roster-count');
    if (el) el.textContent = '…';
    try {
      const snap = await get(ref(rtdb, 'students'));
      const data = snap.val();
      const count = data ? Object.keys(data).length : 0;
      if (el) el.textContent = count;
    } catch(e) { if (el) el.textContent = '오류'; }
  };

  // ── 학기 초기화 마법사 (강의 콘텐츠·미션 카드·학생 명단은 건드리지 않는다) ──
  const RESET_COLLECTIONS = [
    { id: 'st-reset-grade',   name: 'grade_records' },
    { id: 'st-reset-think',   name: 'think_submissions' },
    { id: 'st-reset-publish', name: 'grade_publish_status' },
  ];

  function stSelectedResetCollections() {
    return RESET_COLLECTIONS.filter(c => document.getElementById(c.id)?.checked);
  }

  window.stSettingsPreviewReset = async function() {
    const target = stSelectedResetCollections();
    const out = document.getElementById('st-reset-preview');
    if (!target.length) { out.textContent = '선택된 항목이 없습니다.'; return; }
    out.textContent = '확인 중…';
    try {
      const counts = await Promise.all(target.map(async c => {
        const snap = await getDocs(collection(db, c.name));
        return `${c.name} ${snap.size}건`;
      }));
      out.textContent = counts.join(' / ');
    } catch(e) { out.textContent = '확인 중 오류가 발생했습니다.'; }
  };

  // 문서가 많을 경우를 대비해 배치당 400건씩 끊어서 삭제한다(Firestore 배치 한도 500건).
  // 실행 전 관리자 로그인 비밀번호로 Firebase 재인증을 요구한다("초기화" 타이핑 대신 본인 확인).
  window.stSettingsRunReset = async function() {
    const target = stSelectedResetCollections();
    const result = document.getElementById('st-reset-result');
    if (!target.length) { result.style.color=''; result.textContent = '선택된 항목이 없습니다.'; return; }

    const pwEl = document.getElementById('st-reset-password');
    const pw = pwEl?.value || '';
    const user = auth.currentUser;
    if (!user || !user.email) { result.style.color='#DC2626'; result.textContent = '로그인 상태를 확인할 수 없습니다. 다시 로그인해 주세요.'; return; }
    if (!pw) { result.style.color='#DC2626'; result.textContent = '관리자 로그인 비밀번호를 입력하세요.'; return; }

    result.style.color=''; result.textContent = '비밀번호 확인 중…';
    try {
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, pw));
    } catch (e) {
      result.style.color='#DC2626';
      result.textContent = '비밀번호가 올바르지 않습니다. 삭제를 취소했습니다.';
      return;
    }

    result.style.color='';
    if (!confirm(`${target.map(c=>c.name).join(', ')}\n위 기록을 영구 삭제합니다. 계속할까요?`)) { result.textContent = ''; return; }

    const btn = document.getElementById('st-reset-run-btn');
    btn.disabled = true; btn.textContent = '삭제 중…';
    let total = 0;
    try {
      for (const c of target) {
        const snap = await getDocs(collection(db, c.name));
        const docs = snap.docs;
        for (let i = 0; i < docs.length; i += 400) {
          const batch = writeBatch(db);
          docs.slice(i, i + 400).forEach(d => batch.delete(d.ref));
          await batch.commit();
        }
        total += docs.length;
      }
      result.textContent = `완료: 총 ${total}건 삭제되었습니다.`;
      document.getElementById('st-reset-preview').textContent = '';
      if (pwEl) pwEl.value = '';
    } catch(e) {
      result.textContent = '삭제 중 오류가 발생했습니다. 일부만 삭제됐을 수 있습니다.';
    } finally {
      btn.textContent = '선택한 기록 영구 삭제';
      btn.disabled = false;
    }
  };

  // ── CSV 내보내기 ──
  function stCsvEscape(v) {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  window.stSettingsExportGradesCsv = async function() {
    try {
      const snap = await getDocs(collection(db, 'grade_records'));
      const rows = [['강의','학번','개념체크_달성','개념체크_기한내','미션체크_달성','미션체크_기한내','생각체크_달성','생각체크_기한내','결석','피드백']];
      snap.docs.forEach(d => {
        const r = d.data();
        rows.push([
          r.lessonKey ?? '', r.studentId ?? '',
          r.concept?.achieved ? 'Y' : 'N', r.concept?.onTime ? 'Y' : 'N',
          r.mission?.achieved ? 'Y' : 'N', r.mission?.onTime ? 'Y' : 'N',
          r.think?.achieved   ? 'Y' : 'N', r.think?.onTime   ? 'Y' : 'N',
          r.absent ? 'Y' : 'N', r.feedback ?? '',
        ]);
      });
      const csv = '﻿' + rows.map(row => row.map(stCsvEscape).join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `grade_records_${kstDate()}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch(e) { alert('내보내기에 실패했습니다.'); }
  };

  // ── 초기 로드 ──
  (async function stInit() {
    try {
      const [lockSnap, menuSnap] = await Promise.all([
        getDoc(doc(db, 'settings', 'lockdown')),
        getDoc(doc(db, 'settings', 'menu_visibility')),
      ]);
      if (lockSnap.exists()) lockData = { enabled: !!lockSnap.data().enabled, message: lockSnap.data().message || '' };
      if (menuSnap.exists()) menuVis  = Object.assign({}, menuVis, menuSnap.data());
    } catch(e) {}
    document.getElementById('st-lock-text').value = lockData.message || '';
    stApplyLockdownToggleUI();
    stRenderMenuList();
    window.stSettingsRefreshRoster();
  })();
}

/* ════ 생각 체크 어드민 ════ */
{
  let thLectures = [];
  let thSubs = null;
  let thLoadedLecId = null;
  let thStudents = [];
  let thStudentsReady = false;
  let thLecUnsub = null;
  let thSubUnsub = null;
  let thSort = 'recent';
  let thGradeTabName = 'pass';
  let thGradeCtx = { lecId: '', cls: '1' };
  let thOverrides = {};
  let thAiCache = {};
  let thActivityData = { absent: [], short: [], cheat: [] };

  function thEsc(str) {
    return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }
  function thClassNum(sid) {
    if (!sid || sid.length < 3) return null;
    const c = parseInt(String(sid).slice(1, 3), 10);
    return isNaN(c) ? null : c;
  }

  /* ─ 초기화 ─ */
  // 생각 체크 질문(강의) 순서: order를 강 번호 기준으로 두고 내림차순(강 번호 큰 강의가 위) 정렬.
  // order가 없는 강의는 즉석에서 강 번호(icon 또는 제목)로 order를 채워 저장한다.
  let thOrderMigrating = false;
  function thSortLectures() {
    const missing = thLectures.filter(l => typeof l.order !== 'number');
    if (missing.length && !thOrderMigrating) {
      thOrderMigrating = true;
      const batch = writeBatch(db);
      missing.forEach(l => { l.order = lecOrderKey(l.icon || l.title); batch.update(doc(db, 'think_lectures', l.docId), { order: l.order }); });
      batch.commit().catch(e => console.warn('[think] order migrate:', e)).finally(() => { thOrderMigrating = false; });
    }
    thLectures.sort(lecSortByOrderDesc); // 개념·성적 드롭다운과 동일한 공통 정렬(order 내림차순)
  }

  function thStartLecListener() {
    if (thLecUnsub) thLecUnsub();
    thLecUnsub = onSnapshot(
      query(collection(db, 'think_lectures'), orderBy('createdAt', 'desc')),
      snap => {
        thLectures = snap.docs.map(d => ({ docId: d.id, ...d.data() }));
        thSortLectures();
        thPopulateSelects();
        thRenderLecList();
        if (document.getElementById('panel-think')?.classList.contains('active')) {
          window.thMainRefresh();
        }
      },
      err => console.warn('[think] lectures:', err)
    );
  }

  function thLoadStudents() {
    get(ref(rtdb, 'students')).then(snap => {
      const data = snap.val();
      const list = [];
      if (data) {
        Object.entries(data).forEach(([key, val]) => {
          const sid = String(val.studentId || key);
          const sname = val.name || val.studentName || val.realName || '';
          // 테스트 학번은 여기서 통째로 뺀다 — 총인원·미제출 명단·채점 대상 전부에서 빠진다.
          if (sid && sname && !isTestId(sid)) list.push({ studentId: sid, studentName: sname });
        });
      }
      list.sort((a, b) => a.studentId.localeCompare(b.studentId));
      thStudents = list;
      thStudentsReady = true;
    }).catch(err => console.warn('[think] students:', err));
  }

  function thPopulateSelects() {
    // 통합 패널에서는 강의 드롭다운이 th-sel-cls-lec 하나뿐이다(th-sel-pick은 hidden 값).
    ['th-sel-cls-lec'].forEach(id => {
      const sel = document.getElementById(id);
      if (!sel) return;
      const cur = sel.value;
      sel.innerHTML = '<option value="">강의를 선택하세요</option>';
      thLectures.forEach(l => {
        const o = document.createElement('option');
        o.value = l.docId; o.textContent = String(l.title||'').replace(/\*\*/g,'').replace(/[{}]/g,'');
        sel.appendChild(o);
      });
      if (thLectures.some(l => l.docId === cur)) sel.value = cur;
    });
    // 성적 체크의 강의수 자동 매칭용 캐시(gradeFindMatchingThinkLec)를 갱신한다.
    // gradeThinkSel은 이제 화면에 없는 hidden 값이라 여기서 직접 손대지 않는다.
    _thLecCache = thLectures.map(l => ({ docId: l.docId, icon: l.icon || '', title: l.title || '' }));
  }

  /* ─ 통합 패널: 강의 드롭다운 + 아이콘 버튼 ─ */
  function thMainUpdateToggle(lec) {
    const tog = document.getElementById('th-main-toggle');
    const lbl = document.getElementById('th-main-toglbl');
    if (!tog) return;
    const on = !!(lec && lec.isOpen === true);
    tog.classList.toggle('on', on);
    if (lbl) { lbl.textContent = lec ? (on ? '공개 중' : '비공개') : ''; lbl.style.color = on ? 'var(--c3)' : 'var(--sub)'; }
  }

  // 학생 명단에서 개설된 반 번호만 뽑아 반 선택 태그를 그린다("전체" 없음).
  function thBuildClassTags() {
    const bar = document.getElementById('th-cls-tags');
    if (!bar) return;
    const set = new Set();
    thStudents.forEach(s => { const c = thClassNum(s.studentId); if (c >= 1 && c <= 9) set.add(c); });
    const nums = [...set].sort((a, b) => a - b);
    if (!nums.length) { bar.innerHTML = ''; bar.style.display = 'none'; return; }
    const clsSel = document.getElementById('th-sel-cls');
    let cur = parseInt(clsSel?.value || '0', 10);
    if (!nums.includes(cur)) { cur = nums[0]; if (clsSel) clsSel.value = String(cur); }
    bar.innerHTML = nums.map(n =>
      `<button class="grade-subtab${n === cur ? ' active' : ''}" data-cls="${n}" onclick="thMainSelectClass(${n})">${n}반</button>`
    ).join('');
    bar.style.display = 'flex';
  }

  window.thMainSelectClass = function(n) {
    const clsSel = document.getElementById('th-sel-cls');
    if (clsSel) clsSel.value = String(n);
    document.querySelectorAll('#th-cls-tags .grade-subtab').forEach(b =>
      b.classList.toggle('active', parseInt(b.dataset.cls, 10) === n));
    thRenderAnswerClass();
  };

  // 강의 드롭다운 변경: 정보 표시 + 열려있는 채점/PICK 영역 갱신.
  window.thMainSelect = function() {
    const lecId = document.getElementById('th-sel-cls-lec')?.value || '';
    document.getElementById('th-main-edit').style.display = 'none';
    document.getElementById('th-new-form').style.display = 'none';
    const infoEl   = document.getElementById('th-main-info');
    const gradeArea = document.getElementById('th-grade-area');
    const pickArea  = document.getElementById('th-pick-area');
    const pickSel   = document.getElementById('th-sel-pick');
    if (pickSel) pickSel.value = lecId;
    if (infoEl) infoEl.style.display = 'none'; // 질문/설명은 "수정"할 때만 크게 노출
    if (!lecId) {
      gradeArea.style.display = 'none';
      pickArea.style.display = 'none';
      thMainUpdateToggle(null);
      return;
    }
    const lec = thLectures.find(l => l.docId === lecId);
    thMainUpdateToggle(lec);
    // 강의를 고르면 채점 화면(반 태그 + 통계 + AI 채점 + 답변)을 항상 노출한다.
    pickArea.style.display = 'none';
    gradeArea.style.display = '';
    thBuildClassTags();
    thRenderAnswerClass();
  };

  // 데이터 변경(onSnapshot)·패널 재진입 시 현재 선택 상태에 맞춰 다시 그린다(수정/새 강의 폼은 건드리지 않음).
  window.thMainRefresh = function() {
    const lecId = document.getElementById('th-sel-cls-lec')?.value || '';
    const lec = thLectures.find(l => l.docId === lecId);
    thMainUpdateToggle(lec || null);
    const infoEl    = document.getElementById('th-main-info');
    const gradeArea = document.getElementById('th-grade-area');
    const pickArea  = document.getElementById('th-pick-area');
    if (infoEl) infoEl.style.display = 'none';
    if (!lecId) {
      if (gradeArea) gradeArea.style.display = 'none';
      if (pickArea) pickArea.style.display = 'none';
      return;
    }
    // PICK 보기 중이 아니면 채점 화면(반 태그·통계·AI 채점)을 항상 노출.
    if (pickArea && pickArea.style.display !== 'none') { thRenderPick(); }
    else if (gradeArea) { gradeArea.style.display = ''; thBuildClassTags(); thRenderAnswerClass(); }
  };

  window.thMainToggleOpen = function() {
    const lecId = document.getElementById('th-sel-cls-lec')?.value || '';
    if (!lecId) { alert('강의를 먼저 선택하세요.'); return; }
    const lec = thLectures.find(l => l.docId === lecId);
    const on = !(lec && lec.isOpen === true);
    if (lec) lec.isOpen = on;
    thMainUpdateToggle({ isOpen: on });
    updateDoc(doc(db, 'think_lectures', lecId), { isOpen: on }).catch(e => console.warn(e));
  };

  window.thMainMove = function(dir) {
    const lecId = document.getElementById('th-sel-cls-lec')?.value || '';
    if (lecId && window.thMoveLecture) window.thMoveLecture(lecId, dir);
  };

  window.thMainEdit = function() {
    const lecId = document.getElementById('th-sel-cls-lec')?.value || '';
    if (!lecId) { alert('강의를 먼저 선택하세요.'); return; }
    const lec = thLectures.find(l => l.docId === lecId);
    if (!lec) return;
    document.getElementById('th-me-title').value = lec.title || '';
    document.getElementById('th-me-q').value = lec.question || '';
    document.getElementById('th-me-ref').value = lec.reference || '';
    document.getElementById('th-me-icon').value = lec.icon || '';
    document.getElementById('th-new-form').style.display = 'none';
    document.getElementById('th-main-edit').style.display = '';
  };
  window.thMainCancelEdit = function() {
    document.getElementById('th-main-edit').style.display = 'none';
  };
  window.thMainSaveEdit = async function() {
    const lecId = document.getElementById('th-sel-cls-lec')?.value || '';
    if (!lecId) return;
    const title = document.getElementById('th-me-title').value.trim();
    const question = document.getElementById('th-me-q').value.trim();
    const reference = document.getElementById('th-me-ref').value.trim();
    const icon = document.getElementById('th-me-icon').value.trim();
    if (!title || !question) { alert('강의명과 질문은 필수입니다.'); return; }
    try {
      await updateDoc(doc(db, 'think_lectures', lecId), { title, question, reference, icon });
      document.getElementById('th-main-edit').style.display = 'none';
      window.thMainSelect();
    } catch(e) { alert('저장 실패: ' + e.message); }
  };

  window.thMainDelete = function() {
    const lecId = document.getElementById('th-sel-cls-lec')?.value || '';
    if (!lecId) { alert('강의를 먼저 선택하세요.'); return; }
    const lec = thLectures.find(l => l.docId === lecId);
    if (window.thDeleteLecture) window.thDeleteLecture(lecId, cleanTitle(lec?.title || ''));
  };

  window.thMainGrade = function() {
    const lecId = document.getElementById('th-sel-cls-lec')?.value || '';
    if (!lecId) { alert('강의를 먼저 선택하세요.'); return; }
    document.getElementById('th-pick-area').style.display = 'none';
    document.getElementById('th-grade-area').style.display = '';
    thBuildClassTags();
    thRenderAnswerClass();
  };

  // 생각 체크 → 같은 강의의 성적 체크(CHECK) 화면으로 이동해 바로 불러온다.
  // 생각 강의의 icon(강 번호) == 성적 드롭다운(gradeLessonSel) option value(class_lessons.num).
  window.thGoToGradeCheck = function() {
    const lecId = document.getElementById('th-sel-cls-lec')?.value || '';
    if (!lecId) { alert('강의를 먼저 선택하세요.'); return; }
    const lec = thLectures.find(l => l.docId === lecId);
    const num = String(lec?.icon || '').replace(/[^0-9]/g, '');
    switchNav('grade-check');
    if (!num) return;
    // 성적 드롭다운이 아직 안 채워졌을 수 있어(패널 첫 진입) 잠깐 재시도한다.
    const apply = (tries) => {
      const sel = document.getElementById('gradeLessonSel');
      if (!sel) return;
      if (!Array.from(sel.options).some(o => o.value === num)) {
        if (tries > 0) setTimeout(() => apply(tries - 1), 150);
        return;
      }
      sel.value = num;
      sel.dispatchEvent(new Event('change'));
      document.getElementById('gradeLoadBtn')?.click();
    };
    apply(10);
  };

  window.thMainTogglePick = function() {
    const lecId = document.getElementById('th-sel-cls-lec')?.value || '';
    if (!lecId) { alert('강의를 먼저 선택하세요.'); return; }
    const area = document.getElementById('th-pick-area');
    const show = area.style.display === 'none';
    area.style.display = show ? '' : 'none';
    if (show) {
      document.getElementById('th-grade-area').style.display = 'none';
      const pickSel = document.getElementById('th-sel-pick');
      if (pickSel) pickSel.value = lecId;
      thRenderPick();
    }
  };

  /* ─ QUESTION ─ */
  window.thShowNewForm = function() {
    document.getElementById('th-new-form').style.display = '';
    document.getElementById('th-new-title').focus();
  };
  window.thHideNewForm = function() {
    document.getElementById('th-new-form').style.display = 'none';
    ['th-new-num','th-new-title','th-new-q','th-new-ref'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  };
  window.thAddLecture = async function() {
    const num = document.getElementById('th-new-num').value.trim();
    const title = document.getElementById('th-new-title').value.trim();
    const question = document.getElementById('th-new-q').value.trim();
    const reference = document.getElementById('th-new-ref').value.trim();
    if (!title || !question) { alert('강의명과 질문을 입력해주세요.'); return; }
    const data = { title, question, reference, isOpen: false, isArchived: false, createdAt: Date.now(), order: lecOrderKey(num || title) };
    if (num) data.icon = num;
    try {
      await addDoc(collection(db, 'think_lectures'), data);
      window.thHideNewForm();
    } catch(e) { alert('저장 실패: ' + e.message); }
  };

  function thRenderLecList() {
    const el = document.getElementById('th-lec-list');
    if (!el) return;
    if (!thLectures.length) { el.innerHTML = '<div class="empty-panel">강의가 없습니다. 새 강의를 추가해보세요.</div>'; return; }
    el.innerHTML = thLectures.map((lec, idx) => {
      const isOpen = lec.isOpen === true;
      return `
        <div class="th-lec-card">
          <div class="th-lec-title">${thEsc((lec.title||'').replace(/\*\*/g,'').replace(/[{}]/g,''))}</div>
          <div id="th-view-${lec.docId}">
            <div class="th-lec-actions">
              <div class="th-toggle ${isOpen?'on':''}" id="th-tog-${lec.docId}" title="${isOpen?'공개 중':'비공개'}" onclick="thToggleOpen('${lec.docId}',this)"></div>
              <span style="font-size:13px;font-weight:700;color:${isOpen?'var(--c3)':'var(--sub)'}" id="th-tog-lbl-${lec.docId}">${isOpen?'공개 중':'비공개'}</span>
              <button class="edit-btn" ${idx===0?'disabled':''} title="위로" onclick="thMoveLecture('${lec.docId}','up')">▲</button>
              <button class="edit-btn" ${idx===thLectures.length-1?'disabled':''} title="아래로" onclick="thMoveLecture('${lec.docId}','down')">▼</button>
              <button class="edit-btn" onclick="thToggleEdit('${lec.docId}',true)">수정</button>
              <button class="del-btn" onclick="thDeleteLecture('${lec.docId}','${thEsc(cleanTitle(lec.title)).replace(/'/g,"\\'")}')">삭제</button>
              <button class="edit-btn" onclick="thToggleMore('${lec.docId}')">자세히</button>
            </div>
            <div id="th-more-${lec.docId}" class="th-more-detail" style="display:none">
              <div class="th-detail-lbl">질문</div><div class="th-detail-val">${thEsc(cleanTitle(lec.question))}</div>
              <div class="th-detail-lbl">설명</div><div class="th-detail-val">${thEsc(cleanTitle(lec.reference) || '없음')}</div>
            </div>
          </div>
          <div id="th-edit-${lec.docId}" class="th-inline-edit" style="display:none">
            <div class="form-group"><label class="form-label">강의명</label><input class="form-input" id="th-et-${lec.docId}" value="${thEsc(lec.title)}"></div>
            <div class="form-group"><label class="form-label">질문</label><input class="form-input" id="th-eq-${lec.docId}" value="${thEsc(lec.question)}"></div>
            <div class="form-group"><label class="form-label">설명</label><textarea class="form-textarea" id="th-er-${lec.docId}" style="height:80px">${thEsc(lec.reference||'')}</textarea></div>
            <div class="form-group"><label class="form-label">아이콘 (이모지)</label><input class="form-input" id="th-ei-${lec.docId}" value="${thEsc(lec.icon||'')}" placeholder="이모지를 붙여넣으세요" style="width:100px"></div>
            <div style="display:flex;gap:8px">
              <button class="btn-save" style="flex:none;padding:9px 22px;background:var(--c3)" onclick="thSaveLecture('${lec.docId}')">저장</button>
              <button class="btn-cancel" onclick="thToggleEdit('${lec.docId}',false)">취소</button>
            </div>
          </div>
        </div>`;
    }).join('');
  }

  window.thToggleOpen = function(docId, el) {
    const isOn = el.classList.toggle('on');
    const lbl = document.getElementById(`th-tog-lbl-${docId}`);
    if (lbl) { lbl.textContent = isOn ? '공개 중' : '비공개'; lbl.style.color = isOn ? 'var(--c3)' : 'var(--sub)'; }
    updateDoc(doc(db, 'think_lectures', docId), { isOpen: isOn }).catch(e => console.warn(e));
  };
  window.thMoveLecture = async function(docId, dir) {
    const idx = thLectures.findIndex(l => l.docId === docId);
    if (idx < 0) return;
    const targetIdx = dir === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= thLectures.length) return;
    const cur = thLectures[idx], target = thLectures[targetIdx];
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'think_lectures', cur.docId),    { order: target.order ?? targetIdx });
      batch.update(doc(db, 'think_lectures', target.docId), { order: cur.order ?? idx });
      await batch.commit(); // onSnapshot이 목록을 다시 그린다
    } catch(e) { alert('순서 변경 실패: ' + e.message); }
  };
  window.thToggleEdit = function(docId, open) {
    document.getElementById(`th-view-${docId}`).style.display = open ? 'none' : '';
    document.getElementById(`th-edit-${docId}`).style.display = open ? '' : 'none';
  };
  window.thToggleMore = function(docId) {
    const el = document.getElementById(`th-more-${docId}`);
    if (el) el.style.display = el.style.display === 'none' ? '' : 'none';
  };
  window.thSaveLecture = async function(docId) {
    const title = document.getElementById(`th-et-${docId}`)?.value.trim();
    const question = document.getElementById(`th-eq-${docId}`)?.value.trim();
    const reference = document.getElementById(`th-er-${docId}`)?.value.trim() || '';
    const icon = document.getElementById(`th-ei-${docId}`)?.value.trim() || '';
    if (!title || !question) { alert('강의명과 질문은 필수입니다.'); return; }
    await updateDoc(doc(db, 'think_lectures', docId), { title, question, reference, icon });
    window.thToggleEdit(docId, false);
  };
  window.thDeleteLecture = async function(docId, title) {
    if (!confirm(`"${title}"을(를) 삭제하시겠습니까?\n모든 답변도 함께 삭제됩니다.`)) return;
    const snap = await getDocs(query(collection(db, 'think_submissions'), where('lectureDocId', '==', docId)));
    const batch = writeBatch(db);
    snap.docs.forEach(d => batch.delete(d.ref));
    batch.delete(doc(db, 'think_lectures', docId));
    await batch.commit();
  };

  /* ─ ANSWER 서브탭 ─ */
  window.thAnswerSubTab = function(tab) {
    ['lecture','class','pick'].forEach(t => {
      document.getElementById(`th-atab-${t}-btn`)?.classList.toggle('active', t === tab);
      const panel = document.getElementById(`th-atab-${t}`);
      if (panel) panel.style.display = t === tab ? '' : 'none';
      document.querySelectorAll(`.th-ctrl-${t}`).forEach(el => { el.style.display = t === tab ? '' : 'none'; });
    });
    if (tab === 'lecture') thRenderAnswerLecture();
    else if (tab === 'class') thRenderAnswerClass();
    else thRenderPick();
  };
  window.thSetSort = function(mode, btn) {
    thSort = mode;
    document.querySelectorAll('.th-sort-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    thRenderAnswerLecture();
  };

  function thApplySort(subs) {
    if (thSort === 'recent') return [...subs];
    return [...subs].sort((a, b) => {
      const cmp = String(a.id||'').localeCompare(String(b.id||''), undefined, { numeric: true });
      return thSort === 'id-asc' ? cmp : -cmp;
    });
  }

  function thEnsureSubs(lecId, cb) {
    if (lecId === thLoadedLecId && thSubs !== null) { cb(); return; }
    if (thSubUnsub) { thSubUnsub(); thSubUnsub = null; }
    thLoadedLecId = lecId;
    thSubs = null;
    thSubUnsub = onSnapshot(
      query(collection(db, 'think_submissions'), where('lectureDocId', '==', lecId)),
      // 테스트 학번 제출은 여기서 걸러 낸다 — 답변 목록·통계·AI 채점·재채점·PICK 전부에 적용된다.
      snap => { thSubs = snap.docs.map(d => ({ subId: d.id, ...d.data() })).filter(s => !isTestId(s.id)); cb(); },
      err => console.warn('[think] submissions:', err)
    );
  }

  function thFmtSubTime(ts) {
    const d = ts && ts.toDate ? ts.toDate() : (ts ? new Date(ts) : null);
    if (!d || isNaN(d)) return '';
    return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  }

  function thBuildAnswerCard(data, showMeta) {
    const isPicked = data.isPicked;
    const time = thFmtSubTime(data.createdAt);
    const metaParts = [time ? `${time} 제출` : '', `${data.textLength||0}자`];
    if (data.cheatCount) metaParts.push(`이탈 ${data.cheatCount}회`);
    const meta = metaParts.filter(Boolean).join(' ｜ ');
    return `
      <div class="th-answer-card">
        <div class="th-student-row">
          <span class="th-student-name">${thEsc(data.id)} ${thEsc(data.name)} <span class="th-student-meta">｜ ${meta}</span></span>
          <div class="th-answer-actions">
            <button class="edit-btn" style="${isPicked?'background:var(--c3-l);color:var(--c3)':''}" onclick="thTogglePick('${data.subId}')" title="PICK">★</button>
            <button class="th-answer-del" onclick="thDeleteSub('${data.subId}')" title="답변 삭제"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3,6 21,6"/><path d="M8,6V4a1,1,0,0,1,1-1h6a1,1,0,0,1,1,1V6"/><path d="M10,11v6M14,11v6"/><rect x="5" y="6" width="14" height="15" rx="1"/></svg></button>
          </div>
        </div>
        <div class="th-answer-text">${thEsc(data.text||'')}</div>
      </div>`;
  }

  window.thTogglePick = async function(subId) {
    if (!thSubs) return;
    const t = thSubs.find(s => s.subId === subId);
    if (t) await updateDoc(doc(db, 'think_submissions', subId), { isPicked: !t.isPicked });
  };
  window.thDeleteSub = async function(subId) {
    if (!confirm('이 학생의 답변을 삭제하시겠습니까?')) return;
    await deleteDoc(doc(db, 'think_submissions', subId));
  };

  window.thRenderAnswerLecture = function() {
    const lecId = document.getElementById('th-sel-lec')?.value || '';
    const statsEl = document.getElementById('th-lec-stats');
    const listEl = document.getElementById('th-lec-answers');
    const sortEl = document.getElementById('th-sort-lec');
    if (!listEl) return;
    if (!lecId) {
      if (statsEl) statsEl.style.display = 'none';
      if (sortEl) sortEl.style.display = 'none';
      listEl.innerHTML = ''; return;
    }
    if (sortEl) sortEl.style.display = '';
    if (thSubs === null || thLoadedLecId !== lecId) {
      listEl.innerHTML = '<div class="empty-panel">불러오는 중…</div>';
      thEnsureSubs(lecId, window.thRenderAnswerLecture); return;
    }
    const subs = thSubs.filter(s => s.lectureDocId === lecId);
    if (statsEl) {
      statsEl.style.display = '';
      statsEl.innerHTML = `
        <div class="th-stat-chip"><span class="th-num">${subs.length}${thStudentsReady?' / '+thStudents.length:''}</span>제출${thStudentsReady?' / 총인원':''}</div>
        <div class="th-stat-chip"><span class="th-num">${subs.filter(s=>s.isPicked).length}</span>PICK</div>`;
    }
    const sorted = thApplySort(subs);
    listEl.innerHTML = sorted.length ? sorted.map(d => thBuildAnswerCard(d, false)).join('') : '<div class="empty-panel">제출된 답변이 없습니다.</div>';
  };

  window.thRenderAnswerClass = function() {
    const cls = document.getElementById('th-sel-cls')?.value || '1';
    const lecId = document.getElementById('th-sel-cls-lec')?.value || '';
    const statsEl = document.getElementById('th-cls-stats');
    const listEl = document.getElementById('th-cls-answers');
    if (!listEl) return;
    if (!lecId) { if (statsEl) statsEl.style.display = 'none'; listEl.innerHTML = ''; return; }
    if (thSubs === null || thLoadedLecId !== lecId) {
      listEl.innerHTML = '<div class="empty-panel">불러오는 중…</div>';
      thEnsureSubs(lecId, window.thRenderAnswerClass); return;
    }
    const clsNum = parseInt(cls, 10);
    // 통계·목록 모두 테스트 학번(30600·00000 등)은 제외한다.
    const classStu = thStudentsReady ? thStudents.filter(s => thClassNum(s.studentId) === clsNum && !isTestId(s.studentId)) : [];
    const classSubs = thSubs.filter(s => s.lectureDocId === lecId && thClassNum(s.id) === clsNum && !isTestId(s.id));
    const submittedIds = new Set(classSubs.map(s => String(s.id)));
    thActivityData = {
      absent: classStu.filter(s => !submittedIds.has(String(s.studentId))),
      short:  classSubs.filter(s => (s.textLength||0) < 50),
      cheat:  classSubs.filter(s => (s.cheatCount||0) >= 5)
    };
    const failIds = new Set();
    thActivityData.absent.forEach(s => failIds.add(String(s.studentId)));
    thActivityData.short.forEach(s => failIds.add(String(s.id)));
    thActivityData.cheat.forEach(s => { if (!thIsOverridePass(s.subId)) failIds.add(String(s.id)); });
    const cacheKey = `${lecId}_${cls}`;
    (thAiCache[cacheKey]||[]).forEach(s => { if (thIsOverrideFail(s.subId)) failIds.add(String(s.id)); });
    const total = classStu.length;
    const failCnt = failIds.size;
    const passCnt = total > 0 ? Math.max(0, total - failCnt) : 0;
    // 아직 AI 채점하지 않은 제출 수(테스트 학생 제외) — 대시보드 "채점 N" 표시와 동일 기준.
    const ungradedCnt = classSubs.filter(s => !isTestId(s.id) && s.thGraded !== true).length;
    const pickCnt = classSubs.filter(s => s.isPicked).length;
    if (statsEl) {
      statsEl.style.display = '';
      // 하나의 칩에 총인원 / 제출 / 통과 / 미흡 (앞 둘 오렌지, 통과 초록, 미흡 빨강)
      const star = `<svg class="th-star-ic" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.5l2.9 6.05 6.6.78-4.9 4.5 1.32 6.52L12 17.9 6.08 20.85 7.4 14.33 2.5 9.83l6.6-.78L12 2.5z"/></svg>`;
      statsEl.innerHTML = `
        <div class="th-stat-chip th-stat-combo clickable" onclick="thOpenGradeModalWithLoad('fail')" title="총인원 / 제출 / 통과 / 미흡">
          <span class="thc-o">${total||0}</span><span class="thc-sep">/</span><span class="thc-o">${classSubs.length}</span><span class="thc-sep">/</span><span class="thc-g">${total?passCnt:0}</span><span class="thc-sep">/</span><span class="thc-r">${total?failCnt:0}</span>
        </div>
        <div class="th-stat-chip th-stat-star" title="PICK된 답변 수">${star}<span class="thc-star-n">${pickCnt}</span></div>`;
      // AI 채점 칩 제거 — 콤보칩 하나로 채점 결과 모달을 열고, 그 안의 "AI 채점" 탭에서 채점한다(버튼 하나면 충분).
    }
    const sorted = [...classSubs].sort((a,b)=>String(a.id).localeCompare(String(b.id),undefined,{numeric:true}));
    listEl.innerHTML = sorted.length ? sorted.map(d => thBuildAnswerCard(d, true)).join('') : '<div class="empty-panel">이 반의 제출된 답변이 없습니다.</div>';
  };

  window.thRenderPick = function() {
    const lecId = document.getElementById('th-sel-pick')?.value || '';
    const statsEl = document.getElementById('th-pick-stats');
    const listEl = document.getElementById('th-pick-answers');
    if (!listEl) return;
    if (!lecId) { if (statsEl) statsEl.style.display = 'none'; listEl.innerHTML = ''; return; }
    if (thSubs === null || thLoadedLecId !== lecId) {
      listEl.innerHTML = '<div class="empty-panel">불러오는 중…</div>';
      thEnsureSubs(lecId, window.thRenderPick); return;
    }
    const picked = thSubs.filter(s => s.lectureDocId === lecId && s.isPicked);
    if (statsEl) {
      statsEl.style.display = '';
      statsEl.innerHTML = `<div class="th-stat-chip"><span class="th-num">${picked.length}</span>PICK된 답변</div>`;
    }
    listEl.innerHTML = picked.length ? picked.map(d => thBuildAnswerCard(d, false)).join('') : '<div class="empty-panel">PICK된 답변이 없습니다.</div>';
  };

  /* ─ 채점 모달 ─ */
  function thIsOverridePass(subId) { return thOverrides[subId] === 'pass'; }
  function thIsOverrideFail(subId) { return thOverrides[subId] === 'fail'; }

  async function thLoadOverrides(lecId, cls) {
    try {
      const snap = await getDoc(doc(db, 'gradeOverrides', `${lecId}_${cls}`));
      if (snap.exists()) thOverrides = { ...thOverrides, ...snap.data() };
    } catch(e) {}
  }

  async function thSaveOverrides() {
    try { await setDoc(doc(db, 'gradeOverrides', `${thGradeCtx.lecId}_${thGradeCtx.cls}`), thOverrides); } catch(e) {}
  }

  window.thOpenGradeModalWithLoad = async function(tab) {
    const lecId = document.getElementById('th-sel-cls-lec')?.value || '';
    const cls = document.getElementById('th-sel-cls')?.value || '1';
    if (!lecId) { alert('강의를 먼저 선택해주세요.'); return; }
    thGradeCtx = { lecId, cls };
    await thLoadOverrides(lecId, cls);
    thOpenGradeModal(tab || 'pass');
  };

  function thOpenGradeModal(tab) {
    thGradeTabName = tab;
    document.querySelectorAll('.th-grade-tab').forEach((b, i) => {
      b.classList.toggle('active', ['pass','fail','cheat','review'][i] === tab);
    });
    thUpdateGradeSummary();
    thRenderGradeBody();
    document.getElementById('thGradeBackdrop').classList.add('open');
  }

  window.thCloseGradeModal = function() { document.getElementById('thGradeBackdrop').classList.remove('open'); };

  window.thSwitchGradeTab = function(tab, btn) {
    thGradeTabName = tab;
    document.querySelectorAll('.th-grade-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    thRenderGradeBody();
  };

  function thUpdateGradeSummary() {
    const clsNum = parseInt(thGradeCtx.cls, 10);
    const total = thStudents.filter(s => thClassNum(s.studentId) === clsNum).length;
    const failIds = new Set();
    thActivityData.absent.forEach(s => failIds.add(String(s.studentId)));
    thActivityData.short.forEach(s => failIds.add(String(s.id)));
    thActivityData.cheat.forEach(s => { if (!thIsOverridePass(s.subId)) failIds.add(String(s.id)); });
    const cacheKey = `${thGradeCtx.lecId}_${thGradeCtx.cls}`;
    (thAiCache[cacheKey]||[]).filter(s=>thIsOverrideFail(s.subId)).forEach(s=>failIds.add(String(s.id)));
    const fail = failIds.size;
    const el = document.getElementById('th-grade-summary');
    if (el) el.textContent = `${thGradeCtx.cls}반  통과 ${Math.max(0,total-fail)}명 / 미흡 ${fail}명 / 전체 ${total}명`;
  }

  function thRenderGradeBody() {
    const body = document.getElementById('th-grade-body');
    if (!body) return;
    const cacheKey = `${thGradeCtx.lecId}_${thGradeCtx.cls}`;
    const aiCached = thAiCache[cacheKey] || [];
    if (thGradeTabName === 'pass') {
      const clsNum = parseInt(thGradeCtx.cls, 10);
      const failIds = new Set();
      thActivityData.absent.forEach(s => failIds.add(String(s.studentId)));
      thActivityData.short.forEach(s => failIds.add(String(s.id)));
      thActivityData.cheat.forEach(s => { if (!thIsOverridePass(s.subId)) failIds.add(String(s.id)); });
      aiCached.filter(s=>thIsOverrideFail(s.subId)).forEach(s=>failIds.add(String(s.id)));
      const passStu = thStudents.filter(s => thClassNum(s.studentId) === clsNum && !failIds.has(String(s.studentId)));
      body.innerHTML = passStu.length
        ? `<p style="font-size:13px;color:var(--sub);margin-bottom:12px">총 <strong style="color:var(--c3)">${passStu.length}명</strong> 통과</p><div>${passStu.map(s=>`<span class="th-chip th-chip-pass">${s.studentId} ${s.studentName}</span>`).join('')}</div>`
        : '<div class="empty-panel">통과한 학생이 없습니다.</div>';
    } else if (thGradeTabName === 'fail') {
      const cheatFail = thActivityData.cheat.filter(s => !thIsOverridePass(s.subId));
      const aiFail = aiCached.filter(s => thIsOverrideFail(s.subId));
      const totalFail = thActivityData.absent.length + thActivityData.short.length + cheatFail.length + aiFail.length;
      if (!totalFail) { body.innerHTML = '<div style="text-align:center;padding:32px 0;font-weight:700;color:var(--c3)">미흡 학생 없음!</div>'; return; }
      let html = `<p style="font-size:13px;color:var(--sub);margin-bottom:12px">총 <strong style="color:#DC2626">${totalFail}명</strong> 미흡</p>`;
      if (thActivityData.absent.length) html += `<div style="margin-bottom:14px"><div class="th-reason-hd">미제출 ${thActivityData.absent.length}명</div><div>${thActivityData.absent.map(s=>`<span class="th-chip th-chip-absent">${s.studentId} ${s.studentName}</span>`).join('')}</div></div>`;
      if (thActivityData.short.length)  html += `<div style="margin-bottom:14px"><div class="th-reason-hd">50자 미만 ${thActivityData.short.length}명</div><div>${thActivityData.short.map(s=>`<span class="th-chip th-chip-short">${s.id} ${s.name} <small style="opacity:.75">${s.textLength}자</small></span>`).join('')}</div></div>`;
      if (cheatFail.length)             html += `<div style="margin-bottom:14px"><div class="th-reason-hd">이탈 5회 이상 ${cheatFail.length}명</div><div>${cheatFail.map(s=>`<span class="th-chip th-chip-cheat">${s.id} ${s.name}</span>`).join('')}</div></div>`;
      if (aiFail.length)                html += `<div><div class="th-reason-hd">AI 분석 미흡 ${aiFail.length}명</div><div>${aiFail.map(s=>`<span class="th-chip th-chip-wrong">${s.id} ${s.name}</span>`).join('')}</div></div>`;
      body.innerHTML = html;
    } else if (thGradeTabName === 'cheat') {
      const list = thActivityData.cheat;
      if (!list.length) { body.innerHTML = '<div style="text-align:center;padding:32px 0;font-weight:700;color:var(--c3)">이탈 5회 이상 없음!</div>'; return; }
      body.innerHTML = `<p style="font-size:13px;color:var(--sub);margin-bottom:12px">이탈 ${list.length}건. 기본적으로 미흡이며, 사정에 따라 통과로 변경할 수 있습니다.</p>` +
        [...list].sort((a,b)=>b.cheatCount-a.cheatCount).map(s => {
          const isPassing = thIsOverridePass(s.subId);
          return `<div class="th-review-card" style="${isPassing?'opacity:0.55':''}">
            <div class="th-review-card-top">
              <span class="th-review-card-name">${thEsc(s.id)} ${thEsc(s.name)}</span>
              <span class="th-chip th-chip-cheat">${s.cheatCount}회 이탈</span>
              <div class="th-grade-toggle">
                <button class="th-grade-btn pass ${isPassing?'active':''}" onclick="thToggleOverride('${s.subId}','pass')">통과</button>
                <button class="th-grade-btn fail ${!isPassing?'active':''}" onclick="thToggleOverride('${s.subId}','fail')">미흡</button>
              </div>
            </div>
            <div class="th-review-card-text">${thEsc(s.text||'')}</div>
          </div>`;
        }).join('');
    } else {
      // AI 채점 & 포인트 지급 탭 (0점: 구조적 미흡 / 5점: 조금 미흡 / 10~30: 품질 차등)
      const clsN = parseInt(thGradeCtx.cls, 10);
      const subs = (thSubs||[]).filter(s => s.lectureDocId === thGradeCtx.lecId && thClassNum(s.id) === clsN)
        .sort((a,b)=>String(a.id).localeCompare(String(b.id),undefined,{numeric:true}));
      const ungraded = subs.filter(s => !s.thGraded);
      const vColor = { '통과':'var(--c3)', '조금 미흡':'#B8860B', '미흡(지연 제출)':'#B8860B' };
      const gradedN = subs.length - ungraded.length;
      let html = `<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;flex-wrap:wrap">
          <button class="th-btn-ai" ${ungraded.length?'':'disabled'} onclick="thRunGrading()">AI 채점 &amp; 포인트 지급${ungraded.length?` (미채점 ${ungraded.length})`:''}</button>
          ${gradedN ? `<button class="th-btn-ai" style="background:none;border:1.5px solid var(--hairline);color:var(--charcoal)" onclick="thRegrade()">재채점 (${gradedN}명)</button>` : ''}
          <button class="th-btn-ai" style="background:none;border:1.5px solid var(--c4,#B45309);color:var(--c4,#B45309)" onclick="thGoToGradeCheck()" title="이 강의 성적 체크로 이동"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;margin-right:5px"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>성적 체크로</button>
          <span id="th-ai-status" style="font-size:13px;color:var(--sub);font-weight:700;min-height:18px"></span>
        </div>
        <p style="font-size:12px;color:var(--slate);margin-bottom:12px;line-height:1.6">채점하면 점수가 고정됩니다. 기준과 모델을 바꿔 다시 매기려면 <b>재채점</b>을 누르세요(이전 지급 내역은 삭제되고 새 채점 내역만 남습니다).</p>`;
      if (!subs.length) { body.innerHTML = html + '<div class="empty-panel">이 반의 제출이 없습니다.</div>'; return; }
      html += subs.map(s => {
        const v = s.aiVerdict || '';
        const chip = s.thGraded
          ? `<span style="font-weight:800;color:${vColor[v] || (v.startsWith('미흡')?'#DC2626':'var(--sub)')}">${v||'-'} / ${s.aiPt??0}pt</span>`
          : `<span style="color:var(--slate);font-weight:700">미채점</span>`;
        // 채점된 제출은 모두(이탈로 인한 '미흡(이탈)' 포함) 교사가 이 자리에서 바로
        // 달성 여부를 뒤집을 수 있게 통과/미흡 토글을 제공한다. "이탈" 탭의 토글과 같은
        // gradeOverrides 값을 공유하므로 어느 쪽에서 눌러도 서로 동기화된다.
        // '미흡(지연 제출)'은 thinkVerdict() 기준상 이미 달성으로 치므로(내용·AI 채점은
        // 통과, 당일 제출만 못함) 토글 기본 상태도 "통과"로 보여준다.
        const showToggle = s.thGraded;
        const isPass = thOverrides[s.subId] === 'pass' || (thOverrides[s.subId] !== 'fail' && (v === '통과' || v === '미흡(지연 제출)'));
        const toggle = showToggle ? `
              <div class="th-grade-toggle">
                <button class="th-grade-btn pass ${isPass?'active':''}" onclick="thToggleOverride('${s.subId}','pass')">통과</button>
                <button class="th-grade-btn fail ${!isPass?'active':''}" onclick="thToggleOverride('${s.subId}','fail')">미흡</button>
              </div>` : '';
        return `<div class="th-review-card">
            <div class="th-review-card-top">
              <span class="th-review-card-name">${thEsc(s.id)} ${thEsc(s.name)}</span>
              ${chip}
              ${toggle}
            </div>
            <div class="th-review-card-text">${thEsc(s.text||'')}</div>
          </div>`;
      }).join('');
      body.innerHTML = html;
    }
  }

  window.thToggleOverride = async function(subId, value) {
    if (thOverrides[subId] === value) delete thOverrides[subId]; else thOverrides[subId] = value;
    await thSaveOverrides();
    thUpdateGradeSummary(); thRenderGradeBody(); window.thRenderAnswerClass();
    thSyncGradeAchieved(subId);
  };

  // 성적 표(성적 체크)가 같은 생각 체크 강의로 로드돼 있으면, 이탈 통과/미흡 토글 즉시
  // 해당 학생의 "달성" 체크를 다시 계산해 표와 통계를 갱신한다(불러오기 다시 안 해도 됨).
  function thSyncGradeAchieved(subId) {
    if (!_gradeThinkDocId || _gradeThinkDocId !== thGradeCtx.lecId) return;
    const sub = (thSubs || []).find(s => s.subId === subId);
    const rec = sub && _gradeRecords[sub.id];
    if (!rec || rec.absent) return;   // 결석 학생은 미달성 고정 — 건드리지 않는다.
    const lec = thLectures.find(l => l.docId === thGradeCtx.lecId);
    const { achieved, onTime } = thinkVerdict(sub, lec, thOverrides[subId]);
    rec.think.achieved = achieved;
    rec.think.onTime = onTime;
    renderGradeTable();
    renderGradeStats();
  }

  // AI 채점 & 포인트 지급: 아직 채점 안 된 제출만 채점한다(채점된 학생은 고정).
  // 0점=구조적 미흡(50자 미만/이탈 5회↑), 5점=AI 조금 미흡, 10~30=AI 품질 차등
  // (내용 기준 통과인데 수업 당일 제출을 못했으면 포인트는 그대로 주되 verdict만
  // "미흡(지연 제출)"로 남겨 성적 표의 달성/기한 체크가 갈리게 한다 — thinkVerdict() 참고).
  window.thRunGrading = async function() {
    const { lecId, cls } = thGradeCtx;
    const lec = thLectures.find(l => l.docId === lecId);
    if (!lec) return;
    const clsNum = parseInt(cls, 10);
    const allForLecClass = (thSubs||[]).filter(s => s.lectureDocId === lecId && thClassNum(s.id) === clsNum);
    let ungraded = allForLecClass.filter(s => !s.thGraded);
    if (!ungraded.length) return;
    const statusEl = document.getElementById('th-ai-status');
    document.querySelectorAll('.th-btn-ai').forEach(b => b.disabled = true);
    await xpEnsureConfig();
    const maxPt = _xpCfg?.activities?.thinkCheck?.pt ?? 30;

    // 0) 같은 학생이 같은 강의에 중복 제출한 경우(재입장 후 또 제출 등) 방지 —
    // 학생 화면(index.js)에서 이미 제출했으면 다시 못 쓰게 막았지만, 그 전에 이미
    // 쌓인 중복 데이터나 예외적인 경로에 대한 안전장치로 여기서도 한 번 더 거른다.
    // 이미 채점(지급)된 제출이 있는 학생이면 새 제출은 채점하지 않고 포인트 없이
    // "중복 제출"로만 표시해서 포인트가 두 번 나가는 걸 막는다(30416 윤세준 사고 재발 방지).
    const alreadyGradedIds = new Set(allForLecClass.filter(s => s.thGraded).map(s => s.id));
    const seenInBatch = new Set();
    const dupes = [];
    ungraded = ungraded
      .slice()
      .sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0))
      .filter(s => {
        if (alreadyGradedIds.has(s.id) || seenInBatch.has(s.id)) { dupes.push(s); return false; }
        seenInBatch.add(s.id);
        return true;
      });
    if (dupes.length) {
      for (const s of dupes) {
        try {
          await updateDoc(doc(db, 'think_submissions', s.subId), {
            thGraded: true, aiPt: 0, aiScore: null, aiVerdict: '중복 제출(포인트 미지급)', xpAwarded: false
          });
          const local = (thSubs || []).find(x => x.subId === s.subId);
          if (local) { local.thGraded = true; local.aiPt = 0; local.aiScore = null; local.aiVerdict = '중복 제출(포인트 미지급)'; local.xpAwarded = false; }
        } catch (e) { console.warn('중복 제출 처리 실패:', s.subId, e); }
      }
    }
    if (!ungraded.length) {
      document.querySelectorAll('.th-btn-ai').forEach(b => b.disabled = false);
      thUpdateGradeSummary(); thRenderGradeBody(); window.thRenderAnswerClass();
      return;
    }

    // 1) 구조적 미흡(0점) vs AI 채점 대상 분리
    const structFail = [], needAi = [];
    ungraded.forEach(s => {
      if ((s.textLength||0) < 50)      structFail.push({ s, verdict: '미흡(50자 미만)' });
      else if ((s.cheatCount||0) >= 5) structFail.push({ s, verdict: '미흡(이탈)' });
      else needAi.push(s);
    });

    // 2) AI 품질 채점(0~100)
    const quality = {};
    if (needAi.length) {
      if (statusEl) statusEl.textContent = `${needAi.length}개 답변 채점 중…`;
      const prompt = `역사 수업(중학교 3학년)의 질문에 대한 학생 답변을 채점합니다. 학생 답변은 보통 공백 제외 150자 안팎으로 짧습니다. 길이가 짧다는 이유로 감점하지 마세요. "질문 취지에 맞게 자기 생각을 근거와 함께 썼는가"를 봅니다. 중3 눈높이에서 격려하는 태도로 보되, 점수는 실제 품질에 따라 분명히 구분해서 매기세요. 성의 있게 자기 생각을 쓴 보통 수준의 답은 75~85 구간이 기본입니다. 90점 이상은 자기 입장이 분명하고 근거나 구체적 사례까지 갖춘, 눈에 띄게 뛰어난 답에만 주세요(대부분의 답은 여기까지 오지 않습니다).
- 90~100: 자기 입장이 분명하고 이유·근거·구체적 사례까지 갖춰 설득력이 있음 (뛰어난 소수만)
- 75~89: 질문 취지에 맞게 자기 생각을 성의 있게 씀 (성실한 답의 대부분이 여기)
- 60~74: 자기 생각은 있으나 근거 없이 단편적이거나 질문과 살짝 어긋남
- 45~59: 관련은 있으나 한두 문장으로 성의가 뚜렷이 부족
- 0~44: 질문과 완전히 무관, 무의미한 반복/복붙, 장난 답변
질문: "${lec.question}"
${lec.reference ? `수업 참고: "${String(lec.reference).slice(0,300)}"` : ''}
답변 목록(JSON): ${JSON.stringify(needAi.map(s => ({ subId: s.subId, text: s.text })))}
응답은 JSON 배열만 출력(다른 텍스트 없이): [{"subId":"...","quality":0~100 정수}]`;
      try {
        const res = await fetch(CLAUDE_PROXY_URL, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 1024, messages: [{ role: 'user', content: prompt }] })
        });
        if (!res.ok) throw new Error(`API ${res.status}`);
        const data = await res.json();
        const arr = JSON.parse((data.content?.[0]?.text || '[]').replace(/```json|```/g, '').trim());
        arr.forEach(r => { const q = Math.round(Number(r.quality)); if (isFinite(q)) quality[r.subId] = Math.max(0, Math.min(100, q)); });
      } catch (e) {
        if (statusEl) statusEl.textContent = `채점 실패: ${e.message}`;
        document.querySelectorAll('.th-btn-ai').forEach(b => b.disabled = false);
        return;
      }
    }

    // 3) 점수 환산 + XP 지급 + 제출 문서 기록
    if (statusEl) statusEl.textContent = '포인트 지급 중…';
    // 트랜잭션으로 "아직 채점 안 됨 → 채점됨"을 먼저 원자적으로 확정한 뒤에만 포인트를 지급한다.
    // (다중 탭에서 동시에 채점하거나, 이전 실행의 저장이 조용히 실패해 다시 채점 대상으로 잡히는 경우 등
    //  같은 제출물이 중복 채점되면서 XP가 여러 번 지급되는 사고를 막기 위함)
    async function commit(s, pt, verdict, score) {
      const subRef = doc(db, 'think_submissions', s.subId);
      let claimed = false;
      try {
        await runTransaction(db, async tx => {
          const snap = await tx.get(subRef);
          if (snap.exists() && snap.data().thGraded) return; // 이미 채점됨 → 중단(claimed=false 유지)
          claimed = true;
          tx.update(subRef, {
            aiScore: score == null ? null : score, aiVerdict: verdict, aiPt: pt,
            xpAwarded: pt > 0, xpAwardedAt: serverTimestamp(), thGraded: true
          });
        });
      } catch (e) { console.warn('채점 결과 저장 실패:', s.subId, e); return; }
      if (!claimed) return; // 이미 다른 실행에서 채점된 제출물 → 포인트 지급 건너뜀
      const local = (thSubs || []).find(x => x.subId === s.subId);
      if (local) { local.aiScore = score == null ? null : score; local.aiVerdict = verdict; local.aiPt = pt; local.xpAwarded = pt > 0; local.thGraded = true; }
      if (pt > 0) {
        // src/lecId 표식을 남겨 두면 재채점 때 강의 제목이 바뀌었어도 이 기록만 골라 지울 수 있다.
        try { await adminAddXP(rtdb, s.id, s.name, pt, `생각 체크: ${cleanTitle(lec.title)}`, fbFns, _xpCfg.levels, _xpCfg.levelFormula, { src: 'thinkCheck', lecId }); } catch (e) { console.warn(e); }
      }
    }
    for (const { s, verdict } of structFail) await commit(s, 0, verdict, null);
    for (const s of needAi) {
      const q = quality[s.subId];
      let pt, verdict;
      if (q == null || q < 40) { pt = 5; verdict = '조금 미흡'; }
      else {
        pt = Math.max(10, Math.min(maxPt, Math.round(10 + (q - 40) / 60 * (maxPt - 10))));
        // 내용·분량·AI 채점은 통과 기준이어도 수업 당일에 제출하지 못했으면 "미흡(지연 제출)"로
        // 표시한다(포인트는 그대로 — 지급 여부가 아니라 달성/기한 체크 표시만 갈린다).
        verdict = thIsLateSubmission(s, lec) ? '미흡(지연 제출)' : '통과';
      }
      await commit(s, pt, verdict, q == null ? null : q);
    }
    if (statusEl) statusEl.textContent = '';
    document.querySelectorAll('.th-btn-ai').forEach(b => b.disabled = false);
    thUpdateGradeSummary(); thRenderGradeBody(); window.thRenderAnswerClass();
  };

  // 재채점: 이미 채점된 제출의 점수를 초기화하고 다시 채점한다.
  // 이전 지급은 "회수" 기록(마이너스 항목)을 새로 남기지 않고 원래 지급 기록 자체를 지운다 —
  // 학생 경험치 내역에는 재채점 흔적 없이 새 채점 결과 한 줄만 남는다.
  window.thRegrade = async function() {
    const { lecId, cls } = thGradeCtx;
    const lec = thLectures.find(l => l.docId === lecId);
    if (!lec) return;
    const clsNum = parseInt(cls, 10);
    const graded = (thSubs||[]).filter(s => s.lectureDocId === lecId && thClassNum(s.id) === clsNum && s.thGraded);
    if (!graded.length) return;
    if (!confirm(`${cls}반 ${graded.length}명의 채점을 초기화하고 다시 채점합니다.\n이전 지급 내역은 삭제되고 새 채점 내역만 남습니다. 진행할까요?`)) return;

    const statusEl = document.getElementById('th-ai-status');
    document.querySelectorAll('.th-btn-ai').forEach(b => b.disabled = true);
    if (statusEl) statusEl.textContent = '이전 채점 초기화 중…';
    await xpEnsureConfig();

    // 이 강의의 생각 체크 지급 기록을 찾는 조건.
    // src/lecId 표식은 이 기능 이후 지급분에만 있으므로, 그 전 기록은 note로 잡는다.
    // note에는 이전 방식이 남긴 "…재채점(이전 점수 회수)" 마이너스 항목도 포함시켜야
    // 남은 마이너스 때문에 누적 XP가 깎인 채로 남지 않는다.
    const lecTitle = cleanTitle(lec.title);
    const legacyNotes = [`생각 체크: ${lecTitle}`, `생각 체크 재채점(이전 점수 회수): ${lecTitle}`];
    const isThisLecture = e =>
      (e.src === 'thinkCheck' && e.lecId === lecId) || legacyNotes.includes(e.note);

    for (const s of graded) {
      try { await adminRemoveXPEntries(rtdb, s.id, isThisLecture, fbFns, _xpCfg.levels, _xpCfg.levelFormula); } catch (e) { console.warn(e); }
      try {
        await updateDoc(doc(db, 'think_submissions', s.subId), { thGraded: false, aiPt: null, aiScore: null, aiVerdict: null, xpAwarded: false });
      } catch (e) {}
      const local = (thSubs || []).find(x => x.subId === s.subId);
      if (local) { local.thGraded = false; local.aiPt = null; local.aiScore = null; local.aiVerdict = null; local.xpAwarded = false; }
    }
    // 초기화 후 곧바로 재채점(미채점 상태가 된 제출을 다시 매긴다).
    await thRunGrading();
  };

  /* ─ 자동 시작 ─ */
  thStartLecListener();
  thLoadStudents();
}

// ══════════════════════════════════════════════════════════════
// 경험치 관리
// ══════════════════════════════════════════════════════════════
import { loadXPConfig, saveXPConfig, adminAddXP, adminRemoveXPEntries, DEFAULT_LEVELS, DEFAULT_FORMULA, DEFAULT_ACTIVITIES, calcLevel } from '../shared/xp.js';

const XP_ROOT = 'xp';
const ACT_LABELS = { attendance:'출석 체크', mileage:'히스토리 마일리지', thinkCheck:'생각 체크', typingReview:'타이핑 복습 (일일 1회, 강의당 10회까지)', oxQuiz:'OX 퀴즈 (일일 최대)' };
const fbFns = { ref, get, set, push, update, onValue };

let _xpCfg    = null;
let _xpStuAll = {};       // { sid: { total, level, name, ... } }
let _xpManSel = null;     // { sid, name }

// ── 공통: 설정 로드 ──
async function xpEnsureConfig() {
  if (!_xpCfg) _xpCfg = await loadXPConfig(rtdb, fbFns);
  return _xpCfg;
}

// ── STATUS ──
window.xpRefreshStatus = function() { xpLoadStatus(); };

let _xpSortMode = 'rank';
window.xpSetSort = function(mode) {
  _xpSortMode = mode;
  document.getElementById('xpSortRank').classList.toggle('active', mode === 'rank');
  document.getElementById('xpSortId').classList.toggle('active', mode === 'id');
  xpRenderStatus();
};

// 반 필터 — 학생 관리 탭과 동일하게 학번 2~3번째 자리(반)로 판별한다.
let _xpClsFilter = '';
function xpClassNum(sid) {
  if (!sid || sid.length < 3) return null;
  const c = parseInt(sid.slice(1, 3), 10);
  return isNaN(c) ? null : c;
}
window.xpSetClsFilter = function(cls) {
  _xpClsFilter = cls;
  document.querySelectorAll('#xp-rank-cls-tags .stu-cls-tag').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.cls === cls);
  });
  xpRenderStatus();
};

async function xpLoadStatus() {
  await xpEnsureConfig();
  const snap = await get(ref(rtdb, `${XP_ROOT}/students`));
  _xpStuAll  = snap.exists() ? (snap.val() || {}) : {};
  xpRenderStatus();
}

// ── 랭킹 계산 (동률 처리) ──
// 누적 XP 동률 시: 1)생각체크 포인트 2)마일리지 3)출석일수 4)복습(타이핑) 포인트 순으로 비교.
// 모두 같으면 공동순위로 묶고, 공동인 학생끼리는 학번 오름차순으로 나열한다.
function xpTieMetric(s) {
  const h = (s && s.history) || {};
  let think = 0, mileage = 0, attendDays = 0, review = 0;
  Object.values(h).forEach(e => {
    if (!e) return;
    const pt = e.pt || 0;
    if (e.type === 'mileage') mileage += pt;
    else if (e.type === 'attendance') attendDays += 1;
    else if (e.type === 'typingReview') review += pt;
    else if (e.type === 'manual' && typeof e.note === 'string' && e.note.startsWith('생각 체크')) think += pt;
  });
  return { think, mileage, attendDays, review };
}
function xpSameRank(a, b) {
  return (a.data.total || 0) === (b.data.total || 0)
    && a.m.think === b.m.think && a.m.mileage === b.m.mileage
    && a.m.attendDays === b.m.attendDays && a.m.review === b.m.review;
}
// studentsObj({sid:data}) → [{sid, data, m, rank}] (순위 규칙 적용, competition ranking)
function xpBuildRanking(studentsObj) {
  const list = Object.entries(studentsObj)
    .filter(([sid]) => !isTestId(sid)) // 테스트 학생은 랭킹에서 제외
    .map(([sid, data]) => ({ sid, data: data || {}, m: xpTieMetric(data || {}) }));
  list.sort((a, b) => {
    if ((b.data.total || 0) !== (a.data.total || 0)) return (b.data.total || 0) - (a.data.total || 0);
    if (b.m.think      !== a.m.think)      return b.m.think - a.m.think;
    if (b.m.mileage    !== a.m.mileage)    return b.m.mileage - a.m.mileage;
    if (b.m.attendDays !== a.m.attendDays) return b.m.attendDays - a.m.attendDays;
    if (b.m.review     !== a.m.review)     return b.m.review - a.m.review;
    return a.sid.localeCompare(b.sid, undefined, { numeric: true }); // 완전 동률 → 학번순
  });
  let prev = null;
  list.forEach((e, i) => { e.rank = (prev && xpSameRank(prev, e)) ? prev.rank : i + 1; prev = e; });
  return list;
}

window.xpRenderStatus = function() {
  const q = (document.getElementById('xp-rank-search')?.value || '').trim().toLowerCase();
  const filtered = {};
  Object.entries(_xpStuAll).forEach(([sid, s]) => {
    if (_xpClsFilter && xpClassNum(sid) !== +_xpClsFilter) return;
    if (q && !sid.includes(q) && !(s.name || '').toLowerCase().includes(q)) return;
    filtered[sid] = s;
  });
  const ranked = xpBuildRanking(filtered);
  const sharedRanks = new Set(); const seen = new Set();
  ranked.forEach(e => { if (seen.has(e.rank)) sharedRanks.add(e.rank); else seen.add(e.rank); });
  let view = ranked;
  if (_xpSortMode === 'id') {
    view = ranked.slice().sort((a, b) => a.sid.localeCompare(b.sid, undefined, { numeric: true }));
  }
  const tbody = document.getElementById('xp-status-body');
  if (!tbody) return;
  if (!view.length) { tbody.innerHTML = '<tr><td colspan="7" style="color:var(--slate);padding:24px;font-size:13px">데이터가 없습니다.</td></tr>'; return; }
  tbody.innerHTML = view.map(({ sid, data: s, rank }) => {
    const lv      = s.level || calcLevel(s.total || 0, _xpCfg?.levels, _xpCfg?.levelFormula);
    const lastAct = s.lastAttendance || s.lastMileage || '';
    const rankCell = _xpSortMode === 'rank'
      ? `<span style="font-weight:700;color:var(--slate)">${rank}${sharedRanks.has(rank) ? '<span style="font-size:11px;color:var(--stone)"> 공동</span>' : ''}</span>`
      : '-';
    return `<tr>
      <td>${rankCell}</td><td>${sid}</td><td><span class="stu-name-link" onclick="xpOpenHistory('${esc(sid)}','${esc(s.name||'')}')">${s.name || ''}</span></td>
      <td><span style="font-weight:700;color:var(--amber-d)">Lv.${lv}</span></td>
      <td style="font-weight:700">${(s.total||0).toLocaleString()} pt</td>
      <td style="font-size:12px;color:var(--slate)">${lastAct}</td>
      <td><button class="stu-btn stu-btn-del" onclick="xpResetStudent('${esc(sid)}','${esc(s.name||'')}')">초기화</button></td>
    </tr>`;
  }).join('');
};

// ── 학생별 경험치 적립 기록 모달 ──
window.xpOpenHistory = function(sid, name) {
  const s = _xpStuAll[sid] || {};
  const hist = Object.values(s.history || {});
  hist.sort((a, b) => (b.ts || 0) - (a.ts || 0));
  const title = document.getElementById('xpHistoryTitle');
  if (title) title.textContent = `${name || s.name || sid} (${sid}) 경험치 기록`;
  const tbody = document.getElementById('xp-history-body');
  if (tbody) {
    tbody.innerHTML = hist.length ? hist.map(h => {
      const d = new Date(h.ts || 0);
      const dt = `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
      const label = ACT_LABELS[h.type] || (h.type === 'manual' ? '수동 조정' : (h.type || '-'));
      const sign  = h.pt > 0 ? '+' : '';
      return `<tr><td style="font-size:12px;color:var(--slate)">${dt}</td><td>${label}</td><td>${sign}${h.pt||0}</td><td style="font-size:12px">${cleanTitle(h.note||'')}</td></tr>`;
    }).join('') : '<tr><td colspan="4" style="color:var(--slate);padding:20px;font-size:13px">기록이 없습니다.</td></tr>';
  }
  document.getElementById('xpHistoryBackdrop')?.classList.add('open');
};
window.xpCloseHistory = function() {
  document.getElementById('xpHistoryBackdrop')?.classList.remove('open');
};

// ── 초기화(개별/전체) ──
// 경험치 문서를 {name, total:0, level:1}로 되돌려 누적·기록·일일 게이트를 모두 초기화한다.
window.xpResetStudent = async function(sid, name) {
  if (!confirm(`${name || sid} 학생의 경험치를 초기화할까요?\n누적 경험치, 레벨, 적립 기록이 모두 0으로 돌아갑니다.`)) return;
  try {
    await set(ref(rtdb, `${XP_ROOT}/students/${sid}`), { name: name || (_xpStuAll[sid]?.name || ''), total: 0, level: 1 });
    _xpStuAll[sid] = { ...(_xpStuAll[sid] || {}), total: 0, level: 1 };
    xpRenderStatus();
  } catch (e) { alert('초기화 실패: ' + e.message); }
};

window.xpResetAll = async function() {
  const ids = Object.keys(_xpStuAll);
  if (!ids.length) { alert('초기화할 학생 데이터가 없습니다.'); return; }
  const targets = _xpClsFilter ? ids.filter(sid => xpClassNum(sid) === +_xpClsFilter) : ids;
  if (!targets.length) { alert('해당 반에 초기화할 학생이 없습니다.'); return; }
  const scope = _xpClsFilter ? `${_xpClsFilter}반 ${targets.length}명` : `전체 ${targets.length}명`;
  const val = prompt(`${scope}의 경험치를 모두 초기화합니다.\n되돌릴 수 없습니다. 진행하려면 "초기화"를 입력하세요.`);
  if (val !== '초기화') return;
  try {
    const updates = {};
    targets.forEach(sid => {
      const nm = _xpStuAll[sid]?.name || '';
      updates[`${XP_ROOT}/students/${sid}`] = { name: nm, total: 0, level: 1 };
      _xpStuAll[sid] = { name: nm, total: 0, level: 1 };
    });
    await update(ref(rtdb, '/'), updates);
    xpRenderStatus();
    alert(`${scope}의 경험치를 초기화했습니다.`);
  } catch (e) { alert('초기화 실패: ' + e.message); }
};

// ── SETTINGS ──
async function xpLoadSettings() {
  await xpEnsureConfig();
  // 활동 설정
  const actBody = document.getElementById('xp-act-body');
  if (actBody) {
    const acts = _xpCfg.activities || DEFAULT_ACTIVITIES;
    actBody.innerHTML = Object.entries(acts).filter(([key]) => key !== 'conceptCheck').map(([key, v]) => {
      const label = key === 'thinkCheck' ? '생각 체크 (제출 시 AI 채점, 10~최대)' : (ACT_LABELS[key] || key);
      const ptVal = key === 'oxQuiz' ? (v.dailyMax ?? 20) : (v.pt ?? 0);
      const ptLabel = key === 'oxQuiz' ? `일일 최대 ${ptVal}pt (정답당 ${v.ptPer??1}pt)` : `${ptVal} pt`;
      return `<tr>
        <td>${label}</td>
        <td><input type="number" data-act="${key}" data-field="${key==='oxQuiz'?'dailyMax':'pt'}" value="${ptVal}" style="width:70px;border:1px solid var(--hairline);border-radius:6px;padding:4px 8px;font-family:inherit;font-size:13px;text-align:center"></td>
        <td><div class="toggle-switch ${v.enabled?'on':''}" data-act="${key}" onclick="xpToggleAct(this)"></div></td>
      </tr>`;
    }).join('');
  }
  // 레벨 시스템 — 누적 levels[]를 레벨별 '필요 XP'(간격)로 변환해 표로 편집한다.
  const cumLevels = _xpCfg.levels || DEFAULT_LEVELS;
  _xpLevelGaps = cumLevels.map((v, i) => i === 0 ? 0 : v - cumLevels[i - 1]);
  xpRenderLevelTable();
  const lgInput = document.getElementById('xp-lastgap-input');
  if (lgInput) lgInput.value = _xpCfg.levelFormula?.lastGap ?? 550;
  const incInput = document.getElementById('xp-increment-input');
  if (incInput) incInput.value = _xpCfg.levelFormula?.increment ?? 25;
}

// ── 레벨 표 편집 ──
let _xpLevelGaps = []; // [0, Lv2필요, Lv3필요, ...] (index 0 = Lv.1 시작)

function xpRenderLevelTable() {
  const body = document.getElementById('xp-level-body');
  if (!body) return;
  let cum = 0;
  body.innerHTML = _xpLevelGaps.map((gap, i) => {
    cum += (i === 0 ? 0 : gap);
    const need = i === 0
      ? '<span style="color:var(--stone);font-size:13px">시작 지점</span>'
      : `<input type="number" min="1" data-lvidx="${i}" value="${gap}" oninput="xpRecalcCum()">`;
    return `<tr>
      <td style="font-weight:700">Lv.${i + 1}</td>
      <td>${need}</td>
      <td class="xp-cum" data-cumidx="${i}" style="font-weight:700;color:var(--amber-d)">${cum.toLocaleString()} pt</td>
    </tr>`;
  }).join('');
}

// 입력값 → _xpLevelGaps 동기화
function xpSyncGaps() {
  _xpLevelGaps[0] = 0;
  document.querySelectorAll('#xp-level-body input[data-lvidx]').forEach(inp => {
    _xpLevelGaps[Number(inp.dataset.lvidx)] = Number(inp.value) || 0;
  });
}

window.xpRecalcCum = function() {
  xpSyncGaps();
  let cum = 0;
  for (let i = 0; i < _xpLevelGaps.length; i++) {
    cum += (i === 0 ? 0 : _xpLevelGaps[i]);
    const cell = document.querySelector(`#xp-level-body .xp-cum[data-cumidx="${i}"]`);
    if (cell) cell.textContent = cum.toLocaleString() + ' pt';
  }
};

window.xpAddLevel = function() {
  xpSyncGaps();
  _xpLevelGaps.push(_xpLevelGaps[_xpLevelGaps.length - 1] || 100);
  xpRenderLevelTable();
};

window.xpRemoveLevel = function() {
  if (_xpLevelGaps.length <= 2) { alert('레벨은 최소 2개(Lv.1~2)까지 필요합니다.'); return; }
  xpSyncGaps();
  _xpLevelGaps.pop();
  xpRenderLevelTable();
};

window.xpToggleAct = function(el) {
  el.classList.toggle('on');
};

window.xpSaveActivities = async function() {
  await xpEnsureConfig();
  const rows = document.querySelectorAll('#xp-act-body input[data-act]');
  rows.forEach(inp => {
    const act   = inp.dataset.act;
    const field = inp.dataset.field;
    if (!_xpCfg.activities[act]) _xpCfg.activities[act] = {};
    _xpCfg.activities[act][field] = Number(inp.value) || 0;
  });
  document.querySelectorAll('#xp-act-body .toggle-switch[data-act]').forEach(el => {
    const act = el.dataset.act;
    if (!_xpCfg.activities[act]) _xpCfg.activities[act] = {};
    _xpCfg.activities[act].enabled = el.classList.contains('on');
  });
  await saveXPConfig(rtdb, _xpCfg, fbFns);
  alert('활동 설정이 저장되었습니다.');
};

window.xpSaveLevels = async function() {
  await xpEnsureConfig();
  xpSyncGaps();
  const gaps = _xpLevelGaps.map((g, i) => i === 0 ? 0 : Math.max(1, Math.round(g || 0)));
  if (gaps.length < 2) { alert('레벨은 최소 2개(Lv.1~2)가 필요합니다.'); return; }
  // 간격 → 누적 배열(levels[])로 변환. 첫 값은 항상 0.
  const levels = [];
  let cum = 0;
  gaps.forEach((g, i) => { cum += (i === 0 ? 0 : g); levels.push(cum); });
  _xpCfg.levels            = levels;
  _xpCfg.levelFormula      = _xpCfg.levelFormula || {};
  _xpCfg.levelFormula.lastGap   = Math.max(1, Number(document.getElementById('xp-lastgap-input')?.value) || 550);
  _xpCfg.levelFormula.increment = Math.max(0, Number(document.getElementById('xp-increment-input')?.value) || 25);
  await saveXPConfig(rtdb, _xpCfg, fbFns);
  _xpLevelGaps = gaps;
  xpRenderLevelTable();
  alert('레벨 기준이 저장되었습니다.');
};

// ── MANUAL ──
let _xpAllStudents = [];

async function xpManualLoadStudents() {
  const snap = await get(ref(rtdb, 'students'));
  if (!snap.exists()) return;
  _xpAllStudents = Object.values(snap.val() || {})
    .filter(s => s && (s.studentId || s.id) && !isTestId(String(s.studentId || s.id)))
    .map(s => ({ sid: String(s.studentId || s.id), name: s.name || '' }))
    .sort((a, b) => a.sid.localeCompare(b.sid, undefined, { numeric: true }));
  xpManualLogLoad();
}

window.xpManualSearch = function(q) {
  const dd = document.getElementById('xp-manual-dropdown');
  if (!q.trim()) { dd.style.display = 'none'; return; }
  const results = _xpAllStudents.filter(s => s.sid.includes(q) || s.name.includes(q)).slice(0, 8);
  if (!results.length) { dd.style.display = 'none'; return; }
  dd.style.display = '';
  dd.innerHTML = results.map(s =>
    `<div style="padding:10px 14px;cursor:pointer;font-size:14px;border-bottom:1px solid var(--hairline-soft)" onmousedown="xpManualSelect('${s.sid}','${s.name}')">${s.sid} ${s.name}</div>`
  ).join('');
};

window.xpManualSelect = function(sid, name) {
  _xpManSel = { sid, name };
  document.getElementById('xp-manual-search').value = `${sid} ${name}`;
  document.getElementById('xp-manual-dropdown').style.display = 'none';
  const tgt = document.getElementById('xp-manual-target');
  tgt.style.display = '';
  tgt.textContent   = `선택: ${sid} ${name}`;
};

window.xpManualAward = async function() {
  if (!_xpManSel) { alert('학생을 먼저 선택하세요.'); return; }
  const pt   = Number(document.getElementById('xp-manual-pt')?.value) || 0;
  const note = document.getElementById('xp-manual-note')?.value.trim() || '수동 지급';
  if (!pt) { alert('경험치 양을 입력하세요.'); return; }
  await xpEnsureConfig();
  const { newTotal, newLevel } = await adminAddXP(rtdb, _xpManSel.sid, _xpManSel.name, pt, note, fbFns, _xpCfg.levels, _xpCfg.levelFormula);
  const res = document.getElementById('xp-manual-result');
  res.textContent = `완료: ${_xpManSel.name} → 총 ${newTotal} pt (Lv.${newLevel})`;
  res.style.color = 'var(--success)';
  xpManualLogLoad();
};

async function xpManualLogLoad() {
  const tbody = document.getElementById('xp-manual-log');
  if (!tbody) return;
  const snap = await get(ref(rtdb, `${XP_ROOT}/students`));
  if (!snap.exists()) return;
  const rows = [];
  Object.entries(snap.val() || {}).forEach(([sid, s]) => {
    if (!s.history) return;
    Object.values(s.history).forEach(h => {
      if (h.type === 'manual') rows.push({ sid, name: s.name || '', ...h });
    });
  });
  rows.sort((a, b) => (b.ts || 0) - (a.ts || 0));
  tbody.innerHTML = rows.slice(0, 30).map(r => {
    const d = new Date(r.ts || 0);
    const dt = `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    const sign = r.pt > 0 ? '+' : '';
    return `<tr><td style="font-size:12px;color:var(--slate)">${dt}</td><td>${r.sid}</td><td>${r.name}</td><td>${sign}${r.pt}</td><td style="font-size:12px">${cleanTitle(r.note||'')}</td></tr>`;
  }).join('') || '<tr><td colspan="5" style="color:var(--slate);padding:16px;font-size:13px">내역 없음</td></tr>';
}

// ══ 진도 계획 (class_progress/plan, Firestore 단일 문서) ══
// rows: [{id,label,topic,cells:{classId:'M/D',...}}], classes: [{id,name,schedule}]
// 셀 강조는 저장하지 않고, 화면에 그릴 때마다 오늘(KST) 날짜와 비교해서 매번 새로 계산한다.
let _plData = { classes: [], rows: [] };
let _plLoaded = false; // 생각 체크 지연 제출 판정(thScheduledDate)이 "수업 스케줄" 탭을 연
                        // 적 없어도 동작하도록, plEnsureLoaded()가 이 플래그로 최초 1회만 불러온다.

function plGenId() { return 'id_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

function plDefaultData() {
  const classes = [
    { id: 'c1', name: '1반', schedule: '수1, 목5' },
    { id: 'c2', name: '2반', schedule: '수5, 금3' },
    { id: 'c3', name: '3반', schedule: '수6, 금1' },
    { id: 'c4', name: '4반', schedule: '수3, 목2' },
    { id: 'c5', name: '5반', schedule: '목4, 금6' },
    { id: 'c6', name: '6반', schedule: '목1, 금4' },
  ];
  const raw = [
    ['OT',  '2학기 수업 안내',        ['8/19','8/19','8/18','8/19','8/20','8/20']],
    ['24강','조선 초기',              ['8/20','8/21','8/21','8/20','8/21','8/21']],
    ['25강','조선 전기 제도',          ['8/26','8/26','8/26','8/26','8/27','8/27']],
    ['26강','조선 전기 대외관계',       ['8/27','8/28','8/28','8/27','8/28','8/28']],
    ['27강','수행1',                 ['9/2','9/2','9/2','9/2','9/3','9/3']],
    ['28강','사림의 정치적 성장',       ['9/3','9/4','9/4','9/3','9/4','9/4']],
    ['29강','사림의 정치적 성장2',      ['9/9','9/9','9/9','9/9','9/10','9/10']],
    ['30강','수행2',                 ['9/10','9/11','9/11','9/10','9/11','9/11']],
    ['31강','왜란',                  ['9/16','9/16','9/16','9/16','9/17','9/17']],
    ['32강','호란',                  ['9/17','9/18','9/18','9/17','9/18','9/18']],
    ['33강','수행3',                 ['9/30','9/30','9/30','9/30','10/1','10/1']],
    ['34강','조선 후기 변화',          ['10/1','10/2','10/2','10/1','10/2','10/2']],
    ['35강','영조 정조',              ['10/7','10/7','10/7','10/7','10/8','10/8']],
    ['36강','세도 정치와 농민봉기',      ['10/8','10/14','10/14','10/14','10/8','10/15']],
    ['37강','수행4',                 ['10/14','10/21','10/28','10/15','10/15','10/22']],
    ['38강','경제적 변화',            ['10/15','10/28','10/30','10/21','10/22','10/29']],
    ['39강','조선의 문화와 사상',       ['10/21','10/30','','10/22','10/29','10/30']],
    ['40강','',                     ['10/22','','','10/28','10/29','']],
    ['41강','',                     ['10/28','','','10/29','','']],
    ['42강','',                     ['10/29','','','','','']],
  ];
  const rows = raw.map(([label, topic, dates]) => {
    const cells = {};
    classes.forEach((c, i) => { cells[c.id] = dates[i] || ''; });
    return { id: plGenId(), label, topic, cells };
  });
  return { classes, rows };
}

// "M/D" 문자열을 오늘(today)과 가장 가까운 연도로 해석한다(학기가 연말을 넘어가도 자연스럽게 맞음).
function plResolveDate(mmdd, today) {
  const mt = /^(\d{1,2})\s*\/\s*(\d{1,2})$/.exec((mmdd || '').trim());
  if (!mt) return null;
  const m = +mt[1], d = +mt[2];
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const ty = today.getFullYear();
  let best = null;
  [ty - 1, ty, ty + 1].forEach(yy => {
    const cand = new Date(yy, m - 1, d);
    const diff = Math.abs(cand - today);
    if (!best || diff < best.diff) best = { date: cand, diff };
  });
  return best.date;
}
function plToday() {
  const [y, m, d] = kstDate().split('-').map(Number);
  return new Date(y, m - 1, d);
}
// 'past' | 'today' | 'future' | 'none'(빈 값/입력 형식 오류)
function plCellStatus(mmdd, today) {
  const resolved = plResolveDate(mmdd, today);
  if (!resolved) return 'none';
  if (resolved.getTime() === today.getTime()) return 'today';
  return resolved < today ? 'past' : 'future';
}

async function plLoad() {
  const snap = await getDoc(doc(db, 'class_progress', 'plan'));
  if (snap.exists()) {
    const data = snap.data() || {};
    _plData = { classes: data.classes || [], rows: data.rows || [] };
  } else {
    _plData = plDefaultData();
    await setDoc(doc(db, 'class_progress', 'plan'), _plData);
  }
  _plLoaded = true;
  plRender();
}

async function plEnsureLoaded() {
  if (_plLoaded) return;
  try { await plLoad(); } catch (e) {}
}

async function plSaveAndRender() {
  plRender();
  try { await setDoc(doc(db, 'class_progress', 'plan'), _plData); }
  catch (e) { alert('저장 실패: ' + e.message); }
}

function plRender() {
  const thead = document.getElementById('pl-thead');
  const tbody = document.getElementById('pl-body');
  if (!thead || !tbody) return;
  const { classes, rows } = _plData;
  const today = plToday();

  thead.innerHTML = `
    <tr>
      <th class="pl-col-num" rowspan="2">강의</th>
      <th class="pl-col-topic" rowspan="2">주제</th>
      ${classes.map(c => `<th>
          <div class="pl-cls-th-row">
            <input class="pl-cls-name" data-cls="${c.id}" data-field="name" value="${esc(c.name || '')}" onchange="plClassFieldChange(this)">
            <button class="stu-btn stu-btn-del" style="padding:3px 5px" title="반 삭제" onclick="plDeleteClass('${c.id}')">${icon('x', 12)}</button>
          </div>
        </th>`).join('')}
      <th class="pl-col-manage" rowspan="2">관리</th>
    </tr>
    <tr>
      ${classes.map(c => `<th style="font-weight:400">
          <input class="pl-cls-schedule-input" data-cls="${c.id}" data-field="schedule" value="${esc(c.schedule || '')}" placeholder="요일" onchange="plClassFieldChange(this)">
        </th>`).join('')}
    </tr>`;

  tbody.innerHTML = rows.length ? rows.map(r => `<tr>
      <td class="pl-col-num">
        <div class="pl-num-row">
          <input class="pl-input pl-label-input" data-row="${r.id}" data-field="label" value="${esc(r.label || '')}" onchange="plRowFieldChange(this)">
          <button class="pl-lec-link-btn" title="개념/생각 Check 통합 편집" onclick="plOpenLectureModal('${r.id}')">${icon('square-pen', 11)}</button>
        </div>
      </td>
      <td class="pl-col-topic"><div class="pl-input pl-topic-input" contenteditable="true" data-row="${r.id}" data-field="topic" data-placeholder="주제 입력" onblur="plRowFieldChange(this)" onpaste="plTopicPaste(event)">${esc(r.topic || '')}</div></td>
      ${classes.map(c => {
        const val = (r.cells && r.cells[c.id]) || '';
        const status = plCellStatus(val, today);
        const cellCls = status === 'today' ? 'pl-date-cell is-today' : status === 'past' ? 'pl-date-cell is-past' : 'pl-date-cell';
        return `<td class="${cellCls}"><input class="pl-input" data-row="${r.id}" data-cls="${c.id}" value="${esc(val)}" placeholder="M/D" onchange="plCellChange(this)" onkeydown="if(event.key==='Enter')this.blur()"></td>`;
      }).join('')}
      <td class="pl-col-manage"><button class="stu-btn stu-btn-del" title="삭제" onclick="plDeleteRow('${r.id}')">${icon('trash-2', 14)}</button></td>
    </tr>`).join('') : `<tr><td colspan="${classes.length + 3}" style="color:var(--slate);padding:24px;font-size:13px">강의를 추가해주세요.</td></tr>`;
}

window.plRowFieldChange = function(el) {
  const r = _plData.rows.find(x => x.id === el.dataset.row);
  if (!r) return;
  const field = el.dataset.field;
  const val = (el.isContentEditable ? el.textContent : el.value).trim();
  r[field] = val;
  plSaveAndRender();
  // 강의수를 입력/수정했고 주제가 비어있으면, 연결된 개념 Check 강의 제목을 자동으로 끌어온다.
  if (field === 'label' && !r.topic) plAutoFillTopic(r.id, val);
};
// 주제(contenteditable)에 서식 있는 텍스트를 붙여넣어도 순수 텍스트만 들어가게 한다.
window.plTopicPaste = function(e) {
  e.preventDefault();
  const text = (e.clipboardData || window.clipboardData).getData('text/plain');
  document.execCommand('insertText', false, text);
};
window.plClassFieldChange = function(el) {
  const c = _plData.classes.find(x => x.id === el.dataset.cls);
  if (!c) return;
  c[el.dataset.field] = el.value.trim();
  plSaveAndRender();
};
window.plCellChange = function(el) {
  const r = _plData.rows.find(x => x.id === el.dataset.row);
  if (!r) return;
  r.cells = r.cells || {};
  r.cells[el.dataset.cls] = el.value.trim();
  plSaveAndRender();
};
window.plAddRow = function() {
  const last = _plData.rows[_plData.rows.length - 1];
  let label = '';
  if (last) {
    const mt = /^(\d+)\s*강$/.exec((last.label || '').trim());
    if (mt) label = `${+mt[1] + 1}강`;
  }
  const cells = {};
  _plData.classes.forEach(c => { cells[c.id] = ''; });
  const newRow = { id: plGenId(), label, topic: '', cells };
  _plData.rows.push(newRow);
  plSaveAndRender();
  if (label) plAutoFillTopic(newRow.id, label); // 자동 채번된 번호로 주제도 시도해서 채운다
};
window.plDeleteRow = function(rid) {
  const r = _plData.rows.find(x => x.id === rid);
  const label = [r?.label, r?.topic].filter(Boolean).join(' ');
  if (!confirm(`"${label}" 행을 삭제할까요?`)) return;
  _plData.rows = _plData.rows.filter(x => x.id !== rid);
  plSaveAndRender();
};
window.plAddClass = function() {
  const id = plGenId();
  _plData.classes.push({ id, name: `${_plData.classes.length + 1}반`, schedule: '' });
  _plData.rows.forEach(r => { r.cells = r.cells || {}; r.cells[id] = ''; });
  plSaveAndRender();
};
window.plDeleteClass = function(cid) {
  const c = _plData.classes.find(x => x.id === cid);
  if (!confirm(`"${c?.name || ''}" 열을 삭제할까요? 이 반의 진도 기록도 함께 삭제됩니다.`)) return;
  _plData.classes = _plData.classes.filter(x => x.id !== cid);
  _plData.rows.forEach(r => { if (r.cells) delete r.cells[cid]; });
  plSaveAndRender();
};
// 처음으로 "N강" 형식인 행을 찾아 그 행부터 끝까지 번호를 1씩 증가시키며 다시 채운다(그 앞 행은 그대로 둠).
window.plAutoFillNumbers = function() {
  const rows = _plData.rows;
  const re = /^(\d+)\s*강$/;
  const startIdx = rows.findIndex(r => re.test((r.label || '').trim()));
  if (startIdx === -1) { alert('먼저 "N강" 형식의 강의수를 하나 입력한 뒤 눌러주세요.'); return; }
  let n = +re.exec(rows[startIdx].label.trim())[1];
  for (let i = startIdx; i < rows.length; i++) { rows[i].label = `${n}강`; n++; }
  plSaveAndRender();
};
// 모든 행의 주제를 지우고, 강의수(N강)에 매칭되는 개념 Check 강의 제목으로 다시 채운다.
// 매칭되는 강의가 없으면 빈칸으로 둔다(직접 입력했던 임의 주제는 여기서 전부 지워짐에 유의).
window.plRefillTopics = async function() {
  if (!_plData.rows.length) return;
  if (!confirm('모든 행의 주제를 지우고, 현재 만들어진 개념 Check 강의 제목으로 다시 채울까요?\n연결된 강의가 없는 행은 빈칸으로 남습니다.')) return;
  let lessonsByNum = {};
  try {
    const snap = await getDocs(collection(db, 'class_lessons'));
    snap.docs.forEach(d => { const v = d.data(); if (v.num != null) lessonsByNum[String(v.num)] = v; });
  } catch (e) { alert('강의 목록을 불러오지 못했습니다: ' + e.message); return; }
  _plData.rows.forEach(r => {
    const numKey = plLectureNumKey(r.label);
    const lesson = numKey ? lessonsByNum[numKey] : null;
    r.topic = lesson ? cleanTitle(lesson.title || '') : '';
  });
  plSaveAndRender();
};

// ── 강의수(N강) ↔ 개념 Check(class_lessons.num) / 생각 Check(think_lectures) 연결 ──
// "24강"→"24", "OT"→"OT"처럼 강의수 라벨을 class_lessons.num/think_lectures.icon과 같은 형식의 키로 바꾼다.
function plLectureNumKey(label) {
  const s = (label || '').trim();
  if (!s) return null;
  const m = /^(\d+)\s*강$/.exec(s);
  return m ? m[1] : s;
}
// 강의수에 매칭되는 개념 Check 강의 제목을, 주제가 비어있을 때만 자동으로 채운다(기존 입력은 덮어쓰지 않음).
async function plAutoFillTopic(rowId, label) {
  const numKey = plLectureNumKey(label);
  if (!numKey) return;
  try {
    const snap = await getDocs(query(collection(db, 'class_lessons'), where('num', '==', numKey)));
    if (snap.empty) return;
    const title = cleanTitle(snap.docs[0].data().title || '');
    const cur = _plData.rows.find(x => x.id === rowId); // 그 사이 사용자가 이미 주제를 입력했을 수 있어 다시 확인
    if (cur && !cur.topic && title) { cur.topic = title; plSaveAndRender(); }
  } catch (e) { console.warn('주제 자동 채우기 실패:', e); }
}

let _plLecCtx = { numKey: '', concept: null, think: null };

// grade_lecture_config/{num}.thinkLectureDocId로 먼저 찾고(개념 Check 저장 시 자동 연결되는 표준 경로),
// 없으면 think_lectures.icon===numKey로 한 번 더 찾는다(수동으로 만든 생각 체크 강의 대비).
async function plFetchLinkedLectures(numKey) {
  let concept = null, think = null;
  try {
    const clSnap = await getDocs(query(collection(db, 'class_lessons'), where('num', '==', numKey)));
    if (!clSnap.empty) concept = { docId: clSnap.docs[0].id, ...clSnap.docs[0].data() };
  } catch (e) { console.warn(e); }
  try {
    let linkId = '';
    const cfgSnap = await getDoc(doc(db, 'grade_lecture_config', numKey));
    if (cfgSnap.exists()) linkId = cfgSnap.data().thinkLectureDocId || '';
    if (linkId) {
      const tSnap = await getDoc(doc(db, 'think_lectures', linkId));
      if (tSnap.exists()) think = { docId: tSnap.id, ...tSnap.data() };
    }
    if (!think) {
      const tlSnap = await getDocs(query(collection(db, 'think_lectures'), where('icon', '==', numKey)));
      if (!tlSnap.empty) think = { docId: tlSnap.docs[0].id, ...tlSnap.docs[0].data() };
    }
  } catch (e) { console.warn(e); }
  return { concept, think };
}

window.plOpenLectureModal = async function(rowId) {
  const r = _plData.rows.find(x => x.id === rowId);
  const numKey = plLectureNumKey(r?.label);
  if (!numKey) { alert('강의수를 먼저 입력해주세요 (예: 24강, OT).'); return; }
  document.getElementById('plLectureTitle').textContent = `${lecTag(numKey)} 통합 편집`;
  document.getElementById('pl-concept-fields').style.display = 'none';
  document.getElementById('pl-concept-empty').style.display = 'none';
  document.getElementById('pl-think-fields').style.display = 'none';
  document.getElementById('pl-think-empty').style.display = 'none';
  document.getElementById('plLectureBackdrop').classList.add('open');

  const { concept, think } = await plFetchLinkedLectures(numKey);
  _plLecCtx = { numKey, concept, think };

  if (concept) {
    document.getElementById('pl-concept-fields').style.display = '';
    document.getElementById('pl-concept-title').value = cleanTitle(concept.title || '');
    const on = concept.isOpen === true;
    document.getElementById('pl-concept-toggle').classList.toggle('on', on);
    document.getElementById('pl-concept-toggle-label').textContent = on ? '공개 중' : '비공개';
  } else {
    document.getElementById('pl-concept-empty').style.display = '';
  }
  if (think) {
    document.getElementById('pl-think-fields').style.display = '';
    document.getElementById('pl-think-question').value = think.question || '';
    document.getElementById('pl-think-reference').value = think.reference || '';
    const on = think.isOpen === true;
    document.getElementById('pl-think-toggle').classList.toggle('on', on);
    document.getElementById('pl-think-toggle-label').textContent = on ? '공개 중' : '비공개';
  } else {
    document.getElementById('pl-think-empty').style.display = '';
  }
};
window.plCloseLectureModal = function() {
  document.getElementById('plLectureBackdrop')?.classList.remove('open');
};
window.plToggleModalField = function(kind) {
  const el = document.getElementById(`pl-${kind}-toggle`);
  if (!el) return;
  const on = el.classList.toggle('on');
  document.getElementById(`pl-${kind}-toggle-label`).textContent = on ? '공개 중' : '비공개';
};
window.plSaveConceptFromModal = async function() {
  if (!_plLecCtx.concept) return;
  const title = document.getElementById('pl-concept-title').value.trim();
  const isOpen = document.getElementById('pl-concept-toggle').classList.contains('on');
  if (!title) { alert('제목을 입력해주세요.'); return; }
  try {
    await updateDoc(doc(db, 'class_lessons', _plLecCtx.concept.docId), { title, isOpen });
    _plLecCtx.concept.title = title; _plLecCtx.concept.isOpen = isOpen;
    alert('저장했습니다.');
  } catch (e) { alert('저장 실패: ' + e.message); }
};
window.plSaveThinkFromModal = async function() {
  if (!_plLecCtx.think) return;
  const question = document.getElementById('pl-think-question').value.trim();
  const reference = document.getElementById('pl-think-reference').value.trim();
  const isOpen = document.getElementById('pl-think-toggle').classList.contains('on');
  if (!question) { alert('질문을 입력해주세요.'); return; }
  try {
    await updateDoc(doc(db, 'think_lectures', _plLecCtx.think.docId), { question, reference, isOpen });
    _plLecCtx.think.question = question; _plLecCtx.think.reference = reference; _plLecCtx.think.isOpen = isOpen;
    alert('저장했습니다.');
  } catch (e) { alert('저장 실패: ' + e.message); }
};
// "전체 편집으로 이동"은 모달을 닫고 기존 개념 Check/생각 Check 화면에서 해당 강의를 바로 연다.
window.plGoToConceptEdit = function() {
  if (!_plLecCtx.concept) return;
  const num = _plLecCtx.numKey;
  window.plCloseLectureModal();
  if (window.dbEditLesson) window.dbEditLesson(num);
};
window.plGoToThinkEdit = function() {
  if (!_plLecCtx.think) return;
  const docId = _plLecCtx.think.docId;
  window.plCloseLectureModal();
  switchNav('think');
  setTimeout(() => {
    const sel = document.getElementById('th-sel-cls-lec');
    if (sel) sel.value = docId;
    if (window.thMainSelect) window.thMainSelect();
    if (window.thMainEdit) window.thMainEdit();
    document.getElementById('th-main-edit')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 60);
};

