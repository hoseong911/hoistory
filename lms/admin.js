import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore, collection, query, orderBy, where, onSnapshot,
  addDoc, updateDoc, deleteDoc, doc, getDocs, getDoc, setDoc, writeBatch, serverTimestamp, limit
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getDatabase, ref, get, set, remove, update, onValue, push } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getStorage, ref as sRef, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";
import { mountIconPicker } from '../shared/icon-picker.js';
import { icon } from '../shared/icons.js';

import { firebaseConfig } from "../shared/firebase-config.js";

const app  = initializeApp(firebaseConfig);
const db   = getFirestore(app);
const rtdb = getDatabase(app);
const auth = getAuth(app);
const storage = getStorage(app);
import { CLAUDE_PROXY_URL, kstDate } from '../shared/util.js';

// ── 관리자 로그인 (Firebase Authentication) ──
function showAdminView() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('adminView').style.display = 'flex';
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

function initAdmin() {
  initSidebar();
  startListening();
  ceInitContent();
  ceInitDesign();
  initMissionTab();
  initGradeTab();
  initGradeSettings();
  initContentsTab();
  initArchiveTab();
  dbLoad();
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
  document.querySelectorAll('.nav-sub-item').forEach(item => {
    item.addEventListener('click', e => {
      e.stopPropagation();
      switchNav(item.dataset.subnav);
    });
  });
  // 미션 체크 하위 서브메뉴는 카드 목록에 맞춰 매번 새로 그려지므로(renderMissionSidebarSubnav),
  // 개별 항목에 리스너를 다는 대신 컨테이너에 위임한다.
  document.getElementById('subnav-mission').addEventListener('click', e => {
    const item = e.target.closest('[data-appadmin]');
    if (!item) return;
    e.stopPropagation();
    openMissionAppAdmin(item, item.dataset.appadmin);
  });
  // 각종 콘텐츠 하위 서브메뉴도 미션 체크와 동일하게 카드 목록에서 매번 새로 그려진다.
  document.getElementById('subnav-contents').addEventListener('click', e => {
    const item = e.target.closest('[data-appadmin]');
    if (!item) return;
    e.stopPropagation();
    openContentsAppAdmin(item, item.dataset.appadmin);
  });

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
  think: ['think-question', 'think-answer'],
  grade: ['grade-check', 'grade-grade', 'grade-setting'],
  archive: ['archive-cards', 'archive-category', 'archive-add'],
  xp: ['xp-award', 'xp-settings'],
  settings: ['settings-system', 'settings-student']
};

// ── 모바일 소프트 게이트 ──
// 넓은 화면 기준으로 만든 '저작' 패널은 모바일에서 열면 곧바로 띄우지 않고 안내 카드를 보여준다.
// 대신 '그래도 여기서 열기'로 언제든 강제로 불러 쓸 수 있다(하드 차단 아님).
const MOBILE_PC_ONLY = new Set([
  'panel-concept-content','panel-concept-design','panel-mission',
  'panel-think-question','panel-grade-setting','panel-contents',
  'panel-archive-cards','panel-archive-category','panel-archive-add',
  'panel-students','panel-settings-system','panel-settings-student',
  'panel-xp-settings'
]);
const PANEL_LABELS = {
  'panel-concept-content':'개념 Check · CONTENT','panel-concept-design':'개념 Check · DESIGN',
  'panel-mission':'미션 Check','panel-think-question':'생각 Check · QUESTION',
  'panel-grade-setting':'성적 Check · SETTING','panel-contents':'각종 콘텐츠',
  'panel-archive-cards':'아카이브 · CARDS','panel-archive-category':'아카이브 · CATEGORY',
  'panel-archive-add':'아카이브 · ADD','panel-students':'학생 관리',
  'panel-settings-system':'설정 · SYSTEM','panel-settings-student':'설정 · STUDENT',
  'panel-xp-settings':'경험치 · 설정'
};
const _mobileForced = new Set(); // 사용자가 '그래도 열기'로 통과시킨 패널
let _currentNav = 'dashboard', _currentPanelId = 'panel-dashboard';
function isMobileAdmin() { return window.matchMedia('(max-width:768px)').matches; }

