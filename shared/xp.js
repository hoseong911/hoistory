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
  typingReview: { pt: 20, perLectureMax: 10, enabled: true }, // 하루 1회 + perLectureMax = 한 강의로 받을 수 있는 총 횟수(≈10일치)
  oxQuiz:       { ptPer: 1, dailyMax: 50, enabled: true }, // 맞힌 문제 +ptPer / 틀린 문제 -ptPer를 합산해 하루 한 번만 적립(addOxQuizXP). dailyMax는 하루 상한.
  annComment:   { pt: 5,  enabled: true }, // 공지 댓글 — 한 글에 한 번만
  annLike:      { pt: 2,  enabled: true }, // 공지 좋아요 — 한 글에 한 번만(취소해도 돌려받지 않고, 다시 눌러도 또 주지 않는다)
  lottery:      { enabled: true },         // 일일 뽑기 — 등수별 점수는 index.js의 LOTTERY 표에 있다
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

/* ── 일일 뽑기 티켓 ─────────────────────────────────────────────
   기본 1회에 더해, 아래 활동을 그날 처음 해내면 뽑기를 한 번씩 더 준다.
   저장 위치: xp/students/{sid}/lotteryTickets/{활동} = 티켓을 딴 날짜
   날짜를 값으로 들고 있으므로 다음 날이 되면 자동으로 무효가 된다(따로 청소할 게 없다).
   실제로 몇 번 썼는지는 lotteryUsed = { day, n }이 센다. */
export const LOTTERY_TICKET_SOURCES = ['oxQuiz', 'mileage', 'typingReview'];

// 트랜잭션 안에서 쓰는 순수 함수 — cur를 건드리지 않고 오늘치 티켓 수만 센다.
function _ticketCount(cur, today) {
  const m = (cur && cur.lotteryTickets) || {};
  return LOTTERY_TICKET_SOURCES.reduce((n, k) => n + (m[k] === today ? 1 : 0), 0);
}
// 오늘 뽑을 수 있는 총 횟수(기본 1 + 활동 보너스).
function _lotteryMax(cur, today) { return 1 + _ticketCount(cur, today); }

// ── XP 적립 ──
// gate를 주면 "읽고→확인→쓰기" 사이 시간차로 같은 지급이 여러 번 통과하는 레이스 컨디션을
// 막기 위해 RTDB 트랜잭션 하나로 게이트 확인 + 합계 갱신 + 기록 추가를 원자적으로 처리한다.
// (로그인 화면 연타, 다중 탭 등으로 같은 함수가 거의 동시에 여러 번 호출돼도 상한을 넘지 않음)
// gate 형태:
//   - 문자열: 날짜 게이트. cur[gate]가 오늘이면 중단(하루 1회)
//   - { day, map, key, max }: 날짜 게이트(day, 선택) + 횟수 게이트를 함께 건다.
//     cur[map][key]가 max 이상이면 중단, 통과하면 1 증가. 날짜 게이트에 막히면 횟수는 안 는다.
// extra: 기록 한 줄에 함께 남길 부가 정보({ lec: '28' } 등). 어드민 기록 표가 이걸 보고
//        활동 이름을 더 자세히 적는다(adminAddXP의 extra와 같은 자리).
// ticket: 주면 같은 트랜잭션 안에서 그날의 뽑기 티켓도 함께 찍는다(활동당 하루 한 장).
export async function addXP(type, pt, note, gate, extra, ticket) {
  if (!_rtdb || !_sid) return null;
  const base = `${XP_ROOT}/students/${_sid}`;
  const today   = _today();
  const dayGate = typeof gate === 'string' ? gate : (gate && gate.day) || null;
  const cap     = (gate && typeof gate === 'object' && gate.map) ? gate : null;
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
    // 티켓은 지급이 실제로 성사된 이 트랜잭션 안에서만 찍힌다(연타로 여러 장 생기지 않는다).
    if (ticket) next.lotteryTickets = { ...(cur.lotteryTickets || {}), [ticket]: today };
    next.history = { ...(cur.history || {}), [histKey]: { type, pt, note: note || '', ts: Date.now(), ...(extra || {}) } };
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
  return addXP('mileage', _config.activities.mileage.pt ?? 20, '히스토리 마일리지 완주', 'lastMileage', null, 'mileage');
}

