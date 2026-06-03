/**
 * ============================================================
 *  HOISTORY · shared/auth.js  v1.0
 * ------------------------------------------------------------
 *  학번 검증 + 학생 명단 로드 공통 모듈.
 *  blind_ryeo · 난세의사대부 · s_threads · 생각체크에 흩어져
 *  있던 동일 로직 (~100줄씩)을 한 곳으로 모았습니다.
 *
 *  ▸ RTDB `students` 컬렉션을 SSOT로 사용
 *  ▸ localStorage 24h 캐싱 (즉시 표시)
 *  ▸ 5초 타임아웃 + 최대 3회 자동 재시도 (모바일 캐리어 대응)
 *  ▸ 학번-이름 검증 UI 자동 연결(mountLoginVerification)
 *
 *  사용:
 *    <script type="module">
 *      import { initAuth, mountLoginVerification } from
 *        '/hoistory/shared/auth.js';
 *      import { getDatabase } from
 *        'https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js';
 *
 *      const db = getDatabase(app);
 *      initAuth(db);     // 백그라운드 로드 시작
 *
 *      mountLoginVerification({
 *        idInput:     document.getElementById('joinId'),
 *        nameInput:   document.getElementById('joinName'),
 *        idStatusEl:  document.getElementById('idStatus'),
 *        nameStatusEl:document.getElementById('nameStatus'),
 *        onChange: (status) => {
 *          document.getElementById('enterBtn').disabled = !status.allValid;
 *        }
 *      });
 *    </script>
 * ============================================================
 */

import { ref, get } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// ─── 설정 ───────────────────────────────────────────────────
const CACHE_KEY       = 'hi_students_cache';
const CACHE_TTL_MS    = 24 * 60 * 60 * 1000;   // 24시간
const FETCH_TIMEOUT   = 5000;                    // 5초
const MAX_RETRIES     = 3;
const DEBOUNCE_MS     = 400;                     // 학번 입력 후 검증 대기
const COLLECTION_PATH = 'students';

// ─── 내부 상태 ─────────────────────────────────────────────
let _db = null;
let _studentMap = {};
let _mapLoaded = false;
let _loadPromise = null;


// ────────────────────────────────────────────────────────────
//  Public API
// ────────────────────────────────────────────────────────────

/**
 * 인증 모듈을 초기화하고 학생 명단을 백그라운드로 로드합니다.
 * 앱 시작 시 한 번 호출하세요.
 * @param {import('firebase/database').Database} db
 */
export function initAuth(db) {
  _db = db;
  // 캐시 즉시 로드
  _loadFromCache();
  // 백그라운드 갱신
  loadStudents().catch(() => {});
}

/**
 * 학생 명단을 강제로 다시 불러옵니다.
 * @returns {Promise<Object<string, string>>} { '30201': '김호성', ... }
 */
export async function loadStudents() {
  if (!_db) throw new Error('[auth] initAuth(db)를 먼저 호출하세요.');
  if (_loadPromise) return _loadPromise;

  _loadPromise = _fetchWithRetry().finally(() => { _loadPromise = null; });
  return _loadPromise;
}

/**
 * 학번이 명단에 있는지 확인합니다.
 * @param {string} studentId
 * @returns {{ok:boolean, reason?:string, name?:string|null, message?:string}}
 */
export function verifyStudentId(studentId) {
  const id = String(studentId || '').trim();

  if (!/^\d{5}$/.test(id)) {
    return { ok: false, reason: 'format', message: '학번은 숫자 5자리입니다' };
  }
  if (!_mapLoaded) {
    return { ok: false, reason: 'loading', message: '명단 로드 중…' };
  }
  // 관리자가 명단을 아직 등록하지 않은 경우 → 통과 (기존 앱들과 동일 정책)
  if (Object.keys(_studentMap).length === 0) {
    return { ok: true, reason: 'no_roster', name: null };
  }
  const name = _studentMap[id];
  if (!name) {
    return { ok: false, reason: 'not_in_roster',
             message: '명단에 없는 학번입니다. 선생님께 문의하세요.' };
  }
  return { ok: true, name };
}

/**
 * 입력된 이름이 명단의 이름과 일치하는지 확인합니다.
 * 명단이 비어있거나 학번이 없는 경우는 입력값을 그대로 통과시킵니다.
 */
