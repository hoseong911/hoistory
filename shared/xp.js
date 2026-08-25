// XP 공통 모듈 — 사용처에서 Firebase 함수를 주입받아 버전 충돌을 방지한다.
// Usage: import { initXP } from '../shared/xp.js';
//        await initXP(rtdb, studentId, studentName, { ref, get, set, push, update, onValue, runTransaction });

import { kstDate } from './util.js';

const XP_ROOT = 'xp';

export const DEFAULT_LEVELS = [
  0, 100, 225, 375, 550, 750, 975, 1225, 1500, 1800,
  2125, 2475, 2850, 3250, 3675, 4125, 4600, 5100, 5625, 6175
];
export const DEFAULT_FORMULA  = { lastGap: 550, increment: 25 };
export const DEFAULT_ACTIVITIES = {
  attendance:   { pt: 5,  enabled: true },
  mileage:      { pt: 20, enabled: true },
  thinkCheck:   { pt: 30, enabled: true }, // pt = 최대치. 실제 지급은 제출 AI 채점으로 10~pt 차등.
  typingReview: { pt: 20, perLectureMax: 10, enabled: true }, // perLectureMax = 한 강의에서 XP를 받을 수 있는 최대 횟수(참여 자체는 무제한)
  oxQuiz:       { ptPer: 1, dailyMax: 20, enabled: true },
};

let _rtdb, _sid, _sname, _fb;
let _config    = null;
let _state     = null;
let _listeners = [];
let _unsubXP   = null;

export async function initXP(rtdb, sid, name, fbFns) {
  // 이전 구독 해제 (재로그인 시)
  if (_unsubXP) { _unsubXP(); _unsubXP = null; }

  _rtdb  = rtdb;
  _sid   = String(sid);
  _sname = name;
  _fb    = fbFns; // { ref, get, set, push, update, onValue, runTransaction }

  // 설정 로드 (없으면 기본값)
  try {
    const snap = await _fb.get(_fb.ref(_rtdb, `${XP_ROOT}/config`));
    _config = snap.exists() ? snap.val() : {};
  } catch { _config = {}; }
  _config.levels       = _config.levels       || DEFAULT_LEVELS;
  _config.levelFormula = _config.levelFormula || DEFAULT_FORMULA;
  // 기존에 저장된 설정에 새 활동(typingReview 등)이 없을 수 있어 기본값을 채워 넣는다.
  _config.activities   = { ...DEFAULT_ACTIVITIES, ...(_config.activities || {}) };

  // 학생 상태 실시간 구독
  _unsubXP = _fb.onValue(_fb.ref(_rtdb, `${XP_ROOT}/students/${_sid}`), snap => {
    const raw = snap.exists() ? snap.val() : {};
    _state = { total: raw.total || 0, level: raw.level || 1, ...raw };
    _listeners.forEach(fn => fn({ ..._state }));
  });
}

export function onXPChange(fn) {
  _listeners.push(fn);
  if (_state) fn({ ..._state });
  return () => { _listeners = _listeners.filter(l => l !== fn); };
}

export function getXPState() { return _state ? { ..._state } : null; }
export function getConfig()  { return _config; }

// ── 레벨 계산 ──

export function calcLevel(total, levels, formula) {
  const lvls = levels  || _config?.levels       || DEFAULT_LEVELS;
  const fml  = formula || _config?.levelFormula || DEFAULT_FORMULA;
  // 테이블 범위 내
  for (let i = lvls.length - 1; i >= 0; i--) {
    if (total >= lvls[i]) {
      if (i < lvls.length - 1) return i + 1;
      break; // 마지막 항목 이상 → 공식 확장
    }
  }
  // 테이블 이상: 공식 확장
  let threshold = lvls[lvls.length - 1];
  let gap = fml.lastGap;
  let lv  = lvls.length;
  while (total >= threshold + gap) { threshold += gap; gap += fml.increment; lv++; }
  return lv;
}

