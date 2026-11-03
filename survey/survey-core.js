/* ════════════════════════════════════════════════════════════════
   설문 공통 모듈 — 학생 화면(index.html)과 어드민(admin.html)이 같이 쓴다.
   · Firebase 연결, 설문 목록과 기본 문항, 저장된 설정 불러오기, 잡다한 도우미.
   · 문항·섹션 추가/삭제/순서 변경은 어드민 "설문 편집"에서 한다(2026-11-03~).
     아래 DEFAULT_CONFIG_* 는 survey_config/<설문id> 문서가 아직 없을 때만 쓰인다.
     한 번이라도 저장했다면 Firestore 문서가 우선이라 여기를 고쳐도 화면은 안 바뀐다.
   ════════════════════════════════════════════════════════════════ */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { firebaseConfig } from "../shared/firebase-config.js";

export const app  = initializeApp(firebaseConfig);
export const db   = getFirestore(app);
export const auth = getAuth(app);

// ── Default config ──
export const DEFAULT_CONFIG = {
  sections: [
    {
      id: 'sec1', title: '수업 전반',
      questions: [
        { id:'s1q1', text:'이번 학기 수업 전반에 대해 얼마나 만족하나요?', type:'scale', options:['전혀 그렇지 않다','그렇지 않다','보통이다','그렇다','매우 그렇다'], required:true },
        { id:'s1q2', text:'수업 내용이 이해하기 쉬웠나요?', type:'scale', options:['전혀 그렇지 않다','그렇지 않다','보통이다','그렇다','매우 그렇다'], required:true },
        { id:'s1q3', text:'선생님의 설명 방식이 효과적이라고 느꼈나요?', type:'scale', options:['전혀 그렇지 않다','그렇지 않다','보통이다','그렇다','매우 그렇다'], required:true },
        { id:'s1q4', text:'수업 시간에 충분한 활동이 제공되었나요?', type:'scale', options:['전혀 그렇지 않다','그렇지 않다','보통이다','그렇다','매우 그렇다'], required:true },
        { id:'s1q5', text:'수업 시간에 실시한 여러 활동이 학습에 도움이 되었나요?', type:'scale', options:['전혀 그렇지 않다','그렇지 않다','보통이다','그렇다','매우 그렇다'], required:true },
        { id:'s1q6', text:'수업의 전반적인 만족도와 관련해서 하고 싶은 말이 있다면 이야기해주세요.', type:'text', required:true },
      ]
    },
    {
      id: 'sec2', title: '학습자료',
      questions: [
        { id:'s2q1', text:'수업에 활용된 활동지는 유익했나요?', type:'scale', options:['전혀 그렇지 않다','그렇지 않다','보통이다','그렇다','매우 그렇다'], required:true },
        { id:'s2q2', text:'수업에 활용된 활동지의 분량은 적절했나요?', type:'scale', options:['전혀 그렇지 않다','그렇지 않다','보통이다','그렇다','매우 그렇다'], required:true },
        { id:'s2q3', text:'수업에 활용된 PPT는 유익했나요?', type:'scale', options:['전혀 그렇지 않다','그렇지 않다','보통이다','그렇다','매우 그렇다'], required:true },
        { id:'s2q4', text:'수업에 활용된 PPT의 분량은 적절했나요?', type:'scale', options:['전혀 그렇지 않다','그렇지 않다','보통이다','그렇다','매우 그렇다'], required:true },
        { id:'s2q5', text:'학습자료와 관련해서 하고 싶은 말이 있다면 이야기해주세요.', type:'text', required:true },
      ]
    },
    {
      id: 'sec3', title: '지필/수행평가',
      questions: [
        { id:'s3q1', text:'1학기 1회시험의 난도는 어땠나요?', type:'scale', options:['매우 쉬웠다','쉬웠다','적당했다','어려웠다','매우 어려웠다'], required:true },
        { id:'s3q2', text:'1학기 2회시험의 난도는 어땠나요?', type:'scale', options:['매우 쉬웠다','쉬웠다','적당했다','어려웠다','매우 어려웠다'], required:true },
        { id:'s3q3', text:"1학기 수행평가 중 논술형('삼국통일에 대한 나의 생각 쓰기') 수행평가의 난도는 어땠나요?", type:'scale', options:['매우 쉬웠다','쉬웠다','적당했다','어려웠다','매우 어려웠다'], required:true },
        { id:'s3q4', text:'1학기 수행평가 중 포트폴리오의 난도는 어땠나요?', type:'scale', options:['매우 쉬웠다','쉬웠다','적당했다','어려웠다','매우 어려웠다'], required:true },
        { id:'s3q5', text:'1학기 지필평가와 관련해서 배부된 총정리 자료에 대한 전반적인 만족도는 어땠나요?', type:'scale', options:['전혀 그렇지 않다','그렇지 않다','보통이다','그렇다','매우 그렇다'], required:true },
        { id:'s3q6', text:'지필평가와 관련해서 하고 싶은 말이 있다면 이야기해주세요.', type:'text', required:true },
        { id:'s3q7', text:'수행평가와 관련해서 하고 싶은 말이 있다면 이야기해주세요.', type:'text', required:true },
      ]
    },
    {
      id: 'sec4', title: '체크 활동',
      questions: [
        { id:'s4q1', text:'매 수업 시간에 했던 개념 체크의 난도는 어땠나요?', type:'scale', options:['매우 쉬웠다','쉬웠다','적당했다','어려웠다','매우 어려웠다'], required:true },
        { id:'s4q1a', text:'위 답변을 선택한 이유를 작성해주세요. 더불어 개념 체크(개념 정리 활동)에 대한 의견을 남겨주셔도 좋습니다.', type:'text', required:true },
        { id:'s4q2', text:'매 수업 시간에 했던 생각 체크의 난도는 어땠나요?', type:'scale', options:['매우 쉬웠다','쉬웠다','적당했다','어려웠다','매우 어려웠다'], required:true },
        { id:'s4q2a', text:'위 답변을 선택한 이유를 작성해주세요. 더불어 생각 체크(수업 성찰 활동)에 대한 의견을 남겨주셔도 좋습니다.', type:'text', required:true },
        { id:'s4q3', text:'기억에 남거나 가장 재밌었던 미션 체크 활동을 골라주세요. (중복 가능)', type:'checkbox', options:['(관리자가 옵션을 편집해주세요)','옵션 2','옵션 3','옵션 4','옵션 5'], required:true },
        { id:'s4q3a', text:'위 답변을 선택한 이유를 작성해주세요. 더불어 미션 체크(학생 중심 수업활동)에 대한 의견을 남겨주셔도 좋습니다.', type:'text', required:true },
        { id:'s4q3b', text:'미션 체크나 수행평가 등을 실시할 때 모둠별로 하는 것에 대해 어떻게 생각하십니까?', type:'text', required:true },
      ]
    },
    {
      id: 'sec5', title: '소감',
      questions: [
        { id:'s5q1', text:'1학기 동안 역사 수업을 하면서 본인 스스로에게 해주고 싶은 말이 있다면?', type:'text', required:true },
        { id:'s5q2', text:'2학기에 역사 수업을 들을 본인에게 하고 싶은 말이 있다면?', type:'text', required:true },
        { id:'s5q3', text:'마지막으로 역사 선생님께 하고 싶은 말이 있다면?', type:'text', required:true },
      ]
    },
  ]
};