export function verifyStudentName(studentId, inputName) {
  const idCheck = verifyStudentId(studentId);
  if (!idCheck.ok) return { ok: false, reason: idCheck.reason };
  if (!idCheck.name) {
    return { ok: true, registeredName: null }; // 명단 없으면 통과
  }
  const trimmed = String(inputName || '').trim();
  if (trimmed === idCheck.name) {
    return { ok: true, registeredName: idCheck.name };
  }
  return {
    ok: false, reason: 'name_mismatch',
    registeredName: idCheck.name,
    message: '이름이 일치하지 않습니다'
  };
}

/** 학번 → 이름 (없으면 null) */
export function getStudentName(studentId) {
  return _studentMap[String(studentId).trim()] || null;
}

/** 명단이 로드되었는지 */
export function isStudentMapLoaded() { return _mapLoaded; }

/** 명단이 비어있는지 (관리자가 아직 등록 안 한 상태) */
export function isStudentMapEmpty() {
  return _mapLoaded && Object.keys(_studentMap).length === 0;
}


// ────────────────────────────────────────────────────────────
//  UI Helper — 로그인 화면 학번/이름 입력 자동 연결
// ────────────────────────────────────────────────────────────

/**
 * 학번 → 이름 자동 검증 UI를 wiring합니다.
 *
 * @param {Object} opts
 * @param {HTMLInputElement} opts.idInput      - 학번 입력 element
 * @param {HTMLInputElement} opts.nameInput    - 이름 입력 element
 * @param {HTMLElement} [opts.idStatusEl]      - ⏳/✅/❌ 표시 (선택)
 * @param {HTMLElement} [opts.nameStatusEl]    - ✅/❌ 표시 (선택)
 * @param {HTMLElement} [opts.idMsgEl]         - 학번 메시지 (선택)
 * @param {HTMLElement} [opts.nameMsgEl]       - 이름 메시지 (선택)
 * @param {(status:{idValid:boolean,nameValid:boolean,allValid:boolean,registeredName:string|null})=>void} [opts.onChange]
 * @param {number} [opts.debounceMs=400]
 *
 * @returns {{getStatus:()=>Object, reset:()=>void}} 외부 컨트롤
 */
