
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, collection, query, orderBy, where, onSnapshot, getDocs,
  doc, getDoc, setDoc, addDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getDatabase, ref as rtdbRef, get as rtdbGet, set as rtdbSet, push as rtdbPush, update as rtdbUpdate, onValue as rtdbOnValue } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { initAuth, verifyStudentId, verifyStudentName, isStudentMapLoaded } from "../shared/auth.js";
import "../shared/offline.js";
import { firebaseConfig } from "../shared/firebase-config.js";
import { initXP, onXPChange, checkAndAddAttendance, calcLevel, calcNextThreshold } from "../shared/xp.js";
import { findBadWord } from "../shared/profanity.js";
import { icon } from "../shared/icons.js";

// 생각 체크 AI 도움(힌트·제출 전 점검)은 이 프록시를 통해서만 Claude를 호출한다.
// 키는 서버(Secret Manager)에 있고, functions/index.js의 ALLOWED_ORIGINS에 등록된 origin만 통과한다.
const CLAUDE_PROXY_URL = 'https://asia-northeast3-ho0911seong-56638.cloudfunctions.net/claudeProxy';

const app  = initializeApp(firebaseConfig);
const db   = getFirestore(app);
const rtdb = getDatabase(app);
initAuth(rtdb);

// ── 접속 제한(점검 모드): 로그인 여부와 무관하게 즉시 화면을 가린다 ──
onSnapshot(doc(db, 'settings', 'lockdown'), snap => {
  const d = snap.exists() ? snap.data() : {};
  const screen = document.getElementById('lockdownScreen');
  if (d.enabled) {
    document.getElementById('lockdownMsg').textContent = d.message || '잠시 후 다시 접속해 주세요.';
    screen.style.display = 'flex';
  } else {
    screen.style.display = 'none';
  }
}, () => {});

// ── 공지사항 배너 ──
onSnapshot(doc(db, 'settings', 'announcement'), snap => {
  const d = snap.exists() ? snap.data() : {};
  const banner = document.getElementById('announceBanner');
  if (d.enabled && d.text) {
    const html = esc(d.text)
      .replace(/\n/g, '<br>')
      .replace(/https?:\/\/[^\s<&]+/g, url => `<a href="${url}" target="_blank" rel="noopener" style="color:inherit;text-decoration:underline;font-weight:700">${url}</a>`);
    banner.innerHTML = html;
    banner.style.display = 'block';
  } else {
    banner.style.display = 'none';
  }
}, () => {});

// ── 메뉴 노출 설정 ──
let _menuVisibility = {};
onSnapshot(doc(db, 'settings', 'menu_visibility'), snap => {
  _menuVisibility = snap.exists() ? snap.data() : {};
  renderAll();
}, () => {});
function menuVisible(key) { return _menuVisibility[key] !== false; }

// 컬럼/3열로 보이는 3개 섹션 (성적·마일리지·각종 콘텐츠는 별도 블록으로 처리)
const SECTIONS = [
  { key:'concept',  name:'개념 Check', cls:'s-concept', nodeId:'secConcept' },
  { key:'mission',  name:'미션 Check', cls:'s-mission', nodeId:'secMission' },
  { key:'think',    name:'생각 Check', cls:'s-think',   nodeId:'secThink'   },
];

// 모바일 여부 — PC(4단 그리드) / 모바일(세로)에서 섹션 동작이 다르다
const mqMobile = window.matchMedia('(max-width:960px)');
mqMobile.addEventListener('change', renderAll);

const idInput    = document.getElementById('idInput');
const nameInput  = document.getElementById('nameInput');
const pwInput    = document.getElementById('pwInput');
const statusArea = document.getElementById('statusArea');
const enterBtn   = document.getElementById('enterBtn');

let _pendingId = '', _pendingName = '';
let _matched = false;                 // 학번+이름이 명단과 조용히 일치하는지 (에러는 표시하지 않음)
let _hasPw = false, _storedPw = null, _pwChecked = false, _pwAttemptFailed = false;
let _pwLookupToken = 0;               // 입력이 바뀌면 이전 비밀번호 조회 결과를 무시
let currentStudentId   = sessionStorage.getItem('lms_sid')   || '';
let currentStudentName = sessionStorage.getItem('lms_sname') || '';

const _savedSid   = localStorage.getItem('lms_autosave_sid');
const _savedSname = localStorage.getItem('lms_autosave_sname');

if (currentStudentId && currentStudentName) {
  checkConsentThenEnter(currentStudentId, currentStudentName);
} else if (_savedSid && _savedSname) {
  document.getElementById('autosaveAvatar').textContent    = _savedSname.charAt(0);
  document.getElementById('autosaveName').textContent      = _savedSname;
  document.getElementById('autosaveStudentId').textContent = `학번 ${_savedSid}`;
  document.getElementById('autoSaveCard').style.display    = 'flex';
  document.getElementById('normalLoginForm').style.display = 'none';
}

document.getElementById('autoEnterBtn').addEventListener('click', () => {
  sessionStorage.setItem('lms_sid',   _savedSid);
  sessionStorage.setItem('lms_sname', _savedSname);
  currentStudentId   = _savedSid;
  currentStudentName = _savedSname;
  checkConsentThenEnter(_savedSid, _savedSname);
});

document.getElementById('autosaveResetBtn').addEventListener('click', () => {
  localStorage.removeItem('lms_autosave_sid');
  localStorage.removeItem('lms_autosave_sname');
  document.getElementById('autoSaveCard').style.display    = 'none';
  document.getElementById('normalLoginForm').style.display = 'flex';
});

// ── 로그인 ──
// 입력 중엔 학번/이름 일치 여부를 표시하지 않고(스펙 1·2), 조용히 명단과 대조해
// "맞을 때만" 비밀번호 안내(설정/입력)를 띄운다(스펙 3·4·5). 최종 검증은 로그인 버튼에서만.

// 비밀번호는 SHA-256(학번 salt) 해시로 저장한다. 기존 평문은 로그인 성공 시 해시로 자동 업그레이드.
async function hashPw(pw, salt) {
  const data = new TextEncoder().encode(`lms:${salt}:${pw}`);
  const buf  = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}
const isHash = v => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);
async function pwMatches(input, stored, salt) {
  if (stored == null) return false;
  return isHash(stored) ? (await hashPw(input, salt)) === stored : input === stored; // 평문(legacy) 호환
}

function setStatusLine(line) {
  statusArea.innerHTML = line
    ? `<div class="status-line ${line.type}"><span class="status-icon">${line.icon}</span>${esc(line.text)}</div>` : '';
}

function updateLoginUI() {
  let line = null;
  if (_matched && _pwChecked) {
    if (_hasPw) {
      line = _pwAttemptFailed
        ? { type:'err',  icon:'✕',  text:'비밀번호가 틀렸습니다. 다시 입력해 주세요.' }
        : { type:'info', icon:'🔒', text:'비밀번호를 입력하세요.' };
    } else {
      line = { type:'ok', icon:'✓', text:'처음이시네요! 사용할 비밀번호를 설정하세요 (4자 이상).' };
    }
  } else if (_matched && !_pwChecked) {
    line = { type:'muted', icon:'·', text:'확인 중…' };
  }
  // 명단과 안 맞으면 아무것도 표시하지 않는다(스펙대로). 에러는 로그인 버튼에서만.
  setStatusLine(line);
  pwInput.classList.toggle('error', _pwAttemptFailed);
  pwInput.disabled = !_matched;
  enterBtn.disabled = !(idInput.value.trim() && nameInput.value.trim());
}

// 조용한 명단 대조 + 비밀번호 존재 여부 조회
async function refreshCreds() {
  _pendingId   = idInput.value.trim();
  _pendingName = nameInput.value.trim();
  _pwAttemptFailed = false;

  const idRes   = verifyStudentId(_pendingId);
  const nameRes = idRes.ok ? verifyStudentName(_pendingId, _pendingName) : { ok:false };
  _matched = !!(idRes.ok && nameRes.ok && _pendingName);

  if (!_matched) {
    _pwChecked = false; _hasPw = false; _storedPw = null;
    pwInput.value = '';
    updateLoginUI();
    return;
  }

  const token = ++_pwLookupToken;
  _pwChecked = false;
  updateLoginUI();                       // "확인 중…"
  let hasPw = false, stored = null;
  try {
    const snap = await getDoc(doc(db, 'lms_auth', _pendingId));
    if (snap.exists() && snap.data().pw) { hasPw = true; stored = snap.data().pw; }
  } catch(_) {}
  if (token !== _pwLookupToken) return;  // 그 사이 입력이 바뀌었으면 결과 무시
  _hasPw = hasPw; _storedPw = stored; _pwChecked = true;
  updateLoginUI();
}

