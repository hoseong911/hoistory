/* ════════════════════════════════════════════════════════
   슬라이드 렌더링 엔진 — 26_23.html(학생용)과 admin.html(미리보기)이
   똑같이 이 파일을 불러써서, 슬라이드 HTML 생성 로직이 항상 일치하도록 한다.
   ════════════════════════════════════════════════════════ */
(function (global) {

  function parseText(str) {
    // 빈칸을 임시 플레이스홀더로 보호
    const blanks = [];
    let s = str.replace(/\{([^}]+)\}/g, (_, inner) => {
      blanks.push(inner);
      return `\x00${blanks.length - 1}\x00`;
    });
    // 괄호 안에 빈칸(\x00)이 없는 경우에만 80% 크기 적용
    s = s.replace(/\(([^()\x00]*)\)/g, '<span class="paren-note">($1)</span>');
    // 플레이스홀더를 빈칸 span으로 복원
    s = s.replace(/\x00(\d+)\x00/g, (_, i) => `<span class="blank">${blanks[+i]}</span>`);
    return s;
  }

  /* \n 위치에서 줄바꿈 + 내어쓰기 */
  function renderWithBreaks(text) {
    return text.split('\n').map((line, i) =>
      i === 0 ? parseText(line) : `<br><span class="line-cont">${parseText(line)}</span>`
    ).join('');
  }

  /* " : " 기준으로 소제목(item-lead)과 본문(item-text) 분리. 콜론은 제거 */
  function parseItemText(str) {
    const colonIdx = str.indexOf(' : ');
    if (colonIdx > -1) {
      const leadRaw = str.slice(0, colonIdx);
      const rest    = str.slice(colonIdx + 3);
      return `<span class="item-lead">${parseText(leadRaw)}&nbsp;&nbsp;&nbsp;</span><span class="item-text">${renderWithBreaks(rest)}</span>`;
    }
    return `<span class="item-text">${renderWithBreaks(str)}</span>`;
  }

  function coverHTML(lesson) {
    return `
      <span class="cover-tagline">생각하고 활동하고 질문하는 역사 수업</span>
      <h1 class="cover-title">${lesson.title.replace(/\n/g, '<br>')}</h1>
      <p class="cover-meta">${lesson.unit} &nbsp;·&nbsp; ${lesson.page}</p>
      <div class="cover-num-bg">${lesson.num}</div>
    `;
  }

  function objectivesHTML(lesson) {
    return `
      <div class="slide-header">
        <span class="check-badge">학습 목표</span>
        <h2 class="slide-title">${lesson.num}강 · ${lesson.title}</h2>
      </div>
      <div class="obj-list">
        ${lesson.objectives.map((o, i) => `
          <div class="obj-item">
            <span class="obj-num">${i + 1}</span>
            <p class="obj-text">${parseText(o)}</p>
          </div>
        `).join('')}
      </div>
    `;
  }

  function rowHTML(row) {
    const items = row.items.map(item => `<p>${parseItemText(item)}</p>`).join('');
    return `
      <div class="concept-row">
        <div class="row-label">${row.label}</div>
        <div class="row-content">${items}</div>
      </div>`;
  }

  function conceptHTML(slide, lesson) {
    const header = `
      <div class="slide-header">
        <span class="check-badge">개념 Check</span>
        <h2 class="slide-title">${slide.title}</h2>
      </div>`;
    const rows = `
      <div class="concept-rows">
        ${slide.rows.map(rowHTML).join('')}
      </div>`;

    const imgSrc = slide.img != null
      ? `img/${lesson.num}_${String(slide.img).padStart(2, '0')}.jpg`
      : null;
    const imgSize = slide.imgSize != null ? slide.imgSize : 50;
    const imgPanel = imgSrc ? `
      <div class="clayout-img" style="flex: 0 0 ${imgSize}%">
        <img src="${imgSrc}" alt="${slide.imgCaption || ''}">
        ${slide.imgCaption ? `<p class="clayout-caption">${slide.imgCaption}</p>` : ''}
      </div>` : '';

    if (slide.layout === 'right') {
      return `
        <div class="clayout-right">
          <div class="clayout-main">${header}${rows}</div>
          ${imgPanel}
        </div>`;
    }
    if (slide.layout === 'bottom') {
      return `
        <div class="clayout-bottom">
          <div class="clayout-main">${header}${rows}</div>
          ${imgPanel}
        </div>`;
    }
    return `${header}${rows}`;
  }

  function imageHTML(slide, lesson) {
    const src = slide.img != null
      ? `img/${lesson.num}_${String(slide.img).padStart(2, '0')}.jpg`
      : (slide.src || '');
    return `
      <div class="slide-header">
        <span class="check-badge">자료</span>
        <h2 class="slide-title">${slide.title || ''}</h2>
      </div>
      <div class="image-body">
        <img src="${src}" alt="${slide.title || ''}" class="main-img">
        ${slide.caption ? `<p class="main-img-caption">${slide.caption}</p>` : ''}
      </div>
    `;
  }

  function thinkHTML(slide, lesson) {
    return `
      <div class="slide-header">
        <span class="check-badge think">생각 Check</span>
        <h2 class="slide-title">${lesson.num}강</h2>
      </div>
      <p class="think-question">${slide.question.replace(/\n/g, '<br>')}</p>
      <div class="think-body">
        <p class="think-guide">${slide.guide.replace(/\n/g, '<br>').replace('50자', '<strong>50자</strong>')}</p>
      </div>
    `;
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
    } else if (slide.type === 'concept') {
      inner = conceptHTML(slide, lesson);
    } else if (slide.type === 'image') {
      inner = imageHTML(slide, lesson);
    } else if (slide.type === 'think') {
      extraClass = ' slide-think';
      inner = thinkHTML(slide, lesson);
    }
    return `<div class="slide${extraClass}">${inner}</div>`;
  }

  global.SlideRender = { parseText, renderWithBreaks, parseItemText, renderSlideHTML };

})(window);