// 타이핑 복습: 하루 1회(lastTypingReview 날짜 게이트, 강 무관)를 그대로 두고, 여기에
// "한 강의로는 총 perLectureMax회(기본 10회)까지" 상한을 더한다. 즉 같은 강의로는 최대
// 10일치만 채울 수 있고, 그 뒤로는 그 강의를 아무리 복습해도 XP가 붙지 않는다.
// 참여 자체는 어느 쪽 상한에도 막히지 않는다(호출부가 XP 없이 채점 결과만 보여줌).
// 누적 횟수 저장 위치: xp/students/{sid}/typingReviewCounts/{강의번호}
//
// 반환값: 지급 성공 시 addXP의 결과({pt, used, max, ...}),
//         못 받았으면 이유를 담은 { blocked: 'today' | 'lecture', used, max },
//         비활성/강의번호 없음 등은 null.
export async function addTypingReviewXP(lectureNum) {
  const act = _config?.activities?.typingReview;
  if (!act?.enabled) return null;
  const key = _lectureKey(lectureNum);
  if (!key) return null; // 강의 번호를 모르면 어느 강의 몫인지 셀 수 없으므로 지급하지 않는다
  const max = Number(act.perLectureMax ?? DEFAULT_ACTIVITIES.typingReview.perLectureMax) || 0;
  if (max <= 0) return null;

  //  몇 강을 복습했는지 기록에 남긴다. 예전엔 그냥 '타이핑 복습'이라 어드민 기록에서
  //  어느 강의였는지 알 수 없었다(2026-09-03). 어드민은 이 lec을 보고 "타이핑 복습(28강)"으로 적는다.
  const res = await addXP('typingReview', act.pt ?? 20, '타이핑 복습',
    { day: 'lastTypingReview', map: 'typingReviewCounts', key, max }, { lec: key }, 'typingReview');
  if (res) return res;

  // 못 받았을 때 "오늘 이미 받음"인지 "이 강의 상한 소진"인지 구분해서 알려준다
  // (안내 문구가 달라야 하므로 한 번 더 읽는다).
  try {
    const snap = await _fb.get(_fb.ref(_rtdb, `${XP_ROOT}/students/${_sid}`));
    const cur  = snap.exists() ? (snap.val() || {}) : {};
    const used = Number((cur.typingReviewCounts || {})[key]) || 0;
    if (used >= max) return { blocked: 'lecture', used, max };
    if (cur.lastTypingReview === _today()) return { blocked: 'today', used, max };
  } catch (e) { /* 읽기 실패 시엔 이유 없이 처리 */ }
  return null;
}

// OX 퀴즈: 맞힌 문제 +ptPer, 틀린 문제 -ptPer를 합산해 다 푼 시점에 한 번에 적립한다.
// 하루 한 번만 받는다 — 어느 강의를 골랐든, 몇 문제를 풀었든 그날 첫 한 판만 점수가 된다.
// 다 푼 순간 그날 몫을 쓴 것으로 치므로, 합이 0이거나 음수여도 다시 풀어 만회할 수는 없다.
// 많이 틀려 합이 음수가 되면 누적에서 깎이지만, 누적 점수가 0 밑으로 내려가지는 않는다.
// dailyMax는 하루에 받을 수 있는 상한으로만 남는다(문항을 아무리 많이 풀어도 그 이상은 없다).
// 저장 위치: xp/students/{sid}/dailyOX/{날짜} = 오늘 적립된 pt
//            xp/students/{sid}/oxDay          = 오늘 몫을 썼으면 오늘 날짜
// dailyOX는 오늘 것만 남기고 지난 날짜는 트랜잭션에서 걷어낸다(학기 내내 쌓이지 않게).
//
// 반환값: 적립됐으면 { pt, earnedToday, dailyMax, correct, wrong, newTotal, newLevel, levelUp },
//         오늘 이미 풀었으면 { blocked: 'daily', earnedToday, dailyMax },
//         활동이 꺼져 있으면 null.
export async function addOxQuizXP(correctCount, wrongCount, lessonNums) {
  const act = _config?.activities?.oxQuiz;
  if (!act?.enabled) return null;
  if (!_rtdb || !_sid) return null;

  const ptPer    = Number(act.ptPer ?? DEFAULT_ACTIVITIES.oxQuiz.ptPer) || 0;
  const dailyMax = Number(act.dailyMax ?? DEFAULT_ACTIVITIES.oxQuiz.dailyMax) || 0;
  if (ptPer <= 0 || dailyMax <= 0) return null;

  const correct = Math.max(0, Number(correctCount) || 0);
  const wrong   = Math.max(0, Number(wrongCount)   || 0);
  // 맞힌 만큼 더하고 틀린 만큼 뺀 합. 상한은 지키되 음수는 음수 그대로 간다.
  const net = Math.min((correct - wrong) * ptPer, dailyMax);

  const base    = `${XP_ROOT}/students/${_sid}`;
  const today   = _today();
  const histKey = _fb.push(_fb.ref(_rtdb, `${base}/history`)).key; // 트랜잭션 함수는 순수해야 하므로 키를 미리 뽑는다
  let result = null, blocked = null;

  const txRes = await _fb.runTransaction(_fb.ref(_rtdb, base), cur => {
    cur = cur || {};
    // 하루 한 번. 다 푼 순간 그날 몫은 끝나므로 점수가 0이거나 음수여도 횟수는 쓴 것으로 본다.
    if (cur.oxDay === today) { blocked = 'daily'; return; }

    const prevTotal = cur.total || 0;
    const newTotal  = Math.max(0, prevTotal + net); // 많이 틀려도 누적이 음수로 내려가지는 않는다
    const grant     = newTotal - prevTotal;         // 실제로 움직인 양(깎인 경우 음수)
    const newLevel  = calcLevel(newTotal);
    result = { pt: grant, newTotal, newLevel, wasLevel: calcLevel(prevTotal) };

    return {
      ...cur,
      total: newTotal, level: newLevel, name: _sname,
      oxDay:   today,                 // 오늘 몫을 썼다는 표시
      dailyOX: { [today]: grant },    // 지난 날짜는 버린다
      // 점수가 0이거나 음수여도 끝까지 풀었으면 뽑기 한 장은 준다(참여에 주는 몫).
      lotteryTickets: { ...(cur.lotteryTickets || {}), oxQuiz: today },
      history: { ...(cur.history || {}), [histKey]: { type: 'oxQuiz', pt: grant, note: 'OX 퀴즈 참여', ts: Date.now() } },
    };
  });

  if (!txRes.committed || !result) {
    const cur = (txRes.snapshot && txRes.snapshot.val()) || {};
    return { blocked: blocked || 'daily',
             earnedToday: Number((cur.dailyOX || {})[today]) || 0, dailyMax };
  }
  return { pt: result.pt, earnedToday: result.pt, dailyMax, correct, wrong,
           newTotal: result.newTotal, newLevel: result.newLevel,
           levelUp: result.newLevel > result.wasLevel };
}

