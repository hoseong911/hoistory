/* ════════════════════════════════════════════════════════════════
   설문 관리자 — 예전에는 index.html 안에 숨어 있던 패널을 따로 뺀 페이지.
   탭 네 개: 설문 편집 / 미리보기 / 응답 통계 / 개별 응답.
   ?s=로 학기를 고르고(없으면 진행 중인 설문), 위쪽 드롭다운으로도 바꾼다.
   ════════════════════════════════════════════════════════════════ */
import { collection, getDocs, query, orderBy, doc, setDoc, deleteDoc }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { signInWithEmailAndPassword, onAuthStateChanged, signOut }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import "../shared/offline.js";
import {
  db, auth, SURVEYS, resolveSurveyId, loadConfig, matchesSurvey,
  esc, getClassNum,
} from "./survey-core.js?v=20261102a";

// ── 지금 보고 있는 설문 ──
const SURVEY_ID = resolveSurveyId();
const SURVEY    = SURVEYS[SURVEY_ID];
let   config    = null;

// ── 상태 ──
let currentTab      = sessionStorage.getItem('svadm_tab') || 'edit';
let allResponses    = [];
let respFilterClass = 'all';   // 'all' | 1~6
let respSortDir     = 'asc';
let respIndex       = 0;
let statMatches     = {};
let previewStep     = 0;       // 0=시작 화면, 1~N=섹션, N+1=제출 완료 화면

const $ = id => document.getElementById(id);
const previewUrl = step => `index.html?s=${encodeURIComponent(SURVEY_ID)}&preview=1&step=${step}`;

// ════════ 로그인 게이트 ════════
onAuthStateChanged(auth, async user => {
  if (user) {
    $('gate').style.display = 'none';
    $('adminOverlay').style.display = 'block';
    await boot();
  } else {
    $('gate').style.display = 'flex';
    $('adminOverlay').style.display = 'none';
  }
});

async function attemptLogin() {
  const email = $('loginEmail').value.trim();
  const pw    = $('loginPw').value;
  const btn   = $('loginBtn');
  if (!email || !pw) { $('loginError').style.display = 'block'; return; }
  btn.disabled = true; btn.textContent = '확인 중...';
  try {
    await signInWithEmailAndPassword(auth, email, pw);
    $('loginError').style.display = 'none';
  } catch {
    $('loginError').style.display = 'block';
  } finally {
    btn.disabled = false; btn.textContent = '로그인';
  }
}
$('loginBtn').addEventListener('click', attemptLogin);
$('loginEmail').addEventListener('keydown', e => { if (e.key === 'Enter') $('loginPw').focus(); });
$('loginPw').addEventListener('keydown', e => { if (e.key === 'Enter') attemptLogin(); });
$('logoutBtn').addEventListener('click', () => signOut(auth));

// ════════ 시작 ════════
async function boot() {
  const sel = $('surveySel');
  sel.innerHTML = Object.entries(SURVEYS)
    .map(([id, s]) => `<option value="${esc(id)}"${id === SURVEY_ID ? ' selected' : ''}>${esc(s.term)}</option>`)
    .join('');
  sel.onchange = () => { location.search = '?s=' + encodeURIComponent(sel.value); };

  document.querySelectorAll('.adm-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.tab === currentTab);
    tab.onclick = () => {
      currentTab = tab.dataset.tab;
      sessionStorage.setItem('svadm_tab', currentTab);
      document.querySelectorAll('.adm-tab').forEach(t => t.classList.toggle('active', t === tab));
      renderTab();
    };
  });

  $('admBody').innerHTML = '<div class="empty-state">불러오는 중...</div>';
  config = await loadConfig(SURVEY_ID);
  document.title = '수업 설문조사 - 관리자 모드';
  $('admTopTitle').textContent = `관리자 패널 (${SURVEY.term})`;
  $('goSurvey').href = `index.html?s=${encodeURIComponent(SURVEY_ID)}`;
  renderTab();
}

function renderTab() {
  if (currentTab === 'edit')         return renderEdit();
  if (currentTab === 'preview')      return renderPreview();
  $('admBody').innerHTML = '<div class="empty-state">불러오는 중...</div>';
  if (currentTab === 'stats') renderStats();
  else                        renderResponses();
}

