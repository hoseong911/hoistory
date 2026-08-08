// XP 공통 모듈 — 사용처에서 Firebase 함수를 주입받아 버전 충돌을 방지한다.
// Usage: import { initXP } from '../shared/xp.js';
//        await initXP(rtdb, studentId, studentName, { ref, get, set, push, update, onValue });

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
  typingReview: { pt: 20, enabled: true },
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
  _fb    = fbFns; // { ref, get, set, push, update, onValue }

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

export async function addXP(type, pt, note) {
  if (!_rtdb || !_sid) return null;
  const base = `${XP_ROOT}/students/${_sid}`;
  const snap = await _fb.get(_fb.ref(_rtdb, base));
  const cur  = snap.exists() ? snap.val() : {};
  const prevTotal = cur.total || 0;
  const newTotal  = prevTotal + pt;
  const wasLevel  = calcLevel(prevTotal);
  const newLevel  = calcLevel(newTotal);
  const histRef   = _fb.push(_fb.ref(_rtdb, `${base}/history`));
  const updates   = {};
  updates[`${base}/total`]                  = newTotal;
  updates[`${base}/level`]                  = newLevel;
  updates[`${base}/name`]                   = _sname;
  updates[`${base}/history/${histRef.key}`] = { type, pt, note: note || '', ts: Date.now() };
  await _fb.update(_fb.ref(_rtdb, '/'), updates);
  return { newTotal, newLevel, levelUp: newLevel > wasLevel, pt };
}

export async function checkAndAddAttendance() {
  if (!_config?.activities?.attendance?.enabled) return null;
  const today = _today();
  const snap  = await _fb.get(_fb.ref(_rtdb, `${XP_ROOT}/students/${_sid}/lastAttendance`));
  if (snap.exists() && snap.val() === today) return null;
  await _fb.set(_fb.ref(_rtdb, `${XP_ROOT}/students/${_sid}/lastAttendance`), today);
  return addXP('attendance', _config.activities.attendance.pt ?? 5, '출석 체크');
}

export async function addMileageXP() {
  if (!_config?.activities?.mileage?.enabled) return null;
  const today = _today();
  const snap  = await _fb.get(_fb.ref(_rtdb, `${XP_ROOT}/students/${_sid}/lastMileage`));
  if (snap.exists() && snap.val() === today) return null;
  await _fb.set(_fb.ref(_rtdb, `${XP_ROOT}/students/${_sid}/lastMileage`), today);
  return addXP('mileage', _config.activities.mileage.pt ?? 20, '히스토리 마일리지 완주');
}

// 생각 체크: 제출 시 AI 채점 점수에 따라 pt(10~30)를 강의당 1회 지급한다.
// pt 계산은 호출부(제출 화면)에서 하고, 여기서는 중복 지급만 막는다(강의당 1회).
export async function addThinkCheckXP(lectureKey, pt, note) {
  if (!_config?.activities?.thinkCheck?.enabled) return null;
  const path = `${XP_ROOT}/students/${_sid}/thinkCheck/${lectureKey}`;
  const snap = await _fb.get(_fb.ref(_rtdb, path));
  if (snap.exists() && snap.val()) return null; // 이미 지급됨
  await _fb.set(_fb.ref(_rtdb, path), pt);
  return addXP('thinkCheck', pt, note || '생각 체크');
}

// 타이핑 복습: 강 무관, 하루 1회. lastTypingReview 날짜 게이트로 중복 지급을 막는다.
export async function addTypingReviewXP() {
  if (!_config?.activities?.typingReview?.enabled) return null;
  const today = _today();
  const snap  = await _fb.get(_fb.ref(_rtdb, `${XP_ROOT}/students/${_sid}/lastTypingReview`));
  if (snap.exists() && snap.val() === today) return null;
  await _fb.set(_fb.ref(_rtdb, `${XP_ROOT}/students/${_sid}/lastTypingReview`), today);
  return addXP('typingReview', _config.activities.typingReview.pt ?? 20, '타이핑 복습');
}

// ── 어드민 전용 ──

export async function adminAddXP(rtdb, sid, name, pt, note, fbFns, levels, formula) {
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
  updates[`${base}/history/${histRef.key}`] = { type: 'manual', pt, note: note || '', ts: Date.now() };
  await fbFns.update(fbFns.ref(rtdb, '/'), updates);
  return { newTotal, newLevel };
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

function _today() { return new Date().toISOString().slice(0, 10); }