function applyMobileGate(panelId, nav) {
  const notice = document.getElementById('mobilePcNotice');
  if (!notice) return;
  const panel = document.getElementById(panelId);
  const gated = isMobileAdmin() && MOBILE_PC_ONLY.has(panelId) && !_mobileForced.has(panelId);
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

function switchNav(nav) {
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
  // 미션 체크는 서브메뉴가 카드 목록(어드민 연결된 웹앱)에서 동적으로 채워지므로 SUBNAV_MAP을 쓰지 않는다.
  // 대신 미션 체크로 들어올 때마다 서브메뉴 트레이만 펼쳐 보여준다(기본 화면은 항상 카드 목록 패널).
  if (mainNav === 'mission') {
    const missionSub = document.getElementById('subnav-mission');
    if (missionSub) missionSub.classList.add('open');
  }
  // 각종 콘텐츠도 미션 체크와 동일하게 서브메뉴를 카드 목록에서 동적으로 채운다.
  if (mainNav === 'contents') {
    const contentsSub = document.getElementById('subnav-contents');
    if (contentsSub) contentsSub.classList.add('open');
  }

  // 패널 전환
  document.querySelectorAll('.adm-panel').forEach(p => p.classList.remove('active'));
  const panelId = subs ? `panel-${subNav}` : `panel-${mainNav}`;
  const panel = document.getElementById(panelId);
  if (panel) panel.classList.add('active');

  // 개념 체크 · 디자인 패널은 숨겨진 동안 미리보기 폭 계산이 0이 되므로, 보일 때마다 다시 계산한다.
  if (panelId === 'panel-concept-design') requestAnimationFrame(rescalePreview);
  if (panelId === 'panel-think-answer' && window.thRenderAnswerLecture) {
    window.thRenderAnswerLecture(); window.thRenderAnswerClass(); window.thRenderPick();
  }
  if (panelId === 'panel-archive-cards' && typeof renderArchiveCards === 'function') renderArchiveCards();
  if (panelId === 'panel-archive-category' && typeof renderArchiveCategoryEditor === 'function') renderArchiveCategoryEditor();
  // XP 패널 진입 시 데이터 로드
  if (panelId === 'panel-xp-award'    && typeof xpManualLoadStudents === 'function') { xpEnsureConfig(); xpManualLoadStudents(); }
  if (panelId === 'panel-xp-settings' && typeof xpLoadSettings       === 'function') xpLoadSettings();
  if (panelId === 'panel-dashboard') dbLoad();

  // 모바일: 저작 패널이면 안내 카드로 대체(강제 열기 전까지), 그리고 열린 드로어를 닫는다.
  _currentNav = nav; _currentPanelId = panelId;
  applyMobileGate(panelId, nav);
  closeAdmDrawer();
}

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

async function dbLoad() {
  const el = document.getElementById('db-content');
  if (el) el.innerHTML = '<div style="padding:32px;text-align:center;color:var(--sub);font-size:14px">불러오는 중...</div>';
  try {
    const today = kstDate(); // 한국시간 기준 (shared/util.js)

    // 개념 체크 강의 (상위 10)
    const clSnap = await getDocs(query(collection(db, 'class_lessons'), orderBy('order', 'desc')));
    _dbConcept = clSnap.docs.map(d => { const v = d.data(); return { docId: d.id, num: v.num, title: v.title || '', isOpen: v.isOpen !== false }; }).slice(0, 10);

    // 미션 체크 카드 (mission_category)
    let missionCat = '';
    try { const cfg = await getDoc(doc(db, 'settings', 'lms_config')); if (cfg.exists()) missionCat = cfg.data().mission_category || ''; } catch (_) {}
    if (missionCat) {
      const mSnap = await getDocs(query(collection(db, 'cards'), where('category', '==', missionCat)));
      _dbMission = mSnap.docs.map(d => { const v = d.data(); return { docId: d.id, title: v.title || v.label || '', locked: v.locked === true, order: v.order ?? 999 }; }).sort((a, b) => a.order - b.order);
    } else _dbMission = [];

    // 생각 체크 강의 (상위 10)
    const tlSnap = await getDocs(query(collection(db, 'think_lectures'), orderBy('createdAt', 'desc')));
    _dbThink = tlSnap.docs.map(d => { const v = d.data(); return { docId: d.id, title: v.title || '', isOpen: v.isOpen === true, ungraded: 0 }; }).slice(0, 10);

    // 제출물: 강의별 미채점 수 + 오늘 제출 수
    const tsSnap = await getDocs(collection(db, 'think_submissions'));
    const ungraded = {};
    let thinkSubmit = 0;
    tsSnap.docs.forEach(d => {
      const s = d.data();
      if (s.thGraded !== true) ungraded[s.lectureDocId] = (ungraded[s.lectureDocId] || 0) + 1;
      const secs = s.createdAt?.seconds;
      if (secs && kstDate(secs * 1000) === today) thinkSubmit++;
    });
    _dbThink.forEach(t => t.ungraded = ungraded[t.docId] || 0);

    // 학생 수 + 오늘 출석/복습(rtdb/xp)
    const stuSnap = await get(ref(rtdb, 'students'));
    const stuData = stuSnap.exists() ? (stuSnap.val() || {}) : {};
    _dbStuCount = Object.values(stuData).filter(v => v && v.studentId).length;
    const xpSnap = await get(ref(rtdb, `${XP_ROOT}/students`));
    const xp = xpSnap.exists() ? (xpSnap.val() || {}) : {};
    let attend = 0, review = 0;
    Object.values(xp).forEach(x => { if (!x) return; if (x.lastAttendance === today) attend++; if (x.lastTypingReview === today) review++; });
    _dbToday = { attend, thinkSubmit, review };

    dbRender();
  } catch(e) {
    if (el) el.innerHTML = `<div style="padding:32px;color:var(--critical);font-size:14px">로드 실패: ${esc(e.message)}</div>`;
  }
}

function dbRender() {
  const el = document.getElementById('db-content');
  if (!el) return;
  const totalUngraded = _dbThink.reduce((a, t) => a + (t.ungraded || 0), 0);
  el.innerHTML = `
    <div class="db-summary-row">
      <div class="db-summary-card"><div class="db-summary-label">오늘 출석</div><div class="db-summary-val">${_dbToday.attend} / ${_dbStuCount}명</div></div>
      <div class="db-summary-card"><div class="db-summary-label">오늘 생각체크 제출</div><div class="db-summary-val">${_dbToday.thinkSubmit}건</div></div>
      <div class="db-summary-card"><div class="db-summary-label">오늘 복습 퀴즈</div><div class="db-summary-val">${_dbToday.review}명</div></div>
      <div class="db-summary-card"><div class="db-summary-label">채점 대기(생각체크)</div><div class="db-summary-val" style="color:${totalUngraded ? 'var(--critical)' : 'var(--text)'}">${totalUngraded}건</div></div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px">
      ${dbToggleCard('개념 Check', _dbConcept, 'concept')}
      ${dbToggleCard('미션 Check', _dbMission, 'mission')}
      ${dbToggleCard('생각 Check', _dbThink, 'think')}
    </div>`;
}

function dbToggleCard(title, list, kind) {
  const rows = !list.length
    ? '<div class="empty-panel" style="padding:14px;font-size:13px">항목 없음</div>'
    : list.map(item => {
        const open = kind === 'mission' ? !item.locked : item.isOpen;
        const clean = String(item.title || '').replace(/\*\*/g, '').replace(/[{}]/g, ''); // 편집기호 제거
        const label = kind === 'concept' ? `${item.num}강. ${esc(clean)}` : esc(clean);
        const gradeBtn = kind === 'think'
          ? `<button class="add-btn" style="font-size:11px;padding:3px 9px" onclick="dbGoGrade('${item.docId}')">채점${item.ungraded ? ` <b>${item.ungraded}</b>` : ''}</button>`
          : '';
        const editBtn = kind === 'concept'
          ? `<button class="add-btn" style="font-size:11px;padding:3px 9px" onclick="dbEditLesson('${esc(String(item.num))}')">수정</button>`
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

// 대시보드 → 생각 체크 ANSWER 반별 화면으로 이동(해당 강의 선택)해서 바로 채점하게 한다.
window.dbGoGrade = function(lecId) {
  switchNav('think-answer');
  if (window.thAnswerSubTab) window.thAnswerSubTab('class');
  const sel = document.getElementById('th-sel-cls-lec');
  if (sel) sel.value = lecId;
  if (window.thRenderAnswerClass) window.thRenderAnswerClass();
};

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
const CE_FONT_KEYS = ['title','body','label','obj','cover','coverTagline','coverMeta','think','thinkGuide',
  'coverScript','coverNum','diveQ','diveGuide','diveKicker','badge','qtSub','qtText','qtSrc'];
const CE_FONT_VAR_MAP = {
  title: '--fs-slide-title', body: '--fs-body', label: '--fs-label', obj: '--fs-obj',
  cover: '--fs-cover-title', coverTagline: '--fs-cover-tagline', coverMeta: '--fs-cover-meta',
  think: '--fs-question', thinkGuide: '--fs-think-guide',
  coverScript: '--fs-cover-script', coverNum: '--fs-cover-num',
  diveQ: '--fs-dive-q', diveGuide: '--fs-dive-guide', diveKicker: '--fs-dive-kicker',
  badge: '--fs-badge', qtSub: '--fs-qt-sub', qtText: '--fs-qt-text', qtSrc: '--fs-qt-src',
};
const CE_LH_KEYS = ['body','label','obj','think','thinkGuide'];
const CE_LH_VAR_MAP = {
  body: '--lh-body', label: '--lh-label', obj: '--lh-obj',
  think: '--lh-question', thinkGuide: '--lh-think-guide',
};
const CE_SD = {
  fonts: { title: 40, body: 60, label: 70, obj: 70, cover: 200, coverTagline: 40, coverMeta: 40, think: 80, thinkGuide: 50,
    coverScript: 680, coverNum: 100, diveQ: 80, diveGuide: 50, diveKicker: 40, badge: 30, qtSub: 40, qtText: 60, qtSrc: 40 },
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

function ceLoadDesignInputs() {
  const f = ceCs.fonts;
  CE_FONT_KEYS.forEach(k => {
    document.getElementById('fs-' + k).value = f[k];
    document.getElementById('fv-' + k).value = f[k];
  });
  // 미션 본문: 저장값이 없으면 개념 본문값을 기본으로 따른다(기존 강의는 변화 없음).
  const bm = f.bodyMission != null ? f.bodyMission : f.body;
  document.getElementById('fs-bodyMission').value = bm;
  document.getElementById('fv-bodyMission').value = bm;
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
  const fonts = {};
  CE_FONT_KEYS.forEach(k => { fonts[k] = +document.getElementById('fs-' + k).value; });
  fonts.bodyMission = +document.getElementById('fs-bodyMission').value; // 미션 본문(개념과 별도)
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
  CE_FONT_KEYS.forEach(k => {
    el.style.setProperty(CE_FONT_VAR_MAP[k], (f[k] || CE_SD.fonts[k]) + 'px');
  });
  // 미션 본문 전용 변수. 저장값 없으면 개념 본문값을 따른다.
  el.style.setProperty('--fs-body-mission', ((f.bodyMission != null ? f.bodyMission : f.body) || CE_SD.fonts.body) + 'px');
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

function cePopulateLessonSelect() {
  const sel = document.getElementById('lesson-select');
  const cur = sel.value || ceCurrentLessonNum; // 선택 유지 (새 강의 추가/갱신 시)
  sel.innerHTML = '<option value="">— 강의 선택 —</option>' +
    [...ceLessonsCache].reverse().map(l => `<option value="${esc(l.num)}" ${cur && l.num===cur?'selected':''}>${esc(l.num)}강. ${esc(String(l.title||'').replace(/\*\*/g,'').replace(/[{}]/g,''))}</option>`).join('');
}

window.ceLessonPreview = function() {
  // preview=1 을 붙여 비공개(편집 중) 강의도 미리보기로 열 수 있게 한다.
  if (ceCurrentLessonNum) window.open('lecture.html?num=' + ceCurrentLessonNum + '&mode=complete&preview=1', '_blank', 'noopener');
};

function onLessonChange(num) {
  const area = document.getElementById('ce-editor-area');
  const prevBtn = document.getElementById('ce-preview-btn');
  if (!num) {
    if (area) area.style.display = 'none';
    if (prevBtn) prevBtn.style.display = 'none';
    return;
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
  const order = ceLessonsCache.length + 1;
  await addDoc(collection(db, 'class_lessons'), {
    num, title, unit, year, order, isOpen: false,
    content: ceBlankLessonData(num)
  });
  await ceGetLessonsFromFirestore();
  ceCurrentLessonNum = num;
  cePopulateLessonSelect();
  ceLoadLessonData(num);
  const area = document.getElementById('ce-editor-area');
  if (area) area.style.display = '';
  const prevBtn = document.getElementById('ce-preview-btn');
  if (prevBtn) prevBtn.style.display = '';
}

async function deleteLesson() {
  if (!confirm(`${ceCurrentLessonNum}강을 삭제하시겠습니까? (슬라이드 내용은 삭제되지 않습니다)`)) return;
  const lesson = ceLessonsCache.find(l => l.num === ceCurrentLessonNum);
  if (!lesson) return;
  await deleteDoc(doc(db, 'class_lessons', lesson.docId));
  await ceGetLessonsFromFirestore();
  ceCurrentLessonNum = '';
  cePopulateLessonSelect();
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
  compare: '비교표', quote: '사료 인용', 'flow-h': '플로우(가로)', 'flow-v': '플로우(세로)'
};
const CE_FORMATS = ['rows','timeline-h','timeline-v','compare','quote','flow-h','flow-v'];

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
function setLineFontSize(target, i, v) {
  const line = ceLinesFor(target)[i];
  const n = parseInt(v, 10);
  if (v === '' || isNaN(n)) delete line.fontSize;
  else line.fontSize = n;
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

function ceFormatPanelBody(target, i, line) {
  const fmt = line.format || 'rows';
  if (fmt === 'timeline-h' || fmt === 'timeline-v') return ceTimelineEditor(target, i, line);
  if (fmt === 'compare') return ceCompareEditor(target, i, line);
  if (fmt === 'quote') return ceQuoteEditor(target, i, line);
  if (fmt === 'flow-h' || fmt === 'flow-v') return ceFlowEditor(target, i, line);
  return `
    <label class="cl-labelpos">
      <input type="checkbox" ${line.labelPos === 'left' ? 'checked' : ''} onclick="event.stopPropagation();toggleLabelPos('${target}',${i},this.checked)">
      라벨 좌측 배치
    </label>`;
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
            <span class="cl-img-label" style="font-weight:400;color:var(--stone)">화면을 꽉 채우는 슬라이드 (강번호_번호 이미지)</span>
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
      const lastDivIdx = slides[slides.length - 1].divIdx;
      const slidesHtml = slides.map(({ divIdx, rowIndices }) => {
        const div = lines[divIdx];
        const hasImg = div.img != null, fmt = div.format || 'rows';
        const pg = ++pageNum;
        // 페이지 단위 공통 액션바(우측 세로) — 모든 형식에서 동일한 모양으로 쓴다.
        const pageActions = `
              <div class="cl-row-actions">
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
                <textarea class="cl-items" placeholder="{단어}는 빈칸, **굵게**, 엔터로 항목 구분 (a./b./c. 줄은 하위 항목)" oninput="updateLineItems('${target}',${rowIdx},this.value);autoResizeTa(this)" onkeydown="handleContentKeydown(event)">${esc(row.items.map(it => it.replace(/<\/?br\s*\/?>/gi, '\n')).join('\n'))}</textarea>
                ${rowDelete}
              </div>`;
        };
        // 본문 내용: 행 나열은 행들, 그 외(사료·연표 등)는 형식 편집기. 어느 형식이든 래퍼+우측 세로 액션바는 동일.
        const contentInner = fmt !== 'rows'
          ? ceFormatPanelBody(target, divIdx, div)
          : (rowIndices.length ? rowIndices.map(rowInner).join('') : `<div class="cl-norow-hint">내용이 없는 페이지입니다. 행을 추가하세요.</div>`);
        const bodyHtml = `<div class="cl-slide-row cl-slide-special"><div class="cl-special-editor">${contentInner}</div>${pageActions}</div>`;
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
              <span class="cl-slide-meta">${pg}페이지 <span class="cl-meta-sep">｜</span> ${CE_FORMAT_LABELS[fmt]}</span>
            </div>
            <details class="cl-fmt-details" style="margin:0 12px 6px">
              <summary class="cl-fmt-summary">형식 변경 · 페이지 설정</summary>
              <div class="cl-fmt-panel">
                <div class="cl-fmt-chips">${ceFormatChips(target,divIdx,fmt)}</div>
                ${fmt === 'rows' ? ceFormatPanelBody(target,divIdx,div) : ''}
                <div class="cl-fmt-fontsize">이 페이지 글자 크기 <input type="number" min="10" max="140" placeholder="기본" value="${div.fontSize != null ? div.fontSize : ''}" oninput="setLineFontSize('${target}',${divIdx},this.value)"> px <span class="cl-fmt-fontsize-hint">비우면 디자인 기본값</span></div>
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
              <button class="cl-page-btn" onclick="addPageToGroup('${target}',${lastDivIdx})" title="페이지 추가">${ceIconPlus()} 페이지</button>
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
function ceIconPlus()    { return _svgPlus; }
function ceIconImage()   { return _svgImage; }
function ceIconSliders() { return _svgSliders; }
function ceIconTrash()   { return _svgTrash; }

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

/* 액션바의 + 버튼: 누르면 "행 추가 / 페이지 추가" 중 고를 수 있는 작은 메뉴를 연다.
   행 추가는 이 페이지에 행 하나를, 페이지 추가는 같은 제목의 새 페이지를 바로 뒤에 넣는다. */
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
  menu.appendChild(mkBtn('페이지 추가', () => addPageToGroup(target, divIdx)));
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
  // a./b./c. 로 시작하는 줄은 바로 위 항목에 <br>로 이어 붙여 하나의 항목으로 저장한다.
  // 이렇게 하면 사용자는 태그 없이 엔터만 눌러 하위 항목을 입력할 수 있다.
  const lines = v.split('\n');
  const items = [];
  let cur = null;
  for (const ln of lines) {
    if (ln === '') continue;
    if (/^[a-z]\.\s/.test(ln) && cur !== null) {
      cur += '<br>' + ln;
    } else {
      if (cur !== null) items.push(cur);
      cur = ln;
    }
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
function addVideoSlide(target) {
  ceLinesFor(target).push({ type:'video', url:'', videoId:'' });
  ceRenderContentLines(target); ceRenderPreview();
}
function updateVideoUrl(target, i, v) {
  const line = ceLinesFor(target)[i];
  line.url = v.trim();
  line.videoId = ceParseYouTubeId(v);
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
    document.querySelectorAll(`#${ceContainerIdFor(target)} .cl-labelpos input[type=checkbox]`).forEach(cb => {
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
  const title = `${num}강. ${cd.lesson.title || ''}`.trim();
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
        title, question, reference, icon: num,
        isOpen: false, isArchived: false, createdAt: Date.now()
      });
      await setDoc(cfgRef, { thinkLectureDocId: ref.id, lessonTitle: cd.lesson.title || `${num}강` }, { merge: true });
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
    if (fmt === 'quote') return !!(line.quoteText && line.quoteText.trim());
    if (fmt === 'timeline-h' || fmt === 'timeline-v') return (line.events || []).length > 0;
    if (fmt === 'compare') return (((line.left && line.left.items) || []).length + ((line.right && line.right.items) || []).length) > 0;
    if (fmt === 'flow-h' || fmt === 'flow-v') return (line.stages || []).length > 0;
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

    const order = ceLessonsCache.length + 1;
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

  mountIconPicker({
    triggerEl: document.getElementById('missionIconTrigger'),
    previewEl:  document.getElementById('missionIconPreview'),
    onSelect:  (svg) => { missionSelectedSvg = svg; },
    storeSize: 28,
  });

  document.getElementById('missionAddCardBtn').addEventListener('click', async () => {
    const emoji    = missionSelectedSvg;
    const title    = document.getElementById('missionCardTitle').value.trim();
    const url      = document.getElementById('missionCardUrl').value.trim();
    const adminUrl = document.getElementById('missionCardAdminUrl').value.trim();
    if (!title || !url) { alert('제목과 웹앱 주소를 입력해 주세요.'); return; }
    const btn = document.getElementById('missionAddCardBtn');
    btn.disabled = true;
    try {
      const snap  = await getDocs(query(collection(db, 'cards'), where('category','==',cat)));
      const order = snap.docs.length ? Math.max(...snap.docs.map(d => d.data().order || 0)) + 1 : 0;
      const cardData = { emoji, title, desc: '', url, category: cat, locked: false, order };
      if (adminUrl) cardData.adminUrl = adminUrl;
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
      document.getElementById('missionArchiveTopic').value = '';
      document.getElementById('missionArchiveIntent').value = '';
      document.getElementById('missionArchiveContent').value = '';
      document.getElementById('missionArchivePanel').style.display = 'none';
      document.getElementById('missionArchiveToggleBtn').dataset.open = '';
      document.getElementById('missionArchiveToggleBtn').textContent = '아카이브 정보 입력';
      document.getElementById('missionArchiveToggleBtn').style.borderColor = '';
      document.getElementById('missionArchiveToggleBtn').style.color = '';
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

async function renderMissionPreview(cat) {
  const container = document.getElementById('missionPreviewList');
  if (!cat) { container.innerHTML = ''; return; }
  try {
    const snap  = await getDocs(query(collection(db, 'cards'), where('category','==',cat)));
    const items = snap.docs.map(d => ({ docId: d.id, ...d.data() })).sort((a,b) => (a.order??999)-(b.order??999));
    window._missionItems = items;
    window._missionCat   = cat;
    renderMissionSidebarSubnav(items);
    if (!items.length) { container.innerHTML = '<div class="empty-panel">이 카테고리에 카드가 없습니다.</div>'; return; }
    container.innerHTML = `<p style="font-size:13px;color:var(--sub);margin-bottom:10px">카드 ${items.length}개</p>`;
    items.forEach((item, idx) => {
      const row = document.createElement('div');
      row.className = 'item-row';
      row.id = `mission-row-${item.docId}`;
      const iconStr = String(item.emoji||'');
      const isSvg = iconStr.startsWith('<svg');
      const isLocked = !!item.locked;
      const adminBtn = item.adminUrl
        ? `<button class="admin-link-btn" onclick="openAppAdmin('${esc(item.adminUrl)}')">어드민</button>`
        : '';
      row.innerHTML = `
        <div class="item-icon-preview preview-mission">${isSvg ? iconStr : esc(iconStr) || '—'}</div>
        <div class="item-info">
          <div class="item-label">${esc(item.title||'')}</div>
          <div class="item-url">${esc(item.url||'')}${item.adminUrl?` · 어드민: ${esc(item.adminUrl)}`:''}</div>
        </div>
        <div class="item-meta">
          <button class="lock-toggle ${isLocked?'locked':'open'}" onclick="missionToggleLocked('${item.docId}',${isLocked})">${isLocked?'비공개':'공개'}</button>
          ${adminBtn}
          <button class="edit-btn" ${idx===0?'disabled':''} onclick="missionMoveCard('${item.docId}','up',${idx})">▲</button>
          <button class="edit-btn" ${idx===items.length-1?'disabled':''} onclick="missionMoveCard('${item.docId}','down',${idx})">▼</button>
          <button class="edit-btn" onclick="missionStartEdit('${item.docId}')">수정</button>
          <button class="del-btn" onclick="missionDeleteCard('${item.docId}')">삭제</button>
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
      <button class="btn-save" style="flex:none;padding:7px 16px;background:var(--c3)" onclick="missionSaveEdit('${docId}')">저장</button>
      <button class="btn-cancel" onclick="renderMissionPreview(window._missionCat)">취소</button>
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
  if (!title) { alert('제목을 입력하세요.'); return; }
  try {
    await updateDoc(doc(db, 'cards', docId), { emoji, title, url, adminUrl });

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
  const isOpen = panel.style.display === 'none';
  panel.style.display = isOpen ? 'block' : 'none';
  btn.dataset.open = isOpen ? '1' : '';
  btn.textContent  = isOpen ? '▲ 닫기' : '아카이브 정보 입력';
  btn.style.borderColor = isOpen ? 'var(--c3)' : '';
  btn.style.color       = isOpen ? 'var(--c3)' : '';
};

window.updateMissionArchiveDot = function() {
  const topic   = document.getElementById('missionArchiveTopic')?.value.trim();
  const intent  = document.getElementById('missionArchiveIntent')?.value.trim();
  const content = document.getElementById('missionArchiveContent')?.value.trim();
  const dot     = document.getElementById('missionArchiveDot');
  if (dot) dot.style.background = (topic || intent || content) ? 'var(--c3)' : 'var(--border)';
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
    triggerEl: document.getElementById('contentsIconTrigger'),
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
    items.forEach((item, idx) => {
      const row = document.createElement('div');
      row.className = 'item-row';
      row.id = `contents-row-${item.docId}`;
      const iconStr = String(item.emoji||'');
      const isSvg = iconStr.startsWith('<svg');
      const isLocked = !!item.locked;
      const adminBtn = item.adminUrl
        ? `<button class="admin-link-btn" onclick="openAppAdmin('${esc(item.adminUrl)}')">어드민</button>`
        : '';
      row.innerHTML = `
        <div class="item-icon-preview preview-contents">${isSvg ? iconStr : esc(iconStr) || '—'}</div>
        <div class="item-info">
          <div class="item-label">${esc(item.title||'')}</div>
          <div class="item-url">${esc(item.url||'')}${item.adminUrl?` · 어드민: ${esc(item.adminUrl)}`:''}${item.openInModal?' · 팝업으로 열기':''}</div>
        </div>
        <div class="item-meta">
          <button class="lock-toggle ${isLocked?'locked':'open'}" onclick="contentsToggleLocked('${item.docId}',${isLocked})">${isLocked?'비공개':'공개'}</button>
          ${adminBtn}
          <button class="edit-btn" ${idx===0?'disabled':''} onclick="contentsMoveCard('${item.docId}','up',${idx})">▲</button>
          <button class="edit-btn" ${idx===items.length-1?'disabled':''} onclick="contentsMoveCard('${item.docId}','down',${idx})">▼</button>
          <button class="edit-btn" onclick="contentsStartEdit('${item.docId}')">수정</button>
          <button class="del-btn" onclick="contentsDeleteCard('${item.docId}')">삭제</button>
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
    triggerEl: document.getElementById('archiveAddIconTrigger'),
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
      ? cats.map(c => `<option value="${esc(c.key)}">${esc(c.en)}${c.ko ? ' · ' + esc(c.ko) : ''}</option>`).join('')
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
        <div class="item-url">${esc(card.url || '')}</div>
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
              ${cats.map(c => `<option value="${esc(c.key)}">${esc(c.en)}${c.ko ? ' · ' + esc(c.ko) : ''}</option>`).join('')}
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
  published.forEach(card => {
    const row = document.createElement('div');
    row.className = 'item-row';
    row.id = `archive-row-${card.docId}`;
    const iconStr = String(card.emoji || '');
    const isSvg = iconStr.startsWith('<svg');
    const isLocked = !!card.locked;
    const cat = cats.find(c => c.key === card.category);
    row.innerHTML = `
      <div class="item-icon-preview preview-contents">${isSvg ? iconStr : esc(iconStr) || '—'}</div>
      <div class="item-info">
        <div class="item-label">${esc(card.title || '')}</div>
        <div class="item-sublabel">${esc(cat?.en || '')}${cat?.ko ? ' · ' + esc(cat.ko) : ''}</div>
        <div class="item-url">${esc(card.url || '')}</div>
      </div>
      <div class="item-meta">
        <button class="lock-toggle ${isLocked ? 'locked' : 'open'}" onclick="archiveToggleLocked('${card.docId}',${isLocked})">${isLocked ? '비공개' : '공개'}</button>
        <button class="edit-btn" onclick="archiveStartEdit('${card.docId}')">수정</button>
        <button class="del-btn" onclick="archiveDeleteCard('${card.docId}')">삭제</button>
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
          ${cats.map(c => `<option value="${esc(c.key)}" ${c.key === card.category ? 'selected' : ''}>${esc(c.en)}${c.ko ? ' · ' + esc(c.ko) : ''}</option>`).join('')}
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
let _gradeEnabled     = { concept: true, mission: true, think: true };
let _publishStatus    = {};   // { classNum: boolean }
let _currentGradeClass = null;

async function initGradeTab() {
  // 개념 체크 강의 선택(gradeLessonSel)은 class_lessons(개념 체크에서 만든 강의)에서,
  // 생각 체크 연결(gradeThinkSel)은 lectures(생각 체크 강의)에서 따로 가져온다.
  // 예전엔 둘 다 lectures를 같이 썼는데, 그러면 개념 체크와 무관한 강의까지 섞여 나왔다.
  try {
    const snap = await getDocs(collection(db, 'class_lessons'));
    _gradeLessons = snap.docs
      .map(d => ({ docId: d.id, ...d.data() }))
      .filter(l => l.num)
      .sort((a, b) => parseInt(a.num) - parseInt(b.num));

    const lessonSel = document.getElementById('gradeLessonSel');
    _gradeLessons.forEach(l => {
      const o = document.createElement('option');
      o.value = l.num;
      o.textContent = `${l.num}강 · ${cleanTitle(l.title)}`;
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
        if (sid && sname) map[sid] = sname;
      });
      _gradeStudents = Object.entries(map)
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.id.localeCompare(b.id));
    }
  } catch(e) {}

  // 미션 소스 자동탐색 — 새 escape 앱 추가 시 아래 배열에 추가
  const missionCandidates = [
    'escape26_2_reflections',
  ];
  const missionSel = document.getElementById('gradeMissionColl');
  for (const coll of missionCandidates) {
    try {
      const snap = await getDocs(query(collection(db, coll), limit(1)));
      if (!snap.empty) {
        const o = document.createElement('option');
        o.value = coll;
        o.textContent = coll;
        missionSel.appendChild(o);
      }
    } catch(e) {}
  }

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
      document.getElementById('gradeThinkSel').value    = d.thinkLectureDocId || '';
      document.getElementById('gradeMissionColl').value = d.missionCollection || '';
      document.getElementById('gradeConceptNA').checked = d.conceptEnabled === false;
      document.getElementById('gradeMissionNA').checked = d.missionEnabled === false;
      document.getElementById('gradeThinkNA').checked   = d.thinkEnabled   === false;
      document.getElementById('gradeConceptWeight').value = String(d.conceptWeight || 1);
      document.getElementById('gradeMissionWeight').value = String(d.missionWeight || 1);
      document.getElementById('gradeThinkWeight').value   = String(d.thinkWeight   || 1);
    } else {
      document.getElementById('gradeThinkSel').value    = '';
      document.getElementById('gradeMissionColl').value = '';
      document.getElementById('gradeConceptNA').checked = false;
      document.getElementById('gradeMissionNA').checked = false;
      document.getElementById('gradeThinkNA').checked   = false;
      document.getElementById('gradeConceptWeight').value = '1';
      document.getElementById('gradeMissionWeight').value = '1';
      document.getElementById('gradeThinkWeight').value   = '1';
    }
  } catch(e) {}
}

async function loadGradeData() {
  const lessonNum = document.getElementById('gradeLessonSel').value;
  if (!lessonNum) { alert('강의를 먼저 선택해 주세요.'); return; }

  _gradeLessonKey = lessonNum;

  const thinkDocId  = document.getElementById('gradeThinkSel').value;
  const missionColl = document.getElementById('gradeMissionColl').value.trim();
  const conceptEnabled = !document.getElementById('gradeConceptNA').checked;
  const missionEnabled = !document.getElementById('gradeMissionNA').checked;
  const thinkEnabled   = !document.getElementById('gradeThinkNA').checked;
  const conceptWeight  = parseInt(document.getElementById('gradeConceptWeight').value) || 1;
  const missionWeight  = parseInt(document.getElementById('gradeMissionWeight').value) || 1;
  const thinkWeight    = parseInt(document.getElementById('gradeThinkWeight').value)   || 1;
  _gradeEnabled = { concept: conceptEnabled, mission: missionEnabled, think: thinkEnabled };

  // 설정 저장
  try {
    const lesson = _gradeLessons.find(l => l.num === _gradeLessonKey);
    await setDoc(doc(db, 'grade_lecture_config', _gradeLessonKey), {
      thinkLectureDocId: thinkDocId,
      missionCollection: missionColl,
      lessonTitle: lesson?.title || `${_gradeLessonKey}강`,
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
        savedSet.add(r.studentId);
      }
    });

    // 생각체크 자동감지 (제출시간 수집)
    if (thinkDocId) {
      const tSnap = await getDocs(query(
        collection(db, 'think_submissions'),
        where('lectureDocId', '==', thinkDocId)
      ));
      tSnap.docs.forEach(d => {
        const sub = d.data();
        if (!_gradeRecords[sub.id]) return;
        _gradeRecords[sub.id].think.achieved = true;
        if (!savedSet.has(sub.id)) _gradeRecords[sub.id].think.onTime = true;
        const ts = sub.createdAt;
        if (ts) _gradeThinkTimes[sub.id] = ts.toDate ? ts.toDate() : new Date(ts);
      });
    }

    // 미션체크 자동감지 (제출시간 수집)
    if (missionColl) {
      try {
        const mSnap = await getDocs(collection(db, missionColl));
        mSnap.docs.forEach(d => {
          const data = d.data();
          const sid  = data.studentId || d.id;
          if (!_gradeRecords[sid]) return;
          _gradeRecords[sid].mission.achieved = true;
          if (!savedSet.has(sid)) _gradeRecords[sid].mission.onTime = true;
          const ts = data.createdAt;
          if (ts) _gradeMissionTimes[sid] = ts.toDate ? ts.toDate() : new Date(ts);
        });
      } catch(e) {}
    }

    // 반영 상태 로드
    _publishStatus = {};
    try {
      const pubSnap = await getDocs(query(
        collection(db, 'grade_publish_status'),
        where('lessonKey', '==', _gradeLessonKey)
      ));
      pubSnap.docs.forEach(d => {
        const pd = d.data();
        if (pd.published) _publishStatus[pd.classNum] = true;
      });
    } catch(e) {}

    renderGradeTable();
    setupSubtabs('gradeTableWrap', 'gradeSubtabBar', (cls) => {
      _currentGradeClass = cls;
      syncGradeAllCb();
      renderGradeStats();
      renderGradePublishBar(cls === 'all' ? null : cls);
    }, true);
    document.getElementById('gradeCheckActions').style.display = 'flex';
    refreshGradeSettingsLectures();
  } catch(e) {
    alert('불러오기 실패: ' + e.message);
  } finally {
    btn.disabled = false; btn.textContent = '불러오기';
  }
}

// ── 강의별 학생 피드백 ──
// 체크박스와 마찬가지로 여기서는 메모리(_gradeRecords)만 바꾸고, 실제 저장은
// 기존 "임시 저장"/"반영하기" 흐름을 그대로 타야 학생 화면에 반영된다.
let _gradeFeedbackSid = null;
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
function saveGradeFeedback() {
  if (!_gradeFeedbackSid) return;
  const val = document.getElementById('gradeFeedbackInput').value.trim();
  if (_gradeRecords[_gradeFeedbackSid]) _gradeRecords[_gradeFeedbackSid].feedback = val;
  closeGradeFeedbackModal();
  renderGradeTable();
}

// ── 피드백 템플릿 (설정은 즉시 Firestore에 저장, 학생별 적용은 기존 임시 저장/반영하기 흐름을 탄다) ──
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

function applyFeedbackTemplate() {
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

  let count = 0;
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
    count++;
  });

  closeFeedbackTemplateModal();
  renderGradeTable();
  alert(`${count}명에게 적용했습니다. (임시 저장 또는 반영하기를 눌러야 학생에게 반영됩니다)`);
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
  const totalCols = 2 + (cE?2:0) + (mE?3:0) + (tE?3:0) + 1;

  const allCb = (t, f) =>
    `<input type="checkbox" class="grade-all-cb" data-t="${t}" data-f="${f}" title="전체 선택/해제 (현재 반에만 적용)">`;
  const chk = (sid, type, field, checked, disabled) =>
    `<input type="checkbox" class="grade-cb ${type}" data-sid="${esc(sid)}" data-t="${type}" data-f="${field}" ${checked?'checked':''} ${disabled?'disabled title="결석 처리된 학생은 미달성으로 고정됩니다"':''}>`;
  const timeSpan = (d, isLate) =>
    `<span style="font-size:12px" class="${isLate?'grade-time-late':''}">${esc(fmtTime(d))}</span>`;

  let html = `<div class="grade-table-wrap"><table class="grade-table">
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
    const tMaj  = majorityDay(_gradeThinkTimes,   studs);
    const mMaj  = majorityDay(_gradeMissionTimes, studs);
    html += `<tr class="class-header-row" data-cls="${cls}"><td colspan="${totalCols}">${cls}반 (${studs.length}명)</td></tr>`;
    studs.forEach(s => {
      const r  = _gradeRecords[s.id];
      const tD = _gradeThinkTimes[s.id]   || null;
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
      el.textContent = `${n}명 / ${total}명`;
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
      `반영 강의 ${selectedLectures.length}개 기준 · 최대 ${maxScore}점`;

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
      return { key: data.num, title: `${data.num}강 · ${cleanTitle(data.title)}` };
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
        return `<div class="lecture-list-item">${esc(String(lec?.title || key + '강').replace(/\*\*/g, '').replace(/[{}]/g, ''))}<button class="lecture-list-remove" data-key="${esc(key)}">삭제</button></div>`;
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

// ── 성적 반영 바 ──
function renderGradePublishBar(classNum) {
  const statusEl = document.getElementById('gradePublishStatusLbl');
  const btn = document.getElementById('publishActionBtn');
  if (!classNum || !_gradeLessonKey) {
    statusEl.textContent = '';
    statusEl.className = 'grade-publish-status-lbl';
    btn.style.display = 'none';
    return;
  }
  const published = !!_publishStatus[classNum];

  statusEl.textContent = published ? `✓ 반영됨 (${classNum}반)` : `미반영 (${classNum}반)`;
  statusEl.className = `grade-publish-status-lbl ${published ? 'published' : 'unpublished'}`;

  btn.style.display = '';
  btn.className = published ? 'btn-unpublish' : 'btn-publish';
  btn.textContent = published ? '반영 취소' : '성적 반영하기';
  btn.onclick = () => published ? unpublishClassGrades(classNum) : publishClassGrades(classNum);
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
    renderGradePublishBar(classNum);
    updateSubtabPublishBadge(classNum, true);
    alert(`${classNum}반 성적 반영 완료!`);
  } catch(e) {
    alert('반영 실패: ' + e.message);
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
    renderGradePublishBar(classNum);
    updateSubtabPublishBadge(classNum, false);
    alert(`${classNum}반 성적 반영 취소 완료.`);
  } catch(e) {
    alert('취소 실패: ' + e.message);
  }
}

async function publishAllClasses() {
  if (!_gradeLessonKey) return;
  const bar = document.getElementById('gradeSubtabBar');
  const classBtns = bar ? [...bar.querySelectorAll('.grade-subtab[data-cls]')] : [];
  const classNums = classBtns.map(b => parseInt(b.dataset.cls)).filter(n => !isNaN(n));
  if (!classNums.length) { alert('반 정보가 없습니다.'); return; }
  const unpublished = classNums.filter(n => !_publishStatus[n]);
  if (!unpublished.length) { alert('이미 모든 반에 반영되어 있습니다.'); return; }
  if (!confirm(`${unpublished.join(', ')}반 (총 ${unpublished.length}개 반) 성적을 한꺼번에 반영하시겠습니까?\n학생 성적 조회에 즉시 표시됩니다.`)) return;

  const allBtn = document.getElementById('publishAllBtn');
  if (allBtn) { allBtn.disabled = true; allBtn.textContent = '반영 중...'; }

  const lesson = _gradeLessons.find(l => l.num === _gradeLessonKey);
  const lessonTitle = lesson?.title || '';

  for (const classNum of unpublished) {
    const studentsInClass = _gradeStudents.filter(s => {
      if (s.id === '00000') return false;
      return Math.floor((parseInt(s.id) - 30000) / 100) === classNum;
    });
    try {
      await Promise.all(studentsInClass.map(s =>
        setDoc(doc(db, 'grade_records', `${_gradeLessonKey}_${s.id}`), {
          lessonKey: _gradeLessonKey, lessonTitle,
          studentId: s.id, studentName: s.name,
          concept: _gradeRecords[s.id].concept,
          mission: _gradeRecords[s.id].mission,
          think:   _gradeRecords[s.id].think,
          absent:  _gradeRecords[s.id].absent || false,
          feedback: _gradeRecords[s.id].feedback || '',
          published: true, updatedAt: serverTimestamp(),
        }, { merge: true })
      ));
      await setDoc(doc(db, 'grade_publish_status', `${_gradeLessonKey}_${classNum}`), {
        published: true, publishedAt: serverTimestamp(), lessonKey: _gradeLessonKey, classNum,
      });
      _publishStatus[classNum] = true;
      updateSubtabPublishBadge(classNum, true);
    } catch(e) {
      alert(`${classNum}반 반영 실패: ${e.message}`);
    }
  }

  if (allBtn) { allBtn.disabled = false; allBtn.textContent = '전체 반 공개'; }
  const cur = _currentGradeClass && _currentGradeClass !== 'all' ? _currentGradeClass : null;
  renderGradePublishBar(cur);
  alert(`전체 ${unpublished.length}개 반 성적 반영 완료!`);
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
  addRowToGroup, addPageToGroup, ceShowAddMenu, deleteGroup, deleteRow, updateGroupTitle, ceToggleFmt,
  setLineFormat, toggleLabelPos, setLineFontSize,
  updateEventField, updateEventContent, addEvent, removeEvent,
  updateCompareField, updateCompareItems,
  updateStageField, addStage, removeStage,
  updateImageItem, addImageItem, removeImageItem,
  addFullImageSlide, deleteFullImage, addVideoSlide, updateVideoUrl,
  updateLesson, updateObjectives, updateLine, updateLineItems, updateThink,
  updateDive, updateDiveImg, toggleOpeningEnabled, toggleChosungEnabled, updateChosungEnabled, updateChosungItems, ceToggleLessonOpen,
  resetContent, saveContent, ceHandleFileUpload,
  onFsSliderInput, onFsNumberInput, onLhSliderInput, onLhNumberInput,
  onLsSliderInput, onLsNumberInput, onTwSliderInput, onTwNumberInput,
  onColorChange, resetDesign, saveDesign,
  openGradeFeedbackModal, closeGradeFeedbackModal, saveGradeFeedback,
  handleContentKeydown,
  openFeedbackTemplateModal, closeFeedbackTemplateModal,
  editFeedbackTemplate, resetTemplateForm, saveFeedbackTemplate, deleteFeedbackTemplate,
  applyFeedbackTemplate,
});

// 스크립트 최상위 const/let 선언이 모두 끝난 뒤에 호출해야 TDZ 에러가 안 난다.
initAdmin();

/* ════ 학생 관리 ════ */
{
  const stuRef = ref(rtdb, 'students');
  let stuList = [];
  let stuEditingId = null;
  let stuClsFilter = '';

  function stuParseClass(sid) {
    if (!sid || sid.length < 3) return null;
    const g = sid[0], c = parseInt(sid.slice(1, 3), 10);
    return isNaN(c) ? null : `${g}학년 ${c}반`;
  }

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
    tbody.innerHTML = filtered.map((s, i) => {
      if (stuEditingId === s.studentId) {
        return `<tr>
          <td style="color:var(--sub)">${i+1}</td>
          <td><input class="stu-edit-input" id="stu-edit-id" value="${stuEsc(s.studentId)}" maxlength="5" inputmode="numeric"></td>
          <td><input class="stu-edit-input" id="stu-edit-name" value="${stuEsc(s.studentName)}" onkeydown="if(event.key==='Enter') stuSaveEdit('${stuEsc(s.studentId)}','${stuEsc(s._key)}')"></td>
          <td class="stu-td-cls">${stuParseClass(s.studentId)||'—'}</td>
          <td><div class="stu-actions">
            <button class="stu-btn stu-btn-save" onclick="stuSaveEdit('${stuEsc(s.studentId)}','${stuEsc(s._key)}')">저장</button>
            <button class="stu-btn stu-btn-cancel" onclick="stuCancelEdit()">취소</button>
          </div></td>
        </tr>`;
      }
      return `<tr>
        <td style="color:var(--sub);font-size:13px">${i+1}</td>
        <td class="stu-td-id">${stuEsc(s.studentId)}</td>
        <td style="font-weight:600">${stuEsc(s.studentName)}</td>
        <td class="stu-td-cls">${stuParseClass(s.studentId)||'—'}</td>
        <td><div class="stu-actions">
          <button class="stu-btn stu-btn-edit" onclick="stuStartEdit('${stuEsc(s.studentId)}')">수정</button>
          <button class="stu-btn stu-btn-edit" onclick="stuResetPassword('${stuEsc(s.studentId)}','${stuEsc(s.studentName)}')" title="비밀번호 초기화">PW 초기화</button>
          <button class="stu-btn stu-btn-del" onclick="stuDelete('${stuEsc(s._key)}','${stuEsc(s.studentName)}')">삭제</button>
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
    if (!confirm(`⚠️ 전체 학생 명단(${stuList.length}명)을 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return;
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
  let annData  = { enabled: false, text: '' };
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

  function stApplyAnnouncementToggleUI() {
    const tog = document.getElementById('st-ann-toggle');
    if (tog) tog.classList.toggle('on', !!annData.enabled);
  }
  function stApplyLockdownToggleUI() {
    const tog = document.getElementById('st-lock-toggle');
    if (tog) tog.classList.toggle('on', !!lockData.enabled);
  }

  window.stSettingsToggleAnnouncement = async function() {
    annData.enabled = !annData.enabled;
    stApplyAnnouncementToggleUI();
    try { await setDoc(doc(db, 'settings', 'announcement'), { enabled: annData.enabled, text: annData.text || '' }); } catch(e) {}
  };

  window.stSettingsSaveAnnouncement = async function() {
    annData.text = document.getElementById('st-ann-text').value.trim();
    try {
      await setDoc(doc(db, 'settings', 'announcement'), { enabled: annData.enabled, text: annData.text });
      alert('저장되었습니다.');
    } catch(e) { alert('저장에 실패했습니다.'); }
  };

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
      out.textContent = counts.join(' · ');
    } catch(e) { out.textContent = '확인 중 오류가 발생했습니다.'; }
  };

  window.stSettingsCheckResetConfirm = function() {
    const val = document.getElementById('st-reset-confirm').value.trim();
    document.getElementById('st-reset-run-btn').disabled = (val !== '초기화');
  };

  // 문서가 많을 경우를 대비해 배치당 400건씩 끊어서 삭제한다(Firestore 배치 한도 500건).
  window.stSettingsRunReset = async function() {
    const target = stSelectedResetCollections();
    const result = document.getElementById('st-reset-result');
    if (!target.length) { result.textContent = '선택된 항목이 없습니다.'; return; }
    if (!confirm(`${target.map(c=>c.name).join(', ')}\n위 기록을 영구 삭제합니다. 계속할까요?`)) return;

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
      document.getElementById('st-reset-confirm').value = '';
    } catch(e) {
      result.textContent = '삭제 중 오류가 발생했습니다. 일부만 삭제됐을 수 있습니다.';
    } finally {
      btn.textContent = '선택한 기록 영구 삭제';
      btn.disabled = true;
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
      const [annSnap, lockSnap, menuSnap] = await Promise.all([
        getDoc(doc(db, 'settings', 'announcement')),
        getDoc(doc(db, 'settings', 'lockdown')),
        getDoc(doc(db, 'settings', 'menu_visibility')),
      ]);
      if (annSnap.exists())  annData  = { enabled: !!annSnap.data().enabled,  text: annSnap.data().text || '' };
      if (lockSnap.exists()) lockData = { enabled: !!lockSnap.data().enabled, message: lockSnap.data().message || '' };
      if (menuSnap.exists()) menuVis  = Object.assign({}, menuVis, menuSnap.data());
    } catch(e) {}
    document.getElementById('st-ann-text').value  = annData.text || '';
    document.getElementById('st-lock-text').value = lockData.message || '';
    stApplyAnnouncementToggleUI();
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
  function thStartLecListener() {
    if (thLecUnsub) thLecUnsub();
    thLecUnsub = onSnapshot(
      query(collection(db, 'think_lectures'), orderBy('createdAt', 'desc')),
      snap => {
        thLectures = snap.docs.map(d => ({ docId: d.id, ...d.data() }));
        thPopulateSelects();
        thRenderLecList();
        if (document.getElementById('panel-think-answer')?.classList.contains('active')) {
          thRenderAnswerLecture();
          thRenderAnswerClass();
          thRenderPick();
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
          if (sid && sname) list.push({ studentId: sid, studentName: sname });
        });
      }
      list.sort((a, b) => a.studentId.localeCompare(b.studentId));
      thStudents = list;
      thStudentsReady = true;
    }).catch(err => console.warn('[think] students:', err));
  }

  function thPopulateSelects() {
    ['th-sel-lec', 'th-sel-cls-lec', 'th-sel-pick'].forEach(id => {
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
    const gradeSel = document.getElementById('gradeThinkSel');
    if (gradeSel) {
      const cur = gradeSel.value;
      gradeSel.innerHTML = '<option value="">-- 연결 없음 (수동) --</option>';
      thLectures.forEach(l => {
        const o = document.createElement('option');
        o.value = l.docId; o.textContent = String(l.title||'').replace(/\*\*/g,'').replace(/[{}]/g,'');
        gradeSel.appendChild(o);
      });
      if (cur) gradeSel.value = cur;
    }
  }

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
    const data = { title, question, reference, isOpen: false, isArchived: false, createdAt: Date.now() };
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
    el.innerHTML = thLectures.map(lec => {
      const isOpen = lec.isOpen === true;
      return `
        <div class="th-lec-card">
          <div class="th-lec-title">${thEsc((lec.title||'').replace(/\*\*/g,'').replace(/[{}]/g,''))}</div>
          <div id="th-view-${lec.docId}">
            <div class="th-lec-actions">
              <div class="th-toggle ${isOpen?'on':''}" id="th-tog-${lec.docId}" title="${isOpen?'공개 중':'비공개'}" onclick="thToggleOpen('${lec.docId}',this)"></div>
              <span style="font-size:13px;font-weight:700;color:${isOpen?'var(--c3)':'var(--sub)'}" id="th-tog-lbl-${lec.docId}">${isOpen?'공개 중':'비공개'}</span>
              <button class="edit-btn" onclick="thToggleEdit('${lec.docId}',true)">수정</button>
              <button class="del-btn" onclick="thDeleteLecture('${lec.docId}','${thEsc(lec.title).replace(/'/g,"\\'")}')">삭제</button>
              <button class="edit-btn" onclick="thToggleMore('${lec.docId}')">자세히</button>
            </div>
            <div id="th-more-${lec.docId}" class="th-more-detail" style="display:none">
              <div class="th-detail-lbl">질문</div><div class="th-detail-val">${thEsc(lec.question)}</div>
              <div class="th-detail-lbl">설명</div><div class="th-detail-val">${thEsc(lec.reference||'없음')}</div>
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
      snap => { thSubs = snap.docs.map(d => ({ subId: d.id, ...d.data() })); cb(); },
      err => console.warn('[think] submissions:', err)
    );
  }

  function thFmtSubTime(ts) {
    const d = ts && ts.toDate ? ts.toDate() : (ts ? new Date(ts) : null);
    if (!d || isNaN(d)) return '';
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  }

  function thBuildAnswerCard(data, showMeta) {
    const isPicked = data.isPicked;
    const time = thFmtSubTime(data.createdAt);
    const meta = `${data.textLength||0}자${time?` · ${time} 제출`:''}`;
    return `
      <div class="th-answer-card">
        <div class="th-student-row">
          <span class="th-student-name">${thEsc(data.id)} ${thEsc(data.name)} <span class="th-student-meta">${meta}</span></span>
          <div class="th-answer-actions">
            <button class="edit-btn" style="${isPicked?'background:var(--c3-l);color:var(--c3)':''}" onclick="thTogglePick('${data.subId}')" title="PICK">★</button>
            <button class="del-btn" onclick="thDeleteSub('${data.subId}')">삭제</button>
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
    const classStu = thStudentsReady ? thStudents.filter(s => thClassNum(s.studentId) === clsNum) : [];
    const classSubs = thSubs.filter(s => s.lectureDocId === lecId && thClassNum(s.id) === clsNum);
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
    if (statsEl) {
      statsEl.style.display = '';
      statsEl.innerHTML = `
        <div class="th-stat-chip"><span class="th-num">${classSubs.length}${classStu.length?' / '+classStu.length:''}</span>제출 / ${cls}반</div>
        <div class="th-stat-chip"><span class="th-num">${classSubs.filter(s=>s.isPicked).length}</span>PICK</div>
        <div class="th-stat-chip clickable" onclick="thOpenGradeModalWithLoad('fail')">
          <span class="th-num" style="display:inline">${total?passCnt:'-'}</span><span style="font-size:14px;font-weight:800"> / </span><span class="th-num-red" style="display:inline">${total?failCnt:'-'}</span>
          <span style="display:block;font-size:12px;margin-top:2px">통과 / 미흡</span>
        </div>
        <div class="th-stat-chip clickable" onclick="thOpenGradeModalWithLoad('review')">
          <span class="th-num" style="font-size:14px">AI</span>채점
        </div>`;
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
    if (el) el.textContent = `${thGradeCtx.cls}반 · 통과 ${Math.max(0,total-fail)}명 / 미흡 ${fail}명 / 전체 ${total}명`;
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
      if (thActivityData.absent.length) html += `<div style="margin-bottom:14px"><div class="th-reason-hd">미제출 · ${thActivityData.absent.length}명</div><div>${thActivityData.absent.map(s=>`<span class="th-chip th-chip-absent">${s.studentId} ${s.studentName}</span>`).join('')}</div></div>`;
      if (thActivityData.short.length)  html += `<div style="margin-bottom:14px"><div class="th-reason-hd">50자 미만 · ${thActivityData.short.length}명</div><div>${thActivityData.short.map(s=>`<span class="th-chip th-chip-short">${s.id} ${s.name} <small style="opacity:.75">${s.textLength}자</small></span>`).join('')}</div></div>`;
      if (cheatFail.length)             html += `<div style="margin-bottom:14px"><div class="th-reason-hd">이탈 5회 이상 · ${cheatFail.length}명</div><div>${cheatFail.map(s=>`<span class="th-chip th-chip-cheat">${s.id} ${s.name}</span>`).join('')}</div></div>`;
      if (aiFail.length)                html += `<div><div class="th-reason-hd">AI 분석 미흡 · ${aiFail.length}명</div><div>${aiFail.map(s=>`<span class="th-chip th-chip-wrong">${s.id} ${s.name}</span>`).join('')}</div></div>`;
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
      const vColor = { '통과':'var(--c3)', '조금 미흡':'#B8860B' };
      const gradedN = subs.length - ungraded.length;
      let html = `<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;flex-wrap:wrap">
          <button class="th-btn-ai" ${ungraded.length?'':'disabled'} onclick="thRunGrading()">AI 채점 &amp; 포인트 지급${ungraded.length?` (미채점 ${ungraded.length})`:''}</button>
          ${gradedN ? `<button class="th-btn-ai" style="background:none;border:1.5px solid var(--hairline);color:var(--charcoal)" onclick="thRegrade()">재채점 (${gradedN}명)</button>` : ''}
          <span id="th-ai-status" style="font-size:13px;color:var(--sub);font-weight:700;min-height:18px"></span>
        </div>
        <p style="font-size:12px;color:var(--slate);margin-bottom:12px;line-height:1.6">채점하면 점수가 고정됩니다. 기준·모델을 바꿔 다시 매기려면 <b>재채점</b>을 누르세요(이전 포인트는 회수 후 재지급).</p>`;
      if (!subs.length) { body.innerHTML = html + '<div class="empty-panel">이 반의 제출이 없습니다.</div>'; return; }
      html += subs.map(s => {
        const v = s.aiVerdict || '';
        const chip = s.thGraded
          ? `<span style="font-weight:800;color:${v.startsWith('미흡')?'#DC2626':(vColor[v]||'var(--sub)')}">${v||'-'} · ${s.aiPt??0}pt</span>`
          : `<span style="color:var(--slate);font-weight:700">미채점</span>`;
        return `<div class="th-review-card">
            <div class="th-review-card-top">
              <span class="th-review-card-name">${thEsc(s.id)} ${thEsc(s.name)}</span>
              ${chip}
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
  };

  // AI 채점 & 포인트 지급: 아직 채점 안 된 제출만 채점한다(채점된 학생은 고정).
  // 0점=구조적 미흡(50자 미만/이탈 5회↑), 5점=AI 조금 미흡, 10~30=AI 품질 차등.
  window.thRunGrading = async function() {
    const { lecId, cls } = thGradeCtx;
    const lec = thLectures.find(l => l.docId === lecId);
    if (!lec) return;
    const clsNum = parseInt(cls, 10);
    const ungraded = (thSubs||[]).filter(s => s.lectureDocId === lecId && thClassNum(s.id) === clsNum && !s.thGraded);
    if (!ungraded.length) return;
    const statusEl = document.getElementById('th-ai-status');
    document.querySelectorAll('.th-btn-ai').forEach(b => b.disabled = true);
    await xpEnsureConfig();
    const maxPt = _xpCfg?.activities?.thinkCheck?.pt ?? 30;

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
    async function commit(s, pt, verdict, score) {
      if (pt > 0) {
        try { await adminAddXP(rtdb, s.id, s.name, pt, `생각 체크: ${lec.title}`, fbFns, _xpCfg.levels, _xpCfg.levelFormula); } catch (e) { console.warn(e); }
      }
      try {
        await updateDoc(doc(db, 'think_submissions', s.subId), {
          aiScore: score == null ? null : score, aiVerdict: verdict, aiPt: pt,
          xpAwarded: pt > 0, xpAwardedAt: serverTimestamp(), thGraded: true
        });
      } catch (e) {}
      const local = (thSubs || []).find(x => x.subId === s.subId);
      if (local) { local.aiScore = score == null ? null : score; local.aiVerdict = verdict; local.aiPt = pt; local.xpAwarded = pt > 0; local.thGraded = true; }
    }
    for (const { s, verdict } of structFail) await commit(s, 0, verdict, null);
    for (const s of needAi) {
      const q = quality[s.subId];
      let pt, verdict;
      if (q == null || q < 40) { pt = 5; verdict = '조금 미흡'; }
      else { pt = Math.max(10, Math.min(maxPt, Math.round(10 + (q - 40) / 60 * (maxPt - 10)))); verdict = '통과'; }
      await commit(s, pt, verdict, q == null ? null : q);
    }
    if (statusEl) statusEl.textContent = '';
    document.querySelectorAll('.th-btn-ai').forEach(b => b.disabled = false);
    thUpdateGradeSummary(); thRenderGradeBody(); window.thRenderAnswerClass();
  };

  // 재채점: 이미 채점된 제출의 점수를 초기화하고(지급된 포인트는 회수) 다시 채점한다.
  window.thRegrade = async function() {
    const { lecId, cls } = thGradeCtx;
    const lec = thLectures.find(l => l.docId === lecId);
    if (!lec) return;
    const clsNum = parseInt(cls, 10);
    const graded = (thSubs||[]).filter(s => s.lectureDocId === lecId && thClassNum(s.id) === clsNum && s.thGraded);
    if (!graded.length) return;
    if (!confirm(`${cls}반 ${graded.length}명의 채점을 초기화하고 다시 채점합니다.\n이미 지급된 포인트는 회수한 뒤 새 기준으로 재지급됩니다. 진행할까요?`)) return;

    const statusEl = document.getElementById('th-ai-status');
    document.querySelectorAll('.th-btn-ai').forEach(b => b.disabled = true);
    if (statusEl) statusEl.textContent = '이전 채점 초기화 중…';
    await xpEnsureConfig();

    for (const s of graded) {
      if (s.aiPt > 0) {
        try { await adminAddXP(rtdb, s.id, s.name, -s.aiPt, `생각 체크 재채점(이전 점수 회수): ${lec.title}`, fbFns, _xpCfg.levels, _xpCfg.levelFormula); } catch (e) { console.warn(e); }
      }
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
import { loadXPConfig, saveXPConfig, adminAddXP, DEFAULT_LEVELS, DEFAULT_FORMULA, DEFAULT_ACTIVITIES, calcLevel } from '../shared/xp.js';

const XP_ROOT = 'xp';
const ACT_LABELS = { attendance:'출석 체크', mileage:'히스토리 마일리지', thinkCheck:'생각 체크', typingReview:'타이핑 복습 (일일 1회)', oxQuiz:'OX 퀴즈 (일일 최대)' };
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

async function xpLoadStatus() {
  await xpEnsureConfig();
  const snap = await get(ref(rtdb, `${XP_ROOT}/students`));
  _xpStuAll  = snap.exists() ? (snap.val() || {}) : {};
  xpRenderStatus();
  xpPopulateClassFilter();
}

window.xpRenderStatus = function() {
  const filterCls = document.getElementById('xp-filter-class')?.value || '';
  let rows = Object.entries(_xpStuAll)
    .filter(([sid]) => !filterCls || sid.startsWith(filterCls));
  if (_xpSortMode === 'id') {
    rows.sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));
  } else {
    rows.sort((a, b) => (b[1].total || 0) - (a[1].total || 0));
  }
  const tbody = document.getElementById('xp-status-body');
  if (!tbody) return;
  if (!rows.length) { tbody.innerHTML = '<tr><td colspan="6" style="color:var(--slate);padding:24px;font-size:13px">데이터가 없습니다.</td></tr>'; return; }
  tbody.innerHTML = rows.map(([sid, s], i) => {
    const lv      = s.level || calcLevel(s.total || 0, _xpCfg?.levels, _xpCfg?.levelFormula);
    const lastAct = s.lastAttendance || s.lastMileage || '';
    const rank    = _xpSortMode === 'rank' ? `<span style="font-weight:700;color:var(--slate)">${i+1}</span>` : '-';
    return `<tr>
      <td>${rank}</td><td>${sid}</td><td>${s.name || ''}</td>
      <td><span style="font-weight:700;color:var(--amber-d)">Lv.${lv}</span></td>
      <td style="font-weight:700">${(s.total||0).toLocaleString()} pt</td>
      <td style="font-size:12px;color:var(--slate)">${lastAct}</td>
    </tr>`;
  }).join('');
};

function xpPopulateClassFilter() {
  const sel = document.getElementById('xp-filter-class');
  if (!sel) return;
  const classes = [...new Set(Object.keys(_xpStuAll).map(s => s.slice(0,4)))].sort();
  const cur = sel.value;
  sel.innerHTML = '<option value="">전체 반</option>' + classes.map(c => `<option value="${c}"${c===cur?' selected':''}>${c}</option>`).join('');
}

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
  // 레벨 기준
  const lvInput = document.getElementById('xp-levels-input');
  if (lvInput) lvInput.value = (_xpCfg.levels || DEFAULT_LEVELS).join(', ');
  const lgInput = document.getElementById('xp-lastgap-input');
  if (lgInput) lgInput.value = _xpCfg.levelFormula?.lastGap ?? 550;
  const incInput = document.getElementById('xp-increment-input');
  if (incInput) incInput.value = _xpCfg.levelFormula?.increment ?? 25;
}

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
  const raw = document.getElementById('xp-levels-input')?.value || '';
  const lvls = raw.split(/[,\s]+/).map(Number).filter(n => !isNaN(n));
  if (!lvls.length || lvls[0] !== 0) { alert('첫 값은 반드시 0이어야 합니다.'); return; }
  _xpCfg.levels              = lvls;
  _xpCfg.levelFormula        = _xpCfg.levelFormula || {};
  _xpCfg.levelFormula.lastGap     = Number(document.getElementById('xp-lastgap-input')?.value) || 550;
  _xpCfg.levelFormula.increment   = Number(document.getElementById('xp-increment-input')?.value) || 25;
  await saveXPConfig(rtdb, _xpCfg, fbFns);
  alert('레벨 기준이 저장되었습니다.');
};

// ── MANUAL ──
let _xpAllStudents = [];

async function xpManualLoadStudents() {
  const snap = await get(ref(rtdb, 'students'));
  if (!snap.exists()) return;
  _xpAllStudents = Object.values(snap.val() || {})
    .filter(s => s && (s.studentId || s.id))
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
    `<div style="padding:10px 14px;cursor:pointer;font-size:14px;border-bottom:1px solid var(--hairline-soft)" onmousedown="xpManualSelect('${s.sid}','${s.name}')">${s.sid} · ${s.name}</div>`
  ).join('');
};

window.xpManualSelect = function(sid, name) {
  _xpManSel = { sid, name };
  document.getElementById('xp-manual-search').value = `${sid} · ${name}`;
  document.getElementById('xp-manual-dropdown').style.display = 'none';
  const tgt = document.getElementById('xp-manual-target');
  tgt.style.display = '';
  tgt.textContent   = `선택: ${sid} · ${name}`;
};

window.xpManualAward = async function() {
  if (!_xpManSel) { alert('학생을 먼저 선택하세요.'); return; }
  const pt   = Number(document.getElementById('xp-manual-pt')?.value) || 0;
  const note = document.getElementById('xp-manual-note')?.value.trim() || '수동 지급';
  if (!pt) { alert('XP 양을 입력하세요.'); return; }
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
    return `<tr><td style="font-size:12px;color:var(--slate)">${dt}</td><td>${r.sid}</td><td>${r.name}</td><td style="font-weight:700;color:${r.pt>0?'var(--success)':'var(--critical)'}">${sign}${r.pt}</td><td style="font-size:12px">${r.note||''}</td></tr>`;
  }).join('') || '<tr><td colspan="5" style="color:var(--slate);padding:16px;font-size:13px">내역 없음</td></tr>';
}

