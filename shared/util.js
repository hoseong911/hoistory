// 여러 페이지가 공유하는 공용 유틸.

// 생각 체크 등 AI 채점용 Claude 프록시(Cloud Function). 키는 서버 Secret Manager에만 있다.
export const CLAUDE_PROXY_URL = 'https://asia-northeast3-ho0911seong-56638.cloudfunctions.net/claudeProxy';

// 한국시간(KST, UTC+9) 기준 날짜(YYYY-MM-DD). 출석·마일리지·타이핑복습 일일 게이트, 대시보드 '오늘' 집계가 이 값을 쓴다.
export function kstDate(ms = Date.now()) {
  return new Date(ms + 9 * 3600 * 1000).toISOString().slice(0, 10);
}