export function calcNextThreshold(total, levels, formula) {
  const lvls = levels  || _config?.levels       || DEFAULT_LEVELS;
  const fml  = formula || _config?.levelFormula || DEFAULT_FORMULA;
  const lv   = calcLevel(total, lvls, fml);
  if (lv < lvls.length) return lvls[lv];
  // 공식 확장
  let threshold = lvls[lvls.length - 1];
  let gap = fml.lastGap;
  let cur = lvls.length;
  while (cur < lv) { threshold += gap; gap += fml.increment; cur++; }
  return threshold + gap;
}

// ── XP 적립 ──
// gate를 주면 "읽고→확인→쓰기" 사이 시간차로 같은 지급이 여러 번 통과하는 레이스 컨디션을
// 막기 위해 RTDB 트랜잭션 하나로 게이트 확인 + 합계 갱신 + 기록 추가를 원자적으로 처리한다.
// (로그인 화면 연타, 다중 탭 등으로 같은 함수가 거의 동시에 여러 번 호출돼도 상한을 넘지 않음)
// gate 형태 두 가지:
//   - 문자열: 날짜 게이트. cur[gate]가 오늘이면 중단(하루 1회)
//   - { map, key, max }: 횟수 게이트. cur[map][key]가 max 이상이면 중단, 아니면 1 증가
export async function addXP(type, pt, note, gate) {
  if (!_rtdb || !_sid) return null;
  const base = `${XP_ROOT}/students/${_sid}`;
  const today   = _today();
  const dayGate = typeof gate === 'string' ? gate : null;
  const cap     = (gate && typeof gate === 'object') ? gate : null;
  const histKey = _fb.push(_fb.ref(_rtdb, `${base}/history`)).key; // 키만 미리 뽑아둔다(트랜잭션 함수는 순수해야 함)
  let result = null;
  const txRes = await _fb.runTransaction(_fb.ref(_rtdb, base), cur => {
    cur = cur || {};
    if (dayGate && cur[dayGate] === today) return; // 이미 오늘 지급됨 → 트랜잭션 중단(중복 지급 방지)
    let used = 0;
    if (cap) {
      used = Number((cur[cap.map] || {})[cap.key]) || 0;
      if (used >= cap.max) return; // 이 강의에서 받을 수 있는 횟수 소진 → 중단
    }
    const prevTotal = cur.total || 0;
    const newTotal  = prevTotal + pt;
    const newLevel  = calcLevel(newTotal);
    result = { newTotal, newLevel, wasLevel: calcLevel(prevTotal), used: used + 1 };
    const next = { ...cur, total: newTotal, level: newLevel, name: _sname };
    if (dayGate) next[dayGate] = today;
    if (cap) next[cap.map] = { ...(cur[cap.map] || {}), [cap.key]: used + 1 };
    next.history = { ...(cur.history || {}), [histKey]: { type, pt, note: note || '', ts: Date.now() } };
    return next;
  });
  if (!txRes.committed || !result) return null; // 중단됐으면(이미 지급했거나 상한 도달) null 반환
  return {
    newTotal: result.newTotal, newLevel: result.newLevel,
    levelUp: result.newLevel > result.wasLevel, pt,
    used: cap ? result.used : null, max: cap ? cap.max : null
  };
}

export async function checkAndAddAttendance() {
  if (!_config?.activities?.attendance?.enabled) return null;
  return addXP('attendance', _config.activities.attendance.pt ?? 5, '출석 체크', 'lastAttendance');
}

export async function addMileageXP() {
  if (!_config?.activities?.mileage?.enabled) return null;
  return addXP('mileage', _config.activities.mileage.pt ?? 20, '히스토리 마일리지 완주', 'lastMileage');
}

// 타이핑 복습: 한 강의당 최대 perLectureMax회(기본 10회)까지만 XP를 준다. 상한에 도달해도
// 참여 자체는 막지 않으며(호출부가 null을 받고 XP 없이 진행), 횟수는 강의별로 따로 센다.
// 누적 횟수 저장 위치: xp/students/{sid}/typingReviewCounts/{강의번호}
export async function addTypingReviewXP(lectureNum) {
  const act = _config?.activities?.typingReview;
  if (!act?.enabled) return null;
  const key = _lectureKey(lectureNum);
  if (!key) return null; // 강의 번호를 모르면 어느 강의 몫인지 셀 수 없으므로 지급하지 않는다
  const max = Number(act.perLectureMax ?? DEFAULT_ACTIVITIES.typingReview.perLectureMax) || 0;
  if (max <= 0) return null;
  return addXP('typingReview', act.pt ?? 20, '타이핑 복습', { map: 'typingReviewCounts', key, max });
}

