/**
 * ============================================================
 *  HOISTORY · shared/profanity.js  v1.0
 * ------------------------------------------------------------
 *  비속어/욕설 검사 공통 모듈.
 *  blind_ryeo · s_threads에 동일하게 들어있던 BAD_WORDS 리스트와
 *  검사 로직을 한 곳으로 추출.
 *
 *  사용:
 *    import { containsBadWord } from '/hoistory/shared/profanity.js';
 *    if (containsBadWord(content)) {
 *      showToast('부적절한 표현이 포함되어 있어요', true);
 *      return;
 *    }
 * ============================================================
 */

// ─── 기본 사전 ──────────────────────────────────────────────
const DEFAULT_BAD_WORDS = [
  // 한국어
  "씨발","시발","쉬발","씨바","시바","ㅅㅂ","ㅆㅂ",
  "개새끼","개새","ㄱㅅㄲ","개샊","개섀끼",
  "병신","ㅂㅅ","벙신","뻥신","지랄","ㅈㄹ","지ㄹㄹ",
  "미친","미치","ㅁㅊ","미칀","엠창",
  "새끼","쌔끼","섀끼","ㅅㄲ",
  "꺼져","꺼지","죽어","죽여","뒤져","뒈져","뒤지","뒈지",
  "창녀","창년","걸레","보지","자지",
  "강간","성폭","성추","닥쳐","닥ㅊ",
  "느금마","느그엄마","니애미","니에미","니엄마",
  "존나","ㅈㄴ","좆","좆같","좋같","ㅈㅈ",
  "빡대가리","찐따","머저리","멍청",
  "ㅗㅗ","개같","개 같",
  // 영어
  "fuck","shit","bitch","asshole","bastard"
];

let _wordList = [...DEFAULT_BAD_WORDS];
let _normalizedCache = null;


// ────────────────────────────────────────────────────────────
//  Public API
// ────────────────────────────────────────────────────────────

/**
 * 텍스트에 비속어가 포함되어 있는지 확인합니다.
 * - 공백 제거 + 소문자 변환 후 부분일치 검사
 * @param {string} text
 * @returns {boolean}
 */
export function containsBadWord(text) {
  if (!text) return false;
  const normalized = String(text).replace(/\s/g, '').toLowerCase();
  if (!_normalizedCache) _buildCache();
  return _normalizedCache.some(w => normalized.includes(w));
}

/**
 * 발견된 첫 비속어를 반환합니다 (디버깅·관리자용).
 * @returns {string | null}
 */
export function findBadWord(text) {
  if (!text) return null;
  const normalized = String(text).replace(/\s/g, '').toLowerCase();
  if (!_normalizedCache) _buildCache();
  return _wordList.find((w, i) => normalized.includes(_normalizedCache[i])) || null;
}

/**
 * 사전을 교체합니다 (기본 사전을 무시).
 * @param {string[]} words
 */
export function setBadWords(words) {
  _wordList = Array.isArray(words) ? [...words] : [];
  _normalizedCache = null;
}

/**
 * 사전에 단어를 추가합니다.
 * @param {string | string[]} words
 */
export function addBadWords(words) {
  const arr = Array.isArray(words) ? words : [words];
  arr.forEach(w => { if (w && !_wordList.includes(w)) _wordList.push(w); });
  _normalizedCache = null;
}

/**
 * 사전 목록을 반환합니다.
 * @returns {string[]}
 */
export function getBadWords() {
  return [..._wordList];
}


// ────────────────────────────────────────────────────────────
function _buildCache() {
  _normalizedCache = _wordList.map(w => w.toLowerCase().replace(/\s/g, ''));
}