idInput.addEventListener('input', () => {
  const v = idInput.value.replace(/\D/g, '');
  if (idInput.value !== v) idInput.value = v;
  refreshCreds();
});
nameInput.addEventListener('input', refreshCreds);
pwInput.addEventListener('input', () => { _pwAttemptFailed = false; updateLoginUI(); });

// 명단이 로그인 화면보다 늦게 로드될 수 있으므로, 로드되면 한 번 다시 대조한다.
(function waitRoster() {
  if (isStudentMapLoaded()) { refreshCreds(); return; }
  setTimeout(waitRoster, 200);
})();

[idInput, nameInput, pwInput].forEach(el => {
  el.addEventListener('keydown', e => { if (e.key === 'Enter' && !enterBtn.disabled) enterBtn.click(); });
});

enterBtn.addEventListener('click', async () => {
  const id   = idInput.value.trim();
  const name = nameInput.value.trim();
  if (!id || !name) return;

  // 1) 로그인 버튼을 눌렀을 때만 명단을 검증하고 에러를 표시한다(스펙 1·2).
  const idRes = verifyStudentId(id);
  if (!idRes.ok) {
    setStatusLine({ type:'err', icon:'✕',
      text: idRes.reason === 'format' ? '학번은 숫자 5자리입니다.' : '학번 또는 이름을 확인해 주세요.' });
    return;
  }
  const nameRes = verifyStudentName(id, name);
  if (!nameRes.ok) {
    setStatusLine({ type:'err', icon:'✕', text:'학번 또는 이름을 확인해 주세요.' });
    return;
  }
  const registeredName = nameRes.registeredName || name;

  // 2) 비밀번호 확인/설정 (조회 결과가 아직이면 여기서 한 번 더 읽는다)
  let hasPw = _hasPw, stored = _storedPw;
  if (!_pwChecked || _pendingId !== id) {
    try {
      const snap = await getDoc(doc(db, 'lms_auth', id));
      hasPw  = snap.exists() && !!snap.data().pw;
      stored = hasPw ? snap.data().pw : null;
    } catch(_) {}
  }
  const pw = pwInput.value;
  if (hasPw) {
    if (!(await pwMatches(pw, stored, id))) {
      _pwAttemptFailed = true; updateLoginUI(); pwInput.focus(); return;
    }
    if (!isHash(stored)) {                 // 평문 → 해시로 업그레이드
      try { await setDoc(doc(db, 'lms_auth', id), { pw: await hashPw(pw, id) }); } catch(_) {}
    }
  } else {
    if (pw.length < 4) {
      setStatusLine({ type:'err', icon:'✕', text:'비밀번호를 4자 이상으로 설정해 주세요.' });
      pwInput.focus(); return;
    }
    try { await setDoc(doc(db, 'lms_auth', id), { pw: await hashPw(pw, id) }); } catch(_) {}
  }

  // 3) 세션 저장 + 자동 로그인 + 진입 (첫 로그인이면 진입 흐름에서 개인정보 동의)
  sessionStorage.setItem('lms_sid',   id);
  sessionStorage.setItem('lms_sname', registeredName);
  if (document.getElementById('autosaveCheck')?.checked) {
    localStorage.setItem('lms_autosave_sid',   id);
    localStorage.setItem('lms_autosave_sname', registeredName);
  } else {
    localStorage.removeItem('lms_autosave_sid');
    localStorage.removeItem('lms_autosave_sname');
  }
  currentStudentId   = id;
  currentStudentName = registeredName;
  checkConsentThenEnter(id, registeredName);
});

// ── 비밀번호 초기화 안내 (학생 자가 재설정 없음 · 교사만 초기화) ──
document.getElementById('forgotPwBtn').addEventListener('click', () => {
  document.getElementById('pwResetHelpModal').style.display = 'flex';
});
document.getElementById('pwHelpClose').addEventListener('click', () => {
  document.getElementById('pwResetHelpModal').style.display = 'none';
});
document.getElementById('pwResetHelpModal').addEventListener('click', e => {
  if (e.target.id === 'pwResetHelpModal') e.currentTarget.style.display = 'none';
});

// ── 개인정보 동의 ──
async function checkConsentThenEnter(id, name) {
  try {
    const snap = await getDoc(doc(db, 'lms_consent', id));
    if (snap.exists()) { enterHub(id, name); return; }
  } catch(_) { enterHub(id, name); return; }
  showConsentPopup(id, name);
}

function showConsentPopup(id, name) {
  document.getElementById('loginScreen').style.display  = 'none';
  document.getElementById('consentPopup').style.display = 'flex';
  document.getElementById('consentAgreeBtn').onclick = async () => {
    try { await setDoc(doc(db, 'lms_consent', id), { agreedAt: serverTimestamp(), name }); } catch(_) {}
    document.getElementById('consentPopup').style.display = 'none';
    enterHub(id, name);
  };
  document.getElementById('consentDenyBtn').onclick = () => {
    alert('개인정보 수집 및 이용에 동의하지 않으면 학습 공간을 이용할 수 없습니다.');
    document.getElementById('consentPopup').style.display = 'none';
    document.getElementById('loginScreen').style.display  = 'flex';
    sessionStorage.removeItem('lms_sid'); sessionStorage.removeItem('lms_sname');
  };
}

// ── 허브 진입 ──
function enterHub(id, name) {
  currentStudentId   = id;
  currentStudentName = name;
  document.getElementById('loginScreen').style.display   = 'none';
  document.getElementById('consentPopup').style.display  = 'none';
  document.getElementById('mainHub').style.cssText = 'display:flex;flex-direction:column';
  document.getElementById('studentChip').innerHTML = `<span class="chip-id">${esc(id)}</span><span class="chip-name">${esc(name)}</span>`;
  document.getElementById('welcomeMsg').textContent  = `${name} 학생, 오늘도 즐거운 역사 학습!`;
  document.getElementById('logoutBtn').addEventListener('click', () => {
    sessionStorage.removeItem('lms_sid'); sessionStorage.removeItem('lms_sname'); location.reload();
  });
  startListening();
  _initXPForStudent(id, name);
  _listenMileage(id);
}

// ── 역사 열공 마일리지 누적 일수 (hismile 앱과 공유하는 RTDB 경로) ──
function _listenMileage(id) {
  rtdbOnValue(rtdbRef(rtdb, `historyMileage/mileage/${id}`), snap => {
    _mileageDays = snap.exists() ? (snap.val() || 0) : 0;
    renderMileageBlock();
  }, () => { _mileageDays = 0; renderMileageBlock(); });
}

async function _initXPForStudent(id, name) {
  const fbFns = { ref: rtdbRef, get: rtdbGet, set: rtdbSet, push: rtdbPush, update: rtdbUpdate, onValue: rtdbOnValue };
  await initXP(rtdb, id, name, fbFns);
  onXPChange(_updateXPWidget);
  document.getElementById('xpWidget').style.display = 'flex';
  const result = await checkAndAddAttendance();
  if (result) {
    _showXPFloat(result.pt);
    if (result.levelUp) _showLevelUpModal(result.newLevel);
  }
}

function _updateXPWidget(state) {
  const total = state.total || 0;
  const lv    = state.level || 1;
  const next  = calcNextThreshold(total);
  const lvls  = [0,100,225,375,550,750,975,1225,1500,1800,2125,2475,2850,3250,3675,4125,4600,5100,5625,6175];
  let lvStart;
  if (lv <= lvls.length) {
    lvStart = lvls[lv - 1];
  } else {
    lvStart = lvls[lvls.length - 1];
    let gap = 550; let cur = lvls.length;
    while (cur < lv) { lvStart += gap; gap += 25; cur++; }
  }
  const span = next - lvStart;
  const pct  = span > 0 ? Math.round(((total - lvStart) / span) * 100) : 100;
  document.getElementById('xpLevelText').textContent = `Lv.${lv}`;
  document.getElementById('xpBarLabel').textContent  = `${total} pt`;
  document.getElementById('xpBarFill').style.width   = `${Math.min(pct, 100)}%`;
  document.getElementById('xpHistTotal').textContent = `${total} pt`;
  document.getElementById('xpHistLevel').textContent = `Lv.${lv}`;
}

