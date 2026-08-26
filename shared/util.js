// 여러 페이지가 공유하는 공용 유틸.

// 생각 체크 등 AI 채점용 Claude 프록시(Cloud Function). 키는 서버 Secret Manager에만 있다.
export const CLAUDE_PROXY_URL = 'https://asia-northeast3-ho0911seong-56638.cloudfunctions.net/claudeProxy';

// 한국시간(KST, UTC+9) 기준 날짜(YYYY-MM-DD). 출석·마일리지·타이핑복습 일일 게이트, 대시보드 '오늘' 집계가 이 값을 쓴다.
export function kstDate(ms = Date.now()) {
  return new Date(ms + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

// ── 타이핑 복습(lecture.html?mode=typing) 접속 제한 ──
// 수업 시간에 학생이 복습 슬라이드를 열어 딴짓하는 걸 막는다.
// 평일(월~금) 08:30~15:00 KST 동안 차단하고, 공휴일·재량휴업일은 따로 가리지 않는다
// (규칙을 단순하게 유지하려는 선택 — 쉬는 날에도 그 시간대엔 똑같이 막힌다).
export const TYPING_BLOCK = { days: [1, 2, 3, 4, 5], fromMin: 8 * 60 + 30, toMin: 15 * 60 };

// 차단 시간대면 안내 문구를, 아니면 null을 돌려준다.
// ms는 가급적 서버 시각(Date.now() + RTDB serverTimeOffset)을 넘겨 기기 시계 조작을 무디게 한다.
export function typingBlockReason(ms = Date.now()) {
  const k    = new Date(ms + 9 * 3600 * 1000); // KST로 옮긴 뒤 getUTC*로 읽는다
  const day  = k.getUTCDay();
  if (!TYPING_BLOCK.days.includes(day)) return null;
  const mins = k.getUTCHours() * 60 + k.getUTCMinutes();
  if (mins < TYPING_BLOCK.fromMin || mins >= TYPING_BLOCK.toMin) return null;
  return '복습하기는 수업 시간(평일 08:30~15:00)에는 열 수 없어요. 수업 마친 뒤에 다시 눌러주세요';
}
