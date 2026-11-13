// 방탈출 「사초를 찾아라」(apps/escape/26_3.html)의 게임 데이터 자가 점검.
// 퍼즐 데이터는 HTML 안에 박혀 있으므로 파일에서 ROOMS/FINAL 블록만 떼어 내 평가한다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'apps/escape/26_3.html'), 'utf8');

// 게임 파일과 글자 하나까지 같은 가리개. 여기가 어긋나면 자물쇠가 영영 안 열린다.
const _K = 73;
const enc = s => btoa(unescape(encodeURIComponent([...s].map(c=>String.fromCharCode(c.charCodeAt(0)^_K)).join(''))));
const dec = s => [...decodeURIComponent(escape(atob(s)))].map(c=>String.fromCharCode(c.charCodeAt(0)^_K)).join('');

function slice(startMark, endMark) {
  const a = src.indexOf(startMark);
  const b = src.indexOf(endMark, a);
  assert.ok(a >= 0 && b > a, `${startMark} 블록을 못 찾았다`);
  return src.slice(a + startMark.length, b);
}

const ROOMS = new Function('enc', 'return [' + slice('const ROOMS = [', '\n];') + ']')(enc);
const FINAL = new Function('enc', 'return ' + slice('const FINAL = ', ';\n'))(enc);

test('가리개는 넣은 그대로 되돌아온다', () => {
  for (const v of ['2333', '676', '청해진', '36860']) assert.equal(dec(enc(v)), v);
});

test('다섯 방이 있고 방마다 퍼즐 둘과 자물쇠 하나다', () => {
  assert.equal(ROOMS.length, 5);
  for (const r of ROOMS) {
    assert.equal(r.puzzles.length, 2, `${r.name}의 퍼즐 수`);
    assert.ok(r.lock && r.lock.len > 0, `${r.name}의 자물쇠`);
  }
});

test('퍼즐 아이디가 겹치지 않는다', () => {
  const ids = ROOMS.flatMap(r => r.puzzles.map(p => p.id));
  assert.equal(new Set(ids).size, ids.length);
});

test('자물쇠 숫자는 적어 둔 자릿수와 맞고 숫자만 쓴다', () => {
  for (const r of [...ROOMS.map(r => r.lock), FINAL]) {
    const code = dec(r.code);
    assert.match(code, /^\d+$/, `${r.label}의 코드`);
    assert.equal(code.length, r.len, `${r.label}의 자릿수`);
  }
});

test('마지막 문은 다섯 방 연도의 끝자리를 이은 값이다', () => {
  const tail = ROOMS.map(r => dec(r.lock.code).slice(-1)).join('');
  assert.equal(dec(FINAL.code), tail);
});

test('끌어놓기 퍼즐의 모든 조각은 갈 통이 있거나 일부러 둔 미끼다', () => {
  for (const p of ROOMS.flatMap(r => r.puzzles).filter(p => p.t === 'bins')) {
    const binIds = new Set(p.bins.map(b => b.id));
    const real = p.items.filter(i => i.bin);
    for (const i of real) assert.ok(binIds.has(i.bin), `${p.id}의 "${i.label}" 통 ${i.bin}`);
    assert.ok(real.length >= p.bins.length, `${p.id}는 통보다 조각이 적다`);
    // 미끼는 한 번에 확인하는 퍼즐에서만 쓴다 — 즉시 판정이면 미끼가 끝까지 트레이에 남아 영영 안 끝난다
    if (p.items.some(i => !i.bin)) assert.equal(p.check, 'submit', `${p.id}에 미끼가 있는데 즉시 판정이다`);
    // 즉시 판정은 통이 꽉 차면 끝난다 — 통 정원 합이 조각 수와 같아야 한다
    if (p.check === 'instant') {
      const cap = p.bins.reduce((n, b) => n + p.items.filter(i => i.bin === b.id).length, 0);
      assert.equal(cap, real.length, `${p.id}의 통 정원 합`);
    }
  }
});

test('순서 퍼즐의 차례는 보기를 하나씩 빠짐없이 가리킨다', () => {
  for (const p of ROOMS.flatMap(r => r.puzzles).filter(p => p.t === 'order')) {
    assert.deepEqual([...p.order].sort((a, b) => a - b),
      p.options.map((_, i) => i), `${p.id}의 순서`);
  }
});

test('고르기 퍼즐은 정답 수와 need 가 같고 오답도 섞여 있다', () => {
  for (const p of ROOMS.flatMap(r => r.puzzles).filter(p => p.t === 'pick')) {
    const ok = p.options.filter(o => o.ok).length;
    assert.equal(ok, p.need, `${p.id}의 정답 수`);
    assert.ok(ok < p.options.length, `${p.id}에 오답이 없다`);
  }
});

test('적기 퍼즐은 받아 줄 답이 하나 이상 있다', () => {
  for (const p of ROOMS.flatMap(r => r.puzzles).filter(p => p.t === 'text')) {
    assert.ok(p.answers.length > 0, `${p.id}의 정답`);
    for (const a of p.answers) assert.ok(dec(a).trim().length > 0, `${p.id}의 빈 정답`);
  }
});

test('퍼즐과 자물쇠마다 실마리가 둘씩 있다', () => {
  for (const x of [...ROOMS.flatMap(r => [...r.puzzles, r.lock]), FINAL]) {
    assert.equal(x.hints.length, 2, `${x.title || x.label}의 실마리 수`);
  }
});

test('학생 화면 문구에 가운뎃점 구분자와 화살표를 쓰지 않는다', () => {
  const body = src.slice(src.indexOf('<body>'));
  // 고유명사 병렬(거란·여진·몽골)은 허용. 띄어쓰기를 낀 ' · ' 만이 금지된 구분자다.
  assert.ok(!body.includes(' · '), '화면 문구에 가운뎃점 구분자가 남아 있다');
  for (const bad of ['←', '→', '↑', '↓']) {
    assert.ok(!body.includes(bad), `화면 문구에 ${bad} 가 남아 있다`);
  }
});

test('컬렉션 이름에 연도나 판 번호를 넣지 않는다', () => {
  assert.ok(src.includes("'escape_records'"));
  assert.ok(!/escape26_3_\w+'/.test(src));
});
