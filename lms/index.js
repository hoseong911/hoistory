
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, collection, query, orderBy, where, onSnapshot, getDocs,
  doc, getDoc, setDoc, addDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getDatabase, ref as rtdbRef, get as rtdbGet, set as rtdbSet, push as rtdbPush, update as rtdbUpdate, onValue as rtdbOnValue } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { initAuth, mountLoginVerification, verifyStudentId, verifyStudentName } from "../shared/auth.js";
import "../shared/offline.js";
import { firebaseConfig } from "../shared/firebase-config.js";
import { initXP, onXPChange, checkAndAddAttendance, calcLevel, calcNextThreshold } from "../shared/xp.js";

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

// ── 사이드바 메뉴 노출 설정 ──
let _menuVisibility = {};
onSnapshot(doc(db, 'settings', 'menu_visibility'), snap => {
  _menuVisibility = snap.exists() ? snap.data() : {};
  renderAll();
}, () => {});
function visibleSections() {
  return SECTIONS.filter(s => _menuVisibility[s.key] !== false);
}

const SECTIONS = [
  { key:'concept',  name:'개념 체크',   sub:'Concept Check', cls:'s-concept',  mob:'ms-concept'  },
  { key:'mission',  name:'미션 체크',   sub:'Mission Check', cls:'s-mission',  mob:'ms-mission'  },
  { key:'think',    name:'생각 체크',   sub:'Think Check',   cls:'s-think',    mob:'ms-think'    },
  { key:'grade',    name:'성적 확인',   sub:'Grade Check',   cls:'s-grade',    mob:'ms-grade'    },
  { key:'contents', name:'각종 콘텐츠', sub:'Contents',      cls:'s-contents', mob:'ms-contents' },
];

const idInput    = document.getElementById('idInput');
const nameInput  = document.getElementById('nameInput');
const pwInput    = document.getElementById('pwInput');
const statusArea = document.getElementById('statusArea');
const enterBtn   = document.getElementById('enterBtn');

let _idValid = false, _nameValid = false;
let _pendingId = '', _pendingName = '';
let _hasPw = false, _storedPw = null, _pwChecked = false, _pwValid = false, _pwAttemptFailed = false;
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

mountLoginVerification({
  idInput, nameInput,
  onChange: (s) => {
    _idValid     = s.idValid;
    _nameValid   = s.nameValid;
    _pendingId   = idInput.value.trim();
    _pendingName = s.registeredName || nameInput.value.trim();
    if (_idValid && _nameValid) {
      pwInput.disabled = false;
      if (!_pwChecked || pwInput.dataset.forId !== _pendingId) fetchStoredPassword(_pendingId);
    } else {
      pwInput.disabled = true; pwInput.value = '';
      _hasPw = false; _storedPw = null; _pwChecked = false; _pwValid = false; _pwAttemptFailed = false;
      pwInput.placeholder = '비밀번호'; pwInput.dataset.forId = '';
    }
    nameInput.classList.toggle('valid', _nameValid);
    nameInput.classList.toggle('error', _idValid && !_nameValid && nameInput.value.trim() !== '');
    updateStatus();
  }
});

async function fetchStoredPassword(sid) {
  _pwChecked = false; _hasPw = false; _storedPw = null;
  pwInput.placeholder = '비밀번호 확인 중...'; pwInput.dataset.forId = sid;
  try {
    const snap = await getDoc(doc(db, 'lms_auth', sid));
    if (snap.exists() && snap.data().pw) { _hasPw = true; _storedPw = snap.data().pw; pwInput.placeholder = '비밀번호'; }
    else { pwInput.placeholder = '비밀번호 (첫 방문: 직접 설정)'; }
  } catch(_) { pwInput.placeholder = '비밀번호 (선택)'; }
  _pwChecked = true; validatePassword(); updateStatus();
}

pwInput.addEventListener('input', () => { _pwAttemptFailed = false; validatePassword(); });
function validatePassword() {
  if (!_pwChecked) { _pwValid = false; updateStatus(); return; }
  const val = pwInput.value;
  _pwValid = _hasPw ? val === _storedPw : (val === '' || val.length >= 4);
  pwInput.classList.toggle('valid', _pwValid && val !== '');
  pwInput.classList.toggle('error', _pwAttemptFailed);
  updateStatus();
}