// ── 2학기 기본 문항 ──
// 1학기 실제 설문(survey_config/main)을 바탕으로 학기만 바꿨다. 학기끼리 비교할 수 있게
// 같은 질문은 같은 id를 쓰고, 2학기에 새로 생긴 복습 활동과 포인트 문항만 sec6/s6q*로 둔다.
const AGREE5  = ['전혀 그렇지 않다','그렇지 않다','보통이다','그렇다','매우 그렇다'];
const DIFF5   = ['매우 쉬웠다','쉬웠다','적당했다','어려웠다','매우 어려웠다'];
const HELPED5 = ['매우 도움이 되지 않았다','도움이 되지 않았다','보통이다','도움이 되었다','매우 도움이 되었다'];
// 어드민에서 5점 척도 문항을 새로 만들거나 라벨을 통째로 바꿀 때 고르는 세트
export const SCALE_PRESETS = [
  { name: '동의 정도', options: AGREE5 },
  { name: '난도',      options: DIFF5 },
  { name: '도움 정도', options: HELPED5 },
];
export const DEFAULT_CONFIG_2026_2 = {
  sections: [
    {
      id: 'sec1', title: '수업 전반',
      questions: [
        { id:'s1q1', text:'이번 학기 수업 전반에 대해 얼마나 만족하나요?', type:'scale', options:AGREE5, required:true },
        { id:'s1q2', text:'수업 내용이 이해하기 쉬웠나요?', type:'scale', options:AGREE5, required:true },
        { id:'s1q3', text:'선생님의 설명 방식이 효과적이라고 느꼈나요?', type:'scale', options:AGREE5, required:true },
        { id:'s1q4', text:'수업 시간에 충분한 활동이 제공되었나요?', type:'scale', options:AGREE5, required:true },
        { id:'s1q5', text:'수업 시간에 실시한 여러 활동이 학습에 도움이 되었나요?', type:'scale', options:AGREE5, required:true },
        { id:'s1q6', text:'수업의 전반적인 만족도와 관련해서 하고 싶은 말이 있다면 이야기해주세요.', type:'text', required:true },
      ]
    },
    {
      id: 'sec2', title: '학습자료',
      questions: [
        { id:'s2q1', text:'수업에 활용된 활동지는 유익했나요?', type:'scale', options:AGREE5, required:true },
        { id:'s2q2', text:'수업에 활용된 활동지의 분량은 적절했나요?', type:'scale', options:AGREE5, required:true },
        { id:'s2q3', text:'수업에 활용된 PPT는 유익했나요?', type:'scale', options:AGREE5, required:true },
        { id:'s2q4', text:'수업에 활용된 PPT의 분량은 적절했나요?', type:'scale', options:AGREE5, required:true },
        { id:'s2q5', text:'학습자료와 관련해서 하고 싶은 말이 있다면 이야기해주세요.', type:'text', required:true },
      ]
    },
    {
      id: 'sec3', title: '지필/수행평가',
      questions: [
        // 2학기 지필평가는 한 번뿐이라 s3q2(2회시험)는 두지 않는다
        { id:'s3q1', text:'2학기 지필평가의 난도는 어땠나요?', type:'scale', options:DIFF5, required:true },
        { id:'s3q3', text:'2학기 수행평가 중 논술형 수행평가의 난도는 어땠나요?', type:'scale', options:DIFF5, required:true },
        { id:'s3q4', text:'2학기 수행평가 중 포트폴리오의 난도는 어땠나요?', type:'scale', options:DIFF5, required:true },
        { id:'s3q5', text:'2학기 지필평가와 관련해서 배부된 총정리 자료에 대한 전반적인 만족도는 어땠나요?', type:'scale', options:HELPED5, required:true },
        { id:'s3q6', text:'지필평가와 관련해서 하고 싶은 말이 있다면 이야기해주세요.', type:'text', required:true },
        { id:'s3q7', text:'수행평가와 관련해서 하고 싶은 말이 있다면 이야기해주세요.', type:'text', required:true },
      ]
    },
    {
      id: 'sec4', title: '체크 활동',
      questions: [
        { id:'s4q1', text:'매 수업 시간에 했던 개념 체크의 난도는 어땠나요?', type:'scale', options:DIFF5, required:true },
        { id:'s4q1a', text:'위 답변을 선택한 이유를 작성해주세요. 더불어 개념 체크(개념 정리 활동)에 대한 의견을 남겨주셔도 좋습니다.', type:'text', required:true },
        { id:'s4q2', text:'매 수업 시간에 했던 생각 체크의 난도는 어땠나요?', type:'scale', options:DIFF5, required:true },
        { id:'s4q2a', text:'위 답변을 선택한 이유를 작성해주세요. 더불어 생각 체크(수업 성찰 활동)에 대한 의견을 남겨주셔도 좋습니다.', type:'text', required:true },
        // 선택지는 2학기(24강~) 강의에 연결된 LMS 미션 카드 제목 그대로, 연결 강의번호 순서
        { id:'s4q3', text:'기억에 남거나 가장 재밌었던 미션 체크 활동을 골라주세요. (중복 가능)', type:'checkbox', options:[
          '조선의 기틀을 만든 자들',             // 25강
          '유교적 통치 이념',                    // 27강
          '사화 네컷',                           // 28강
          '사화에서 살아남기',                   // 29강
          '전란의 도미노',                       // 32강
          '영조와 정조의 머릿속을 들여다보다',   // 35강
        ], required:true },
        { id:'s4q3a', text:'위 답변을 선택한 이유를 작성해주세요. 더불어 미션 체크(학생 중심 수업활동)에 대한 의견을 남겨주셔도 좋습니다.', type:'text', required:true },
        { id:'s4q3b', text:'미션 체크나 수행평가 등을 실시할 때 모둠별로 하는 것에 대해 어떻게 생각하십니까?', type:'text', required:true },
      ]
    },
    {
      id: 'sec6', title: '복습 활동과 포인트',
      questions: [
        { id:'s6q1', text:'타이핑 복습이 수업 내용을 복습하는 데 도움이 되었나요?', type:'scale', options:AGREE5, required:true },
        { id:'s6q2', text:'OX 퀴즈가 수업 내용을 복습하는 데 도움이 되었나요?', type:'scale', options:AGREE5, required:true },
        { id:'s6q3', text:'포인트(경험치) 제도가 수업에 참여하는 동기가 되었나요?', type:'scale', options:AGREE5, required:true },
        { id:'s6q4', text:'복습 활동이나 포인트 제도와 관련해서 하고 싶은 말이 있다면 이야기해주세요.', type:'text', required:true },
      ]
    },
    {
      id: 'sec5', title: '소감',
      questions: [
        { id:'s5q1', text:'2학기 동안 역사 수업을 하면서 본인 스스로에게 해주고 싶은 말이 있다면?', type:'text', required:true },
        { id:'s5q2', text:'고등학교에 가서 역사를 공부할 본인에게 하고 싶은 말이 있다면?', type:'text', required:true },
        { id:'s5q3', text:'마지막으로 역사 선생님께 하고 싶은 말이 있다면?', type:'text', required:true },
      ]
    },
  ]
};

