/**
 * ============================================================
 *  HOISTORY · shared/testIds.js
 * ------------------------------------------------------------
 *  선생님이 수업 전에 미리 돌려 보는 테스트 학번 목록.
 *  LMS 어드민(STUDENT > SETTING)에서 등록하고 Firestore
 *  `settings/lms_config`의 `testStudentIds` 배열에 저장된다.
 *
 *  이 학번들은 어드민의 목록·통계·채점 어디에도 나오면 안 된다
 *  (총원에 끼거나 미채점 인원으로 잡히면 숫자가 전부 틀어진다).
 *  학생 화면은 건드리지 않는다 — 테스트 계정도 정상 로그인은 된다.
 *
 *  사용:
 *    import { loadTestIds, isTestId } from '../../shared/testIds.js';
 *    await loadTestIds(db);                 // 목록을 읽어올 때 한 번
 *    list = list.filter(x => !isTestId(x.studentId));
 *
 *  loadTestIds를 부르기 전에는 isTestId가 항상 false라, 목록을
 *  그리기 전에 await 해두는 게 중요하다.
 * ============================================================
 */
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let _ids = new Set();
let _loaded = null;

/** settings/lms_config에서 테스트 학번을 읽어 캐시한다(같은 페이지에서 1회만 실제 조회). */
export function loadTestIds(db) {
  if (_loaded) return _loaded;
  _loaded = (async () => {
    try {
      const snap = await getDoc(doc(db, 'settings', 'lms_config'));
      const arr = snap.exists() ? (snap.data().testStudentIds || []) : [];
      _ids = new Set(arr.map(x => String(x).trim()).filter(Boolean));
    } catch (e) { _ids = new Set(); }
    return _ids;
  })();
  return _loaded;
}

/** 이 학번이 테스트 계정인가. */
export function isTestId(sid) {
  return _ids.has(String(sid == null ? '' : sid).trim());
}

/** studentId 필드를 가진 배열에서 테스트 계정을 걸러 낸다. */
export function stripTestIds(list, key = 'studentId') {
  return (list || []).filter(x => !isTestId(x && x[key]));
}