// ════════ 설문 편집 ════════
function renderEdit() {
  const body = $('admBody');
  let html = `<div class="adm-save-bar">
    <span class="adm-save-msg">변경사항을 저장하면 즉시 반영됩니다.</span>
    <button class="btn-adm-save" id="admSaveBtn">저장하기</button>
  </div>`;

  config.sections.forEach((sec, si) => {
    let qHtml = '';
    sec.questions.forEach((q, qi) => {
      const typeLbl = q.type === 'scale' ? '5점 척도' : q.type === 'checkbox' ? '복수 선택' : '주관식';
      let optsHtml = '';
      if (q.type === 'scale' || q.type === 'checkbox') {
        const rows = q.options.map((opt, oi) => `
          <div class="adm-opt-row">
            <input class="adm-opt-inp opt-inp" value="${esc(opt)}" data-si="${si}" data-qi="${qi}" data-oi="${oi}">
            ${q.type === 'checkbox' ? `<button class="adm-opt-del del-opt-btn" data-si="${si}" data-qi="${qi}" data-oi="${oi}">✕</button>` : ''}
          </div>`).join('');
        optsHtml = `
          <div class="adm-opts-label">${q.type === 'scale' ? '선택지 라벨 (1→5 순서)' : '선택지 목록'}</div>
          <div>${rows}</div>
          ${q.type === 'checkbox' ? `<button class="adm-opt-add add-opt-btn" data-si="${si}" data-qi="${qi}">+ 옵션 추가</button>` : ''}`;
      }
      qHtml += `<div class="adm-q-item">
        <div class="adm-q-meta">Q${qi + 1} · ${typeLbl} · 필수</div>
        <textarea class="adm-q-inp q-text-inp" rows="2" data-si="${si}" data-qi="${qi}">${esc(q.text)}</textarea>
        ${optsHtml}
      </div>`;
    });
    html += `<div class="adm-sec-block">
      <div class="adm-sec-hd">
        <span class="adm-sec-num">${si + 1}</span>
        <input class="adm-sec-title-inp sec-title-inp" value="${esc(sec.title)}" data-si="${si}">
      </div>
      <div class="adm-q-list">${qHtml}</div>
    </div>`;
  });

  body.innerHTML = html;

  body.querySelectorAll('.sec-title-inp').forEach(inp => {
    inp.addEventListener('input', () => { config.sections[+inp.dataset.si].title = inp.value; });
  });
  body.querySelectorAll('.q-text-inp').forEach(ta => {
    ta.addEventListener('input', () => { config.sections[+ta.dataset.si].questions[+ta.dataset.qi].text = ta.value; });
  });
  body.querySelectorAll('.opt-inp').forEach(inp => {
    inp.addEventListener('input', () => { config.sections[+inp.dataset.si].questions[+inp.dataset.qi].options[+inp.dataset.oi] = inp.value; });
  });
  body.querySelectorAll('.del-opt-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      config.sections[+btn.dataset.si].questions[+btn.dataset.qi].options.splice(+btn.dataset.oi, 1);
      renderEdit();
    });
  });
  body.querySelectorAll('.add-opt-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      config.sections[+btn.dataset.si].questions[+btn.dataset.qi].options.push('새 옵션');
      renderEdit();
    });
  });
  body.querySelector('#admSaveBtn').addEventListener('click', async () => {
    try {
      await setDoc(doc(db, 'survey_config', SURVEY_ID), config);
      alert('저장되었습니다.');
    } catch (e) { alert('저장 실패: ' + e.message); }
  });
}