// ── 설문 목록 ──
// 주소의 ?s=로 고르고, 없으면 지금 진행 중인 설문(CURRENT_SURVEY)을 띄운다. 지난 설문은 ?s=로 연다(1학기는 ?s=main).
// 설문 id가 곧 survey_config 문서 id이고, 응답은 같은 survey_responses에 surveyId 필드로 구분한다.
// 1학기 응답은 이 필드가 없으므로 'main'으로 본다.
export const SURVEYS = {
  'main':   { term: '1학기', title: '2026학년도 3학년 1학기 역사 수업 설문조사', defaults: DEFAULT_CONFIG },
  '2026-2': { term: '2학기', title: '2026학년도 3학년 2학기 역사 수업 설문조사', defaults: DEFAULT_CONFIG_2026_2 },
};

export const CURRENT_SURVEY = '2026-2';

/* 주소의 ?s=로 설문을 고른다. 값이 없거나 모르는 값이면 진행 중인 설문. */
export function resolveSurveyId(search = location.search) {
  const p = new URLSearchParams(search).get('s');
  return SURVEYS[p] ? p : CURRENT_SURVEY;
}

/* 저장된 설정이 있으면 그걸, 없으면 코드에 적힌 기본 문항을 쓴다. */
export async function loadConfig(surveyId) {
  try {
    const snap = await getDoc(doc(db, 'survey_config', surveyId));
    if (snap.exists()) return snap.data();
  } catch { /* 오프라인 등 — 기본 문항으로 넘어간다 */ }
  return JSON.parse(JSON.stringify(SURVEYS[surveyId].defaults));
}

/* 1학기 응답에는 surveyId 필드가 없으므로 'main'으로 본다. */
export const matchesSurvey = (r, surveyId) => (r.surveyId || 'main') === surveyId;

export function esc(s) {
  if (s == null) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

export function isValidStudentId(id) {
  if (id === '00000') return true;
  return /^30[1-6]\d{2}$/.test(id);
}

export function getClassNum(id) {
  if (!id || id === '00000') return 0;
  const n = parseInt(id[2], 10);
  return (n >= 1 && n <= 6) ? n : 0;
}
