// xmas/tree-layout.js 순수 로직 단위 테스트. 빌드툴 없이 `node --test` 로 실행한다.
//   실행: node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TREE, slotCapacity, rowsFor, slotIndex, ornamentWidth, halfWidthAt, hash01, layout
} from '../xmas/tree-layout.js';

const ids = n => Array.from({ length: n }, (_, i) => 'letter' + i);

test('slotCapacity: 줄마다 r+2칸씩 쌓인다', () => {
  assert.equal(slotCapacity(1), 2);        // 2
  assert.equal(slotCapacity(2), 5);        // 2+3
  assert.equal(slotCapacity(3), 9);        // 2+3+4
  assert.equal(slotCapacity(6), 27);
});

test('rowsFor: 편지가 적어도 최소 줄 수는 유지한다', () => {
  assert.equal(rowsFor(0), TREE.minRows);
  assert.equal(rowsFor(1), TREE.minRows);
  assert.equal(rowsFor(27), TREE.minRows);          // 6줄 정원이 27
  assert.ok(rowsFor(28) > TREE.minRows);
});

test('rowsFor: 편지 수만큼 자리가 생긴다', () => {
  for (const n of [40, 120, 161, 300, 500]) {
    assert.ok(slotCapacity(rowsFor(n)) >= n, `${n}통을 담지 못한다`);
  }
});

test('rowsFor: 최대 줄 수를 넘지 않는다', () => {
  assert.equal(rowsFor(99999), TREE.maxRows);
});

test('slotIndex: 칸 번호를 줄과 자리로 푼다', () => {
  assert.deepEqual(slotIndex(0, 6), { row: 0, col: 0, cols: 2 });
  assert.deepEqual(slotIndex(1, 6), { row: 0, col: 1, cols: 2 });
  assert.deepEqual(slotIndex(2, 6), { row: 1, col: 0, cols: 3 });
  assert.deepEqual(slotIndex(4, 6), { row: 1, col: 2, cols: 3 });
  assert.deepEqual(slotIndex(5, 6), { row: 2, col: 0, cols: 4 });
});

test('slotIndex: 자리가 모자라면 앞에서부터 다시 쓴다', () => {
  const cap = slotCapacity(6);
  assert.deepEqual(slotIndex(cap, 6), slotIndex(0, 6));
  assert.deepEqual(slotIndex(cap + 3, 6), slotIndex(3, 6));
});

test('halfWidthAt: 꼭대기는 0, 아래로 갈수록 넓어진다', () => {
  assert.equal(halfWidthAt(TREE.apexY), 0);
  assert.ok(halfWidthAt(60) > halfWidthAt(30));
  assert.ok(Math.abs(halfWidthAt(TREE.baseY) - TREE.baseHalf * TREE.inset) < 1e-9);
});

test('ornamentWidth: 편지가 많아질수록 오너먼트가 작아진다', () => {
  assert.ok(ornamentWidth(6) > ornamentWidth(12));
  assert.ok(ornamentWidth(12) > ornamentWidth(24));
});

test('hash01: 같은 글자는 늘 같은 값, 소금이 다르면 다른 값', () => {
  assert.equal(hash01('abc'), hash01('abc'));
  assert.notEqual(hash01('abc', 1), hash01('abc', 2));
  for (const s of ['', 'a', 'letter42', '가나다']) {
    const v = hash01(s);
    assert.ok(v >= 0 && v < 1, `${s} → ${v}`);
  }
});

test('layout: 오너먼트가 트리 그림 밖으로 나가지 않는다', () => {
  for (const n of [1, 5, 27, 100, 161, 400]) {
    for (const o of layout(ids(n))) {
      const half = halfWidthAt(o.y);
      // 흔들림까지 더해도 가지 안쪽에 머물러야 한다
      assert.ok(Math.abs(o.x - 50) <= half + 1e-9, `${n}통: x=${o.x} y=${o.y}`);
      assert.ok(o.y >= TREE.firstRowY - 4 && o.y <= TREE.baseY + 4, `${n}통: y=${o.y}`);
    }
  }
});

test('layout: 아래 줄 오너먼트가 서로 심하게 겹치지 않는다', () => {
  const out = layout(ids(100));
  const w = out[0].w;
  // 맨 아래 줄만 본다 — 가장 빽빽한 줄이다
  const bottom = out.filter(o => o.y > TREE.baseY - 3).sort((a, b) => a.x - b.x);
  for (let i = 1; i < bottom.length; i++) {
    assert.ok(bottom[i].x - bottom[i - 1].x > w * 0.45,
      `너무 붙었다: ${bottom[i - 1].x} / ${bottom[i].x} (너비 ${w})`);
  }
});

test('layout: 같은 편지는 늘 같은 자리에 걸린다', () => {
  const a = layout(ids(50));
  const b = layout(ids(50));
  assert.deepEqual(a, b);
});