// 오늘 날짜인 항목만 남긴 사본. 날짜 맵이 학기 내내 쌓이는 걸 막는다.
function _todayOnly(map, today) {
  const out = {};
  Object.entries(map || {}).forEach(([k, v]) => { if (v === today) out[k] = v; });
  return out;
}

// OX 퀴즈 오늘 현황 — 고르는 화면에 "오늘 12 / 50 pt"와 오늘 몫을 썼는지 보여 주는 용도다.
// 지급 여부는 언제나 addOxQuizXP의 트랜잭션이 정하므로 이 값은 보여 주기 전용이다.
export async function getOxQuizToday() {
  const act      = _config?.activities?.oxQuiz;
  const dailyMax = Number(act?.dailyMax ?? DEFAULT_ACTIVITIES.oxQuiz.dailyMax) || 0;
  const enabled  = act?.enabled !== false;
  const today    = _today();
  let earned = 0, done = false;
  try {
    const snap = await _fb.get(_fb.ref(_rtdb, `${XP_ROOT}/students/${_sid}`));
    const cur  = snap.exists() ? (snap.val() || {}) : {};
    earned = Number((cur.dailyOX || {})[today]) || 0;
    done   = cur.oxDay === today;
  } catch (e) { /* 못 읽으면 0으로 둔다 */ }
  return { enabled, earned, dailyMax, doneToday: done };
}

