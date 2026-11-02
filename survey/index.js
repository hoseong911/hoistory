/* ════════════════════════════════════════════════════════════════
   수업 설문조사 — 학생 화면.
   관리자 기능은 admin.html로 따로 나갔다(2026-11-02).
   주소에 preview=1 이 붙으면 "미리보기 모드"로 돈다:
     · 학번과 이름을 묻지 않고 바로 들어간다
     · 답을 하지 않아도 이전/다음으로 모든 화면을 넘겨볼 수 있다
     · 제출 버튼을 눌러도 저장되지 않고 완료 화면만 보여 준다
     · 어드민 미리보기 탭 안에서 열렸으면, 아직 저장하지 않은 문항도 받아서 비춘다
   ════════════════════════════════════════════════════════════════ */
import { addDoc, collection } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import "../shared/offline.js";
import {
  db, SURVEYS, resolveSurveyId, loadConfig, esc, isValidStudentId,
} from "./survey-core.js?v=20261102a";

const params    = new URLSearchParams(location.search);
const SURVEY_ID = resolveSurveyId();
const SURVEY    = SURVEYS[SURVEY_ID];
const PREVIEW   = params.get('preview') === '1';

document.title = PREVIEW ? `${SURVEY.title} (미리보기)` : SURVEY.title;
document.getElementById('surveyTitle').textContent = SURVEY.title;
if (PREVIEW) document.body.classList.add('preview-mode');
// 보고 있던 학기 그대로 어드민을 연다
document.getElementById('adminLink').href = `admin.html?s=${encodeURIComponent(SURVEY_ID)}`;

// ── 상태 ──
let config = null;
let step = 0;
let answers = {};
let studentId = '';
let studentName = '';

// ── 세션 저장 ──
// 설문마다 열쇠를 갈라 둔다. 같은 탭에서 다른 학기 설문을 열었을 때 진행 단계와 답이 넘어가지 않게.
// 미리보기는 아무것도 저장하지 않는다(학생 세션을 건드리면 안 되므로).
const svKey = k => `sv_${SURVEY_ID}_${k}`;
function saveSession() {
  if (PREVIEW) return;
  if (step > config.sections.length) { clearSession(); return; }
  sessionStorage.setItem(svKey('step'), step);
  sessionStorage.setItem(svKey('id'), studentId);
  sessionStorage.setItem(svKey('name'), studentName);
  sessionStorage.setItem(svKey('answers'), JSON.stringify(answers));
}
function clearSession() {
  ['step', 'id', 'name', 'answers'].forEach(k => sessionStorage.removeItem(svKey(k)));
}
function loadSession() {
  if (PREVIEW) return;
  const s = sessionStorage.getItem(svKey('step'));
  if (s == null) return;
  step = parseInt(s) || 0;
  studentId = sessionStorage.getItem(svKey('id')) || '';
  studentName = sessionStorage.getItem(svKey('name')) || '';
  try { answers = JSON.parse(sessionStorage.getItem(svKey('answers')) || '{}'); } catch { answers = {}; }
}

// ── 슬라이더 채움 ──
function setSliderFill(slider, val) {
  const pct = ((val - 1) / 4) * 100;
  slider.style.background = `linear-gradient(to right, var(--green) ${pct}%, var(--border) ${pct}%)`;
}

// ── 시작 ──
async function init() {
  config = await loadConfig(SURVEY_ID);

  if (PREVIEW) {
    step = clampStep(parseInt(params.get('step') || '0', 10));
    renderStep(false);
    askParentForConfig();
    return;
  }

  loadSession();
  history.replaceState({ surveyStep: step }, '');
  renderStep(false);
}

function clampStep(n) {
  if (!Number.isFinite(n) || n < 0) return 0;
  const last = config.sections.length + 1;
  return n > last ? last : n;
}

// ── 미리보기: 어드민이 편집 중인(아직 저장 안 한) 문항 받아오기 ──
function askParentForConfig() {
  if (window.parent === window) return;
  window.addEventListener('message', e => {
    if (e.source !== window.parent) return;
    const d = e.data || {};
    if (d.type === 'survey-preview-config' && d.config?.sections?.length) {
      config = d.config;
      step = clampStep(step);
      renderStep(false);
    }
  });
  window.parent.postMessage({ type: 'survey-preview-ready' }, '*');
}

function tellParentStep() {
  if (!PREVIEW || window.parent === window) return;
  window.parent.postMessage({ type: 'survey-preview-step', step }, '*');
}

// ── 뒤로가기 ──
window.addEventListener('popstate', e => {
  if (e.state && typeof e.state.surveyStep === 'number') {
    step = e.state.surveyStep;
    renderStep(false);
  }
});