function updateStatus() {
  let line = null;
  if (!_idValid) {
    if (idInput.value.length > 0 && idInput.value.length < 5) line = { type:'muted', icon:'·', text:`학번은 5자리입니다 (현재 ${idInput.value.length}자리)` };
    else if (idInput.value.length === 5) line = { type:'err', icon:'✕', text:'명단에 없는 학번입니다' };
  } else if (!_nameValid) {
    if (nameInput.value.trim() !== '') line = { type:'err', icon:'✕', text:'이름을 다시 확인해 주세요' };
  } else if (_pwChecked) {
    if (_hasPw) {
      if (_pwAttemptFailed)        line = { type:'err',  icon:'✕',  text:'비밀번호가 틀렸습니다. 다시 입력해 주세요.' };
      else if (pwInput.value === '') line = { type:'info', icon:'🔒', text:'비밀번호가 설정되어 있습니다. 입력해 주세요.' };
    } else {
      if (pwInput.value.length > 0 && pwInput.value.length < 4) line = { type:'muted', icon:'·', text:'비밀번호는 4자 이상으로 설정해 주세요' };
      else if (pwInput.value.length >= 4) line = { type:'ok', icon:'✓', text:'새 비밀번호가 설정됩니다' };
    }
  }
  statusArea.innerHTML = line
    ? `<div class="status-line ${line.type}"><span class="status-icon">${line.icon}</span>${esc(line.text)}</div>` : '';
  // 비밀번호는 입력 중엔 막지 않고, 입장 시도 시점에 검증한다 (한 글자만 쳐도 "틀렸다"고 뜨는 문제 방지)
  const canEnter = _idValid && _nameValid && _pwChecked && (_hasPw ? pwInput.value.length > 0 : (pwInput.value === '' || pwInput.value.length >= 4));
  enterBtn.disabled = !canEnter;
}

[idInput, nameInput, pwInput].forEach(el => {
  el.addEventListener('keydown', e => { if (e.key === 'Enter' && !enterBtn.disabled) enterBtn.click(); });
});

enterBtn.addEventListener('click', async () => {
  if (!_pendingId || !_pendingName) return;
  if (_hasPw && pwInput.value !== _storedPw) {
    _pwAttemptFailed = true;
    pwInput.classList.add('error');
    updateStatus();
    pwInput.focus();
    return;
  }
  if (!_hasPw && pwInput.value.length >= 4) {
    try { await setDoc(doc(db, 'lms_auth', _pendingId), { pw: pwInput.value }); } catch(_) {}
  }
  sessionStorage.setItem('lms_sid',   _pendingId);
  sessionStorage.setItem('lms_sname', _pendingName);
  if (document.getElementById('autosaveCheck')?.checked) {
    localStorage.setItem('lms_autosave_sid',   _pendingId);
    localStorage.setItem('lms_autosave_sname', _pendingName);
  } else {
    localStorage.removeItem('lms_autosave_sid');
    localStorage.removeItem('lms_autosave_sname');
  }
  currentStudentId   = _pendingId;
  currentStudentName = _pendingName;
  checkConsentThenEnter(_pendingId, _pendingName);
});

// ── 비밀번호 재설정 ──
const resetPwForm     = document.getElementById('resetPwForm');
const resetIdInput    = document.getElementById('resetIdInput');
const resetNameInput  = document.getElementById('resetNameInput');
const resetNewPwInput = document.getElementById('resetNewPwInput');
const resetPwStatus   = document.getElementById('resetPwStatus');
const resetConfirmBtn = document.getElementById('resetConfirmBtn');

