/* ════════════════════════════════════════════════════════
   슬라이드 렌더링 엔진 — lesson.html(학생용)과 admin.html(미리보기)이
   똑같이 이 파일을 불러써서, 슬라이드 HTML 생성 로직이 항상 일치하도록 한다.
   ════════════════════════════════════════════════════════ */
(function (global) {
  console.log('[SlideRender] v20260815c loaded');

  // 스페이스를 2칸 이상 연달아 쓰면 브라우저가 하나로 줄여버리므로, 짝수 번째
  // 스페이스를 &nbsp;로 바꿔 타이핑한 칸 수 그대로 보이게 한다(홀수 번째는 일반
  // 스페이스로 남겨둬서 줄바꿈 지점은 그대로 유지된다).
  function preserveSpaces(str) {
    return String(str).replace(/ {2,}/g, run =>
      Array.from(run, (_, i) => (i % 2 === 0 ? ' ' : '&nbsp;')).join('')
    );
  }

  // 빈칸({})이나 괄호 축소 없이 **굵게** 문법만 적용. 생각 Check 질문처럼 빈칸 문법이
  // 필요 없는 일반 텍스트에 쓴다.
  function boldOnly(str) {
    return String(str).replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  }

  // 강 번호 표기 규칙: 순수 숫자면 "N강", 문자(OT/안내 등)가 섞이면 "강" 없이 그대로 둔다.
  function isNumericNum(n) { return /^\d+$/.test(String(n == null ? '' : n).trim()); }
  function lessonNumTag(num) { return isNumericNum(num) ? `${num}강` : `${num}`; }

  function parseText(str) {
    // 빈칸을 임시 플레이스홀더로 보호
    const blanks = [];
    let s = preserveSpaces(str).replace(/\{([^}]+)\}/g, (_, inner) => {
      blanks.push(inner);
      return `\x00${blanks.length - 1}\x00`;
    });
    // **굵게** 문법
    s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    // 괄호 안에 빈칸(\x00)이 없는 경우에만 80% 크기 적용.
    // 단 (가)(나)(다)처럼 한 글자짜리 글머리 기호는 축소하지 않고 본문 크기로 둔다.
    s = s.replace(/\(([^()\x00]*)\)/g, (m, inner) =>
      /^[가-힣]$/.test(inner) ? m : `<span class="paren-note">(${inner})</span>`);
    // 플레이스홀더를 빈칸 span으로 복원. data-answer에 정답 원문을 담아 타이핑 모드 채점에 쓴다.
    s = s.replace(/\x00(\d+)\x00/g, (_, i) => {
      const ans = blanks[+i];
      const attr = ans.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return `<span class="blank" data-answer="${attr}">${ans}</span>`;
    });
    // 소프트 줄바꿈: U+2028 -> <br> (편집기 Shift+Enter). U+200B(편집기 표시)는 제거.
    s = s.replace(new RegExp(String.fromCharCode(0x200B), 'g'), '')
         .replace(new RegExp(String.fromCharCode(0x2028), 'g'), '<br>');
    return s;
  }

  /* \n 또는 <br>/</br> 위치에서 줄바꿈 + 내어쓰기. <br>은 어드민 편집기의 textarea가
     항목(items) 구분자로 실제 개행(\n)을 쓰기 때문에, 한 항목 "안에서" 줄을 나누고 싶을
     때(예: ①에 딸린 a./b./c. 하위 줄, 또는 그 본문 중간에 Shift+Enter로 넣는 줄바꿈) 개행
     대신 쓰는 표시다.

     " : "로 시작하는 줄(예: "b.유입 : ...")은 소제목(item-sublead)+본문(sub-body)을 가로
     flex(sub-line)로 묶는다. 그 다음에 이어지는, " : "가 없는 줄들(Shift+Enter로 추가한
     줄바꿈)은 새 sub-line을 만들지 않고 직전 소제목의 sub-body 안에 <br>로 합쳐 넣는다 —
     sub-body가 본문 시작 위치에서 시작하는 flex:1 박스이므로, 안에서 줄이 나뉘어도(수동
     줄바꿈이든 자동 줄바꿈이든) 항상 본문 시작 위치에 맞춰 내어쓰기된다. */
  function renderWithBreaks(text) {
    const lines = text
      .replace(new RegExp(String.fromCharCode(0x200B), 'g'), '')
      .replace(new RegExp(String.fromCharCode(0x2028), 'g'), '\n')
      .replace(/<\/?br\s*\/?>/gi, '\n').split('\n');
    const out = [];
    let subLead = null, subBodyLines = null;

    function flushSub() {
      if (subLead === null) return;
      const body = subBodyLines.map(parseText).join('<br>');
      out.push(`<span class="sub-line"><span class="item-sublead">${parseText(subLead)}</span><span class="sub-body">${body}</span></span>`);
      subLead = null;
      subBodyLines = null;
    }

    lines.forEach(line => {
      if (/^[a-z]\.\s/.test(line)) {
        // a./b./c. 마커: 콜론 유무와 무관하게 무조건 새 하위항목. "a." 만 sublead, 나머지 전체가 본문.
        flushSub();
        subLead = line.slice(0, 2);
        subBodyLines = [line.slice(3)];
      } else {
        const colonIdx = line.indexOf(' : ');
        if (colonIdx > -1) {
          flushSub();
          subLead = line.slice(0, colonIdx);
          subBodyLines = [line.slice(colonIdx + 3)];
        } else if (subBodyLines) {
          subBodyLines.push(line);
        } else {
          out.push(out.length === 0 ? parseText(line) : `<br><span class="line-cont">${parseText(line)}</span>`);
        }
      }
    });
    flushSub();

    return out.join('');
  }

  /* item 문자열이 "소제목 : <br>..." 형태 — 즉 Tab으로 소제목을 구분한 직후 곧바로
     Shift+Enter를 눌러 본문이 빈 줄로 시작하는 형태인지 판별한다. rowHTML이 이 값을
     보고 <p>를 가로 배치(기존, 내어쓰기 있음) 대신 세로 배치(내어쓰기 없음)로 바꾼다. */
  function isStackedItem(str) {
    const colonIdx = str.indexOf(' : ');
    if (colonIdx > -1 && /^<br\s*\/?>/i.test(str.slice(colonIdx + 3))) return true;
    const brIdx = str.indexOf('<br>');
    return brIdx > -1 && /^[a-z]\.\s/.test(str.slice(brIdx + 4));
  }

  /* " : " 기준으로 소제목(item-lead)과 본문(item-text) 분리. 콜론은 제거.
     isStackedItem이 true인 경우, 본문 맨 앞의 빈 줄(<br>)은 렌더링에 쓰지 않고
     제거한다 — 줄바꿈 자체는 rowHTML이 <p>를 세로 배치로 바꿔서 대신 표현하므로,
     여기 남겨두면 위쪽에 빈 줄이 하나 더 끼어드는 이중 간격이 생긴다. */
  function parseItemText(str) {
    // 원문자(①~㉿) 및 괄호숫자 (1) (2) 등 앞 번호 제거
    str = str.replace(/^[①-⑳㉑-㊿]\s*/, '').replace(/^\(\d+\)\s*/, '');

    // Case 1: 아이템 자체가 a./b./c. 마커로 시작 → item-lead 없이 전체를 renderWithBreaks에 넘김
    if (/^[a-z]\.\s/.test(str)) {
      return `<span class="item-text">${renderWithBreaks(str)}</span>`;
    }

    // Case 2: "제목<br>a./b./c. 하위항목" 형태 — ① 뗀 후 첫 줄이 제목, <br> 이후 a.b.c. 시작
    // e.g. "건국 과정<br>a. {이성계} : ...<br>b. ...<br>c. ..."
    const firstBr = str.indexOf('<br>');
    if (firstBr > -1 && /^[a-z]\.\s/.test(str.slice(firstBr + 4))) {
      const heading = str.slice(0, firstBr);
      const subs    = str.slice(firstBr + 4);
      return `<span class="item-lead">${parseText(heading)}</span><span class="item-text">${renderWithBreaks(subs)}</span>`;
    }

    // Case 2b: "소제목 a. ..." 형태 — 소제목 앞에 ' : ' 없는 경우
    const subItemMatch = str.match(/^(.+?)\s([a-z]\.\s)/);
    if (subItemMatch && !subItemMatch[1].includes(' : ')) {
      const leadRaw = subItemMatch[1];
      const rest = str.slice(leadRaw.length + 1);
      return `<span class="item-lead">${parseText(leadRaw)}</span><span class="item-text">${renderWithBreaks(rest)}</span>`;
    }

    // Case 3: "소제목 : 본문" 형태 (기존 콜론 구분)
    const colonIdx = str.indexOf(' : ');
    if (colonIdx > -1) {
      const leadRaw = str.slice(0, colonIdx);
      let   rest     = str.slice(colonIdx + 3);
      if (isStackedItem(str)) rest = rest.replace(/^<br\s*\/?>/i, '');
      return `<span class="item-lead">${parseText(leadRaw)}</span><span class="item-text">${renderWithBreaks(rest)}</span>`;
    }

    return `<span class="item-text">${renderWithBreaks(str)}</span>`;
  }

  /* 표지 제목의 **핵심어**를 강조(오렌지)로. 빈칸/괄호 축소는 표지에선 쓰지 않는다. */
  function coverParse(str) {
    return preserveSpaces(str).replace(/\*\*([^*\n]+)\*\*/g, '<em>$1</em>');
  }
  function coverHTML(lesson) {
    // 제목은 \n 기준으로 줄을 나눠 각 줄이 좌·우에서 번갈아 밀려들어오는 스플릿 진입을 쓴다.
    const lines = String(lesson.title || '').split('\n');
    const titleLines = lines.map(l => `<span class="cline">${coverParse(l)}</span>`).join('');
    // 단원명·교과서 페이지 메타. 둘 다 있을 때만 사이에 '|' 바를 넣고, 하나만 있으면 그것만,
    // 둘 다 비어 있으면 메타 줄(바 포함) 자체를 렌더하지 않는다.
    const unit = String(lesson.unit || '').trim();
    const page = String(lesson.page || '').trim();
    const metaInner = (unit && page)
      ? `${preserveSpaces(unit)} &nbsp;|&nbsp; ${preserveSpaces(page)}`
      : preserveSpaces(unit || page);
    const metaHTML = metaInner ? `<div class="cover-meta">${metaInner}</div>` : '';
    return `
      <div class="cover-script">Dive into<br>History</div>
      <div class="intro-sweep"></div>
      <div class="cover-num">${lessonNumTag(lesson.num)}</div>
      <div class="cover-fg">
        <div class="cover-tagline">생각하고 활동하고 질문하는 역사 수업</div>
        <h1 class="cover-title">${titleLines}</h1>
        ${metaHTML}
      </div>
    `;
  }

  /* 번호가 매겨진 목록 형태의 슬라이드(학습 목표, 초성 퀴즈가 이 구성을 공유한다).
     둘 다 Dive into History 묶음이라 배지는 "Dive into History", 제목만 다르게 표시한다.
     startNum: 초성 퀴즈가 여러 페이지로 나뉠 때 번호가 이어지도록(6번 문제부터 시작 등). */
  function numberedListHTML(items, badgeLabel, headerTitle, startNum) {
    const base = startNum || 1;
    return `
      <div class="intro-sweep"></div>
      <div class="slide-header">
        <span class="check-badge">${badgeLabel}</span>
        <h2 class="slide-title">${preserveSpaces(headerTitle)}</h2>
      </div>
      <div class="obj-list">
        ${items.map((o, i) => `
          <div class="obj-item">
            <span class="obj-num">${base + i}</span>
            <p class="obj-text">${parseText(o)}</p>
          </div>
        `).join('')}
      </div>
    `;
  }
  function objectivesHTML(lesson) { return numberedListHTML(lesson.objectives, 'Dive into History', '학습 목표'); }
  function chosungHTML(slide, lesson) {
    return numberedListHTML(slide.items, 'Dive into History', '지난 수업 시간에는?', (slide.numOffset || 0) + 1);
  }

  /* 초성 퀴즈 문항이 많으면 한 화면(약 8줄)을 넘기 전에 다음 페이지로 넘긴다.
     글자수로 줄바꿈 줄 수를 어림잡는 방식은 실제 폭·폰트와 안 맞아 문항 하나가 이미
     8줄로 잡혀 "한 줄짜리 문항도 페이지 하나를 통째로 차지"하는 문제가 있었다. 대신
     실제 프로덕션과 똑같은 DOM(.slide-chosung .obj-item .obj-text)을 화면 밖에
     그대로 만들어 각 문항을 진짜로 렌더해보고 줄바꿈 줄 수를 측정한다 — 폭·폰트가
     나중에 바뀌어도 이 숫자가 항상 실제와 일치한다. */
  let _chosungMeasureP = null;
  function ensureChosungMeasureP() {
    if (_chosungMeasureP) return _chosungMeasureP;
    const wrap = document.createElement('div');
    wrap.className = 'slide slide-chosung';
    wrap.style.cssText = 'position:fixed;left:-9999px;top:0;width:1920px;height:1080px;visibility:hidden;pointer-events:none;';
    const list = document.createElement('div');
    list.className = 'obj-list';
    const item = document.createElement('div');
    item.className = 'obj-item';
    const num = document.createElement('span');
    num.className = 'obj-num';
    num.textContent = '1';
    const p = document.createElement('p');
    p.className = 'obj-text';
    item.appendChild(num);
    item.appendChild(p);
    list.appendChild(item);
    wrap.appendChild(list);
    document.body.appendChild(wrap);
    _chosungMeasureP = p;
    return p;
  }
  function measureChosungLines(text) {
    // document가 없는 극히 예외적인 상황(테스트 등) 대비 안전장치 — 글자수로 대략 추정.
    if (typeof document === 'undefined') {
      const len = String(text || '').replace(/[{}]/g, '').length;
      return Math.max(1, Math.ceil(len / 28));
    }
    const p = ensureChosungMeasureP();
    p.innerHTML = parseText(text || '');
    const lineHeight = parseFloat(getComputedStyle(p).lineHeight) || 74;
    const h = p.getBoundingClientRect().height;
    return Math.max(1, Math.round(h / lineHeight));
  }
  function buildChosungSlides(items) {
    const MAX_LINES = 8;
    const pages = [];
    let cur = [], curLines = 0;
    (items || []).forEach(it => {
      const ln = measureChosungLines(it);
      if (cur.length && curLines + ln > MAX_LINES) { pages.push(cur); cur = []; curLines = 0; }
      cur.push(it);
      curLines += ln;
    });
    if (cur.length) pages.push(cur);
    let offset = 0;
    return pages.map(group => {
      const s = { type: 'chosung', items: group, numOffset: offset };
      offset += group.length;
      return s;
    });
  }

  // 좌측 라벨 6자 줄바꿈: 6자(공백 포함) 이내로 자르되 6자 안 마지막 공백에서 끊고,
  // 공백이 없으면 6자에서 강제로 끊는다.
  function wrapLabelLine(text) {
    let arr = [...String(text)];
    if (arr.length <= 6) return [String(text)];
    const out = [];
    while (arr.length > 6) {
      let br = -1;
      for (let k = Math.min(6, arr.length - 1); k >= 1; k--) { if (arr[k] === ' ') { br = k; break; } }
      const cut = br > 0 ? br : 6;
      out.push(arr.slice(0, cut).join('').trim());
      arr = arr.slice(br > 0 ? cut + 1 : cut);
      while (arr[0] === ' ') arr = arr.slice(1);
    }
    if (arr.length) out.push(arr.join('').trim());
    return out;
  }

  function rowHTML(row, labelPos, bottomQuote) {
    const rawItems = row.items || [];
    const CIRCLE_RE = /^[①-⑳㉑-㊿]\s*/;

    // 1. rawItems를 줄 단위로 납작하게 펴기 (<br>도 줄바꿈으로 처리)
    //    단, "→"로 시작하는 줄은 화살표에서 줄을 바꾸지 않고 바로 앞 줄에 이어 붙인다.
    // U+2028(Shift+Enter로 같은 항목 안에 이어붙인 줄바꿈) 뒤에 곧바로(또는 예전 편집기
    // 버그로 남은 U+200B 잔재 몇 개를 사이에 두고) a./b./c. 하위 항목 마커가 오면, 원래
    // 별도 하위 항목으로 갈라졌어야 하는데 그냥 이어붙여져 저장된 데이터다(a.는 굵게
    // 나오는데 b.는 일반 텍스트로 보이던 문제 — 실제로 U+2028 뒤에 U+200B가 여러 개 낀
    // 채로 저장된 사례가 있었음). 그 경우만 줄바꿈으로 되살려 재분류하고, 그 외
    // U+2028(문장 중간 줄바꿈)은 그대로 둬서 기존 동작에 영향 없게 한다.
    const SOFT_SUBITEM_RE = new RegExp(String.fromCharCode(0x2028) + String.fromCharCode(0x200B) + '*(?=[a-z]\\.\\s)', 'g');
    const lines = [];
    rawItems.forEach(item => {
      item.replace(SOFT_SUBITEM_RE, '\n').replace(/<\/?br\s*\/?>/gi, '\n').split('\n').forEach(line => {
        const t = line.trim();
        if (!t) return;
        if (/^→/.test(t) && lines.length) lines[lines.length - 1] += ' ' + t;
        else lines.push(t);
      });
    });

    // 2. 각 줄 분류
    function classifyLine(line) {
      if (CIRCLE_RE.test(line)) {
        const bare = line.replace(CIRCLE_RE, '');
        const ci = bare.indexOf(' : ');
        const m  = bare.match(/^(.+?)\s([a-z]\.\s)/);
        // a.가 :보다 먼저 나오면 → 제목+인라인소제목
        if (m && (ci === -1 || ci > m[1].length)) {
          return { type: 'title-sub', title: m[1], firstSub: bare.slice(m[1].length + 1) };
        }
        // 콜론 구분 → 제목+내용
        if (ci > -1) return { type: 'title-colon', title: bare.slice(0, ci), content: bare.slice(ci + 3) };
        // 제목만
        return { type: 'title-alone', title: bare };
      }
      if (/^[a-z]\.\s/.test(line)) {
        return { type: 'sub', marker: line.slice(0, 2), body: line.slice(3) };
      }
      return { type: 'text', content: line };
    }

    const classified = lines.map(classifyLine);

    // 3. 그루핑: title-sub + 이어지는 sub, 연속 sub끼리 묶기
    const groups = [];
    let i = 0;
    while (i < classified.length) {
      const cl = classified[i];
      if (cl.type === 'title-sub') {
        const subs = [{ marker: cl.firstSub.slice(0, 2), body: cl.firstSub.slice(3) }];
        i++;
        while (i < classified.length && classified[i].type === 'sub') { subs.push(classified[i]); i++; }
        groups.push({ type: 'title-with-subs', title: cl.title, subs });
      } else if (cl.type === 'sub') {
        const subs = [cl];
        i++;
        while (i < classified.length && classified[i].type === 'sub') { subs.push(classified[i]); i++; }
        groups.push({ type: 'subs-standalone', subs });
      } else {
        groups.push(cl);
        i++;
      }
    }

    // 4. 렌더링
    function renderSub(sub) {
      return `<span class="sub-line"><span class="item-sublead">${sub.marker}</span><span class="sub-body">${parseText(sub.body)}</span></span>`;
    }

    const itemsHtml = groups.map(g => {
      if (g.type === 'title-with-subs') {
        return `<p class="cr-block"><span class="item-lead">${parseText(g.title)}</span><span class="item-text">${g.subs.map(renderSub).join('')}</span></p>`;
      }
      if (g.type === 'subs-standalone') {
        return `<p class="cr-block"><span class="item-text">${g.subs.map(renderSub).join('')}</span></p>`;
      }
      if (g.type === 'title-colon') {
        return `<p class="cr-block"><span class="item-lead">${parseText(g.title)}</span><span class="item-text">${parseText(g.content)}</span></p>`;
      }
      if (g.type === 'title-alone') {
        return `<p class="cr-block title-alone"><span class="item-lead">${parseText(g.title)}</span></p>`;
      }
      return `<p class="cr-block"><span class="item-text">${parseText(g.content)}</span></p>`;
    }).join('');

    // 행 라벨 밑에 사료 인용을 같이 보이고 싶을 때(3번 기능): 페이지 하단에 따로 떨어뜨리지
    // 않고, 이 행의 항목(들) 바로 아래 같은 내용 칸(라벨 옆)에 이어서 렌더한다. 라벨/오렌지
    // 선은 원래 정한 대로 첫 소제목 높이에만 맞추고(아래 참고), 이 블록 때문에 늘어나지 않는다.
    const bqHtml = bottomQuote ? (() => {
      const srcWrapped = normalizeSource(bottomQuote.source);
      const sub = bottomQuote.label ? `<div class="qt-subtitle">${preserveSpaces(bottomQuote.label)}</div>` : '';
      return `
        <div class="cr-block row-bq">
          ${sub}
          <div class="fmt-quote qt-inline">
            <p class="qt-text"><span class="qt-open">&ldquo;</span>${renderWithBreaks(bottomQuote.text || '')}<span class="qt-close">&rdquo;</span></p>
            ${srcWrapped ? `<p class="qt-src">${preserveSpaces(srcWrapped)}</p>` : ''}
          </div>
        </div>`;
    })() : '';

    // 라벨 위치 기본값은 '상단'. 명시적으로 'left'인 경우에만 좌측 배치.
    const posClass = labelPos === 'left' ? '' : ' label-top';
    // 라벨이 비어 있으면 라벨 칸(네이비 박스) 자체를 렌더하지 않고 내용이 폭을 다 쓰게 한다.
    const hasLabel = !!(row.label && String(row.label).trim());
    // 라벨 여러 줄 규칙:
    //  · 그냥 줄바꿈(엔터/<br>) → 같은 수준(같은 크기)으로 다음 줄 (긴 라벨용)
    //  · 줄 맨 앞에 '>' → 그 줄만 한 수준 낮게(작게·연하게)
    //  · 줄 끝의 (연도) 같은 괄호 → 아랫줄에 작게 분리
    let labelHtml = '';
    if (hasLabel) {
      let lines = [];
      String(row.label).replace(/<\/?br\s*\/?>/gi, '\n').split('\n').forEach(raw => {
        let t = raw.trim();
        if (!t) return;
        let sub = false;
        if (t[0] === '>') { sub = true; t = t.slice(1).trim(); }
        const m = t.match(/^(.*\S)\s*(\([^()]*\))$/); // 끝의 (…) 분리
        if (m && m[1]) { lines.push({ t: m[1].trim(), sub }); lines.push({ t: m[2], sub: true }); }
        else if (t) lines.push({ t, sub });
      });
      // 좌측 라벨은 6자(공백 포함)까지 한 줄, 넘으면 줄바꿈(6자 이내 마지막 공백에서 끊고,
      // 공백이 없으면 6자에서 강제 줄바꿈). 줄바꿈되면 라벨을 우측정렬(.multi).
      if (labelPos === 'left') {
        const wrapped = [];
        lines.forEach(o => wrapLabelLine(o.t).forEach(t => wrapped.push({ t, sub: o.sub })));
        lines = wrapped;
      }
      const multiCls = (labelPos === 'left' && lines.length > 1) ? ' multi' : '';
      const inner = lines.map(o =>
        `<span class="row-label-line${o.sub ? ' sub' : ''}">${preserveSpaces(o.t)}</span>`).join('');
      // 좌측 라벨 배치는 라벨과 '첫 소제목'만 세로 가운데로 맞춘다는 원래 정한 규칙 그대로
      // 유지한다(전체 내용/그룹 개수와 무관) — 라벨·오렌지 세로선은 항상 첫 항목 높이만큼만.
      // CSS grid(display:contents 트릭)로 라벨은 1행에, 항목(<p>)들은 각자 행에 자동 배치되고,
      // align-items:center로 라벨과 1행(첫 항목)만 상호 중앙정렬된다.
      labelHtml = `<div class="row-label${multiCls}">${inner}</div>`;
    }
    return `
      <div class="concept-row${posClass}${hasLabel ? '' : ' no-label'}">
        ${labelHtml}
        <div class="row-content">${itemsHtml}${bqHtml}</div>
      </div>`;
  }

  function checkHeaderHTML(badgeLabel, title) {
    return `
      <div class="slide-header">
        <span class="check-badge">${badgeLabel}</span>
        <h2 class="slide-title">${preserveSpaces(title)}</h2>
      </div>`;
  }

  /* ── 새 슬라이드 형식(연표·비교표·사료 인용·플로우) 본문 렌더러 ──
     기존 행 나열(rows)과 달리 좌측 이미지 패널(clayout)은 지원하지 않는다. */
  function timelineHBodyHTML(slide) {
    const events = (slide.events || []).map(ev => `
      <div class="tl-ev">
        <div class="tl-dot"></div>
        <div class="tl-card">
          <span class="tl-year">${preserveSpaces(ev.year || '')}</span>
          <span class="tl-text">${parseText(ev.label || '')}</span>
        </div>
      </div>`).join('');
    return `
      <div class="fmt-timeline-h">
        <div class="tl-line"></div>
        <div class="tl-events">${events}</div>
      </div>`;
  }

  function timelineVBodyHTML(slide) {
    const events = (slide.events || []).map(ev => `
      <div class="tlv-ev">
        <div class="tlv-dot"></div>
        <span class="tlv-memo">${preserveSpaces(ev.memo || '')}</span>
        <div class="tlv-content">${(ev.content || []).map(t => `<p>${parseItemText(t)}</p>`).join('')}</div>
      </div>`).join('');
    return `
      <div class="fmt-timeline-v">
        <div class="tlv-line"></div>
        <div class="tlv-events">${events}</div>
      </div>`;
  }

  function compareBodyHTML(slide) {
    const left  = slide.left  || { label: '', items: [] };
    const right = slide.right || { label: '', items: [] };
    const col = (side, data) => `
      <div class="cmp-col ${side}">
        <div class="cmp-head">${preserveSpaces(data.label || '')}</div>
        <div class="cmp-body">${(data.items || []).map(t => `<p>${parseItemText(t)}</p>`).join('')}</div>
      </div>`;
    return `
      <div class="fmt-compare">
        ${col('l', left)}
        <div class="cmp-vs">VS</div>
        ${col('r', right)}
      </div>`;
  }

  /* 출처는 항상 겹낫표(『』)로 감싼다. 이미 낫표/꺽쇠류(「」『』〈〉《》【】<>)로 감싸져
     있으면 그 바깥 기호를 벗겨내고 겹낫표로 통일한다 — 예전 데이터가 홑낫표「」로
     저장돼 있어도 화면에는 겹낫표로 보이게 한다. */
  function normalizeSource(src) {
    let s = String(src || '').trim();
    if (!s) return '';
    s = s.replace(/^[『「【《〈<]+\s*/, '').replace(/\s*[』」】》〉>]+$/, '').trim();
    return s ? '『' + s + '』' : '';
  }

  function quoteBodyHTML(slide) {
    const srcWrapped = normalizeSource(slide.source);
    // 소제목이 없으면 화면 세로 중앙에, 있으면 소제목 아래에 그대로 따라붙는다.
    return `
      <div class="fmt-quote${slide.quoteLabel ? '' : ' qt-centered'}">
        <p class="qt-text"><span class="qt-open">&ldquo;</span>${renderWithBreaks(slide.text || '')}<span class="qt-close">&rdquo;</span></p>
        ${srcWrapped ? `<p class="qt-src">${preserveSpaces(srcWrapped)}</p>` : ''}
      </div>`;
  }

  /* 안내(OT·수행평가 등) 자유 문단 슬라이드(1번 기능). 한 줄 = 한 문단,
     "- "로 시작하면 불릿, 빈 줄은 간격. 굵게/빈칸 문법 그대로 적용. */
  function noticeBodyHTML(slide) {
    const lines = String(slide.noticeText || '')
      .replace(new RegExp(String.fromCharCode(0x2028), 'g'), '\n')
      .replace(/<\/?br\s*\/?>/gi, '\n')
      .split('\n');
    const html = lines.map(raw => {
      const t = raw.trim();
      if (!t) return '<div class="notice-gap"></div>';
      if (/^-\s/.test(t)) return `<div class="notice-line notice-bullet">${parseText(t.slice(2))}</div>`;
      return `<div class="notice-line">${parseText(t)}</div>`;
    }).join('');
    return `<div class="fmt-notice">${html}</div>`;
  }

  /* 슬라이드에 이미지(img 번호)가 있으면 우측/하단 패널 HTML을 만든다. 없으면 ''. */
  function imgPanelHTML(slide, lesson) {
    const imgBase = slide.img != null ? `/hoistory/lms/img/${lesson.num}_${slide.img}` : null;
    if (!imgBase) return '';
    const imgSize = slide.imgSize != null ? slide.imgSize : 50;
    const style = slide.layout === 'bottom' ? 'flex: 1 1 0; min-height: 0' : `flex: 0 0 ${imgSize}%`;
    return `
      <div class="clayout-img" style="${style}">
        <img src="${imgBase}.png" decoding="async" alt="${slide.imgCaption || ''}" onerror="SlideRenderImgFallback(this,'${imgBase}',0)">
        ${slide.imgCaption ? `<p class="clayout-caption">${slide.imgCaption}</p>` : ''}
      </div>`;
  }

  /* 본문 HTML을 이미지 패널과 함께 우측/하단 레이아웃으로 감싼다. 이미지 없으면 본문 그대로. */
  function wrapWithImg(mainHtml, slide, lesson) {
    const panel = imgPanelHTML(slide, lesson);
    if (!panel) return mainHtml;
    const wrapClass = slide.layout === 'bottom' ? 'clayout-bottom' : 'clayout-right';
    return `<div class="${wrapClass}"><div class="clayout-main">${mainHtml}</div>${panel}</div>`;
  }

  function flowBodyHTML(slide, orientation) {
    const chevClass = orientation === 'v' ? 'fl-chev-v' : 'fl-chev-h';
    const stages = (slide.stages || []);
    const inner = stages.map((st, i) => `
      <div class="fl-stage">
        <div class="fl-stage-label">${preserveSpaces(st.label || '')}</div>
        <p class="fl-stage-text">${renderWithBreaks(st.text || '')}</p>
      </div>${i < stages.length - 1 ? `<div class="${chevClass}"></div>` : ''}`).join('');
    return `<div class="fmt-flow-${orientation}">${inner}</div>`;
  }

  /* 중앙 나열 형식(cols): 대제목(slide.title) 아래에 소제목+내용 칸을 가로로 균등 배치하고
     전체를 화면 정중앙에 놓는다. 칸 개수(2~N)에 상관없이 여백은 균등. */
  function colsBodyHTML(slide) {
    const cols = (slide.cols || []).map(c => `
      <div class="cx-col">
        <div class="cx-head">${parseText(c.head || '')}</div>
        ${(c.body && c.body.trim()) ? `<div class="cx-body">${renderWithBreaks(c.body)}</div>` : ''}
      </div>`).join('');
    // 상단 배지 헤더(slide.title)와 별개로, 본문 가운데에 큰 대제목(slide.colsTitle)을 둔다.
    const bigTitle = (slide.colsTitle && slide.colsTitle.trim()) ? `<div class="cx-title">${parseText(slide.colsTitle)}</div>` : '';
    return `<div class="fmt-cols-wrap">${bigTitle}<div class="fmt-cols">${cols}</div></div>`;
  }

  // 제목 없는 헤더(배지 없이 제목만) — 안내 슬라이드와 '배지 숨김' 옵션에서 공용.
  function titleOnlyHeaderHTML(title) {
    return title ? `<div class="slide-header slide-header-notice"><h2 class="slide-title">${preserveSpaces(title)}</h2></div>` : '';
  }

  function checkStyleHTML(slide, lesson, badgeLabel) {
    const format = slide.format || 'rows';
    // slide.hideBadge가 켜져 있으면 어떤 형식이든 개념/미션 배지 없이 제목만 표시한다(A 기능).
    const mkHeader = (title) => slide.hideBadge ? titleOnlyHeaderHTML(title) : checkHeaderHTML(badgeLabel, title);

    if (format === 'notice') {
      // OT·수행 안내 등 자유 문단 슬라이드. 개념/미션 배지를 달지 않고 제목만 표시한다.
      // (제목이 비어 있으면 헤더 자체를 렌더하지 않는다.)
      return wrapWithImg(titleOnlyHeaderHTML(slide.title) + noticeBodyHTML(slide), slide, lesson);
    }
    if (format === 'cols') {
      // 일반 배지 헤더(제목) + 소제목/내용 균등 나열(가운데). hideBadge/이미지도 지원.
      return wrapWithImg(mkHeader(slide.title) + colsBodyHTML(slide), slide, lesson);
    }
    if (format === 'quote') {
      // 전체 슬라이드 제목은 다른 슬라이드와 똑같이 좌상단 헤더로 고정.
      const header = slide.title ? mkHeader(slide.title) : '';
      // 사료 소제목((가) 등)만 사료 본문 위에 가운데 정렬로 한 번 더 표시.
      const sub = slide.quoteLabel ? `<div class="qt-subtitle">${preserveSpaces(slide.quoteLabel)}</div>` : '';
      // 사료 인용도 우측/하단 이미지 패널을 지원한다(3번 기능).
      return wrapWithImg(`${header}${sub}${quoteBodyHTML(slide)}`, slide, lesson);
    }
    if (format === 'timeline-h') return mkHeader(slide.title) + timelineHBodyHTML(slide);
    if (format === 'timeline-v') return mkHeader(slide.title) + timelineVBodyHTML(slide);
    if (format === 'compare')    return mkHeader(slide.title) + compareBodyHTML(slide);
    if (format === 'flow-h')     return mkHeader(slide.title) + flowBodyHTML(slide, 'h');
    if (format === 'flow-v')     return mkHeader(slide.title) + flowBodyHTML(slide, 'v');

    // format === 'rows' (기본값) — 행 나열 + (선택) 하단 사료 + 이미지 우/하 배치
    const header = mkHeader(slide.title);
    // 2번 기능: 하단 사료 인용(bottomQuote, 본문이 비어있지 않을 때만). 페이지 맨 아래에
    // 따로 떨어뜨리지 않고 마지막 행의 라벨 옆(내용 칸) 밑에 같이 붙여서, 그 행의 라벨과
    // 오렌지 구분선이 사료 인용까지 자연스럽게 이어지게 한다(3번 기능).
    const bq = slide.bottomQuote;
    const hasBQ = !!(bq && bq.text && bq.text.trim());
    const rows = `
      <div class="concept-rows">
        ${slide.rows.map((r, idx) => rowHTML(r, slide.labelPos, hasBQ && idx === slide.rows.length - 1 ? bq : null)).join('')}
      </div>`;
    return wrapWithImg(`${header}${rows}`, slide, lesson);
  }

  function conceptHTML(slide, lesson) { return checkStyleHTML(slide, lesson, '개념 Check'); }
  function missionHTML(slide, lesson) { return checkStyleHTML(slide, lesson, '미션 Check'); }

  function diveHTML(slide, lesson) {
    // 질문 앞뒤를 따옴표로 감싸 사료 인용처럼. 질문 아래 고정 안내 문구를 붙인다.
    const q = slide.guide || slide.title || '';
    return `
      <div class="intro-sweep"></div>
      <div class="dive-head">
        <span class="check-badge">Dive into History</span>
        <span class="dive-kicker">Opening Question</span>
      </div>
      <div class="dive-body">
        <p class="dive-q"><span class="qt-open">&ldquo;</span>${renderWithBreaks(q)}<span class="qt-close">&rdquo;</span></p>
        <p class="dive-guide">질문에 대한 본인의 답변을 자유롭게 생각해 보고 활동지에 작성해 보세요.</p>
      </div>
    `;
  }

  function imageHTML(slide, lesson) {
    const images = slide.images && slide.images.length ? slide.images : [{ img: slide.img, src: slide.src, caption: slide.caption }];
    const cols = images.length === 4 ? 2 : Math.min(images.length, 3) || 1;
    const cells = images.map(im => {
      if (im.img != null) {
        const base = `/hoistory/lms/img/${lesson.num}_${im.img}`;
        return `
          <div class="grid-img-cell">
            <img src="${base}.png" decoding="async" alt="${im.caption || slide.title || ''}" class="grid-img" onerror="SlideRenderImgFallback(this,'${base}',0)">
            ${im.caption ? `<p class="grid-img-caption">${im.caption}</p>` : ''}
          </div>`;
      }
      return `
        <div class="grid-img-cell">
          <img src="${im.src || ''}" decoding="async" alt="${im.caption || slide.title || ''}" class="grid-img">
          ${im.caption ? `<p class="grid-img-caption">${im.caption}</p>` : ''}
        </div>`;
    }).join('');
    const sz = slide.size != null ? slide.size : 100;
    const sizeStyle = sz < 100 ? `;flex:0 0 auto;width:${sz}%;height:${sz}%;margin:auto` : '';
    return `
      ${slide.title ? `<div class="slide-header"><span class="check-badge">자료</span><h2 class="slide-title">${preserveSpaces(slide.title)}</h2></div>` : ''}
      <div class="image-body" style="grid-template-columns: repeat(${cols}, 1fr)${sizeStyle}">
        ${cells}
      </div>
    `;
  }

  function thinkHTML(slide, lesson) {
    return `
      <div class="slide-header">
        <span class="check-badge think">생각 Check</span>
        <h2 class="slide-title">${lessonNumTag(lesson.num)}</h2>
      </div>
      <p class="think-question">${boldOnly(preserveSpaces(slide.question)).replace(/\n/g, '<br>')}</p>
      <div class="think-body">
        <p class="think-guide">${preserveSpaces(slide.guide).replace(/\n/g, '<br>').replace('50자', '<strong>50자</strong>')}</p>
      </div>
    `;
  }

  /* 슬라이드 항목을 원문자(①②③…) 경계로 그룹 분리.
     rows가 1개인 rows 형식 슬라이드에만 적용.
     분리 가능하면 { row, groups } 반환, 아니면 null */
  const CIRCLED_RE = /^[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮]/;
  function circledGroups(slide) {
    if (slide.format && slide.format !== 'rows') return null;
    if (!slide.rows || slide.rows.length !== 1) return null;
    const row = slide.rows[0];
    const items = row.items || [];
    if (!items.some(it => CIRCLED_RE.test(it))) return null;
    const groups = [];
    let cur = [];
    for (const item of items) {
      if (CIRCLED_RE.test(item) && cur.length > 0) { groups.push(cur); cur = []; }
      cur.push(item);
    }
    if (cur.length) groups.push(cur);
    return groups.length > 1 ? { row, groups } : null;
  }

  /* contentLines(구분선/행/이미지 배열)를 slide 배열로 변환. 개념 체크·미션 체크가
     같은 구조를 쓰므로 type만 다르게 해서 공유한다. */
  function buildCheckSlides(lines, type) {
    const raw = [];
    let current = null;
    (lines || []).forEach(line => {
      if (line.type === 'divider') {
        current = { type, title: line.title, rows: [] };
        if (line.fontSize != null) current.fontSize = line.fontSize; // 페이지별 본문 글자 크기(px) 오버라이드
        if (line.hideBadge) current.hideBadge = true;                 // 페이지별 개념/미션 배지 숨김(A 기능)
        const fmt = line.format;
        if (fmt && fmt !== 'rows') {
          current.format = fmt;
          if (fmt === 'timeline-h' || fmt === 'timeline-v') current.events = line.events || [];
          else if (fmt === 'compare') { current.left = line.left || { label: '', items: [] }; current.right = line.right || { label: '', items: [] }; }
          else if (fmt === 'quote') { current.text = line.quoteText || ''; current.source = line.quoteSource || ''; current.quoteLabel = line.quoteLabel || ''; }
          else if (fmt === 'flow-h' || fmt === 'flow-v') current.stages = line.stages || [];
          else if (fmt === 'notice') current.noticeText = line.noticeText || '';
          else if (fmt === 'cols') { current.cols = line.cols || []; current.colsTitle = line.colsTitle || ''; }
        } else if (line.labelPos) {
          current.labelPos = line.labelPos;
        }
        // 행 나열(rows) 페이지에 하단 사료 인용이 붙어 있으면 함께 넘긴다(2번 기능).
        if ((!fmt || fmt === 'rows') && line.quoteText && line.quoteText.trim()) {
          current.bottomQuote = { text: line.quoteText, source: line.quoteSource || '', label: line.quoteLabel || '' };
        }
        if (line.img != null) {
          current.img = line.img;
          current.layout = line.imgLayout || 'right';
          current.imgSize = line.imgSize != null ? line.imgSize : 50;
        }
        raw.push(current);
      } else if (line.type === 'image') {
        raw.push({
          type: 'image',
          title: line.title || '',
          images: line.images.map(im => ({ img: im.img || 1, caption: im.caption || '' })),
          size: line.size != null ? line.size : 100
        });
        current = null;
      } else if (line.type === 'fullimage') {
        raw.push({ type: 'fullimage', img: line.img != null ? line.img : null, url: line.url || '', size: line.size != null ? line.size : 100 });
        current = null;
      } else if (line.type === 'video') {
        raw.push({ type: 'video', videoId: line.videoId || '' });
        current = null;
      } else {
        if (!current) { current = { type, title: '', rows: [] }; raw.push(current); }
        current.rows.push({ label: line.label, items: line.items });
      }
    });
    // 내용이 비어 있는 슬라이드(제목만 있고 본문이 없는 사료·행 등)는 렌더하지 않는다.
    return raw.filter(s => {
      if (s.type === 'image' || s.type === 'fullimage' || s.type === 'video') return true;
      if (s.img != null) return true;
      if (s.format === 'notice') return !!(s.noticeText && s.noticeText.trim());
      if (s.format === 'cols') return !!(s.colsTitle && s.colsTitle.trim()) || (s.cols || []).some(c => (c.head && c.head.trim()) || (c.body && c.body.trim()));
      if (s.format === 'quote') return !!(s.text && s.text.trim());
      if (s.format === 'timeline-h' || s.format === 'timeline-v') return (s.events || []).length > 0;
      if (s.format === 'compare') return (((s.left && s.left.items) || []).length + ((s.right && s.right.items) || []).length) > 0;
      if (s.format === 'flow-h' || s.format === 'flow-v') return (s.stages || []).length > 0;
      if (s.bottomQuote && s.bottomQuote.text && s.bottomQuote.text.trim()) return true;
      return (s.rows || []).some(r => (r.label && r.label.trim()) || (r.items || []).some(it => it && String(it).trim()));
    });
  }

  /* 어드민 콘텐츠 편집 데이터({lesson, dive, contentLines, mission, think})를 실제
     화면이 쓰는 slides 배열 형태로 변환한다. 어드민 미리보기와 실제 학생 페이지
     (lesson.html)가 동일한 이 함수를 써서 두 화면이 항상 일치하도록 한다. */
  function buildSlidesFromData(d) {
    // 표지 → [Dive into History: 초성 퀴즈 → Opening Question → 학습 목표] → 개념 → 미션 → 생각
    const slides = [{ type: 'cover' }];
    // opening{question,guide}은 dive{title,guide}로 바뀌기 전 필드명. 예전 강의도 보이게 대비.
    const dive = d.dive || (d.opening ? { title: d.opening.question, guide: d.opening.guide } : null);
    // 1. 초성 퀴즈 — 토글 ON + 항목 있을 때만
    if (d.dive && d.dive.chosungEnabled && d.dive.chosungItems && d.dive.chosungItems.length) {
      slides.push(...buildChosungSlides(d.dive.chosungItems));
    }
    // 2. Opening Question — 내용 있고 토글 ON일 때만(openingEnabled 없으면 기본 ON)
    if (dive && (dive.title || dive.guide || dive.img != null) && dive.openingEnabled !== false) {
      slides.push({ type: 'dive', title: dive.title || '', guide: dive.guide || '', headerTitle: dive.headerTitle || '', img: dive.img != null ? dive.img : null, imgCaption: dive.imgCaption || '', imgLayout: dive.imgLayout || 'right', guideBox: dive.guideBox !== false });
    }
    // 3. 학습 목표 — 항상
    slides.push({ type: 'objectives' });
    slides.push(...buildCheckSlides(d.contentLines, 'concept'));
    if (d.mission) slides.push(...buildCheckSlides(d.mission.contentLines, 'mission'));
    slides.push({ type: 'think', question: d.think.question, guide: d.think.guide });
    return slides;
  }

  /* slide + lesson 데이터를 받아 완성된 <div class="slide ...">...</div> HTML 문자열을 돌려준다 */
  function renderSlideHTML(slide, lesson) {
    let extraClass = '';
    let inner = '';
    if (slide.type === 'cover') {
      extraClass = ' slide-cover';
      inner = coverHTML(lesson);
    } else if (slide.type === 'objectives') {
      extraClass = ' slide-objectives';
      inner = objectivesHTML(lesson);
    } else if (slide.type === 'dive') {
      extraClass = ' slide-dive'; // 다크 무빙 포스터 톤(인트로 4연작)
      inner = diveHTML(slide, lesson);
    } else if (slide.type === 'chosung') {
      extraClass = ' slide-chosung';
      inner = chosungHTML(slide, lesson);
    } else if (slide.type === 'concept') {
      inner = conceptHTML(slide, lesson);
    } else if (slide.type === 'mission') {
      extraClass = ' slide-mission';
      inner = missionHTML(slide, lesson);
    } else if (slide.type === 'image') {
      inner = imageHTML(slide, lesson);
    } else if (slide.type === 'fullimage') {
      extraClass = ' slide-full';
      // 100%는 기존 그대로 화면 전체를 채우는 cover(전면 이미지 본래 취지, 크롭 허용).
      // 100% 미만으로 줄일 때는 그 반대로 "이만큼만 차지시키고 나머지는 여백으로 두는" 것이
      // 목적이므로 contain을 써서 사진 내용이 잘리지 않게 한다(크기 = 화면 기준 %는 그대로 유지).
      const sz = slide.size != null ? slide.size : 100;
      const sizeStyle = sz < 100 ? ` style="width:${sz}%;height:${sz}%;object-fit:contain"` : '';
      if (slide.img != null) {
        const base = `/hoistory/lms/img/${lesson.num}_${slide.img}`;
        inner = `<img class="full-img"${sizeStyle} decoding="async" src="${base}.png" alt="" onerror="SlideRenderImgFallback(this,'${base}',0)">`;
      } else if (slide.url) {
        inner = `<img class="full-img"${sizeStyle} decoding="async" src="${slide.url}" alt="">`;   // 예전 업로드분 호환
      } else {
        inner = `<div class="slide-media-empty" style="color:#999">이미지 없음</div>`;
      }
    } else if (slide.type === 'video') {
      extraClass = ' slide-video';
      inner = slide.videoId
        ? `<iframe class="video-frame" data-vsrc="https://www.youtube-nocookie.com/embed/${slide.videoId}?rel=0&modestbranding=1" src="" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`
        : `<div class="slide-media-empty" style="color:#fff">영상 URL 없음</div>`;
    } else if (slide.type === 'think') {
      extraClass = ' slide-think';
      inner = thinkHTML(slide, lesson);
    }
    const fsStyle = slide.fontSize ? ` style="--fs-body:${slide.fontSize}px"` : ''; // 페이지별 본문 글자 크기 오버라이드
    return `<div class="slide${extraClass}"${fsStyle}>${inner}</div>`;
  }

  /* img 번호로 만든 경로는 확장자를 png로 가정하는데, 실제 저장 파일이 jpg인 경우가
     섞여 있어서 로드 실패 시 jpg -> jpeg 순으로 다시 시도한다. onerror 인라인 속성에서
     호출해야 하므로 전역(window)에 노출한다. */
  function SlideRenderImgFallback(imgEl, basePath, idx) {
    const exts = ['jpg', 'jpeg'];
    if (idx >= exts.length) { imgEl.onerror = null; return; }
    imgEl.onerror = () => SlideRenderImgFallback(imgEl, basePath, idx + 1);
    imgEl.src = `${basePath}.${exts[idx]}`;
  }
  global.SlideRenderImgFallback = SlideRenderImgFallback;

  /* 이미지 클릭 → 확대 라이트박스. 오버레이는 최초 호출 시 한 번만 만들어 body에 붙인다. */
  let lightbox = null;
  function ensureLightbox() {
    if (lightbox) return lightbox;
    const overlay = document.createElement('div');
    overlay.className = 'img-lightbox-overlay';
    overlay.innerHTML = `<button class="img-lightbox-close" aria-label="닫기">&times;</button><img>`;
    document.body.appendChild(overlay);
    const imgEl = overlay.querySelector('img');
    const close = () => overlay.classList.remove('open');
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    overlay.querySelector('.img-lightbox-close').addEventListener('click', close);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    lightbox = { overlay, imgEl, close };
    return lightbox;
  }

  /* container 안의 슬라이드 이미지들에 클릭 시 확대 보기를 붙인다. 렌더 후(슬라이드를 새로 그릴 때마다) 호출. */
  function wireLightbox(container) {
    const box = ensureLightbox();
    container.querySelectorAll('.grid-img, .clayout-img img').forEach(img => {
      img.addEventListener('click', () => {
        box.imgEl.src = img.src;
        box.overlay.classList.add('open');
      });
    });
  }

  /* 확대된 상태면 닫는다. 슬라이드 전환 시(다음/이전) 호출해서 확대 이미지가 그대로 남지 않게 한다. */
  function closeLightbox() {
    if (lightbox) lightbox.close();
  }

  // 강 번호 + 제목 결합 표기: 숫자면 "N강. 제목", 문자면 "OT: 제목".
  function lessonTitleLabel(num, title) { return isNumericNum(num) ? `${num}강. ${title}` : `${num}: ${title}`; }

  global.SlideRender = { parseText, renderWithBreaks, parseItemText, renderSlideHTML, wireLightbox, closeLightbox, buildSlidesFromData, circledGroups, lessonNumTag, lessonTitleLabel };

})(window);