// ════════ 미리보기 ════════
// 학생 화면(index.html)을 preview=1로 띄운다. 학번을 넣지 않아도 들어가지고,
// 답을 하지 않아도 다음으로 넘어가며, 제출 버튼은 눌러도 저장되지 않는다.
// 편집 탭에서 고치고 아직 저장하지 않은 내용도 그대로 비춰 보려고, 띄운 뒤 config를 보내 준다.
function renderPreview() {
  const names = ['시작 화면', ...config.sections.map((s, i) => `${i + 1}. ${s.title}`), '제출 완료'];
  if (previewStep >= names.length) previewStep = 0;

  $('admBody').innerHTML = `
    <div class="pv-bar">
      <span class="pv-msg">학생에게 보이는 그대로입니다. 답을 하지 않아도 모든 화면을 넘겨볼 수 있고, 여기서 누른 것은 저장되지 않습니다. 편집 탭에서 고친 내용은 저장 전이라도 여기에 바로 비칩니다.</span>
      <label class="pv-chk"><input type="checkbox" id="pvWide"> PC 폭으로</label>
      <a class="btn-adm-save" id="pvNewTab" target="_blank" rel="noopener">새 창으로</a>
    </div>
    <div class="pv-jump" id="pvJump">
      ${names.map((n, i) => `<button data-step="${i}"${i === previewStep ? ' class="active"' : ''}>${esc(n)}</button>`).join('')}
    </div>
    <div class="pv-stage"><div class="pv-frame" id="pvFrame"><iframe id="pvIframe" title="설문 미리보기"></iframe></div></div>`;

  showPreviewStep(previewStep);

  $('pvWide').addEventListener('change', e => {
    $('pvFrame').classList.toggle('wide', e.target.checked);
  });
  $('pvJump').querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => showPreviewStep(+btn.dataset.step));
  });
}

function showPreviewStep(step) {
  previewStep = step;
  $('pvIframe').src = previewUrl(step);
  $('pvNewTab').href = previewUrl(step);
  markPreviewStep(step);
}

function markPreviewStep(step) {
  $('pvJump')?.querySelectorAll('button').forEach(b => b.classList.toggle('active', +b.dataset.step === step));
}

// 미리보기 창이 "준비됐다"고 알려오면 지금 편집 중인 문항을 넘겨준다.
// 학생 화면에서 이전/다음으로 넘어갔을 때도 알려와, 위쪽 버튼 표시를 맞춘다.
window.addEventListener('message', e => {
  const frame = $('pvIframe');
  if (!frame || e.source !== frame.contentWindow) return;
  const d = e.data || {};
  if (d.type === 'survey-preview-ready') {
    frame.contentWindow.postMessage({ type: 'survey-preview-config', config }, '*');
  } else if (d.type === 'survey-preview-step' && typeof d.step === 'number') {
    previewStep = d.step;
    markPreviewStep(d.step);
    if ($('pvNewTab')) $('pvNewTab').href = previewUrl(d.step);
  }
});