// ── 화면 그리기 ──
function renderStep(pushHistory = true) {
  const el = document.getElementById('surveyContent');
  el.innerHTML = '';

  if (step === 0) {
    el.innerHTML = renderIntroHTML();
    el.querySelector('#startBtn').addEventListener('click', startSurvey);
  } else if (step <= config.sections.length) {
    const sec = config.sections[step - 1];
    el.innerHTML = renderSectionHTML(sec);
    el.innerHTML += renderNavHTML(step === config.sections.length);
    attachSectionListeners(sec, el);
    attachNavListeners(el, step === config.sections.length);
  } else {
    el.innerHTML = renderDoneHTML();
    el.querySelector('#homeBtn').addEventListener('click', () => {
      step = 0;
      answers = {};
      studentId = '';
      studentName = '';
      clearSession();
      renderStep();
    });
  }

  if (pushHistory && !PREVIEW) history.pushState({ surveyStep: step }, '');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  tellParentStep();
}

function renderIntroHTML() {
  const idForm = PREVIEW ? '' : `
      <div class="form-label">학번 (5자리)</div>
      <input class="form-input" id="inpId" type="text" inputmode="numeric" maxlength="5" placeholder="예: 30101" value="${esc(studentId)}">
      <div class="form-label">이름</div>
      <input class="form-input" id="inpName" type="text" placeholder="이름을 입력하세요" value="${esc(studentName)}">`;
  return `
    <div class="card intro-card">
      <div class="intro-title">안녕하세요!</div>
      <div class="intro-desc">
        이 설문은 ${SURVEY.term} 역사 수업에 대한 여러분의 솔직한 의견을 듣기 위한 것입니다.<br><br>
        총 ${config.sections.length}개 섹션으로 구성되어 있으며 약 5~10분 소요됩니다.<br>
        모든 항목이 필수이니 성실하게 답해주세요 :)
      </div>
      ${idForm}
      <button class="btn-primary" id="startBtn">시작하기</button>
    </div>`;
}

function renderSectionHTML(sec) {
  let qNum = 0;
  const qs = sec.questions.map(q => {
    if (q.type === 'scale') qNum++;
    const prefix = q.type === 'scale' ? `<span class="q-num">${qNum}.</span>` : '';
    const label = `<div class="q-label">${prefix}${esc(q.text)}</div>`;

    if (q.type === 'scale') {
      const sel = answers[q.id];
      const sliderVal = sel != null ? sel : 3;
      const isUnset = sel == null;
      const valDisplay = isUnset
        ? `<div class="slider-val-display" data-qid="${esc(q.id)}" style="display:none"></div>`
        : `<div class="slider-val-display" data-qid="${esc(q.id)}">${sliderVal}점 · ${esc(q.options[sliderVal - 1])}</div>`;
      return `<div class="q-block">${label}
        <div class="slider-wrap">
          <div class="slider-ends">
            <span>${esc(q.options[0])}</span>
            <span>${esc(q.options[4])}</span>
          </div>
          <input type="range" min="1" max="5" step="1" value="${sliderVal}"
            class="scale-slider ${isUnset ? 'unset-slider' : ''}"
            data-qid="${esc(q.id)}"
            data-opts="${esc(JSON.stringify(q.options))}">
          <div class="slider-ticks">
            <span class="slider-tick">1</span>
            <span class="slider-tick">2</span>
            <span class="slider-tick">3</span>
            <span class="slider-tick">4</span>
            <span class="slider-tick">5</span>
          </div>
          ${valDisplay}
        </div>
      </div>`;
    }

    if (q.type === 'checkbox') {
      const sel = answers[q.id] || [];
      const items = q.options.map(opt => {
        const cls = sel.includes(opt) ? 'check-item checked' : 'check-item';
        return `<div class="${cls}" data-qid="${esc(q.id)}" data-opt="${esc(opt)}">
          <div class="check-box"></div><span>${esc(opt)}</span></div>`;
      }).join('');
      return `<div class="q-block">${label}<div class="check-wrap">${items}</div></div>`;
    }

    if (q.type === 'text') {
      const val = answers[q.id] || '';
      return `<div class="q-block">${label}
        <textarea class="survey-ta" data-qid="${esc(q.id)}" placeholder="자유롭게 작성해주세요.">${esc(val)}</textarea>
        <div class="char-count" data-qid="${esc(q.id)}">${val.replace(/\s/g, '').length}자</div>
      </div>`;
    }
    return '';
  }).join('');

  return `<div class="card"><div class="sec-title">${esc(sec.title)}</div>${qs}</div>`;
}

function renderNavHTML(isLast) {
  const prevBtn = step > 1 ? `<button class="btn-nav" id="prevBtn">이전</button>` : '';
  return `<div class="nav-wrap">${prevBtn}<button class="btn-nav fill" id="nextBtn">${isLast ? '제출하기' : '다음'}</button></div>`;
}