export function mountLoginVerification(opts) {
  const {
    idInput, nameInput,
    idStatusEl, nameStatusEl,
    idMsgEl, nameMsgEl,
    onChange,
    debounceMs = DEBOUNCE_MS
  } = opts;

  if (!idInput || !nameInput) {
    throw new Error('[auth] idInput, nameInput은 필수입니다.');
  }

  let verifiedName = null;
  let idVerifyTimer = null;
  let status = { idValid: false, nameValid: false, allValid: false, registeredName: null };

  const setText = (el, txt) => { if (el) el.textContent = txt; };
  const setMsg = (el, txt, kind) => {
    if (!el) return;
    el.textContent = txt;
    el.className = el.className.replace(/\s*(ok|err)\b/g, '');
    if (kind) el.className += ' ' + kind;
  };
  const emit = () => {
    status.allValid = status.idValid && status.nameValid;
    onChange?.(status);
  };

  // 학번 입력 핸들러
  const handleIdInput = () => {
    // 숫자만
    const val = idInput.value.replace(/\D/g, '');
    if (idInput.value !== val) idInput.value = val;

    // 상태 리셋
    verifiedName = null;
    nameInput.disabled = true;
    nameInput.value = '';
    setText(idStatusEl, '');
    setText(nameStatusEl, '');
    setMsg(idMsgEl, '');
    setMsg(nameMsgEl, '');
    status.idValid = false;
    status.nameValid = false;
    status.registeredName = null;
    emit();

    if (val.length < 5) {
      if (val.length > 0) setMsg(idMsgEl, `학번은 5자리입니다 (현재 ${val.length}자리)`, 'err');
      return;
    }

    setText(idStatusEl, '⏳');
    setMsg(idMsgEl, '');

    clearTimeout(idVerifyTimer);
    idVerifyTimer = setTimeout(async () => {
      // 명단이 아직 로드 안 됐으면 잠시 기다림
      if (!_mapLoaded) {
        try { await loadStudents(); } catch (e) {}
      }
      const check = verifyStudentId(val);

      if (check.ok) {
        setText(idStatusEl, '✅');
        if (check.reason === 'no_roster') {
          setMsg(idMsgEl, '학번 형식 확인 완료', 'ok');
          nameInput.disabled = false;
          status.idValid = true;
          // 이름은 사용자가 입력해야 함
        } else {
          verifiedName = check.name;
          status.registeredName = check.name;
          setMsg(idMsgEl, '명단 확인 완료', 'ok');
          nameInput.value = check.name;
          nameInput.disabled = false;
          setText(nameStatusEl, '✅');
          setMsg(nameMsgEl, `${check.name} 학생으로 확인되었습니다`, 'ok');
          status.idValid = true;
          status.nameValid = true;
        }
      } else {
        setText(idStatusEl, '❌');
        setMsg(idMsgEl, check.message || '확인 실패', 'err');
        nameInput.disabled = true;
      }
      emit();
    }, debounceMs);
  };

  // 이름 입력 핸들러
  const handleNameInput = () => {
    const val = nameInput.value.trim();
    setText(nameStatusEl, '');

    if (!val) {
      setMsg(nameMsgEl, '');
      status.nameValid = false;
      emit();
      return;
    }

    if (verifiedName) {
      if (val === verifiedName) {
        setText(nameStatusEl, '✅');
        setMsg(nameMsgEl, '이름 일치', 'ok');
        status.nameValid = true;
      } else {
        setText(nameStatusEl, '❌');
        setMsg(nameMsgEl, '이름이 일치하지 않습니다', 'err');
        status.nameValid = false;
      }
    } else {
      // 명단이 없으면 입력값 그대로 통과
      setText(nameStatusEl, '✅');
      status.nameValid = true;
    }
    emit();
  };

  idInput.addEventListener('input', handleIdInput);
  nameInput.addEventListener('input', handleNameInput);

  return {
    getStatus: () => ({ ...status }),
    reset: () => {
      clearTimeout(idVerifyTimer);
      idInput.value = '';
      nameInput.value = '';
      nameInput.disabled = true;
      verifiedName = null;
      setText(idStatusEl, '');
      setText(nameStatusEl, '');
      setMsg(idMsgEl, '');
      setMsg(nameMsgEl, '');
      status = { idValid: false, nameValid: false, allValid: false, registeredName: null };
      emit();
    }
  };
}


// ────────────────────────────────────────────────────────────
//  내부 구현
// ────────────────────────────────────────────────────────────

function _loadFromCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return;
    const { map, ts } = JSON.parse(raw);
    if (map && ts && (Date.now() - ts) < CACHE_TTL_MS) {
      _studentMap = map;
      _mapLoaded = true;
    }
  } catch (e) {}
}

function _saveToCache(map) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ map, ts: Date.now() }));
  } catch (e) {}
}

function _fetchWithRetry(attempt = 1) {
  return new Promise((resolve) => {
    let done = false;

    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      if (attempt < MAX_RETRIES) {
        console.warn(`[auth] timeout, retry ${attempt}/${MAX_RETRIES - 1}`);
        _fetchWithRetry(attempt + 1).then(resolve);
      } else {
        console.warn('[auth] 명단 로드 실패 — 캐시 사용');
        resolve(_studentMap);
      }
    }, FETCH_TIMEOUT);

    get(ref(_db, COLLECTION_PATH))
      .then(snap => {
        if (done) return;
        done = true;
        clearTimeout(timer);

        const data = snap.val();
        const newMap = {};
        if (data) {
          Object.values(data).forEach(s => {
            if (!s) return;
            const sid   = String(s.studentId || s.id || '').trim();
            const sname = (s.name || s.studentName || s.realName || '').trim();
            if (sid && sname) newMap[sid] = sname;
          });
        }
        _studentMap = newMap;
        _mapLoaded = true;
        _saveToCache(newMap);
        resolve(newMap);
      })
      .catch(err => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (attempt < MAX_RETRIES) {
          _fetchWithRetry(attempt + 1).then(resolve);
        } else {
          console.warn('[auth] 명단 로드 오류:', err);
          resolve(_studentMap);
        }
      });
  });
}
