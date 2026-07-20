# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

A static web app suite for 김호성 선생님 (Korean history teacher), branded "Dive into HISTORY." It's deployed via GitHub Pages (`.nojekyll` present). No build system — pure vanilla HTML/CSS/JS loaded directly in the browser.

## Deployment

Push to `main` → GitHub Pages auto-deploys. No build step. Open any `.html` file directly in a browser to test locally.

## Architecture

### Hub structure
- `index.html` — Student-facing hub homepage; reads cards/categories from Firestore and renders them
- `admin.html` — Master admin console (password-gated); manages hub cards, student roster, and sidebar menu items

### Sub-apps
Each lives in its own folder with a consistent pattern:
- `<folder>/index.html` — Student view (requires student ID + name login)
- `<folder>/admin.html` — Teacher view (password-gated)

Current sub-apps: `blind_ryeo/`, `goryeo_choice/`, `hismile/`, `s_threads/`, `sillaver/`, `samguk_goods/`, `think/`, `quiz/`, `trip/`, `mission/`

The `mission/` folder contains standalone single-file HTML pages (no sub-folder structure).

### LMS 통합 서브앱 (`lms/admin.html`의 미션 체크에서 연결되는 웹앱)
`lms/admin.html`은 자체 미션 카드(Firestore `cards` 컬렉션, `settings/lms_config`의 `mission_category` 값이 카테고리)를 관리한다. 카드에 `adminUrl`을 지정하면 (a) 미션 카드 목록에 "어드민" 버튼이 생기고 (b) 사이드바 "미션 체크" 하위에 자동으로 서브메뉴 항목이 생겨 바로 그 웹앱 어드민을 iframe으로 연다(예: `interview/`).

새 미션 웹앱의 `admin.html`을 만들 때 다음 패턴을 그대로 따른다(기준 예시: `interview/admin.html`):
- `<title>` 은 lms 자체 표기(콜론)를 따른다 — `index.html`은 "웹앱 이름", `admin.html`은 "웹앱 이름 : 관리자 모드". (아래 디자인 원칙의 일반 하이픈 형식과 다른, lms 계열 전용 컨벤션.)
- 상단 헤더는 로고/탭/로그아웃을 3열 그리드(`grid-template-columns:1fr auto 1fr`)로 배치하고 각 항목에 `grid-column`을 명시적으로 지정한다. `display:none`인 그리드 아이템은 auto-placement에서 완전히 빠지므로, 명시하지 않으면 로고·로그아웃을 숨겼을 때(임베드 시) 남은 탭이 1번 칸으로 밀려 들어가 중앙정렬이 깨진다.
- `const isEmbedded = window.self !== window.top;`로 lms 안에 iframe으로 열렸는지 판별한다. 임베드된 경우:
  - 로그인 게이트를 건너뛰고 바로 어드민 화면을 보여준다(이미 lms에 로그인돼 있으므로).
  - 자체 로고·로그아웃 버튼은 숨긴다(`body.embedded` 클래스로 제어).
  - `document.documentElement.classList.add('has-own-back')`를 반드시 추가한다 — lms가 이 마커를 보고 자기 쪽 상단의 중복된 "목록으로" 바를 자동으로 숨긴다(같은 origin이라 `frame.contentDocument`로 확인 가능).
  - 헤더 안에 자체 "목록으로" 버튼을 두고(탭과 같은 줄) 클릭 시 `window.parent.closeAppAdmin()`을 호출한다.
- 색상 팔레트는 lms/admin.html의 `:root` 토큰(`--primary:#1E3A8A`, `--accent:#2DD4BF`, `--canvas:#FAFAF9` 등)을 그대로 재사용해 lms와 통일된 톤을 유지한다.
- lms에 등록할 때 "어드민 URL"은 hoistory 루트 기준 상대경로로 입력한다(예: `interview/admin.html`, `../`로 시작하면 안 됨 — `lms/admin.html`의 `resolveAppUrl()`이 루트 기준으로 풀어준다).