function renderDoneHTML() {
  return `<div class="card done-wrap">
    <div class="done-icon">🎉</div>
    <div class="done-title">제출 완료!</div>
    <div class="done-desc">설문에 참여해 주셔서 감사합니다.<br>여러분의 소중한 의견이 더 좋은 수업을 만드는 데<br>큰 도움이 됩니다.</div>
    <button class="btn-home" id="homeBtn">처음으로 돌아가기</button>
  </div>`;
}

// ── 입력 이벤트 ──
function attachSectionListeners(sec, el) {
  el.querySelectorAll('.scale-slider').forEach(slider => {
    const qid = slider.dataset.qid;
    const opts = JSON.parse(slider.dataset.opts);

    if (!slider.classList.contains('unset-slider')) {
      setSliderFill(slider, parseInt(slider.value));
    }

    slider.addEventListener('input', () => {
      const val = parseInt(slider.value);
      answers[qid] = val;
      slider.classList.remove('unset-slider');
      setSliderFill(slider, val);
      const display = el.querySelector(`.slider-val-display[data-qid="${qid}"]`);
      display.style.display = '';
      display.textContent = `${val}점 · ${opts[val - 1]}`;
      saveSession();
    });
  });

  el.querySelectorAll('.check-item').forEach(item => {
    item.addEventListener('click', () => {
      const qid = item.dataset.qid;
      const opt = item.dataset.opt;
      if (!answers[qid]) answers[qid] = [];
      if (answers[qid].includes(opt)) {
        answers[qid] = answers[qid].filter(v => v !== opt);
        item.classList.remove('checked');
      } else {
        answers[qid].push(opt);
        item.classList.add('checked');
      }
      saveSession();
    });
  });

  el.querySelectorAll('.survey-ta').forEach(ta => {
    ta.addEventListener('input', () => {
      answers[ta.dataset.qid] = ta.value;
      const cc = el.querySelector(`.char-count[data-qid="${ta.dataset.qid}"]`);
      if (cc) cc.textContent = `${ta.value.replace(/\s/g, '').length}자`;
      saveSession();
    });
  });
}

function attachNavListeners(el, isLast) {
  const prev = el.querySelector('#prevBtn');
  const next = el.querySelector('#nextBtn');
  if (prev) prev.addEventListener('click', () => {
    if (PREVIEW) { step--; renderStep(false); return; }
    history.back();
  });
  if (next) next.addEventListener('click', isLast ? submitSurvey : nextStep);
}

// ── 흐름 ──
function startSurvey() {
  if (PREVIEW) { step = 1; renderStep(false); return; }
  const id   = document.getElementById('inpId').value.trim();
  const name = document.getElementById('inpName').value.trim();
  if (!id || id.length !== 5 || !/^\d+$/.test(id)) { alert('학번을 5자리 숫자로 입력해주세요.'); return; }
  if (!isValidStudentId(id)) { alert('학번 형식이 올바르지 않습니다.\n30xxx 형태로 입력해주세요. (3번째 자리는 1~6, 예외적으로 00000 허용)'); return; }
  if (!name) { alert('이름을 입력해주세요.'); return; }
  studentId = id; studentName = name;
  step = 1;
  saveSession();
  renderStep();
}

function nextStep() {
  if (PREVIEW) { step++; renderStep(false); return; }
  if (!validateSection()) return;
  step++;
  saveSession();
  renderStep();
}

function validateSection() {
  const sec = config.sections[step - 1];
  for (const q of sec.questions) {
    if (!q.required) continue;
    if (q.type === 'scale' && answers[q.id] == null) {
      alert('모든 항목을 응답해주세요.');
      return false;
    }
    if (q.type === 'checkbox' && (!answers[q.id] || !answers[q.id].length)) {
      alert('하나 이상 선택해주세요.');
      return false;
    }
    if (q.type === 'text' && (!answers[q.id] || !answers[q.id].trim())) {
      alert('모든 항목을 작성해주세요.');
      return false;
    }
  }
  return true;
}

async function submitSurvey() {
  // 미리보기에서는 저장하지 않고 완료 화면만 보여 준다
  if (PREVIEW) { step = config.sections.length + 1; renderStep(false); return; }

  if (!validateSection()) return;
  const btn = document.getElementById('nextBtn');
  btn.disabled = true; btn.textContent = '제출 중...';
  try {
    await addDoc(collection(db, 'survey_responses'), {
      studentId, studentName, submittedAt: new Date(), answers, surveyId: SURVEY_ID,
    });
    clearSession();
    step = config.sections.length + 1;
    renderStep();
  } catch (e) {
    alert('제출 중 오류가 발생했습니다. 다시 시도해주세요.\n' + e.message);
    btn.disabled = false; btn.textContent = '제출하기';
  }
}

init();
