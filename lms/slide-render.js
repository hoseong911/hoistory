/* ════════════════════════════════════════════════════════
   슬라이드 렌더링 엔진 — lesson.html(학생용)과 admin.html(미리보기)이
   똑같이 이 파일을 불러써서, 슬라이드 HTML 생성 로직이 항상 일치하도록 한다.
   ════════════════════════════════════════════════════════ */
(function (global) {

  // 스페이스를 2칸 이상 연달아 쓰면 브라우저가 하나로 줄여버리므로, 짝수 번째
  // 스페이스를 &nbsp;로 바꿔 타이핑한 칸 수 그대로 보이게 한다(홀수 번째는 일반
  // 스페이스로 남겨둬서 줄바꿈 지점은 그대로 유지된다).
  function preserveSpaces(str) {
    return String(str).replace(/ {2,}/g, run =>
      Array.from(run, (_, i) => (i % 2 === 0 ? ' ' : '&nbsp;')).join('')
    );
  }

  function parseText(str) {
    // 빈칸을 임시 플레이스홀더로 보호
    const blanks = [];
    let s = preserveSpaces(str).replace(/\{([^}]+)\}/g, (_, inner) => {
      blanks.push(inner);
      return `\x00${blanks.length - 1}\x00`;
    });
    // 괄호 안에 빈칸(\x00)이 없는 경우에만 80% 크기 적용
    s = s.replace(/\(([^()\x00]*)\)/g, '<span class="paren-note">($1)</span>');
    // 플레이스홀더를 빈칸 span으로 복원
    s = s.replace(/\x00(\d+)\x00/g, (_, i) => `<span class="blank">${blanks[+i]}</span>`);
    return s;
  }

  /* \n 또는 <br>/</br> 위치에서 줄바꿈 + 내어쓰기. <br>은 어드민 편집기의 textarea가
     항목(items) 구분자로 실제 개행(\n)을 쓰기 때문에, 한 항목 "안에서" 줄을 나누고 싶을
     때(예: ①에 딸린 a./b./c. 하위 줄) 개행 대신 쓰는 표시다. */
  function renderWithBreaks(text) {
    return text.replace(/<\/?br\s*\/?>/gi, '\n').split('\n').map((line, i) =>
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
      <h1 class="cover-title">${preserveSpaces(lesson.title).replace(/\n/g, '<br>')}</h1>
      <p class="cover-meta">${preserveSpaces(lesson.unit)} &nbsp;·&nbsp; ${preserveSpaces(lesson.page)}</p>
      <div class="cover-num-bg">${lesson.num}</div>
    `;
  }

  /* 번호가 매겨진 목록 형태의 슬라이드(학습 목표, 초성 퀴즈가 이 구성을 공유한다) */
  function numberedListHTML(items, badgeLabel, lesson) {
    return `
      <div class="slide-header">
        <span class="check-badge">${badgeLabel}</span>
        <h2 class="slide-title">${lesson.num}강 · ${preserveSpaces(lesson.title)}</h2>
      </div>
      <div class="obj-list">
        ${items.map((o, i) => `
          <div class="obj-item">
            <span class="obj-num">${i + 1}</span>
            <p class="obj-text">${parseText(o)}</p>
          </div>
        `).join('')}
      </div>
    `;
  }
  function objectivesHTML(lesson) { return numberedListHTML(lesson.objectives, '학습 목표', lesson); }
  function chosungHTML(slide, lesson) { return numberedListHTML(slide.items, '초성 퀴즈', lesson); }

  function rowHTML(row, labelPos) {
    const items = row.items.map(item => `<p>${parseItemText(item)}</p>`).join('');
    const posClass = labelPos === 'top' ? ' label-top' : '';
    return `
      <div class="concept-row${posClass}">
        <div class="row-label">${preserveSpaces(row.label)}</div>
        <div class="row-content">${items}</div>
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

  function quoteBodyHTML(slide) {
    return `
      <div class="fmt-quote">
        <span class="qt-mark">&ldquo;</span>
        <p class="qt-text">${renderWithBreaks(slide.text || '')}</p>
        ${slide.source ? `<p class="qt-src">${preserveSpaces(slide.source)}</p>` : ''}
      </div>`;
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

  function checkStyleHTML(slide, lesson, badgeLabel) {
    const format = slide.format || 'rows';

    if (format === 'quote') {
      // 사료 인용은 슬라이드 제목이 선택 사항이라, 있을 때만 헤더를 붙인다.
      const header = slide.title ? checkHeaderHTML(badgeLabel, slide.title) : '';
      return `${header}${quoteBodyHTML(slide)}`;
    }
    if (format === 'timeline-h') return checkHeaderHTML(badgeLabel, slide.title) + timelineHBodyHTML(slide);
    if (format === 'timeline-v') return checkHeaderHTML(badgeLabel, slide.title) + timelineVBodyHTML(slide);
    if (format === 'compare')    return checkHeaderHTML(badgeLabel, slide.title) + compareBodyHTML(slide);
    if (format === 'flow-h')     return checkHeaderHTML(badgeLabel, slide.title) + flowBodyHTML(slide, 'h');
    if (format === 'flow-v')     return checkHeaderHTML(badgeLabel, slide.title) + flowBodyHTML(slide, 'v');

    // format === 'rows' (기본값) — 기존 행 나열 + 이미지 좌/우 배치
    const header = checkHeaderHTML(badgeLabel, slide.title);
    const rows = `
      <div class="concept-rows">
        ${slide.rows.map(r => rowHTML(r, slide.labelPos)).join('')}
      </div>`;

    const imgBase = slide.img != null
      ? `/hoistory/lms/img/${lesson.num}_${slide.img}`
      : null;
    const imgSize = slide.imgSize != null ? slide.imgSize : 50;
    const imgPanel = imgBase ? `
      <div class="clayout-img" style="flex: 0 0 ${imgSize}%">
        <img src="${imgBase}.png" alt="${slide.imgCaption || ''}" onerror="SlideRenderImgFallback(this,'${imgBase}',0)">
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

  function conceptHTML(slide, lesson) { return checkStyleHTML(slide, lesson, '개념 Check'); }
  function missionHTML(slide, lesson) { return checkStyleHTML(slide, lesson, '미션 Check'); }

  function diveHTML(slide, lesson) {
    return `
      <div class="slide-header">
        <span class="check-badge">Dive into HISTORY</span>
        <h2 class="slide-title">${lesson.num}강</h2>
      </div>
      <p class="think-question">${preserveSpaces(slide.title||'').replace(/\n/g, '<br>')}</p>
      ${slide.guide ? `
      <div class="think-body">
        <p class="think-guide">${preserveSpaces(slide.guide).replace(/\n/g, '<br>')}</p>
      </div>` : ''}
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
            <img src="${base}.png" alt="${im.caption || slide.title || ''}" class="grid-img" onerror="SlideRenderImgFallback(this,'${base}',0)">
            ${im.caption ? `<p class="grid-img-caption">${im.caption}</p>` : ''}
          </div>`;
      }
      return `
        <div class="grid-img-cell">
          <img src="${im.src || ''}" alt="${im.caption || slide.title || ''}" class="grid-img">
          ${im.caption ? `<p class="grid-img-caption">${im.caption}</p>` : ''}
        </div>`;
    }).join('');
    return `
      ${slide.title ? `<div class="slide-header"><span class="check-badge">자료</span><h2 class="slide-title">${preserveSpaces(slide.title)}</h2></div>` : ''}
      <div class="image-body" style="grid-template-columns: repeat(${cols}, 1fr)">
        ${cells}
      </div>
    `;
  }

  function thinkHTML(slide, lesson) {
    return `
      <div class="slide-header">
        <span class="check-badge think">생각 Check</span>
        <h2 class="slide-title">${lesson.num}강</h2>
      </div>
      <p class="think-question">${preserveSpaces(slide.question).replace(/\n/g, '<br>')}</p>
      <div class="think-body">
        <p class="think-guide">${preserveSpaces(slide.guide).replace(/\n/g, '<br>').replace('50자', '<strong>50자</strong>')}</p>
      </div>
    `;
  }

  /* contentLines(구분선/행/이미지 배열)를 slide 배열로 변환. 개념 체크·미션 체크가
     같은 구조를 쓰므로 type만 다르게 해서 공유한다. */
  function buildCheckSlides(lines, type) {
    const slides = [];
    let current = null;
    (lines || []).forEach(line => {
      if (line.type === 'divider') {
        current = { type, title: line.title, rows: [] };
        const fmt = line.format;
        if (fmt && fmt !== 'rows') {
          current.format = fmt;
          if (fmt === 'timeline-h' || fmt === 'timeline-v') current.events = line.events || [];
          else if (fmt === 'compare') { current.left = line.left || { label: '', items: [] }; current.right = line.right || { label: '', items: [] }; }
          else if (fmt === 'quote') { current.text = line.quoteText || ''; current.source = line.quoteSource || ''; }
          else if (fmt === 'flow-h' || fmt === 'flow-v') current.stages = line.stages || [];
        } else if (line.labelPos === 'top') {
          current.labelPos = 'top';
        }
        if (line.img != null) {
          current.img = line.img;
          current.layout = line.imgLayout || 'right';
          current.imgSize = line.imgSize != null ? line.imgSize : 50;
        }
        slides.push(current);
      } else if (line.type === 'image') {
        slides.push({
          type: 'image',
          title: line.title || '',
          images: line.images.map(im => ({ img: im.img || 1, caption: im.caption || '' }))
        });
        current = null;
      } else {
        if (!current) { current = { type, title: '', rows: [] }; slides.push(current); }
        current.rows.push({ label: line.label, items: line.items });
      }
    });
    return slides;
  }

  /* 어드민 콘텐츠 편집 데이터({lesson, dive, contentLines, mission, think})를 실제
     화면이 쓰는 slides 배열 형태로 변환한다. 어드민 미리보기와 실제 학생 페이지
     (lesson.html)가 동일한 이 함수를 써서 두 화면이 항상 일치하도록 한다. */
  function buildSlidesFromData(d) {
    const slides = [{ type: 'cover' }, { type: 'objectives' }];
    // opening{question,guide}은 dive{title,guide}로 바뀌기 전 필드명. 아직 admin에서
    // 다시 저장하지 않은 예전 강의도 그대로 보이도록 대비한다.
    const dive = d.dive || (d.opening ? { title: d.opening.question, guide: d.opening.guide } : null);
    if (dive && (dive.title || dive.guide)) {
      slides.push({ type: 'dive', title: dive.title || '', guide: dive.guide || '' });
    }
    if (d.dive && d.dive.chosungEnabled && d.dive.chosungItems && d.dive.chosungItems.length) {
      slides.push({ type: 'chosung', items: d.dive.chosungItems });
    }
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
      extraClass = ' slide-think'; // 생각 체크와 같은 단순 질문형 슬라이드라 배경 스타일을 재사용
      inner = diveHTML(slide, lesson);
    } else if (slide.type === 'chosung') {
      extraClass = ' slide-objectives'; // 학습 목표와 같은 번호 목록 구성이라 배경 스타일을 재사용
      inner = chosungHTML(slide, lesson);
    } else if (slide.type === 'concept') {
      inner = conceptHTML(slide, lesson);
    } else if (slide.type === 'mission') {
      inner = missionHTML(slide, lesson);
    } else if (slide.type === 'image') {
      inner = imageHTML(slide, lesson);
    } else if (slide.type === 'think') {
      extraClass = ' slide-think';
      inner = thinkHTML(slide, lesson);
    }
    return `<div class="slide${extraClass}">${inner}</div>`;
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

  global.SlideRender = { parseText, renderWithBreaks, parseItemText, renderSlideHTML, wireLightbox, buildSlidesFromData };

})(window);