const ACT_ICONS = { attendance:'📅', mileage:'🏃', conceptCheck:'📖', thinkCheck:'💭', oxQuiz:'❓', manual:'✏️' };

// 데스크톱: 클릭 시 경험치 내역 모달 / 모바일: 인라인 아코디언 펼침
// 모바일도 PC처럼 모달로 연다(인라인 아코디언은 닫아도 내용이 남고 스크롤이 지저분해 폐기).
document.getElementById('xpWidget').addEventListener('click', () => _openXPHistory());

async function _fetchXPRows() {
  const snap = await rtdbGet(rtdbRef(rtdb, `xp/students/${currentStudentId}/history`));
  if (!snap.exists()) return [];
  return Object.values(snap.val()).sort((a, b) => (b.ts || 0) - (a.ts || 0));
}

function _xpItemHTML(r) {
  const d  = new Date(r.ts || 0);
  const dt = `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  const icon = ACT_ICONS[r.type] || '⭐';
  const sign = r.pt > 0 ? '+' : '';
  const isSnack = r.pt >= 30 && /^생각\s*체크\s*:/.test(r.note || '');
  // 강의 제목에 섞인 마크다운 강조(**...**) 표시는 내역에선 그대로 노출되므로 제거한다.
  const note = String(r.note || r.type || '활동').replace(/\*\*/g, '');
  return `<div class="xp-hist-item">
    <div class="xp-hist-icon">${icon}</div>
    <div class="xp-hist-info">
      <div class="xp-hist-note">${esc(note)}</div>
      <div class="xp-hist-date">${dt}</div>
      ${isSnack ? `<div class="xp-hist-snack">🍬 선생님께 간식을 받으러 오세요</div>` : ''}
    </div>
    <div class="xp-hist-pt">${sign}${r.pt} pt</div>
  </div>`;
}

async function _openXPHistory() {
  const modal = document.getElementById('xpHistoryModal');
  modal.classList.add('open');
  const list = document.getElementById('xpHistList');
  list.innerHTML = '<div style="padding:24px;text-align:center;color:#9CA3AF;font-size:13px">로딩 중...</div>';
  try {
    const rows = await _fetchXPRows();
    document.getElementById('xpHistCount').textContent = rows.length;
    list.innerHTML = rows.length
      ? rows.map(_xpItemHTML).join('')
      : '<div style="padding:24px;text-align:center;color:#9CA3AF;font-size:13px">활동 내역이 없어요.</div>';
  } catch(e) {
    list.innerHTML = '<div style="padding:24px;text-align:center;color:#9CA3AF;font-size:13px">내역을 불러올 수 없어요.</div>';
  }
}

// 모바일: 경험치 위젯 아코디언 (펼치면 내역을 인라인으로 표시)
window._closeXPHistory = function() {
  document.getElementById('xpHistoryModal').classList.remove('open');
};

function _showLevelUpModal(level) {
  document.getElementById('xpModalLevel').textContent = level;
  document.getElementById('xpLevelUpModal').classList.add('open');
}

function _showXPFloat(pt) {
  const el = document.createElement('div');
  el.className = 'xp-float';
  el.textContent = `+${pt} pt`;
  const widget = document.getElementById('xpWidget');
  const rect   = widget ? widget.getBoundingClientRect() : { left: window.innerWidth / 2, top: 60 };
  el.style.left = `${rect.left + 20}px`;
  el.style.top  = `${rect.top}px`;
  document.body.appendChild(el);
  el.addEventListener('animationend', () => el.remove());
}

// ── 섹션 데이터 ──
const sectionData  = { concept:null, mission:null, think:null, grade:null, contents:null };
let _mileageDays = null;   // 역사 열공 마일리지 누적 일수
let _openListKey = null;   // 모바일: 현재 열려 있는 섹션 목록 모달의 key (실시간 갱신 시 재렌더용)
let _gradeAccOpen = false; // 모바일: 성적 아코디언 펼침 상태 (실시간 갱신 시에도 유지)
// 허브 아이콘은 이미 강 번호를 원 안에 크게 보여주므로, 라벨 앞의 "24강." 같은 중복 번호는 뗀다.
// 제목 원문에 섞인 편집 문법(**강조**, {빈칸})은 학생 화면에 텍스트로 보일 땐 떼어낸다.
function stripEmph(t) { return String(t || '').replace(/\*\*/g, '').replace(/[{}]/g, ''); }
function stripLecNum(t) { const s = stripEmph(t); return s.replace(/^\s*\d+\s*강\.?\s*/, '').trim() || s; }
// hismile(역사 열공 마일리지)은 전용 마일리지 버튼으로 노출하므로 미션/콘텐츠 카드 목록에서는 제외한다.
function notHismile(x) { return !/hismile/i.test(x.url || ''); }

function startListening() {
  ['concept','mission','think','grade','contents'].forEach(k => sectionData[k] = null);
  renderAll();

  // 1. 개념 체크 — class_lessons
  onSnapshot(query(collection(db, 'class_lessons'), orderBy('order','desc')), snap => {
    // 비공개(isOpen===false)는 생각 체크처럼 허브에서 아예 숨긴다(흐린 잠금 표시 안 함).
    sectionData.concept = snap.docs
      .filter(d => d.data().isOpen !== false)
      .map(d => {
        const l = d.data();
        return { icon: l.num, label: stripLecNum(l.title), sublabel: l.unit, num: l.num, isConcept: true, locked: false };
      });
    renderAll();
  });

  // 2. 미션 체크 — cards filtered by settings/lms_config.mission_category
  getDoc(doc(db, 'settings', 'lms_config')).then(cfg => {
    const cat = cfg.exists() ? (cfg.data().mission_category || '') : '';
    if (!cat) { sectionData.mission = []; renderAll(); return; }
    onSnapshot(query(collection(db, 'cards'), where('category','==', cat)), snap => {
      sectionData.mission = snap.docs
        .map(d => { const data = d.data(); return { docId: d.id, ...data, label: data.title || data.label, url: resolveAppUrl(data.url) }; })
        .filter(x => notHismile(x) && x.locked !== true) // 비공개(locked)는 생각 체크처럼 허브에서 숨긴다
        .sort((a, b) => (b.order ?? -1) - (a.order ?? -1)); // 최신(order 큰 것)이 위로
      renderAll();
    });
  }).catch(() => { sectionData.mission = []; renderAll(); });

  // 3. 생각 체크 — open lectures
  onSnapshot(query(collection(db, 'think_lectures'), where('isOpen','==', true)), snap => {
    function extractNum(title) { const m = String(title).match(/(\d+)/); return m ? parseInt(m[1], 10) : 9999; }
    sectionData.think = snap.docs
      .map(d => {
        const l = d.data();
        const n = extractNum(l.title);
        return { icon: l.icon || (n < 9999 ? String(n) : '?'), label: stripLecNum(l.title), locked:false,
          isThink:true, lectureDocId:d.id, lectureTitle:l.title,
          question:l.question||'', reference:l.reference||'', _n: n };
      })
      .sort((a, b) => b._n - a._n);
    renderAll();
  });

  // 4. 성적 확인 — grade_records 기반 계산
  loadStudentGrade();

  // 5. 각종 콘텐츠 — cards filtered by settings/lms_config.contents_category (미션 체크와 동일한 구조)
  getDoc(doc(db, 'settings', 'lms_config')).then(cfg => {
    const cat = cfg.exists() ? (cfg.data().contents_category || '') : '';
    if (!cat) { sectionData.contents = []; renderAll(); return; }
    onSnapshot(query(collection(db, 'cards'), where('category','==', cat)), snap => {
      sectionData.contents = snap.docs
        .map(d => { const data = d.data(); return { docId: d.id, ...data, label: data.title || data.label, url: resolveAppUrl(data.url), openInModal: !!data.openInModal }; })
        .filter(x => notHismile(x) && x.locked !== true) // 비공개(locked)는 생각 체크처럼 허브에서 숨긴다
        .sort((a, b) => (b.order ?? -1) - (a.order ?? -1)); // 최신(order 큰 것)이 위로
      renderAll();
    });
  }).catch(() => { sectionData.contents = []; renderAll(); });
}

// ── 렌더링 (단일 DOM을 CSS 그리드로 PC 4단 / 모바일 세로로 리플로우) ──
function renderAll() {
  renderSections();
  renderGradeBlock();
  renderMileageBlock();
  renderContentsBlock();
  // 모바일 목록 모달이 열린 채 실시간 데이터가 갱신되면 모달 내용도 같이 새로고침
  if (_openListKey && document.getElementById('sectionListModal').style.display === 'flex') openSectionList(_openListKey);
}

// ── 성적 체크 계산 ──
async function loadStudentGrade() {
  sectionData.grade = null;
  renderAll();
  try {
    const settingsSnap = await getDoc(doc(db, 'grade_settings', 'config'));
    if (!settingsSnap.exists()) { sectionData.grade = { _summary: false }; renderAll(); return; }
    const { selectedLectures = [], bands = [] } = settingsSnap.data();
    if (!selectedLectures.length || !bands.length) { sectionData.grade = { _summary: false }; renderAll(); return; }

    // 학생 반 번호
    const classNum = Math.floor((parseInt(currentStudentId) - 30000) / 100);

    // 강의별 반영 여부 확인
    const publishChecks = await Promise.all(selectedLectures.map(async key => {
      try {
        const snap = await getDoc(doc(db, 'grade_publish_status', `${key}_${classNum}`));
        return { key, published: snap.exists() && snap.data().published === true };
      } catch { return { key, published: false }; }
    }));
    const publishedSet = new Set(publishChecks.filter(p => p.published).map(p => p.key));

    // 강의별 설정 + 성적 기록 로드
    const enabledMap = {}, titleMap = {}, records = {};
    await Promise.all(selectedLectures.map(async key => {
      try {
        const [cfgSnap, recSnap] = await Promise.all([
          getDoc(doc(db, 'grade_lecture_config', key)),
          getDoc(doc(db, 'grade_records', `${key}_${currentStudentId}`)),
        ]);
        const d = cfgSnap.exists() ? cfgSnap.data() : {};
        enabledMap[key] = {
          concept: d.conceptEnabled !== false,
          mission: d.missionEnabled !== false,
          think:   d.thinkEnabled   !== false,
        };
        titleMap[key] = d.lessonTitle || `${key}강`;
        if (recSnap.exists()) records[key] = recSnap.data();
      } catch {
        enabledMap[key] = { concept:true, mission:true, think:true };
        titleMap[key] = `${key}강`;
      }
    }));

    let cA=0, cN=0, mA=0, mN=0, tA=0, tN=0;
    const lectureDetails = [];

    selectedLectures.forEach(key => {
      if (!publishedSet.has(key)) return; // 미반영 강의 제외
      const r  = records[key];
      const en = enabledMap[key];
      if (en.concept) { cN++; if (r?.concept?.achieved) cA++; }
      if (en.mission) { mN++; if (r?.mission?.achieved) mA++; }
      if (en.think)   { tN++; if (r?.think?.achieved)   tA++; }
      lectureDetails.push({
        key, title: titleMap[key],
        concept: { achieved: en.concept && !!(r?.concept?.achieved), enabled: en.concept },
        mission: { achieved: en.mission && !!(r?.mission?.achieved), enabled: en.mission },
        think:   { achieved: en.think   && !!(r?.think?.achieved),   enabled: en.think   },
        feedback: r?.feedback || '',
      });
    });

    function calcScore(achieved, total, type) {
      if (!total) return { achieved:0, total:0, pct:0, score:0 };
      const pct  = Math.round(achieved / total * 100);
      const band = bands.find(b => pct >= b.min) || bands[bands.length - 1];
      return { achieved, total, pct, score: band ? (band[type] || 0) : 0 };
    }

    const concept = calcScore(cA, cN, 'concept');
    const mission = calcScore(mA, mN, 'mission');
    const think   = calcScore(tA, tN, 'think');
    const maxScore = (bands[0]?.concept || 0) + (bands[0]?.mission || 0) + (bands[0]?.think || 0);
    const totalPublished = publishedSet.size;

    sectionData.grade = {
      _summary: true,
      concept, mission, think,
      total: concept.score + mission.score + think.score,
      max: maxScore,
      lectureDetails,
      totalPublished,
      totalSelected: selectedLectures.length,
    };
  } catch(e) {
    sectionData.grade = { _summary: false };
  }
  renderAll();
  _maybeNotifyFeedback();
}

// ── 간단 토스트 ──
function showToast(msg, duration) {
  let el = document.getElementById('lmsToast');
  if (!el) { el = document.createElement('div'); el.id = 'lmsToast'; el.className = 'lms-toast'; document.body.appendChild(el); }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), duration || 5000);
}

// ── 새 선생님 피드백 감지 (입장 시 1회 토스트) ──
function _feedbackSig(g) {
  if (!g || !g.lectureDetails) return '';
  return g.lectureDetails.filter(d => d.feedback).map(d => `${d.key}:${d.feedback}`).join('||');
}
let _fbToastShown = false;
function _maybeNotifyFeedback() {
  if (_fbToastShown) return;
  const sig = _feedbackSig(sectionData.grade);
  if (!sig) return;
  let seen = '';
  try { seen = localStorage.getItem('lms_seen_fb_' + currentStudentId) || ''; } catch(_) {}
  if (sig !== seen) {
    _fbToastShown = true;
    showToast('📩 새 선생님 피드백이 있어요 · 성적에서 확인하세요');
  }
}

function renderGradeSummaryHTML(g) {
  if (!g._summary) return `<div class="grade-no-data">성적 정보가 없습니다</div>`;
  if (g.totalPublished === 0) {
    return `<div class="grade-pending">아직 반영된 성적이 없습니다.<br>선생님이 반영 후 확인 가능합니다.</div>`;
  }
  const col = (label, cls, d) =>
    `<div class="grade-col">
      <span class="grade-col-label ${cls}">${label}</span>
      <span class="grade-col-frac">${d.total ? `${d.achieved}/${d.total}` : '—'}</span>
      <span class="grade-col-pct">${d.total ? d.pct + '%' : '—'}</span>
      <div style="display:flex;align-items:baseline;gap:2px">
        <span class="grade-col-score">${d.total ? d.score : '—'}</span><span class="grade-col-score-unit">점</span>
      </div>
    </div>`;
  const hasDetail = g.lectureDetails && g.lectureDetails.length > 0;
  return `<div class="grade-summary">
    <div class="grade-cols">
      ${col('개념', 'c1', g.concept)}
      ${col('미션', 'c2', g.mission)}
      ${col('생각', 'c3', g.think)}
    </div>
    <div class="grade-sum-total">
      <span>총점</span>
      <span><strong>${g.total}</strong> / ${g.max}점</span>
    </div>
    ${hasDetail ? `<div class="grade-btns">
      <button class="btn-grade-detail" onclick="openGradeDetail()">세부 채점 내역</button>
      <button class="btn-grade-detail" onclick="openGradeFeedback()">선생님 피드백</button>
    </div>` : ''}
  </div>`;
}

// ── 렌더 공통 조각 ──
const LOADING_HTML = '<div class="loading-dots"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>';
const CHEVRON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';
const CARET   = '<svg class="acc-caret" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
const SEC_CLS    = { concept:'s-concept', mission:'s-mission', think:'s-think', contents:'s-contents' };
const SEC_LABELS = { concept:'개념 Check', mission:'미션 Check', think:'생각 Check', contents:'각종 콘텐츠' };
const GRADE_CAPTION = '채점 기준에 따른 실시간 점수를 제공합니다. 최종 점수는 학기말에 별도로 안내됩니다.';
const isMobile = () => mqMobile.matches;

// PC 공통 카드 골격 (헤더 + 아이콘 그리드)
function renderGridCard(el, name, items) {
  const body = items === null ? LOADING_HTML : `<div class="icon-grid"></div>`;
  el.innerHTML = `<div class="sec-head"><div class="sec-name">${name}</div></div><hr class="sec-divider"><div class="sec-body">${body}</div>`;
  if (items !== null) fillIconGrid(el.querySelector('.icon-grid'), items);
}

// 개념·미션·생각 3개 섹션 — PC는 카드+아이콘 그리드, 모바일은 3열 칩(탭 시 목록 모달)
function renderSections() {
  SECTIONS.forEach(s => {
    const card = document.getElementById(s.nodeId);
    if (!card) return;
    if (!menuVisible(s.key)) { card.style.display = 'none'; return; }
    card.style.display = '';
    const items = sectionData[s.key];
    if (isMobile()) {
      card.innerHTML = `<button class="sec-chip" type="button"><span class="chip-name">${s.name}</span></button>`;
      card.querySelector('.sec-chip').onclick = () => openSectionList(s.key);
    } else {
      renderGridCard(card, s.name, items);
    }
  });
}

// 성적 Check (포트폴리오) — PC는 카드로 펼쳐 표시, 모바일은 전폭 아코디언 버튼
function renderGradeBlock() {
  const el = document.getElementById('gradeBlock');
  if (!menuVisible('grade')) { el.style.display = 'none'; return; }
  el.style.display = '';
  const g = sectionData.grade;
  const summary = g === null ? LOADING_HTML : renderGradeSummaryHTML(g);
  const caption = `<div class="grade-caption">${GRADE_CAPTION}</div>`;
  if (isMobile()) {
    const total = (g && g._summary && g.totalPublished > 0) ? `총점 ${g.total}점` : '';
    el.className = 'grade-block' + (_gradeAccOpen ? ' open' : '');
    el.innerHTML = `<button class="acc-head" type="button">
        <span class="acc-title">성적 Check (포트폴리오)</span>
        <span class="acc-right">${total ? `<span class="acc-total">${total}</span>` : ''}${CARET}</span>
      </button>
      <div class="acc-body">${summary}${caption}</div>`;
    el.querySelector('.acc-head').onclick = () => {
      _gradeAccOpen = !_gradeAccOpen;
      el.classList.toggle('open', _gradeAccOpen);
    };
  } else {
    el.className = 'grade-block';
    el.innerHTML = `<div class="sec-head"><div class="sec-name">성적 Check (포트폴리오)</div></div><hr class="sec-divider"><div class="sec-body">${summary}${caption}</div>`;
  }
}

// 역사 열공 마일리지 — PC는 누적일수 카드(탭 시 hismile 이동), 모바일은 "N일째" 버튼(탭 시 모달)
function renderMileageBlock() {
  const el = document.getElementById('mileageBlock');
  if (!menuVisible('mileage')) { el.style.display = 'none'; return; }
  el.style.display = '';
  const num = _mileageDays === null ? '…' : _mileageDays;
  if (isMobile()) {
    el.className = 'mileage-block';
    el.innerHTML = `<button class="mileage-btn" type="button"><span class="acc-title">역사 열공 마일리지</span><span class="mileage-btn-days">${num}일째</span></button>`;
    el.onclick = null;
    el.querySelector('.mileage-btn').onclick = openMileageModal;
  } else {
    el.className = 'mileage-block clickable';
    el.innerHTML = `<div class="sec-head"><div class="sec-name">역사 열공 마일리지</div></div><hr class="sec-divider">
      <div class="mileage-body">
        <div class="mileage-days">${num}<span class="mileage-unit">일</span></div>
        <div class="mileage-caption">매일 꾸준히 기록해 마일리지를 쌓아요</div>
      </div>`;
    el.onclick = openMileageModal;
  }
}

// 각종 콘텐츠 — PC는 카드+그리드, 모바일은 전폭 버튼(탭 시 목록 모달)
function renderContentsBlock() {
  const el = document.getElementById('contentsBlock');
  if (!menuVisible('contents')) { el.style.display = 'none'; return; }
  el.style.display = '';
  const items = sectionData.contents;
  if (isMobile()) {
    el.innerHTML = `<button class="sec-launch" type="button"><span class="sec-name">각종 콘텐츠</span><span class="sec-launch-count">${CHEVRON}</span></button>`;
    el.querySelector('.sec-launch').onclick = () => openSectionList('contents');
  } else {
    renderGridCard(el, '각종 콘텐츠', items);
  }
}

// ── 마일리지 모달 — hismile 앱을 큰 팝업(iframe)으로 연다(데스크톱·모바일 공통) ──
// 학번·이름을 URL로 넘겨 hismile가 자체 로그인 화면을 건너뛰고 바로 로그인된 상태로 뜨게 한다.
function openMileageModal() {
  const base = resolveAppUrl('hismile/index.html');
  const sep = base.includes('?') ? '&' : '?';
  const url = `${base}${sep}embed=1&sid=${encodeURIComponent(currentStudentId)}&sn=${encodeURIComponent(currentStudentName)}`;
  document.getElementById('contentAppModalTitle').textContent = '역사 열공 마일리지';
  document.getElementById('contentAppFrame').src = url;
  document.getElementById('contentAppModal').style.display = 'flex';
}

// ── 모바일 섹션 목록 모달 (개념/미션/생각/콘텐츠 런처 탭 시) ──
function openSectionList(key) {
  _openListKey = key;
  const items = sectionData[key];
  document.getElementById('sectionListTitle').textContent = SEC_LABELS[key] || '';
  const body = document.getElementById('sectionListBody');
  if (items === null) {
    body.innerHTML = LOADING_HTML;
  } else {
    body.innerHTML = `<div class="icon-grid ${SEC_CLS[key] || ''}"></div>`;
    fillIconGrid(body.querySelector('.icon-grid'), items);
  }
  document.getElementById('sectionListModal').style.display = 'flex';
}
function closeSectionList() {
  document.getElementById('sectionListModal').style.display = 'none';
  _openListKey = null;
}
document.getElementById('sectionListClose').addEventListener('click', closeSectionList);
document.getElementById('sectionListModal').addEventListener('click', e => {
  if (e.target.id === 'sectionListModal') closeSectionList();
});

function fillIconGrid(container, items) {
  if (!items.length) { container.innerHTML = '<div class="icon-empty">아직 비어있어요</div>'; return; }
  items.forEach(item => container.appendChild(makeIconItem(item)));
}

function makeIconItem(item) {
  const useAppModal = !item.isThink && item.openInModal;
  const el = (item.isThink || useAppModal || item.isConcept) ? document.createElement('button') : document.createElement('a');
  el.className = 'icon-item' + (item.locked ? ' locked' : '');
  if (item.isThink) {
    if (!item.locked) el.addEventListener('click', () => openThinkModal(item));
  } else if (item.isConcept) {
    if (!item.locked) el.addEventListener('click', e => { e.stopPropagation(); openConceptPicker(item); });
  } else if (useAppModal) {
    if (!item.locked && item.url) el.addEventListener('click', () => openContentAppModal(item));
  } else {
    // 같은 창에서 이동(같은 도메인 앱) → PWA 안에서 열려 상단 URL바(커스텀 탭)가 안 뜬다.
    if (!item.locked && item.url) { el.href = item.url; }
  }
  const iconStr = String(item.emoji || item.icon || '?').trim();
  const isSvgIcon = iconStr.startsWith('<svg');
  const sizeClass = isSvgIcon ? 'size-svg' : (iconStr.length <= 2 ? 'size-md' : iconStr.length <= 3 ? 'size-sm' : iconStr.length <= 5 ? 'size-lg' : 'size-xl');
  el.innerHTML = `<div class="icon-box ${sizeClass}">${isSvgIcon ? iconStr : esc(iconStr)}</div>${item.label?`<div class="icon-label">${esc(item.label)}</div>`:''}`;
  return el;
}

// ── 생각 체크 모달 ──
let _thinkItem = null, _thinkStart = null, _thinkCheat = 0, _thinkMyAnswer = '';
// AI 도움 상태 — 도움 질문도, 제출 전 점검도 답변당 딱 1회씩.
// 점검을 다 쓴 뒤 "제출하기"를 누르면 점검 없이 바로 제출된다.
let _thinkHintUsed = false, _thinkCheckCount = 0, _thinkFlagged = 0, _thinkFixed = false;
let _thinkProfane = false, _thinkTextAtCheck = '';
const THINK_CHECK_MAX = 1;

function resetThinkAid() {
  _thinkHintUsed = false; _thinkCheckCount = 0; _thinkFlagged = 0;
  _thinkFixed = false; _thinkProfane = false; _thinkTextAtCheck = '';
  const hintBtn = document.getElementById('thinkHintBtn');
  hintBtn.style.display = 'inline-flex';
  hintBtn.disabled = false;
  hintBtn.textContent = '도움질문';
  document.getElementById('thinkHintPanel').style.display  = 'none';
  document.getElementById('thinkHintList').innerHTML       = '';
  hideThinkCheck();
}

// 버튼만 "제출하기" 한 개짜리로 되돌린다. 점검 패널은 그대로 두어
// 학생이 무엇을 고쳐야 하는지 보면서 위 입력칸을 수정할 수 있게 한다.
function resetThinkButtons() {
  document.getElementById('thinkSubmitBtn').style.display = '';
  document.getElementById('thinkReviseBtn').style.display = 'none';
  document.getElementById('thinkForceBtn').style.display  = 'none';
}

function hideThinkCheck() {
  document.getElementById('thinkCheckPanel').style.display = 'none';
  document.getElementById('thinkCheckList').innerHTML      = '';
  document.getElementById('thinkFixList').innerHTML        = '';
  document.getElementById('thinkFixList').style.display    = 'none';
  resetThinkButtons();
}

async function openThinkModal(item) {
  _thinkItem  = item; _thinkStart = Date.now(); _thinkCheat = 0;
  document.getElementById('thinkModalTitle').textContent    = stripEmph(item.lectureTitle);
  document.getElementById('thinkModalQuestion').textContent = item.question;
  const refEl = document.getElementById('thinkModalRef');
  if (item.reference) { refEl.textContent = item.reference; refEl.style.display = 'block'; }
  else { refEl.style.display = 'none'; }

  const ta = document.getElementById('thinkTextarea');
  ta.value = '';
  document.getElementById('thinkWriteArea').style.display   = 'flex';
  document.getElementById('thinkDoneBox').style.display     = 'none';
  document.getElementById('thinkViewAnswerBtn').style.display = 'none';
  document.getElementById('thinkMyAnswerBox').style.display = 'none';
  document.getElementById('thinkSubmitBtn').disabled      = true;
  document.getElementById('thinkSubmitBtn').textContent   = '제출하기';
  resetThinkAid();
  updateThinkMeta();
  document.getElementById('thinkModal').style.display = 'flex';
  setTimeout(() => ta.focus(), 100);

  // 이미 제출한 답변이 있으면 "내가 쓴 답변 보기" 버튼을 텍스트에어리어 위에 노출
  try {
    const snap = await getDocs(query(collection(db, 'think_submissions'),
      where('lectureDocId', '==', item.lectureDocId), where('id', '==', currentStudentId)));
    if (!snap.empty && _thinkItem === item) {
      const subs = snap.docs.map(d => d.data())
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      _thinkMyAnswer = subs[0].text || '';
      document.getElementById('thinkViewAnswerBtn').style.display = 'inline-block';
    }
  } catch(_) {}
}

function closeThinkModal() {
  document.getElementById('thinkModal').style.display = 'none';
  _thinkItem = null;
}

document.getElementById('thinkModalClose').addEventListener('click', closeThinkModal);
document.getElementById('thinkDoneClose').addEventListener('click', closeThinkModal);
document.getElementById('thinkViewAnswerBtn').addEventListener('click', () => {
  const box = document.getElementById('thinkMyAnswerBox');
  box.textContent = _thinkMyAnswer;
  box.style.display = box.style.display === 'block' ? 'none' : 'block';
});
document.getElementById('thinkModal').addEventListener('click', e => { if (e.target === document.getElementById('thinkModal')) closeThinkModal(); });

const thinkTextarea = document.getElementById('thinkTextarea');
const THINK_MAX_CHARS = 1000;
thinkTextarea.addEventListener('input', updateThinkMeta);
thinkTextarea.addEventListener('paste', e => e.preventDefault());

function updateThinkMeta() {
  const len = thinkTextarea.value.replace(/\s/g, '').length;
  const el  = document.getElementById('thinkCharCount');
  const over = len > THINK_MAX_CHARS;
  el.textContent = `${len} / ${THINK_MAX_CHARS}자`;
  el.className   = 'think-char-count ' + (over ? 'over' : len >= 50 ? 'ok' : 'short');
  document.getElementById('thinkSubmitBtn').disabled = len === 0 || over;
}

document.addEventListener('visibilitychange', () => { if (_thinkItem && document.hidden) _thinkCheat++; });

// ── 프록시 호출 공통 ──
async function thinkAskClaude(prompt, maxTokens) {
  const res = await fetch(CLAUDE_PROXY_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] })
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  const data = await res.json();
  return (data.content?.[0]?.text || '').replace(/```json|```/g, '').trim();
}

// 해당 강의 본문(class_lessons)을 압축해서 가져온다.
// 질문·안내만으로는 AI가 원래 질문을 되풀이하는 수준의 힌트밖에 못 만든다 —
// 실제로 배운 제도·사건 이름이 들어가야 학생이 붙잡을 거리가 생긴다.
async function fetchLessonContext(num) {
  if (!num || num >= 9999) return '';
  try {
    const snap = await getDocs(query(collection(db, 'class_lessons'), where('num', '==', String(num))));
    if (snap.empty) return '';
    const lines = snap.docs[0].data()?.content?.contentLines || [];
    const parts = [];
    lines.forEach(l => {
      if (l?.type !== 'row') return;
      const items = (l.items || []).join(' ');
      parts.push(`${l.label || ''}: ${items}`);
    });
    // 빈칸 표기({정답})와 줄바꿈 태그를 걷어내고 길이를 제한한다.
    return parts.join('\n').replace(/[{}]/g, '').replace(/<br>/g, ' ').slice(0, 1500);
  } catch(_) { return ''; }
}


// ── 쓰기 전 도움 질문: 답을 주지 않고 난이도별로 하나씩 (강의당 1회) ──
document.getElementById('thinkHintBtn').addEventListener('click', async () => {
  if (!_thinkItem || _thinkHintUsed) return;
  const btn = document.getElementById('thinkHintBtn');
  btn.disabled = true;
  btn.textContent = '생각하는 중...';

  try {
    const lessonCtx = await fetchLessonContext(_thinkItem._n);
    const prompt = `중학교 3학년 학생이 아래 역사 질문 앞에서 무엇을 써야 할지 몰라 막혀 있다. 답을 알려주지 말고, 스스로 생각을 시작하게 만드는 도움 질문을 난이도별로 하나씩 만들어라.

난이도:
- 하: 오늘 배운 사실 하나만 떠올리면 되는 것
- 중: 두 인물이나 두 제도를 견주어 보게 하는 것
- 상: 무엇을 기준으로 판단할지 스스로 세워 보게 하는 것

길이 규칙(가장 중요):
- 세 항목 모두 35자 이내. 상·중도 예외 없다. 어려운 난이도라고 길게 쓰면 실패다.
- 쉼표를 쓰지 마라. 한 문장 안에 조건을 여러 개 넣지 마라.
- 길이 감각을 잡기 위한 예시다. 아래 소재(고려)는 이번 수업과 무관하니 절대 가져다 쓰지 마라.
  - 좋은 예: "광종의 노비안검법이 왜 필요했을까?" (21자)
  - 나쁜 예: "왕권을 강화하는 과정에서 호족의 경제 기반을 무너뜨린 정책이 어떤 결과를 낳았는지 근거를 들어 판단해 보자" (너무 길다)

그 밖에:
- 아래 "오늘 배운 내용"에 실제로 나온 제도·사건·인물 이름을 하나씩 넣어라. 배우지 않은 내용을 끌어오지 마라.
- 정답이 무엇인지 티내지 마라. 세 항목이 한 인물로 몰리면 안 된다.
- 원래 질문을 그대로 되풀이하지 마라.
- 전부 물음표로 끝낼 필요는 없다. "~을 떠올려 보자", "~을 견주어 보자" 같은 권유형을 섞어라.

질문: "${_thinkItem.question}"
${_thinkItem.reference ? `수업 안내: "${String(_thinkItem.reference).slice(0, 300)}"` : ''}
${lessonCtx ? `오늘 배운 내용:\n${lessonCtx}` : ''}

다른 텍스트 없이 JSON 배열만 출력: [{"level":"하","text":"..."},{"level":"중","text":"..."},{"level":"상","text":"..."}]`;

    const raw  = await thinkAskClaude(prompt, 500);
    const list = JSON.parse(raw.match(/\[[\s\S]*\]/)?.[0] || '[]')
      .filter(o => o && typeof o.text === 'string' && o.text.trim());
    if (!list.length) throw new Error('빈 응답');
    // 쉬운 것부터 보여준다 — 막힌 학생이 첫 줄에서 걸리면 안 된다.
    const order = { '하': 0, '중': 1, '상': 2 };
    list.sort((a, b) => (order[a.level] ?? 9) - (order[b.level] ?? 9));
    document.getElementById('thinkHintList').innerHTML = list.slice(0, 3)
      .map(o => `<div class="think-aid-item"><span>${esc(o.text)}</span></div>`).join('');
    document.getElementById('thinkHintPanel').style.display = 'flex';
    _thinkHintUsed = true;
    btn.style.display = 'none';
  } catch(_) {
    // 실패해도 학생 발목을 잡지 않는다 — 버튼을 되살려 다시 눌러볼 수 있게 한다.
    btn.disabled = false;
    btn.textContent = '다시 시도해 주세요';
    setTimeout(() => { if (!_thinkHintUsed) btn.textContent = '도움질문'; }, 2500);
  }
});

// ── 제출 전 점검: 오탈자와 비속어만 본다 ──
// 답변의 내용·품질은 일부러 판단하지 않는다. 그건 학생 본인의 실력이고,
// AI가 "생각이 부족하다"고 훈수를 두기 시작하면 답변이 AI 취향으로 수렴한다.
async function runThinkCheck(text) {
  const prompt = `중학교 3학년 학생이 쓴 글에서 오탈자와 비속어만 찾아라. 글의 내용이 좋은지 나쁜지, 논리가 있는지는 절대 판단하지 마라.

학생 글: """${text}"""

1. typos: 글자가 명백히 틀린 것만 최대 4개. 다음은 절대 넣지 마라 — 띄어쓰기 오류, 문장부호, 어색한 표현이나 문체, 줄임말·구어체(예: "같다", "했음"), 맞다고 볼 여지가 있는 것. 받침·철자가 틀린 것만 골라라. 각 항목은 {"was":"틀린 그대로","now":"고친 말","why":"6자 이내 이유"}
2. profanity: 욕설·비속어로 볼 수 있는 표현만 배열로. 없으면 []

확신이 없으면 넣지 마라. 틀리지 않은 것을 틀렸다고 하면 안 된다.
다른 텍스트 없이 JSON만 출력: {"typos":[],"profanity":[]}`;

  const raw = await thinkAskClaude(prompt, 500);
  const r   = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || '{}');
  const typos = (Array.isArray(r.typos) ? r.typos : [])
    .filter(t => t && typeof t.was === 'string' && typeof t.now === 'string' && t.was !== t.now)
    .filter(t => text.includes(t.was))   // 실제 답변에 없는 말을 지적하는 환각 방지
    .slice(0, 4);
  // 비속어는 공용 사전(shared/profanity.js)을 우선하고, AI가 잡은 변형을 더한다.
  const local = findBadWord(text);
  const bad   = [...new Set([...(local ? [local] : []), ...(Array.isArray(r.profanity) ? r.profanity : []).filter(w => typeof w === 'string' && w.trim())])];
  return { typos, bad };
}

function renderThinkCheck(r) {
  const row = (cls, ic, html) => `<div class="think-check ${cls}">${icon(ic, 16)}<span>${html}</span></div>`;
  const rows = [];
  if (r.bad.length)
    rows.push(row('bad', 'triangle-alert', '<b>쓰면 안 되는 말이 있어요</b> — 고쳐서 내 주세요.'));
  if (r.typos.length)
    rows.push(row('warn', 'triangle-alert', `<b>고칠 곳 ${r.typos.length}군데</b> — 아래를 고쳐서 내면 더 좋아요.`));
  document.getElementById('thinkCheckList').innerHTML = rows.join('');

  const fixEl = document.getElementById('thinkFixList');
  if (r.typos.length) {
    fixEl.innerHTML = r.typos.map(t => `<div class="think-fix">
        <span class="think-fix-was">${esc(t.was)}</span>
        <span class="think-fix-now">${esc(t.now)}</span>
        ${t.why ? `<span class="think-fix-why">${esc(String(t.why).slice(0, 8))}</span>` : ''}
      </div>`).join('');
    fixEl.style.display = 'flex';
  } else {
    fixEl.innerHTML = ''; fixEl.style.display = 'none';
  }

  const panel = document.getElementById('thinkCheckPanel');
  panel.style.display = 'flex';
  document.getElementById('thinkSubmitBtn').style.display = 'none';
  document.getElementById('thinkReviseBtn').style.display = '';
  document.getElementById('thinkForceBtn').style.display  = '';
  panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

// ── 실제 제출 ──
async function doThinkSubmit(triggerId) {
  const text = thinkTextarea.value.trim();
  const textLength = text.replace(/\s/g, '').length;
  if (!_thinkItem) return;
  // 점검에서 지적받은 뒤 실제로 글을 고쳤는지 ("이대로 제출"로 바로 낸 경우도 여기서 판정된다)
  if (_thinkTextAtCheck && text !== _thinkTextAtCheck) _thinkFixed = true;
  const duration = Math.floor((Date.now() - _thinkStart) / 1000);
  const btns = ['thinkSubmitBtn', 'thinkReviseBtn', 'thinkForceBtn'].map(id => document.getElementById(id));
  btns.forEach(b => b.disabled = true);
  const activeBtn = document.getElementById(triggerId || 'thinkSubmitBtn');
  const activeLabel = activeBtn.textContent;
  activeBtn.textContent = '제출 중...';
  try {
    await addDoc(collection(db, 'think_submissions'), {
      lectureDocId: _thinkItem.lectureDocId, lectureTitle: _thinkItem.lectureTitle,
      id: currentStudentId, name: currentStudentName,
      text, textLength, duration, cheatCount: _thinkCheat,
      // AI 도움 사용 기록 — 채점 참고용이며 점수에는 관여하지 않는다.
      aiHintUsed: _thinkHintUsed, spellFlagged: _thinkFlagged,
      spellFixed: _thinkFixed, hasProfanity: _thinkProfane,
      isPicked: false, createdAt: serverTimestamp(), source: 'lms'
    });
    document.getElementById('thinkWriteArea').style.display = 'none';
    document.getElementById('thinkDoneBox').style.display   = 'block';
  } catch(_) {
    btns.forEach(b => b.disabled = false);
    activeBtn.textContent = activeLabel;
    alert('제출 중 오류가 발생했습니다. 다시 시도해 주세요.');
  }
}

document.getElementById('thinkReviseBtn').addEventListener('click', () => {
  // 점검 결과는 남겨둔 채 버튼만 되돌린다 — 고칠 목록을 보면서 위 입력칸을 수정한다.
  resetThinkButtons();
  updateThinkMeta();
  thinkTextarea.focus();
  thinkTextarea.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
});
document.getElementById('thinkForceBtn').addEventListener('click', () => doThinkSubmit('thinkForceBtn'));

document.getElementById('thinkSubmitBtn').addEventListener('click', async () => {
  const text = thinkTextarea.value.trim();
  const textLength = text.replace(/\s/g, '').length;
  if (!_thinkItem) return;
  if (textLength > THINK_MAX_CHARS) return;
  if (textLength < 50 && !confirm('50자 미만 작성했습니다. 그래도 제출 하시겠습니까?')) return;

  // 점검 횟수를 다 썼으면 그냥 제출한다.
  if (_thinkCheckCount >= THINK_CHECK_MAX) { doThinkSubmit(); return; }

  const btn = document.getElementById('thinkSubmitBtn');
  btn.disabled = true; btn.textContent = '점검 중...';
  let r = null;
  try { r = await runThinkCheck(text); } catch(_) {}
  _thinkCheckCount++;
  btn.disabled = false; btn.textContent = '제출하기';

  // 점검에 실패하면 건너뛰고 제출한다 — AI 때문에 제출을 못 하는 일은 없어야 한다.
  if (!r) { doThinkSubmit(); return; }

  if (_thinkCheckCount === 1) _thinkFlagged = r.typos.length;
  if (r.bad.length) _thinkProfane = true;
  if (_thinkTextAtCheck && text !== _thinkTextAtCheck) _thinkFixed = true;
  _thinkTextAtCheck = text;

  // 지적할 게 없으면 한 번 더 누르게 하지 않고 바로 제출한다.
  if (!r.typos.length && !r.bad.length) { doThinkSubmit(); return; }

  renderThinkCheck(r);
});

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// 미션 카드 URL은 hoistory 루트 기준 상대경로(예: interview/index.html)로 입력받는다.
// 이 페이지 자체가 lms/ 하위에 있어 그대로 쓰면 lms/interview/... 로 잘못 풀리므로 루트 기준으로 보정한다.
function resolveAppUrl(u) {
  if (!u) return u;
  if (/^(https?:)?\/\//i.test(u) || u.startsWith('/') || u.startsWith('#')) return u;
  const root = location.pathname.replace(/\/lms\/.*$/, '/');
  return root + u;
}

// ── 성적 상세 모달 ──
window.openGradeDetail = function() {
  const g = sectionData.grade;
  if (!g || !g.lectureDetails || !g.lectureDetails.length) return;
  const ok  = s => `<span class="gd-ok">●</span>`;
  const no  = s => `<span class="gd-no">✗</span>`;
  const na  = ()  => `<span class="gd-na">미실시</span>`;
  const rows = g.lectureDetails.map(d => `<tr>
    <td>${esc(stripEmph(d.title))}</td>
    <td>${d.concept.enabled ? (d.concept.achieved ? ok() : no()) : na()}</td>
    <td>${d.mission.enabled ? (d.mission.achieved ? ok() : no()) : na()}</td>
    <td>${d.think.enabled   ? (d.think.achieved   ? ok() : no()) : na()}</td>
  </tr>`).join('');
  document.getElementById('gradeDetailContent').innerHTML = `
    <table class="gd-table">
      <thead>
        <tr>
          <th>강의</th>
          <th>개념</th>
          <th>미션</th>
          <th>생각</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
  document.getElementById('gradeDetailModal').style.display = 'flex';
};

