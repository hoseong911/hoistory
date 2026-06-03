/**
 * ============================================================
 *  HOISTORY · shared/textLimit.js  v1.0
 * ------------------------------------------------------------
 *  글자수 카운트·자르기·페이스트 차단 공통 모듈.
 *  blind_ryeo · s_threads · sillaver에 흩어져있던 동일 로직 통합.
 *
 *  사용:
 *    import { mountCharCounter, blockPaste }
 *      from '/hoistory/shared/textLimit.js';
 *
 *    mountCharCounter({
 *      input: document.getElementById('postInput'),
 *      counter: document.getElementById('charCount'),
 *      max: 300,
 *      excludeSpaces: true,
 *      format: (n, max) => `${n} / ${max}`
 *    });
 *
 *    blockPaste(document.getElementById('answerText'), {
 *      onPaste: () => showToast('직접 작성해주세요!')
 *    });
 * ============================================================
 */

/**
 * 공백 제외 글자수를 셉니다.
 * @param {string} text
 * @returns {number}
 */
export function countCharsNoSpace(text) {
  if (!text) return 0;
  return String(text).replace(/\s/g, '').length;
}

/**
 * 공백 포함 글자수를 셉니다.
 */
export function countChars(text) {
  return text ? String(text).length : 0;
}

/**
 * 공백 제외 기준으로 입력을 최대 글자수까지 자릅니다.
 * @param {string} text
 * @param {number} max - 공백 제외 최대 글자수
 * @returns {string}
 */
export function truncateNoSpace(text, max) {
  if (!text) return '';
  const s = String(text);
  let count = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch !== ' ' && ch !== '\n' && ch !== '\t') count++;
    if (count > max) return s.slice(0, i);
  }
  return s;
}

/**
 * Input/textarea에 글자수 카운터를 자동으로 wiring합니다.
 *
 * @param {Object} opts
 * @param {HTMLInputElement|HTMLTextAreaElement} opts.input
 * @param {HTMLElement} opts.counter - 카운터 표시 element
 * @param {number} opts.max - 최대 글자수
 * @param {boolean} [opts.excludeSpaces=true] - 공백 제외 카운트
 * @param {boolean} [opts.truncate=true] - 초과시 자동 자르기
 * @param {(count:number, max:number)=>string} [opts.format] - 카운터 포맷
 *
 * @returns {() => void} cleanup 함수 (이벤트 리스너 해제)
 */
export function mountCharCounter(opts) {
  const {
    input,
    counter,
    max,
    excludeSpaces = true,
    truncate = true,
    format
  } = opts;

  if (!input || !counter || !max) {
    throw new Error('[textLimit] input, counter, max는 필수입니다.');
  }

  const countFn = excludeSpaces ? countCharsNoSpace : countChars;
  const fmt = format || ((n, m) => `${n} / ${m}`);

  const update = () => {
    const len = countFn(input.value);

    // 초과 시 자르기
    if (truncate && len > max) {
      input.value = excludeSpaces
        ? truncateNoSpace(input.value, max)
        : input.value.slice(0, max);
    }

    const finalLen = countFn(input.value);
    counter.textContent = fmt(finalLen, max);

    // 상태 클래스
    counter.classList.remove('hi-count-ok', 'hi-count-warn');
    if (finalLen >= max) counter.classList.add('hi-count-warn');
    else if (finalLen > 0) counter.classList.add('hi-count-ok');
  };

  input.addEventListener('input', update);
  update();

  return () => input.removeEventListener('input', update);
}

/**
 * 입력 요소에서 복사/붙여넣기를 차단합니다.
 * @param {HTMLElement} el
 * @param {Object} [opts]
 * @param {() => void} [opts.onPaste] - 페이스트 시도 시 콜백
 * @param {() => void} [opts.onCopy] - 복사 시도 시 콜백
 */
export function blockPaste(el, opts = {}) {
  if (!el) return;
  const onPaste = (e) => {
    e.preventDefault();
    opts.onPaste?.();
  };
  const onCopy = (e) => {
    e.preventDefault();
    opts.onCopy?.();
  };
  el.addEventListener('paste', onPaste);
  el.addEventListener('copy', onCopy);
  el.addEventListener('cut', onCopy);
  el.addEventListener('contextmenu', e => e.preventDefault());
}

/**
 * 양쪽 공백 + 중간 다중 공백을 단일 공백으로 정리합니다.
 * @param {string} text
 * @returns {string}
 */
export function trimCompact(text) {
  return String(text || '').trim().replace(/\s+/g, ' ');
}

/**
 * 입력값 검증 (최소 글자수, 비속어 등).
 * @param {string} text
 * @param {Object} opts
 * @param {number} [opts.min=0] - 최소 글자수 (공백 제외)
 * @param {number} [opts.max] - 최대 글자수 (공백 제외)
 * @param {boolean} [opts.checkRepeats=false] - 반복 문자(ㅋㅋㅋㅋㅋ) 차단
 * @returns {{ok:boolean, reason?:string, message?:string, length?:number}}
 */
export function validateText(text, opts = {}) {
  const { min = 0, max, checkRepeats = false } = opts;
  const len = countCharsNoSpace(text);

  if (len < min) {
    return {
      ok: false, reason: 'too_short', length: len,
      message: `공백 제외 ${min}자 이상 작성해주세요. (현재 ${len}자)`
    };
  }
  if (max && len > max) {
    return {
      ok: false, reason: 'too_long', length: len,
      message: `최대 ${max}자까지 작성 가능합니다. (현재 ${len}자)`
    };
  }
  if (checkRepeats) {
    if (/ㅋ{5,}|ㅎ{5,}|ㅠ{5,}|ㅜ{5,}|\.{5,}/.test(text)) {
      return {
        ok: false, reason: 'repeat_chars', length: len,
        message: '반복 문자 남발은 지양해주세요.'
      };
    }
    if (text && text.match(/(.{4,})\1{2,}/)) {
      return {
        ok: false, reason: 'repeat_phrase', length: len,
        message: '반복된 문구가 감지되었습니다.'
      };
    }
  }
  return { ok: true, length: len };
}