### Shared utilities (`shared/`)
All modules are ES modules imported with a CDN-versioned Firebase path:

| File | Purpose |
|------|---------|
| `theme.css` | Design system. Apply via `<body class="hi-preset-XXX">`. Presets: `hi-preset-admin`, `hi-preset-blind`, `hi-preset-paper`, `hi-preset-mono-dark`, `hi-preset-naver`, `hi-preset-gallery`. Token names use `--hi-*` prefix. |
| `auth.js` | Student roster load + ID/name verification. Call `initAuth(db)` once, then `mountLoginVerification({...})` to wire up login UI. Caches roster in localStorage for 24h. |
| `toast.js` | Three notification styles: `showToast()` (simple pill), `showRichToast()` (icon+title card), `showCelebration()` (big center popup). Also `subscribePickChannel()` for real-time teacher-pick events. |
| `profanity.js` | `containsBadWord(text)` — checks Korean/English profanity for student text submissions. |
| `textLimit.js` | Text input length limiting helpers. |

### Firebase
Single project `ho0911seong-56638`, used by all pages. The config is copy-pasted inline in each HTML file (standard for Firebase web apps).

- **Firestore**: Hub cards (`cards` collection, ordered by `order` field), categories (`settings/categories` doc, `list` array), admin sidebar links (`settings/admin_links` doc)
- **RTDB**: Student roster at `students/` path (used as SSOT for all student ID verification)

### Admin authentication
Password is hardcoded in each admin page's JS (`sessionStorage` key `admin_auth`). Not security-critical — the real data protection is Firebase security rules.

## Key patterns

**Category → card grouping**: Cards have a `category` field matching a key in the `settings/categories` list. Orphaned cards (category deleted) are shown in a warning zone in admin.

**Student login flow**: Enter 5-digit student ID → `auth.js` looks up RTDB → auto-fills name → student confirms → session begins. If roster is empty, any valid 5-digit ID passes.

**Drag-and-drop reordering** (admin hub): Uses HTML5 drag events. Drop recalculates global `order` integers for all cards across all categories in a single Firestore batch write.

**New sub-app checklist**: Copy an existing sub-app folder, update Firebase listeners, set `<body class="hi-preset-XXX">` for the right visual identity, register the admin URL in `settings/admin_links` via the admin console menu editor.

## 세션 시작 규칙
- 매 세션 시작 시 반드시 `git pull`을 먼저 실행한다. 사용자가 별도로 요청하지 않아도 항상 자동으로 실행한다.

## Git 규칙
- 코드 수정 후 확인 없이 바로 `git add → git commit → git push`를 자동으로 실행한다.
- push 전에 사용자 허락을 구하지 않는다.
- git 관련 작업(커밋, 푸시, 로컬 git 사용자 설정 등)은 매번 허락을 구하지 않고 바로 진행한다. 파괴적인 작업(reset --hard, force push, 브랜치 삭제 등)만 예외로 사전에 확인한다.

## 응답 규칙
- 모든 대화·주석·사용자 메시지는 한국어로 작성한다.

## 프로젝트 개요
김호성 선생님이 운영하는 역사 교육 웹앱 시리즈(HOISTORY). 중학교 역사 수업에서 사용한다.

## 공통 스택
- Firebase Realtime Database + Storage
- Firebase SDK v10.7.1 (shared/auth.js와 버전 통일 필수)
- Vanilla HTML/CSS/JS, 빌드 도구 없음
- Pretendard 폰트
- 학번 5자리 체계 (앞 1자리=학년, 2~3자리째=반(0n이면 n반), 4~5자리=학번)

## 공통 라이브러리 (항상 shared/에서 import)
- `theme.css` — `--hi-*` 토큰만 사용, 직접 색상값 금지
- `admin-base.css` — 어드민 공통 디자인 (어드민에서만 import)
- `auth.js` — `initAuth(db)` + `mountLoginVerification()` 패턴
- `toast.js` — `showToast` / `showRichToast` / `showCelebration`
- `textLimit.js` — `mountCharCounter` / `validateText` / `blockPaste`
- `profanity.js` — `containsBadWord`로 사용자 입력 검증

