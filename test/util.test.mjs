// shared/util.js 순수 로직 단위 테스트. 빌드툴 없이 `node --test` 로 실행한다.
//   실행: node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kstDate, cardOpenAtPassed } from '../shared/util.js';

// KST(UTC+9) 기준 날짜로 자르는지. UTC 자정 전후가 한국에서는 이미 다음 날이다.
test('kstDate: 한국시간 기준으로 날짜를 자른다', () => {
  const utcNoon = Date.UTC(2026, 10, 4, 12, 0, 0);   // 2026-11-04 12:00 UTC = 한국 21:00
  assert.equal(kstDate(utcNoon), '2026-11-04');
  const utcLate = Date.UTC(2026, 10, 4, 15, 0, 0);   // 2026-11-04 15:00 UTC = 한국 11-05 00:00
  assert.equal(kstDate(utcLate), '2026-11-05');
});

test('cardOpenAtPassed: 공개일이 없으면 늘 열려 있다', () => {
  const now = Date.UTC(2026, 10, 3, 0, 0, 0);
  assert.equal(cardOpenAtPassed(undefined, now), true);
  assert.equal(cardOpenAtPassed('', now), true);
  assert.equal(cardOpenAtPassed('   ', now), true);
  // 형식이 어긋난 값은 잠그지 않는다 — 잘못 적은 날짜 때문에 카드가 영영 안 보이면 안 된다.
  assert.equal(cardOpenAtPassed('2026-11', now), true);
  assert.equal(cardOpenAtPassed('11/5', now), true);
  assert.equal(cardOpenAtPassed('내일', now), true);
});

test('cardOpenAtPassed: 공개일 0시(KST)부터 열린다', () => {
  const openAt = '2026-11-05';
  // 한국시간 11-04 23:59 → 아직 닫힘
  assert.equal(cardOpenAtPassed(openAt, Date.UTC(2026, 10, 4, 14, 59, 0)), false);
  // 한국시간 11-05 00:00 → 열림
  assert.equal(cardOpenAtPassed(openAt, Date.UTC(2026, 10, 4, 15, 0, 0)), true);
  // 한국시간 11-05 09:00 → 열림
  assert.equal(cardOpenAtPassed(openAt, Date.UTC(2026, 10, 5, 0, 0, 0)), true);
  // 하루 뒤에도 계속 열려 있다
  assert.equal(cardOpenAtPassed(openAt, Date.UTC(2026, 10, 6, 0, 0, 0)), true);
  // 한참 앞(2026-11-03)에는 닫힘
  assert.equal(cardOpenAtPassed(openAt, Date.UTC(2026, 10, 3, 0, 0, 0)), false);
});

test('cardOpenAtPassed: 해가 바뀌어도 글자 비교가 날짜 비교와 같다', () => {
  // 'YYYY-MM-DD'는 자리수가 고정이라 사전순 = 날짜순이다(09 < 10 비교가 깨지지 않는다).
  assert.equal(cardOpenAtPassed('2027-01-01', Date.UTC(2026, 11, 31, 10, 0, 0)), false);
  assert.equal(cardOpenAtPassed('2026-09-30', Date.UTC(2026, 9, 1, 0, 0, 0)), true);
});