// ════════ 응답 통계 ════════
async function renderStats() {
  const body = $('admBody');
  try {
    const snap = await getDocs(query(collection(db, 'survey_responses'), orderBy('submittedAt', 'desc')));
    const responseDocs = snap.docs.filter(d => matchesSurvey(d.data(), SURVEY_ID));
    const responses = responseDocs.map(d => d.data());
    const total = responses.length;

    if (!total) {
      body.innerHTML = '<div class="empty-state">아직 제출된 응답이 없습니다.</div>';
      return;
    }

    statMatches = {};

    let html = `<div class="adm-top-bar">
      <div class="stat-badge">총 ${total}명 응답</div>
      <button class="btn-reset" id="resetAllBtn">전체 초기화</button>
    </div>`;

    config.sections.forEach(sec => {
      html += `<div class="stat-sec-label">${esc(sec.title)}</div>`;
      sec.questions.forEach(q => {
        if (q.type === 'scale') {
          const counts = [0, 0, 0, 0, 0];
          responses.forEach(r => { const v = r.answers?.[q.id]; if (v >= 1 && v <= 5) counts[v - 1]++; });
          const answered = counts.reduce((a, b) => a + b, 0);
          const sum = counts.reduce((a, b, i) => a + b * (i + 1), 0);
          const avg = answered ? (sum / answered).toFixed(2) : '—';
          const bars = q.options.map((opt, i) => {
            const pct = total > 0 ? Math.round(counts[i] / total * 100) : 0;
            const key = `${q.id}_s${i + 1}`;
            statMatches[key] = responses
              .filter(r => r.answers?.[q.id] === i + 1)
              .map(r => ({ id: r.studentId, name: r.studentName }));
            const cntCls = counts[i] > 0 ? 'stat-bar-cnt clickable-cnt' : 'stat-bar-cnt';
            return `<div class="stat-bar-row">
              <div class="stat-bar-lbl">${esc(opt)}</div>
              <div class="stat-bar-track"><div class="stat-bar-fill" style="width:${pct}%"></div></div>
              <div class="${cntCls}" data-key="${key}" data-label="${esc(opt)}">${counts[i]}</div>
            </div>`;
          }).join('');
          html += `<div class="stat-card"><div class="stat-q-text">${esc(q.text)}</div>${bars}<div class="stat-avg">평균 ${avg}점 (${answered}명 응답)</div></div>`;

        } else if (q.type === 'checkbox') {
          const optCounts = {};
          q.options.forEach(o => optCounts[o] = 0);
          responses.forEach(r => { (r.answers?.[q.id] || []).forEach(v => { if (v in optCounts) optCounts[v]++; }); });
          const bars = q.options.map((opt, oi) => {
            const cnt = optCounts[opt] || 0;
            const pct = total > 0 ? Math.round(cnt / total * 100) : 0;
            const key = `${q.id}_c${oi}`;
            statMatches[key] = responses
              .filter(r => (r.answers?.[q.id] || []).includes(opt))
              .map(r => ({ id: r.studentId, name: r.studentName }));
            const cntCls = cnt > 0 ? 'stat-bar-cnt clickable-cnt' : 'stat-bar-cnt';
            return `<div class="stat-bar-row">
              <div class="stat-bar-lbl">${esc(opt)}</div>
              <div class="stat-bar-track"><div class="stat-bar-fill" style="width:${pct}%"></div></div>
              <div class="${cntCls}" data-key="${key}" data-label="${esc(opt)}">${cnt}</div>
            </div>`;
          }).join('');
          html += `<div class="stat-card"><div class="stat-q-text">${esc(q.text)}</div>${bars}</div>`;

        } else if (q.type === 'text') {
          const texts = responses.map(r => r.answers?.[q.id]).filter(v => v && v.trim());
          if (!texts.length) return;
          const items = texts.map(v => `<li class="stat-text-item">${esc(v)}</li>`).join('');
          html += `<div class="stat-card"><div class="stat-q-text">${esc(q.text)}</div><ul class="stat-text-list">${items}</ul></div>`;
        }
      });
    });

    body.innerHTML = html;

    body.querySelectorAll('.clickable-cnt').forEach(el => {
      el.addEventListener('click', () => {
        openRespModal(statMatches[el.dataset.key] || [], el.dataset.label);
      });
    });

    body.querySelector('#resetAllBtn').addEventListener('click', async () => {
      if (!confirm(`${SURVEY.term} 설문의 응답 데이터를 모두 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return;
      try {
        // 다른 학기 응답도 같은 컬렉션에 있으므로 이 설문 것만 지운다
        await Promise.all(responseDocs.map(d => deleteDoc(d.ref)));
        body.innerHTML = '<div class="empty-state">초기화가 완료되었습니다.</div>';
      } catch (e) { alert('초기화 실패: ' + e.message); }
    });

  } catch (e) {
    body.innerHTML = `<div class="empty-state" style="color:var(--danger)">오류: ${esc(e.message)}</div>`;
  }
}

// ── 응답자 명단 모달 ──
function openRespModal(list, label) {
  $('rlmTitle').textContent = label ? `${label} · ${list.length}명` : `${list.length}명`;
  $('rlmBody').innerHTML = list.length
    ? list.map(s => `<div class="rlm-item"><span class="rlm-item-name">${esc(s.name)}</span><span class="rlm-item-id">${esc(s.id)}</span></div>`).join('')
    : '<div class="rlm-empty">선택한 학생이 없습니다.</div>';
  $('respListModal').classList.add('open');
}
function closeRespModal() {
  $('respListModal').classList.remove('open');
}
$('rlmCloseBtn').addEventListener('click', closeRespModal);
$('respListModal').addEventListener('click', e => {
  if (e.target.id === 'respListModal') closeRespModal();
});

// ════════ 개별 응답 ════════
async function renderResponses() {
  const body = $('admBody');
  try {
    const snap = await getDocs(query(collection(db, 'survey_responses'), orderBy('submittedAt', 'desc')));
    allResponses = snap.docs.map(d => ({ _docId: d.id, ...d.data() })).filter(r => matchesSurvey(r, SURVEY_ID));
    renderResponseList();
  } catch (e) {
    body.innerHTML = `<div class="empty-state" style="color:var(--danger)">오류: ${esc(e.message)}</div>`;
  }
}

// ── 엑셀 다운로드 ──
function exportResponsesToExcel(list) {
  if (!list.length) { alert('다운로드할 응답이 없습니다.'); return; }

  const headers = ['학번', '이름', '제출일시'];
  const qMeta = [];
  config.sections.forEach(sec => {
    sec.questions.forEach(q => {
      headers.push(`${sec.title} - ${q.text}`);
      qMeta.push(q);
    });
  });

  const rows = [headers];
  list.forEach(r => {
    const date = r.submittedAt?.toDate?.() || new Date();
    const dateStr = date.toLocaleDateString('ko-KR') + ' ' + date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
    const row = [r.studentId || '', r.studentName || '', dateStr];
    qMeta.forEach(q => {
      const val = r.answers?.[q.id];
      if (val == null || val === '') { row.push(''); return; }
      if (q.type === 'scale') {
        row.push(`${val}점 (${q.options[val - 1] || ''})`);
      } else if (q.type === 'checkbox') {
        row.push(Array.isArray(val) ? val.join(', ') : String(val));
      } else {
        row.push(String(val));
      }
    });
    rows.push(row);
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = headers.map((_, i) => ({ wch: i < 3 ? 14 : 32 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '설문응답');
  const today = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `역사수업설문_${SURVEY.term}_응답_${today}.xlsx`);
}

function saveRespState() {
  sessionStorage.setItem('resp_filter', String(respFilterClass));
  sessionStorage.setItem('resp_sortdir', respSortDir);
  sessionStorage.setItem('resp_index', String(respIndex));
}

function buildRespCardHTML(r) {
  const date = r.submittedAt?.toDate?.() || new Date();
  const dateStr = date.toLocaleDateString('ko-KR') + ' ' + date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });

  const sectionGroups = [];
  let textHtml = '';

  config.sections.forEach(sec => {
    const rows = [];
    const textItems = [];
    sec.questions.forEach(q => {
      const val = r.answers?.[q.id];
      if (val == null || val === '') return;
      if (q.type === 'scale') {
        rows.push(`<td class="resp-table-q">${esc(q.text)}</td><td class="resp-table-a">${val}점 · ${esc(q.options[val - 1] || '')}</td>`);
      } else if (q.type === 'checkbox') {
        const items = Array.isArray(val) ? val : [String(val)];
        const dv = items.map(v => esc(v)).join('<br>');
        rows.push(`<td class="resp-table-q resp-table-q-narrow">${esc(q.text)}</td><td class="resp-table-a">${dv}</td>`);
      } else if (q.type === 'text') {
        textItems.push(`<div class="resp-q"><div class="resp-q-text">${esc(q.text)}</div><div class="resp-q-ans">${esc(val)}</div></div>`);
      }
    });
    if (rows.length) sectionGroups.push({ title: sec.title, rows });
    if (textItems.length) {
      textHtml += `<div class="resp-text-sec">${esc(sec.title)}</div>${textItems.join('')}`;
    }
  });

  let tableHtml = '';
  if (sectionGroups.length) {
    const bodyRows = sectionGroups.map(grp =>
      grp.rows.map((cells, i) => i === 0
        ? `<tr><td class="resp-table-sec" rowspan="${grp.rows.length}">${esc(grp.title)}</td>${cells}</tr>`
        : `<tr>${cells}</tr>`
      ).join('')
    ).join('');
    tableHtml = `<table class="resp-table"><tbody>${bodyRows}</tbody></table>`;
  }

  return `<div class="resp-card" data-docid="${esc(r._docId)}">
    <div class="resp-header">
      <div><div class="resp-name">${esc(r.studentName)}</div><div class="resp-id">${esc(r.studentId)}</div></div>
      <div class="resp-header-right">
        <div class="resp-date">${dateStr}</div>
        <button class="btn-del-resp" data-docid="${esc(r._docId)}">삭제</button>
      </div>
    </div>
    ${tableHtml}
    ${textHtml ? `<div class="resp-text-heading">서술형 응답</div>${textHtml}` : ''}
  </div>`;
}

function renderResponseList() {
  const body = $('admBody');

  if (!allResponses.length) {
    body.innerHTML = '<div class="empty-state">아직 제출된 응답이 없습니다.</div>';
    return;
  }

  const filtered = respFilterClass === 'all'
    ? allResponses.slice()
    : allResponses.filter(r => getClassNum(r.studentId) === respFilterClass);

  const sorted = filtered.slice().sort((a, b) => {
    const cmp = (a.studentId || '').localeCompare(b.studentId || '');
    return respSortDir === 'asc' ? cmp : -cmp;
  });

  const tagDefs = [
    { key: 'all', label: '전체' },
    { key: 1, label: '1반' }, { key: 2, label: '2반' }, { key: 3, label: '3반' },
    { key: 4, label: '4반' }, { key: 5, label: '5반' }, { key: 6, label: '6반' },
  ];
  const tagsHtml = tagDefs.map(t =>
    `<div class="resp-tag${respFilterClass === t.key ? ' active' : ''}" data-key="${t.key}">${t.label}</div>`
  ).join('');

  const sortArrow = respSortDir === 'asc' ? ' ↑' : ' ↓';
  const filterLabel = respFilterClass === 'all' ? '전체' : `${respFilterClass}반`;

  let html = `
    <div class="resp-tags">${tagsHtml}</div>
    <div class="resp-sort-row"><button class="resp-sort-btn active" id="respSortBtn">학번순${sortArrow}</button></div>
    <div class="adm-top-bar">
      <div class="stat-badge">${filterLabel} ${sorted.length}명 응답</div>
      <div style="display:flex;gap:8px">
        <button class="btn-adm-save" id="excelDownloadBtn">엑셀 다운로드</button>
        <button class="btn-reset" id="resetAllBtn">전체 초기화</button>
      </div>
    </div>`;

  if (!sorted.length) {
    html += '<div class="empty-state">해당 조건의 응답이 없습니다.</div>';
    body.innerHTML = html;
  } else {
    if (respIndex >= sorted.length) respIndex = sorted.length - 1;
    if (respIndex < 0) respIndex = 0;

    html += `<div class="resp-pager">
      <button class="btn-nav" id="respPrevBtn" ${respIndex <= 0 ? 'disabled' : ''}>이전</button>
      <div class="resp-pager-count">${respIndex + 1} / ${sorted.length}</div>
      <button class="btn-nav" id="respNextBtn" ${respIndex >= sorted.length - 1 ? 'disabled' : ''}>다음</button>
    </div>`;
    html += buildRespCardHTML(sorted[respIndex]);
    body.innerHTML = html;

    body.querySelector('#respPrevBtn')?.addEventListener('click', () => { respIndex--; saveRespState(); renderResponseList(); });
    body.querySelector('#respNextBtn')?.addEventListener('click', () => { respIndex++; saveRespState(); renderResponseList(); });

    body.querySelectorAll('.btn-del-resp').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('이 응답을 삭제하시겠습니까?')) return;
        try {
          await deleteDoc(doc(db, 'survey_responses', btn.dataset.docid));
          allResponses = allResponses.filter(r => r._docId !== btn.dataset.docid);
          renderResponseList();
        } catch (e) { alert('삭제 실패: ' + e.message); }
      });
    });
  }

  body.querySelectorAll('.resp-tag').forEach(tag => {
    tag.addEventListener('click', () => {
      const k = tag.dataset.key;
      respFilterClass = k === 'all' ? 'all' : parseInt(k, 10);
      respIndex = 0;
      saveRespState();
      renderResponseList();
    });
  });

  body.querySelector('#respSortBtn').addEventListener('click', () => {
    respSortDir = respSortDir === 'asc' ? 'desc' : 'asc';
    respIndex = 0;
    saveRespState();
    renderResponseList();
  });

  body.querySelector('#excelDownloadBtn').addEventListener('click', () => {
    exportResponsesToExcel(sorted);
  });

  body.querySelector('#resetAllBtn').addEventListener('click', async () => {
    if (!confirm(`${SURVEY.term} 설문의 응답 데이터를 모두 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return;
    try {
      // allResponses는 이미 이 설문 것만 걸러 둔 목록이다
      await Promise.all(allResponses.map(r => deleteDoc(doc(db, 'survey_responses', r._docId))));
      allResponses = [];
      body.innerHTML = '<div class="empty-state">초기화가 완료되었습니다.</div>';
    } catch (e) { alert('초기화 실패: ' + e.message); }
  });
}

// 새로고침해도 보던 필터·순서·쪽수를 유지한다
const savedFilter = sessionStorage.getItem('resp_filter');
if (savedFilter != null) respFilterClass = savedFilter === 'all' ? 'all' : parseInt(savedFilter, 10);
respSortDir = sessionStorage.getItem('resp_sortdir') || 'asc';
respIndex = parseInt(sessionStorage.getItem('resp_index') || '0', 10);