document.getElementById('gradeDetailClose').addEventListener('click', () => {
  document.getElementById('gradeDetailModal').style.display = 'none';
});
document.getElementById('gradeDetailModal').addEventListener('click', e => {
  if (e.target === document.getElementById('gradeDetailModal'))
    document.getElementById('gradeDetailModal').style.display = 'none';
});

// ── 선생님 피드백 모달 ──
window.openGradeFeedback = async function() {
  const g = sectionData.grade;
  if (!g || !g.lectureDetails || !g.lectureDetails.length) return;
  const withFeedback = g.lectureDetails.filter(d => d.feedback);
  const body = withFeedback.length
    ? withFeedback.map(d => `<div class="feedback-card">
        <div class="feedback-lec">${esc(stripEmph(d.title))}</div>
        <div class="feedback-text">${esc(d.feedback)}</div>
      </div>`).join('')
    : `<div class="feedback-empty">아직 등록된 피드백이 없습니다</div>`;
  const el = document.getElementById('gradeFeedbackContent');
  el.innerHTML = body;
  document.getElementById('gradeFeedbackModal').style.display = 'flex';
  // 확인한 피드백은 "본 것"으로 기록해 다음 입장 때 토스트가 다시 뜨지 않게 한다.
  try { localStorage.setItem('lms_seen_fb_' + currentStudentId, _feedbackSig(g)); } catch(_) {}
  // 생각 체크에서 만점(30pt)을 받은 적이 있으면 간식 안내 배너를 맨 위에 붙인다.
  try {
    const rows = await _fetchXPRows();
    if (rows.some(r => r.pt >= 30 && /^생각\s*체크\s*:/.test(r.note || ''))) {
      el.insertAdjacentHTML('afterbegin',
        `<div class="feedback-snack">🍬 생각 체크 만점! 선생님께 간식을 받으러 오세요</div>`);
    }
  } catch(_) {}
};

