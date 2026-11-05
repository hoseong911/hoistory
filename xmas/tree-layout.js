/* ════════════════════════════════════════════════════════════════
   트리에 오너먼트를 어디에 걸지 정하는 계산.

   화면 코드와 떼어 둔 이유는 두 가지다 — 눈으로 확인하기 어려운 셈이라
   테스트(test/xmas.test.mjs)로 묶어 두고 싶었고, 트리 그림(tree.html의 <svg>)과
   좌표계를 반드시 같이 맞춰야 해서 한 곳에 숫자를 모아 두는 편이 안전하다.

   좌표는 전부 트리 그림과 같은 viewBox 단위다(가로 100, 세로 130).
   화면에서는 그대로 퍼센트로 쓴다 — 담는 칸의 가로세로 비율이 100:130이라
   x 단위 = 가로 %, y 단위 = 세로의 (y/130*100) %가 된다.
   ════════════════════════════════════════════════════════════════ */

// tree.html의 트리 그림과 맞춘 값. 그림을 고치면 여기도 같이 고친다.
export const TREE = {
  vbW: 100,
  vbH: 130,
  apexY: 6,      // 꼭대기
  baseY: 112,    // 맨 아래 가지
  baseHalf: 37,  // 맨 아래 가지의 반쪽 너비
  inset: 0.84,   // 가장자리에서 이만큼 안쪽에만 건다(가지 밖으로 비어져 나오지 않게)
  firstRowY: 20, // 첫 줄 높이(꼭대기 별과 겹치지 않게 조금 내린다)
  minRows: 6,
  maxRows: 34,   // 칸 629개. 그보다 많으면 앞 칸부터 다시 쓴다(겹쳐 달린다).
};

/** 줄이 rows개일 때 걸 수 있는 자리 수 — r번째 줄에 r+2칸 */
export function slotCapacity(rows) {
  return rows * (rows + 3) / 2;
}

/** 편지 n통을 담으려면 몇 줄이 필요한가 */
export function rowsFor(n) {
  let rows = TREE.minRows;
  while (rows < TREE.maxRows && slotCapacity(rows) < n) rows++;
  return rows;
}

/** 칸 번호 → 몇 번째 줄의 몇 번째인지 */
export function slotIndex(i, rows) {
  const cap = slotCapacity(rows);
  let k = ((i % cap) + cap) % cap;   // 자리보다 많으면 앞에서부터 다시 쓴다
  let row = 0;
  while (k >= row + 2) { k -= row + 2; row++; }
  return { row, col: k, cols: row + 2 };
}

/** 줄 수에 맞는 오너먼트 너비(viewBox 단위). 살짝 겹치게 두어야 트리가 비어 보이지 않는다. */
export function ornamentWidth(rows) {
  const bottomCols = rows + 1;
  const spread = 2 * TREE.baseHalf * TREE.inset;
  return (spread / bottomCols) * 1.15;
}

/** 줄 간격(viewBox 단위) */
export function rowGap(rows) {
  return (TREE.baseY - TREE.firstRowY) / Math.max(1, rows - 1);
}

/** 그 높이에서 트리의 반쪽 너비 */
export function halfWidthAt(y) {
  const t = (y - TREE.apexY) / (TREE.baseY - TREE.apexY);
  return Math.max(0, Math.min(1, t)) * TREE.baseHalf * TREE.inset;
}

/** 문자열에서 늘 같은 0~1 값을 뽑는다 — 새로고침해도 오너먼트가 제자리에 있게 */
export function hash01(str, salt = 0) {
  let h = (2166136261 ^ salt) >>> 0;
  const s = String(str || '');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

/**
 * 편지 id 목록(걸린 순서대로)을 받아 자리를 정한다.
 * @returns [{ id, x, y, w }]  x,y,w 는 viewBox 단위
 */
export function layout(ids) {
  const n = ids.length;
  const rows = rowsFor(n);
  const w = ornamentWidth(rows);
  const gap = rowGap(rows);
  return ids.map((id, i) => {
    const { row, col, cols } = slotIndex(i, rows);
    const baseY = TREE.firstRowY + row * gap;
    const half = halfWidthAt(baseY);
    const baseX = 50 + (((col + 0.5) / cols) * 2 - 1) * half;
    // 격자 티가 안 나게 살짝 흔들어 둔다. 흔들림도 id에서 나오므로 늘 같은 자리다.
    // 흔드는 폭은 트리 너비가 아니라 **칸 간격**에 맞춘다 — 트리 너비에 맞추면
    // 아래 줄처럼 칸이 촘촘한 데서 옆칸까지 넘어가 오너먼트가 서로 포개진다.
    const pitch = (2 * half) / cols;
    const x = baseX + (hash01(id, 1) - 0.5) * pitch * 0.3;
    const y = baseY + (hash01(id, 2) - 0.5) * gap * 0.34;
    return { id, x, y, w };
  });
}