// RTDB 키로 쓸 수 없는 문자(. # $ [ ] /)를 치환한 강의 키
function _lectureKey(num) {
  const k = String(num ?? '').trim().replace(/[.#$[\]/]/g, '_');
  return k || null;
}

// ── 어드민 전용 ──

// extra를 주면 기록에 추가 필드가 붙는다(예: { src:'thinkCheck', lecId } — 재채점 때 이 기록만
// 골라 지우기 위한 표식. 강의 제목이 바뀌어도 note 대신 이 값으로 찾을 수 있다).
export async function adminAddXP(rtdb, sid, name, pt, note, fbFns, levels, formula, extra) {
  const base = `${XP_ROOT}/students/${sid}`;
  const snap = await fbFns.get(fbFns.ref(rtdb, base));
  const cur  = snap.exists() ? snap.val() : {};
  const prevTotal = cur.total || 0;
  const newTotal  = prevTotal + pt;
  const newLevel  = calcLevel(newTotal, levels, formula);
  const histRef   = fbFns.push(fbFns.ref(rtdb, `${base}/history`));
  const updates   = {};
  updates[`${base}/total`]                  = newTotal;
  updates[`${base}/level`]                  = newLevel;
  updates[`${base}/name`]                   = name;
  updates[`${base}/history/${histRef.key}`] = { type: 'manual', pt, note: note || '', ts: Date.now(), ...(extra || {}) };
  await fbFns.update(fbFns.ref(rtdb, '/'), updates);
  return { newTotal, newLevel };
}

// match(entry)가 true인 히스토리 기록을 지우고 그만큼 누적 XP를 되돌린다(레벨도 재계산).
// 재채점처럼 "이전 지급을 회수"해야 할 때, 회수 기록을 새로 남기는 대신 원래 기록 자체를 지워
// 내역에 새 채점 결과만 남게 하려고 쓴다. 지운 게 없으면 아무것도 쓰지 않고 null을 반환한다.
export async function adminRemoveXPEntries(rtdb, sid, match, fbFns, levels, formula) {
  const base = `${XP_ROOT}/students/${sid}`;
  const snap = await fbFns.get(fbFns.ref(rtdb, base));
  if (!snap.exists()) return null;
  const cur  = snap.val() || {};
  const hist = cur.history || {};
  const keys = Object.keys(hist).filter(k => hist[k] && match(hist[k]));
  if (!keys.length) return null;
  const removedPt = keys.reduce((sum, k) => sum + (Number(hist[k].pt) || 0), 0);
  const newTotal  = Math.max(0, (cur.total || 0) - removedPt);
  const newLevel  = calcLevel(newTotal, levels, formula);
  const updates   = {};
  updates[`${base}/total`] = newTotal;
  updates[`${base}/level`] = newLevel;
  keys.forEach(k => { updates[`${base}/history/${k}`] = null; });
  await fbFns.update(fbFns.ref(rtdb, '/'), updates);
  return { removedPt, removedCount: keys.length, newTotal, newLevel };
}

export async function loadXPConfig(rtdb, fbFns) {
  const snap = await fbFns.get(fbFns.ref(rtdb, `${XP_ROOT}/config`));
  const cfg  = snap.exists() ? { ...snap.val() } : {};
  cfg.levels       = cfg.levels       || DEFAULT_LEVELS;
  cfg.levelFormula = cfg.levelFormula || DEFAULT_FORMULA;
  cfg.activities   = { ...DEFAULT_ACTIVITIES, ...(cfg.activities || {}) };
  return cfg;
}

export async function saveXPConfig(rtdb, config, fbFns) {
  await fbFns.set(fbFns.ref(rtdb, `${XP_ROOT}/config`), config);
}

function _today() { return kstDate(); } // KST 기준 (shared/util.js)
