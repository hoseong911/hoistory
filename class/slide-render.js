/* ════════════════════════════════════════════════════════
   슬라이드 렌더링 엔진 — lesson.html(학생용)과 admin.html(미리보기)이
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

    const imgBase = slide.img != null
      ? `/hoistory/class/img/${lesson.num}_${slide.img}`
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

  function imageHTML(slide, lesson) {
    const images = slide.images && slide.images.length ? slide.images : [{ img: slide.img, src: slide.src, caption: slide.caption }];
    const cols = images.length === 4 ? 2 : Math.min(images.length, 3) || 1;
    const cells = images.map(im => {
      if (im.img != null) {
        const base = `/hoistory/class/img/${lesson.num}_${im.img}`;
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
      ${slide.title ? `<div class="slide-header"><span class="check-badge">자료</span><h2 class="slide-title">${slide.title}</h2></div>` : ''}
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
      <p class="think-question">${slide.question.replace(/\n/g, '<br>')}</p>
      <div class="think-body">
        <p class="think-guide">${slide.guide.replace(/\n/g, '<br>').replace('50자', '<strong>50자</strong>')}</p>
      </div>
    `;
  }

  /* 어드민 콘텐츠 편집 데이터({lesson, contentLines, think})를 실제 화면이 쓰는
     slides 배열 형태로 변환한다. 어드민 미리보기와 실제 학생 페이지(lesson.html)가
     동일한 이 함수를 써서 두 화면이 항상 일치하도록 한다. */
  function buildSlidesFromData(d) {
    const slides = [{ type: 'cover' }, { type: 'objectives' }];
    let current = null;
    d.contentLines.forEach(line => {
      if (line.type === 'divider') {
        current = { type: 'concept', title: line.title, rows: [] };
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
        if (!current) { current = { type: 'concept', title: '', rows: [] }; slides.push(current); }
        current.rows.push({ label: line.label, items: line.items });
      }
    });
    slides.push({ type: 'think', question: d.think.question, guide: d.think.guide, qr: d.think.qr });
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
