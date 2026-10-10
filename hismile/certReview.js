// 열공 마일리지 인증을 선생님이 손으로 통과·보류·실패로 바꿀 때 쓰는 공통 처리.
// hismile/admin.html(CERTS)과 lms/admin.js(대시보드 검토 카드)가 같이 쓴다 — 두 곳이 따로 계산하면
// 한쪽에서 승인하고 다른 쪽에서 반려할 때 일수·경험치가 어긋난다.
//
// 바뀌는 것은 세 가지를 한 번의 다중 경로 update로 쓴다.
//   · 인증 기록(result, manualOverride, revoked / grantedXp)
//   · 누적 일수 historyMileage/mileage, totalEarned
//   · 경험치 xp/students/{학번} (total, level, history에 'manual' 한 줄)
//
// 경험치 금액 규칙
//   · 통과로 바꿀 때: 회수했던 건(revoked)이면 그때 회수한 만큼 되돌려 준다. 처음 승인하는 건이면 지금 설정값.
//   · 통과에서 내릴 때: 그 인증으로 실제 받은 만큼 회수한다(grantedXp, 없으면 그날의 마일리지 지급 기록).
//     설정값이 나중에 올랐더라도 예전 인증은 예전 금액으로 회수해야 하기 때문이다.
//   · 보류 ↔ 실패는 일수·경험치에 손대지 않는다.

import { loadXPConfig, calcLevel } from '../shared/xp.js';

// cert.time("2026. 9. 28. 오후 3:11:22", 제출한 기기의 한국 시각)에서 제출한 날을 뽑는다.
// cert.date는 2026-10-10 이전 기록이 UTC 기준이라 주말 아침 제출이 전날로 적혀 있을 수 있다.
export function certSubmitDay(cert) {
  const m = String(cert.time || '').match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\./);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  return String(cert.date || '');
}

function kstDay(ms) {
  return new Date(Number(ms) + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

// 이 인증으로 실제 받은 경험치. 기록이 없으면 그날 받은 '히스토리 마일리지' 지급분을 찾는다(하루 한 번뿐이다).
export function grantedXpOf(cert, xpStudent) {
  if (Number.isFinite(Number(cert.grantedXp)) && cert.grantedXp != null) return Number(cert.grantedXp);
  const day = certSubmitDay(cert);
  const hit = Object.values((xpStudent && xpStudent.history) || {})
    .find(h => h && h.type === 'mileage' && kstDay(h.ts) === day);
  return hit ? Number(hit.pt) || 0 : 0;
}

// 통과로 바꿀 때 입력 칸에 미리 채워 둘 금액: 회수했던 건이면 회수한 금액, 아니면 지금 설정값.
// 실제 지급액은 선생님이 고친 값(opts.xp)이 우선한다.
export function defaultPassXp(cert, cfgPt) {
  return cert.revoked ? (Number(cert.revoked.xp) || 0) : (Number(cfgPt) || 0);
}

// fns: { ref, get, update, push } (호출하는 쪽 Firebase SDK의 함수를 넘긴다 — 버전 충돌 방지)
// opts.xp: 통과로 바꿀 때 줄 경험치(선생님이 정한 값). 없으면 defaultPassXp.
export async function reviewCert(rtdb, fns, certId, cert, to, opts = {}) {
  const from = cert.result || 'fail';
  if (from === to) return null;
  const sid = String(cert.studentNum);
  const xpBase = `xp/students/${sid}`;
  const certPath = `historyMileage/studyCert/${certId}`;
  const [cfg, xpSnap, daySnap] = await Promise.all([
    loadXPConfig(rtdb, fns),
    fns.get(fns.ref(rtdb, xpBase)),
    fns.get(fns.ref(rtdb, `historyMileage/mileage/${sid}`)),
  ]);
  const xp = xpSnap.exists() ? (xpSnap.val() || {}) : {};
  const days = Number(daySnap.val()) || 0;
  const at = new Date().toLocaleString('ko-KR');
  const [, mm, dd] = certSubmitDay(cert).split('-');
  const md = `${Number(mm)}/${Number(dd)}`;

  let xpDelta = 0, dayDelta = 0;
  const updates = {};
  if (to === 'pass') {
    const chosen = Number(opts.xp);
    xpDelta = Number.isFinite(chosen) && opts.xp !== '' && opts.xp != null
      ? Math.max(0, Math.round(chosen))
      : defaultPassXp(cert, cfg.activities?.mileage?.pt ?? 20);
    dayDelta = 1;
    updates[`${certPath}/revoked`] = null;
    updates[`${certPath}/grantedXp`] = xpDelta;
  } else if (from === 'pass') {
    xpDelta = -grantedXpOf(cert, xp);
    dayDelta = -1;
    updates[`${certPath}/revoked`] = { xp: -xpDelta, days: 1, at };
    updates[`${certPath}/grantedXp`] = null;
  }
  updates[`${certPath}/result`] = to;
  updates[`${certPath}/manualOverride`] = { at, from, to };

  if (xpDelta) {
    const total = Math.max(0, (Number(xp.total) || 0) + xpDelta);
    updates[`${xpBase}/total`] = total;
    updates[`${xpBase}/level`] = calcLevel(total, cfg.levels, cfg.levelFormula);
    if (!xp.name && cert.studentName) updates[`${xpBase}/name`] = cert.studentName;
    const key = fns.push(fns.ref(rtdb, `${xpBase}/history`)).key;
    updates[`${xpBase}/history/${key}`] = {
      type: 'manual', pt: xpDelta, ts: Date.now(), src: 'mileageReview', certId,
      note: `열공 마일리지 검토 ${xpDelta > 0 ? '승인' : '회수'} (${md} 인증)`,
    };
  }
  if (dayDelta) {
    const nd = Math.max(0, days + dayDelta);
    updates[`historyMileage/mileage/${sid}`] = nd;
    updates[`historyMileage/totalEarned/${sid}`] = nd;
  }
  await fns.update(fns.ref(rtdb), updates);
  return { from, to, xpDelta, dayDelta };
}

// 확인 창에 띄울 한 줄 요약. pt는 통과로 바꿀 때 실제로 줄 금액.
export function reviewSummary(cert, to, pt) {
  const from = cert.result || 'fail';
  if (to === 'pass') {
    const back = cert.revoked ? ` (회수했던 금액 ${Number(cert.revoked.xp) || 0}pt)` : '';
    return `누적 +1일, 경험치 +${pt}${back}`;
  }
  if (from === 'pass') return '누적 -1일, 그 인증으로 받은 경험치 회수';
  return '누적 일수·경험치 변화 없음';
}