document.getElementById('gradeFeedbackClose').addEventListener('click', () => {
  document.getElementById('gradeFeedbackModal').style.display = 'none';
});
document.getElementById('gradeFeedbackModal').addEventListener('click', e => {
  if (e.target === document.getElementById('gradeFeedbackModal'))
    document.getElementById('gradeFeedbackModal').style.display = 'none';
});

// ── 각종 콘텐츠 앱 모달 (새창 대신 팝업으로 열기) ──
function openContentAppModal(item) {
  document.getElementById('contentAppModalTitle').textContent = item.label || '';
  document.getElementById('contentAppFrame').src = item.url;
  document.getElementById('contentAppModal').style.display = 'flex';
}
function closeContentAppModal() {
  document.getElementById('contentAppModal').style.display = 'none';
  document.getElementById('contentAppFrame').src = 'about:blank';
}
document.getElementById('contentAppModalClose').addEventListener('click', closeContentAppModal);
document.getElementById('contentAppModal').addEventListener('click', e => {
  if (e.target === document.getElementById('contentAppModal')) closeContentAppModal();
});
// ── 개념 체크 모드 선택 토스트 ──
let _cpItem = null;
const _cpEl = document.getElementById('conceptPicker');
function openConceptPicker(item) {
  _cpItem = item;
  document.getElementById('cpTitle').textContent = item.label || '';
  _cpEl.classList.add('show');
}
function closeConceptPicker() { _cpEl.classList.remove('show'); _cpItem = null; }
document.getElementById('cpComplete').addEventListener('click', () => {
  if (_cpItem) window.open(`lecture.html?num=${_cpItem.num}&mode=complete`, '_blank', 'noopener');
  closeConceptPicker();
});
document.getElementById('cpBlank').addEventListener('click', () => {
  if (_cpItem) window.open(`lecture.html?num=${_cpItem.num}&mode=blank`, '_blank', 'noopener');
  closeConceptPicker();
});
document.getElementById('cpTyping').addEventListener('click', () => {
  // 타이핑 복습은 학생 신원(sid/이름)을 URL로 넘겨 lecture.html에서 90% 이상 정답 시 XP를 적립한다.
  if (_cpItem) {
    const q = `num=${_cpItem.num}&mode=typing&sid=${encodeURIComponent(currentStudentId)}&sn=${encodeURIComponent(currentStudentName)}`;
    window.open(`lecture.html?${q}`, '_blank', 'noopener');
  }
  closeConceptPicker();
});
document.addEventListener('click', e => {
  if (_cpItem && !_cpEl.contains(e.target)) closeConceptPicker();
});