## 디자인 원칙
- body에 `hi-preset-*` 클래스 하나로 앱 정체성 결정
- 새 앱 만들 때 어떤 preset이 어울릴지 먼저 제안
- 컴포넌트는 `.hi-btn` / `.hi-card` / `.hi-input` / `.hi-tab` 등 기존 클래스 사용
- 새 클래스 만들 때도 `hi-*` 네이밍 컨벤션 따름
- **버튼·링크·UI 요소에 화살표(←, →, ↑, ↓, ↗, ➡️ 등) 사용 절대 금지**
  - 유일한 예외: 정렬 방향을 명시해야 하는 버튼(예: 학번 ↑ / 학번 ↓), 리스트 순서 이동(↑↓)
  - 게임 콘텐츠 내 스탯 표시(생존↑ 등)는 허용
  - "뒤로가기", "다음", "콘솔", "열기" 같은 버튼에는 절대 붙이지 않는다
- **어드민 UI에 이모지 사용 절대 금지**
  - 로그인 화면(login-icon), 상단바 제목, 탭 버튼, 섹션 헤더, 버튼 레이블 전부 이모지 없이
  - 예외: 기능적으로 이모지 자체가 데이터인 경우 (카드 이모지 선택 팝업, 게임 콘텐츠 등)
- **어드민 탭(main-tabs / sub-tabs) 항상 중앙 정렬** — `justify-content: center` 필수
- **어드민 사이드바/탭의 메뉴 라벨은 (콘텐츠 이름·데이터 항목이 아닌 카테고리 메뉴에 한해) 항상 영문 대문자로 표기** (예: `FEED`, `ANSWER`, `QUESTION`, `SETTING`, `SYSTEM`, `STUDENT`, `CARDS`, `UPLOAD`, `STATUS`). 새 앱을 만들거나 기존 한글 탭을 발견하면 짧고 명확한 영단어로 바꾸고, 이미 쓰인 라벨과 겹치는 개념이면 그 단어를 그대로 재사용해 앱마다 통일한다.
  - 예외: 에피소드 제목·강의 회차처럼 콘텐츠 자체의 이름(고유명사·번호)인 서브탭은 번역하지 않는다(예: escape의 "프롤로그"/"엔딩", 반별 탭의 "1반"~"6반").
- **어드민 브라우저 `<title>` 형식: `"웹앱 제목 - 관리자 모드"`**
- **어드민 로그인 화면 구조**: login-icon 없이, login-title = 웹앱 이름(크게), login-sub = "관리자 모드"(작은 텍스트)
- 버튼은 가급적 중앙정렬

## 파일 구조
- 학생용: `index.html`
- 선생님용: `admin.html`
- 도구: `/tools/*.html`

## 코드 스타일
- 한글 주석, 사용자 메시지 한국어
- 모바일 우선 (`max-width: 600px` 분기)
- shared/의 import 경로는 상대경로(`../shared/`)나 절대경로(`/hoistory/shared/`) — 새 앱마다 어떤 걸 쓰는지 확인

## 현재 진행 중인 작업 — 어드민 통일
4개 어드민(blind_ryeo, goryeo_choice, s_threads, think)의 디자인을 통일하는 중.
- **1단계 (완료)**: `shared/admin-base.css` 생성 — 공통 디자인 시스템 (로그인·상단바·메인탭·서브탭·패널·모달·토스트·통계칩 등)
- **2단계**: 라이트 톤 3개(blind_ryeo, goryeo_choice, s_threads) 어드민의 `<style>`에서 공통 부분 제거, `<link rel="stylesheet" href="../shared/admin-base.css">` 추가
- **3단계**: think/admin.html 다크 → 라이트 마이그레이션 + 통일된 구조로 재작성

각 어드민의 앱 정체성(blind_ryeo의 카테고리 점 색, goryeo_choice의 Noto Serif KR 한자 로고, s_threads의 Jua 폰트 등)은 각 파일 안의 `<style>`에 남긴다.
