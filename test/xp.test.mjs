// shared/xp.js 순수 로직 단위 테스트. 빌드툴 없이 `node --test` 로 실행한다.
//   실행: node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcLevel, calcNextThreshold, DEFAULT_LEVELS, DEFAULT_FORMULA } from '../shared/xp.js';

const L = DEFAULT_LEVELS;      // [0,100,225,...,6175] (20단계)
const F = DEFAULT_FORMULA;     // { lastGap:550, increment:25 }

test('calcLevel: 표 구간', () => {
  assert.equal(calcLevel(0, L, F), 1);        // 0~99 = Lv.1
  assert.equal(calcLevel(99, L, F), 1);
  assert.equal(calcLevel(100, L, F), 2);      // 100 = Lv.2
  assert.equal(calcLevel(224, L, F), 2);
  assert.equal(calcLevel(225, L, F), 3);
  assert.equal(calcLevel(6175, L, F), 20);    // 마지막 표값 = Lv.20
});

test('calcLevel: 표 이후 공식 확장', () => {
  // 20레벨 이후: 간격 550부터 25씩 증가
  assert.equal(calcLevel(6175 + 549, L, F), 20);
  assert.equal(calcLevel(6175 + 550, L, F), 21);           // +550 → Lv.21
  assert.equal(calcLevel(6175 + 550 + 575, L, F), 22);     // 다음 간격 575 → Lv.22
});

test('calcNextThreshold: 다음 레벨까지 필요한 누적 XP', () => {
  assert.equal(calcNextThreshold(0, L, F), 100);           // Lv.1 → 다음 100
  assert.equal(calcNextThreshold(100, L, F), 225);         // Lv.2 → 다음 225
  assert.equal(calcNextThreshold(6175, L, F), 6175 + 550); // Lv.20 → 공식 확장
});

test('DEFAULT_LEVELS 형태', () => {
  assert.equal(L[0], 0);                       // 첫 값은 반드시 0
  assert.equal(L.length, 20);
  for (let i = 1; i < L.length; i++) assert.ok(L[i] > L[i - 1]); // 증가 수열
});