// 정적 HTML에 박아둔 아이콘 자리(data-icon)를 SVG로 채운다. (shared/icons.js 공용 헬퍼)
document.querySelectorAll('[data-icon]').forEach(el => {
  el.innerHTML = icon(el.dataset.icon, el.dataset.iconSize ? +el.dataset.iconSize : 24);
});

// ── 홈 화면에 추가 (PWA 설치) 버튼 ──
// 안드로이드/PC 크롬: beforeinstallprompt를 잡아 눌렀을 때 설치창을 바로 띄운다.
// iOS: 애플이 프롬프트를 막아 두어 "공유 → 홈 화면에 추가" 안내 시트를 대신 띄운다.
(function initInstallButton() {
  const btn = document.getElementById('installBtn');
  if (!btn) return;
  // 이미 홈 화면 앱으로 실행 중이면 버튼을 숨긴다.
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  if (isStandalone) return;

  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  let deferredPrompt = null;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    btn.style.display = 'flex';
  });
  window.addEventListener('appinstalled', () => { btn.style.display = 'none'; });

  // iOS는 이벤트가 없으므로 바로 보여주고, 안드로이드도 설치 안내 폴백이 있으니 노출한다.
  btn.style.display = 'flex';

  const guide = document.getElementById('iosInstallGuide');
  const closeGuide = () => { if (guide) guide.style.display = 'none'; };

  btn.addEventListener('click', async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      try { await deferredPrompt.userChoice; } catch (_) {}
      deferredPrompt = null;
      btn.style.display = 'none';
    } else if (isIOS) {
      if (guide) guide.style.display = 'flex';
    } else {
      showToast('브라우저 메뉴(⋮)에서 "홈 화면에 추가"를 눌러주세요');
    }
  });

  document.getElementById('iosGuideClose')?.addEventListener('click', closeGuide);
  guide?.addEventListener('click', (e) => { if (e.target === guide) closeGuide(); });
})();