function showResetPwForm() {
  document.getElementById('normalLoginForm').style.display = 'none';
  document.getElementById('autoSaveCard').style.display    = 'none';
  resetPwForm.style.display = 'flex';
  resetIdInput.focus();
}
function hideResetPwForm() {
  resetPwForm.style.display = 'none';
  resetIdInput.value = ''; resetNameInput.value = ''; resetNewPwInput.value = '';
  setResetStatus('', '');
  resetConfirmBtn.disabled = true;
  if (localStorage.getItem('lms_autosave_sid')) {
    document.getElementById('autoSaveCard').style.display = 'flex';
  } else {
    document.getElementById('normalLoginForm').style.display = 'flex';
  }
}
function setResetStatus(msg, type) {
  resetPwStatus.textContent = msg;
  resetPwStatus.className = 'reset-pw-status' + (type ? ' ' + type : '');
}
function validateResetForm() {
  const id   = resetIdInput.value.trim();
  const name = resetNameInput.value.trim();
  const pw   = resetNewPwInput.value;
  const idRes = verifyStudentId(id);
  if (!idRes.ok) {
    setResetStatus(id.length === 5 ? (idRes.message || '학번을 확인해 주세요') : '', '');
    resetConfirmBtn.disabled = true; return;
  }
  const nameRes = verifyStudentName(id, name);
  if (!nameRes.ok) {
    setResetStatus(name ? '이름이 일치하지 않습니다' : '', '');
    resetConfirmBtn.disabled = true; return;
  }
  if (pw.length < 4) {
    setResetStatus(pw ? '비밀번호는 4자 이상으로 설정해 주세요' : '', '');
    resetConfirmBtn.disabled = true; return;
  }
  setResetStatus('확인되었습니다. 재설정 버튼을 눌러주세요', 'ok');
  resetConfirmBtn.disabled = false;
}
[resetIdInput, resetNameInput, resetNewPwInput].forEach(el => {
  el.addEventListener('input', validateResetForm);
  el.addEventListener('keydown', e => { if (e.key === 'Enter' && !resetConfirmBtn.disabled) resetConfirmBtn.click(); });
});
document.getElementById('forgotPwBtn').addEventListener('click', showResetPwForm);
document.getElementById('resetBackBtn').addEventListener('click', hideResetPwForm);
resetConfirmBtn.addEventListener('click', async () => {
  const id = resetIdInput.value.trim();
  const pw = resetNewPwInput.value;
  resetConfirmBtn.disabled = true;
  setResetStatus('재설정 중...', '');
  try {
    await setDoc(doc(db, 'lms_auth', id), { pw });
    setResetStatus('비밀번호가 재설정되었습니다!', 'ok');
    setTimeout(() => {
      hideResetPwForm();
      idInput.value = id;
      idInput.dispatchEvent(new Event('input'));
    }, 1500);
  } catch(_) {
    setResetStatus('오류가 발생했습니다. 다시 시도해 주세요.', 'err');
    resetConfirmBtn.disabled = false;
  }
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
  document.getElementById('studentChip').textContent = `${id} · ${name}`;
  document.getElementById('welcomeMsg').textContent  = `${name} 학생, 오늘도 즐거운 역사 학습!`;
  document.getElementById('logoutBtn').addEventListener('click', () => {
    sessionStorage.removeItem('lms_sid'); sessionStorage.removeItem('lms_sname'); location.reload();
  });
  startListening();
  _initXPForStudent(id, name);
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

document.getElementById('xpWidget').addEventListener('click', _openXPHistory);

async function _openXPHistory() {
  const modal = document.getElementById('xpHistoryModal');
  modal.classList.add('open');
  const list = document.getElementById('xpHistList');
  list.innerHTML = '<div style="padding:24px;text-align:center;color:#9CA3AF;font-size:13px">로딩 중...</div>';
  try {
    const snap = await rtdbGet(rtdbRef(rtdb, `xp/students/${currentStudentId}/history`));
    if (!snap.exists()) { list.innerHTML = '<div style="padding:24px;text-align:center;color:#9CA3AF;font-size:13px">활동 내역이 없어요.</div>'; return; }
    const rows = Object.values(snap.val()).sort((a, b) => (b.ts || 0) - (a.ts || 0));
    document.getElementById('xpHistCount').textContent = rows.length;
    list.innerHTML = rows.map(r => {
      const d  = new Date(r.ts || 0);
      const dt = `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
      const icon = ACT_ICONS[r.type] || '⭐';
      const sign = r.pt > 0 ? '+' : '';
      return `<div class="xp-hist-item">
        <div class="xp-hist-icon">${icon}</div>
        <div class="xp-hist-info">
          <div class="xp-hist-note">${r.note || r.type || '활동'}</div>
          <div class="xp-hist-date">${dt}</div>
        </div>
        <div class="xp-hist-pt">${sign}${r.pt} pt</div>
      </div>`;
    }).join('');
  } catch(e) {
    list.innerHTML = '<div style="padding:24px;text-align:center;color:#9CA3AF;font-size:13px">내역을 불러올 수 없어요.</div>';
  }
}

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
// 허브 아이콘은 이미 강 번호를 원 안에 크게 보여주므로, 라벨 앞의 "24강." 같은 중복 번호는 뗀다.
function stripLecNum(t) { return String(t || '').replace(/^\s*\d+\s*강\.?\s*/, '').trim() || String(t || ''); }
let _openFolderKey = null; // 모바일: 현재 열려 있는 폴더 (없으면 null)

function startListening() {
  Object.keys(sectionData).forEach(k => sectionData[k] = null);
  renderAll();

  // 1. 개념 체크 — class_lessons
  onSnapshot(query(collection(db, 'class_lessons'), orderBy('order','desc')), snap => {
    sectionData.concept = snap.docs.map(d => {
      const l = d.data();
      return { icon: l.num, label: stripLecNum(l.title), sublabel: l.unit, num: l.num, isConcept: true, locked: l.isOpen === false };
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
        .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
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
        .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
      renderAll();
    });
  }).catch(() => { sectionData.contents = []; renderAll(); });
}

function renderAll() { renderPC(); renderMobile(); }

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
      ${col('개념 체크', 'c1', g.concept)}
      ${col('미션 체크', 'c2', g.mission)}
      ${col('생각 체크', 'c3', g.think)}
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

function renderPC() {
  const grid = document.getElementById('hubGrid');
  grid.innerHTML = '';
  visibleSections().forEach(s => {
    const items = sectionData[s.key];
    const card  = document.createElement('div');
    card.className = `sec-card ${s.cls}`;
    const isSummary = items?._summary !== undefined;
    const body = items === null
      ? '<div class="loading-dots"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>'
      : isSummary
        ? renderGradeSummaryHTML(items)
        : `<div class="icon-grid" id="pc-${s.key}"></div>`;
    card.innerHTML = `<div class="sec-head"><div class="sec-name">${s.name}</div></div><hr class="sec-divider"><div class="sec-body">${body}</div>`;
    if (items !== null && !isSummary) fillIconGrid(card.querySelector(`#pc-${s.key}`), items);
    grid.appendChild(card);
  });
}

// 모바일: 폰 홈 화면처럼 5개 카테고리를 3열 "폴더" 아이콘으로 띄우고,
// 탭하면 그 폴더의 내용(icon-grid 또는 성적 요약)이 전체화면 오버레이로 열린다.
function renderMobile() {
  const hub = document.getElementById('mobileHub');
  hub.innerHTML = `<div class="mobile-launcher" id="mobileLauncher"></div>`;
  const launcher = document.getElementById('mobileLauncher');

  visibleSections().forEach(s => {
    const items     = sectionData[s.key];
    const isSummary = items?._summary !== undefined;
    const count     = items === null ? '불러오는 중' : isSummary ? (items._summary ? `총점 ${items.total}점` : '정보 없음') : `${items.length}개`;

    const btn = document.createElement('button');
    btn.className = `folder-btn ${s.mob}`;
    btn.innerHTML = `
      <div class="folder-box">${folderPreviewHTML(items, isSummary)}</div>
      <div class="folder-label">${s.name}</div>
      <div class="folder-count">${count}</div>`;
    btn.addEventListener('click', () => openFolder(s.key));
    launcher.appendChild(btn);
  });

  // 폴더가 열려 있는 상태에서 데이터가 갱신되면(실시간 구독) 오버레이 내용도 같이 새로고침
  if (_openFolderKey) renderFolderOverlay(_openFolderKey);
}

function folderPreviewHTML(items, isSummary) {
  if (items === null) return `<div class="folder-glyph">…</div>`;
  if (isSummary) return `<div class="folder-glyph"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg></div>`;
  if (!items.length) return `<div class="folder-glyph"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg></div>`;
  return `<div class="folder-preview-grid">${
    items.slice(0, 4).map(it => {
      const ic = String(it.emoji || it.icon || '?').trim();
      return `<div class="folder-mini">${ic.startsWith('<svg') ? ic : esc(ic)}</div>`;
    }).join('')
  }</div>`;
}

function openFolder(key) {
  _openFolderKey = key;
  renderFolderOverlay(key);
  document.getElementById('folderOverlay').classList.add('open');
}

function closeFolder() {
  _openFolderKey = null;
  document.getElementById('folderOverlay').classList.remove('open');
}

function renderFolderOverlay(key) {
  const s     = SECTIONS.find(x => x.key === key);
  const items = sectionData[key];
  const isSummary = items?._summary !== undefined;
  document.getElementById('folderOvTitle').textContent = s.name;
  const body = document.getElementById('folderOvBody');
  if (items === null) {
    body.innerHTML = '<div class="loading-dots"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>';
  } else if (isSummary) {
    body.innerHTML = renderGradeSummaryHTML(items);
  } else {
    body.innerHTML = `<div class="folder-icon-grid ${s.mob}" id="folder-grid-${key}"></div>`;
    fillIconGrid(document.getElementById(`folder-grid-${key}`), items);
  }
}

document.getElementById('folderOvBack').addEventListener('click', closeFolder);

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
    if (!item.locked && item.url) { el.href = item.url; el.target = '_blank'; el.rel = 'noopener'; }
  }
  const iconStr = String(item.emoji || item.icon || '?').trim();
  const isSvgIcon = iconStr.startsWith('<svg');
  const sizeClass = isSvgIcon ? 'size-svg' : (iconStr.length <= 2 ? 'size-md' : iconStr.length <= 3 ? 'size-sm' : iconStr.length <= 5 ? 'size-lg' : 'size-xl');
  el.innerHTML = `<div class="icon-box ${sizeClass}">${isSvgIcon ? iconStr : esc(iconStr)}</div>${item.label?`<div class="icon-label">${esc(item.label)}</div>`:''}`;
  return el;
}

// ── 생각 체크 모달 ──
let _thinkItem = null, _thinkStart = null, _thinkCheat = 0, _thinkMyAnswer = '';

async function openThinkModal(item) {
  _thinkItem  = item; _thinkStart = Date.now(); _thinkCheat = 0;
  document.getElementById('thinkModalTitle').textContent    = item.lectureTitle;
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

document.getElementById('thinkSubmitBtn').addEventListener('click', async () => {
  const text = thinkTextarea.value.trim();
  const textLength = text.replace(/\s/g, '').length;
  if (!_thinkItem) return;
  if (textLength > THINK_MAX_CHARS) return;
  if (textLength < 50 && !confirm('50자 미만 작성했습니다. 그래도 제출 하시겠습니까?')) return;
  const duration = Math.floor((Date.now() - _thinkStart) / 1000);
  const btn = document.getElementById('thinkSubmitBtn');
  btn.disabled = true; btn.textContent = '제출 중...';
  try {
    await addDoc(collection(db, 'think_submissions'), {
      lectureDocId: _thinkItem.lectureDocId, lectureTitle: _thinkItem.lectureTitle,
      id: currentStudentId, name: currentStudentName, verify: currentStudentName,
      text, textLength, duration, cheatCount: _thinkCheat,
      isPicked: false, createdAt: serverTimestamp(), source: 'lms'
    });
    document.getElementById('thinkWriteArea').style.display = 'none';
    document.getElementById('thinkDoneBox').style.display   = 'block';
  } catch(_) {
    btn.disabled = false; btn.textContent = '제출하기';
    alert('제출 중 오류가 발생했습니다. 다시 시도해 주세요.');
  }
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
    <td>${esc(d.title)}</td>
    <td>${d.concept.enabled ? (d.concept.achieved ? ok() : no()) : na()}</td>
    <td>${d.mission.enabled ? (d.mission.achieved ? ok() : no()) : na()}</td>
    <td>${d.think.enabled   ? (d.think.achieved   ? ok() : no()) : na()}</td>
  </tr>`).join('');
  document.getElementById('gradeDetailContent').innerHTML = `
    <table class="gd-table">
      <thead>
        <tr>
          <th>강의</th>
          <th style="background:var(--c1-l);color:var(--c1)">개념체크</th>
          <th style="background:var(--c2-l);color:var(--c2)">미션체크</th>
          <th style="background:var(--c1-l);color:var(--c1)">생각체크</th>
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
window.openGradeFeedback = function() {
  const g = sectionData.grade;
  if (!g || !g.lectureDetails || !g.lectureDetails.length) return;
  const withFeedback = g.lectureDetails.filter(d => d.feedback);
  document.getElementById('gradeFeedbackContent').innerHTML = withFeedback.length
    ? withFeedback.map(d => `<div class="feedback-card">
        <div class="feedback-lec">${esc(d.title)}</div>
        <div class="feedback-text">${esc(d.feedback)}</div>
      </div>`).join('')
    : `<div class="feedback-empty">아직 등록된 피드백이 없습니다</div>`;
  document.getElementById('gradeFeedbackModal').style.display = 'flex';
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