// RTDB 키로 쓸 수 없는 문자(. # $ [ ] /)를 치환한 강의 키
function _lectureKey(num) {
  const k = String(num ?? '').trim().replace(/[.#$[\]/]/g, '_');
  return k || null;
}
// 공지 문서 id도 같은 규칙으로 RTDB 키에 쓴다.
function _annKey(annId) {
  const k = String(annId ?? '').trim().replace(/[.#$[\]/]/g, '_');
  return k || null;
}

/* ── 공지 댓글 · 좋아요 ─────────────────────────────────────────
   한 글에 한 번씩만 준다. 받은 글은 annCommentIds / annLikeIds에 적어 두므로,
   댓글을 지웠다 다시 써도, 좋아요를 껐다 다시 켜도 두 번 지급되지 않는다.
   (좋아요를 취소해도 이미 받은 것을 회수하지는 않는다 — 껐다 켰다로 장난치는 걸
    막는 쪽이 중요하고, 회수까지 하면 실수로 누른 학생이 손해를 본다.) */
export async function addAnnCommentXP(annId) {
  const act = _config?.activities?.annComment;
  const key = _annKey(annId);
  if (!act?.enabled || !key) return null;
  return addXP('annComment', act.pt ?? DEFAULT_ACTIVITIES.annComment.pt, '공지 댓글 작성',
    { map: 'annCommentIds', key, max: 1 }, { ann: key });
}
export async function addAnnLikeXP(annId) {
  const act = _config?.activities?.annLike;
  const key = _annKey(annId);
  if (!act?.enabled || !key) return null;
  return addXP('annLike', act.pt ?? DEFAULT_ACTIVITIES.annLike.pt, '공지 좋아요',
    { map: 'annLikeIds', key, max: 1 }, { ann: key });
}

/* ── 일일 뽑기 ──────────────────────────────────────────────────
   기본 하루 한 번. 여기에 OX 퀴즈·히스토리 마일리지·타이핑 복습을 그날 해내면
   한 장씩 더 붙어 최대 네 번까지 뽑는다(lotteryTickets). 몇 번 썼는지는
   lotteryUsed = { day, n }이 센다 — 남은 횟수 판정은 전부 이 트랜잭션 안에서 한다.
   꽝은 마이너스인데 RTDB 규칙이 total >= 0을 요구하므로 가진 만큼만 깎는다
   (실제로 오르내린 양을 real로 돌려준다).
   등수를 고르는 일(확률표)은 호출하는 쪽에 있다. 여기서는 정해진 등수를 적기만 한다. */
export async function addLotteryXP(rank, pt, label) {
  const act = _config?.activities?.lottery;
  if (!act?.enabled || !_rtdb || !_sid) return null;
  const base = `${XP_ROOT}/students/${_sid}`;
  const today = _today();
  const histKey = _fb.push(_fb.ref(_rtdb, `${base}/history`)).key;
  let result = null;
  const txRes = await _fb.runTransaction(_fb.ref(_rtdb, base), cur => {
    cur = cur || {};
    const max  = _lotteryMax(cur, today);
    const used = (cur.lotteryUsed && cur.lotteryUsed.day === today) ? (Number(cur.lotteryUsed.n) || 0) : 0;
    if (used >= max) return;                                // 남은 횟수 없음 → 중단
    const prevTotal = cur.total || 0;
    const newTotal  = Math.max(0, prevTotal + pt);
    const real      = newTotal - prevTotal;
    const newLevel  = calcLevel(newTotal);
    result = { newTotal, newLevel, wasLevel: calcLevel(prevTotal), real, used: used + 1, max };
    const next = { ...cur, total: newTotal, level: newLevel, name: _sname };
    next.lottery     = { day: today, rank, pt: real };      // 마지막으로 뽑은 결과(화면 복원용)
    next.lotteryUsed = { day: today, n: used + 1 };
    next.history = { ...(cur.history || {}),
      [histKey]: { type: 'lottery', pt: real, note: `일일 뽑기 ${rank === 0 ? '꽝' : (rank === 'S' ? '스페셜 S' : rank + '등')}`, ts: Date.now() } };
    return next;
  });
  if (!txRes.committed || !result) return null;
  return { rank, pt: result.real, newTotal: result.newTotal, newLevel: result.newLevel,
           levelUp: result.newLevel > result.wasLevel,
           used: result.used, max: result.max, remain: result.max - result.used };
}

/* 오늘 뽑기 현황.
   { used, max, remain, tickets: {활동: true}, last: { day, rank, pt } | null }
   last는 마지막으로 뽑은 결과다 — 남은 횟수가 있어도 직전 결과를 그대로 보여 주려고 든다. */
export async function getLotteryToday() {
  if (!_rtdb || !_sid) return { used: 0, max: 1, remain: 1, tickets: {}, last: null };
  const today = _today();
  try {
    const snap = await _fb.get(_fb.ref(_rtdb, `${XP_ROOT}/students/${_sid}`));
    const cur  = snap.exists() ? (snap.val() || {}) : {};
    const max  = _lotteryMax(cur, today);
    const used = (cur.lotteryUsed && cur.lotteryUsed.day === today) ? (Number(cur.lotteryUsed.n) || 0) : 0;
    const tickets = {};
    LOTTERY_TICKET_SOURCES.forEach(k => { if ((cur.lotteryTickets || {})[k] === today) tickets[k] = true; });
    const last = (cur.lottery && cur.lottery.day === today) ? cur.lottery : null;
    return { used, max, remain: Math.max(0, max - used), tickets, last };
  } catch (e) { return { used: 0, max: 1, remain: 1, tickets: {}, last: null }; }
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
