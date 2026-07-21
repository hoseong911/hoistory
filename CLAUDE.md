# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

A static web app suite for 김호성 선생님 (Korean history teacher), branded "Dive into HISTORY." It's deployed via GitHub Pages (`.nojekyll` present). No build system — pure vanilla HTML/CSS/JS loaded directly in the browser.

## Deployment

Push to `main` → GitHub Pages auto-deploys. No build step. Open any `.html` file directly in a browser to test locally.

## Architecture

### Hub structure
- `index.html` — Public-facing hub homepage (no login); reads cards/categories from Firestore and renders them. No standalone root admin — managed from `lms/admin.html`'s "아카이브" tab (2026-07-21, root `admin.html` deleted; see "루트 index.html / 아카이브 관리" below).

### Sub-apps
Each lives in its own folder with a consistent pattern:
- `<folder>/index.html` — Student view (requires student ID + name login)
- `<folder>/admin.html` — Teacher view (password-gated)

Current sub-apps (LMS 미션 체크 연결, `apps/` 하위): `blind_ryeo/`, `escape/`, `goryeo_choice/`, `interview/`, `oxquiz/`, `s_threads/`, `sillaver/`, `samguk_goods/`
루트 앱 (LMS 연동이지만 미션 체크 앱 아님): `hismile/`, `survey/`

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

**Firestore 컬렉션 이름 규칙**: 신규 컬렉션은 반드시 `{앱이름}_{기능}` 형식의 snake_case로 짓는다. 예: `sillaver_posts`, `escape_stages`, `oxquiz_rankings`. 버전·연도·학기 번호를 이름에 절대 포함하지 않는다(`escape26_2`, `ox2606_*`, `silla_v3` 같은 패턴 금지). LMS 공통 인프라(`grade_records`, `class_lessons` 등)와 허브 설정(`cards`, `settings`)은 예외. camelCase 금지(`gradeOverrides` 같은 패턴 금지).

**제출/채점 데이터 표준 스키마 (신규 미션 앱)**: 미션 제출 데이터는 항상 Firestore에 저장한다(RTDB 아님 — `students` 로스터·토스트·간단 설정용으로만 RTDB 사용). 채점 결과는 제출 문서 자신의 필드에 저장하고(별도 경로 아님), 필드명은 `status`, 값은 `'pass' | 'fail'`(필드 없음 = 미채점)로 통일한다. 기존 6개 미션 앱 모두 이 규칙 통일 완료(interview/samguk_goods/sillaver는 이전, s_threads/goryeo_choice/blind_ryeo는 2026-07-21 이관). blind_ryeo의 `goryeo_grades` 별도 경로도 제거하고 post 문서의 `status` 필드로 통합됨. 기존 RTDB 데이터 마이그레이션이 필요하면 `tools/migrate_status_fields.html` 참고.

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
- Firebase SDK v10.12.2 (shared/auth.js와 버전 통일 필수)
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
- **웹앱 내 `border-left` 강조박스(왼쪽 선 강조) 사용 금지**
  - AI가 생성한 티가 나는 대표적인 패턴. 콘텐츠 강조가 필요하면 상하 얇은 선(`border-top + border-bottom`) 또는 배경색 박스로 대체한다.
  - 예외: 레이아웃 구조용 border(사이드바 경계, 패널 구분선 등)는 허용
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
- 선생님용: `lms/admin.html` (루트 아카이브 관리 포함, 2026-07-21부터 — 루트 자체 `admin.html`은 없음)
- 도구: `/tools/*.html`
- `apps/` — LMS **미션 체크** 탭에 직접 연결되는 수업 활동 앱만 넣는다. LMS와 연동되더라도 미션 체크 앱이 아닌 것(예: `hismile/`, `survey/`)은 루트에 둔다.

## 코드 스타일
- 한글 주석, 사용자 메시지 한국어
- 모바일 우선 (`max-width: 600px` 분기)
- shared/의 import 경로는 상대경로(`../shared/`)나 절대경로(`/hoistory/shared/`) — 새 앱마다 어떤 걸 쓰는지 확인

## 루트 index.html / 아카이브 관리

**배경**: 거의 모든 실사용 기능이 LMS로 이전됐다. 루트는 이제 (a) 학생이 LMS로 들어가는 진입점 + 지난 자료 아카이브 열람, (b) 동료 교사들이 둘러보는 링크트리 역할만 하면 된다. 남은 관리 기능(카드 공개/수정/삭제, 카테고리 CRUD)이 너무 작아져서 로그인 화면·상단바·Firebase 초기화를 통째로 갖춘 별도 `admin.html`을 유지할 이유가 없다고 판단 — **루트 `admin.html`은 삭제**하고 `lms/admin.html`에 "아카이브" 탭으로 흡수함(같은 Firebase Auth 계정을 쓰므로 보안상 분리할 이유도 없었음).

**index.html**: 구조는 유지(기존 링크트리+아카이브 아코디언). "ADMIN" 버튼 링크를 `admin.html` → `lms/admin.html`로 변경. 비주얼(색상/폰트)은 이후 2026-07-21 세션에서 추가로 손봄 — 아래 "루트 index.html 비주얼 리디자인" 참고.

**`lms/admin.html`의 "아카이브" 탭** (사이드바 `nav-dark`, "각종 콘텐츠"와 "학생 관리" 사이에 위치, 서브메뉴 CARDS/CATEGORY/ADD):
- **CARDS**: "LMS 미션 카드" 패널(미션 체크에서 공개·잠금해제한 카드 중 아직 아카이브에 안 올라간 것 자동 나열) + 이미 공개된 아카이브 카드 목록(수정/삭제/공개-비공개 토글). 카드 데이터는 `getDocs`로 매번 새로 불러오는 방식(다른 탭처럼 onSnapshot 구독 안 씀 — lms/admin.html 기존 관례를 따름).
- **CATEGORY**: `settings/categories`(`{list:[{key,en,ko}]}`) CRUD, 최대 4개, 추가/삭제만(순서 변경 없음).
- **ADD**: LMS를 거치지 않는 외부 자료(링크 등)를 직접 추가하는 보조 기능 — 아이콘(`shared/icon-picker.js`)/카테고리/제목/설명/URL 입력.
- 관련 함수는 전부 `renderArchive*`/`archive*` 접두어(`lms/admin.html`, `contentsMoveCard` 함수 직후에 위치). 이 파일은 `<script type="module">` 하나로 전체가 돌아가므로, 인라인 `onclick`이 참조하는 새 함수는 반드시 `window.함수명 = 함수명`으로도 노출해야 한다([[feedback_lms_module_window_expose]] 그대로 적용됨).

**LMS 미션 카드 → 아카이브 공개 메커니즘** ("가져오기" 수동 모드를 대체함):
LMS에서 미션 카드를 만들고 공개(잠금 해제)하면, 같은 Firestore `cards` 컬렉션에 `category`가 `settings/lms_config.mission_category` 값으로 저장된다(기존과 동일한 데이터 구조). 이걸 루트 아카이브에 노출할지는 별도 단계로 분리했다:
- 아카이브 CARDS 탭에 "LMS 미션 카드" 패널이 자동으로 뜬다 — `category === mission_category && !locked`인 카드를 나열(수동으로 찾아 들어갈 필요 없음).
- 학생 허브(index.html)에는 이 시점까지 전혀 안 뜬다 — index.html은 `settings/categories`에 등록된 카테고리만 렌더링하는데 `mission_category`는 그 목록에 없기 때문에 자동으로 비공개 상태.
- 관리자가 "아카이브에 공개" 버튼을 누르면 카테고리 선택 + 설명(desc) 입력 폼이 펼쳐진다. 설명란은 `adminConfig/{appKey}/archive`(RTDB)의 topic/intent가 있으면 자동으로 채워지되(appKey는 `url.split('/')[1]`), 직접 수정 가능. "게시하기"를 누르면 **원본과 무관한 새 `cards` 문서를 addDoc으로 생성**(`sourceMissionId: <원본 docId>` 필드로 출처만 표시)하고 그걸 index.html이 렌더링한다.
- **컬렉션을 나누지 않기로 함**: 문서 단위로 이미 독립된 사본이 생성되므로(다른 docId), LMS 쪽에서 원본 미션 카드를 나중에 삭제해도(수업에서 더 이상 안 씀) 루트에 이미 공개된 사본은 영향받지 않는다. 컬렉션을 분리하면 index.html 쿼리·firestore.rules를 이중으로 관리해야 해서 오히려 복잡도만 늘어난다고 판단(2026-07-21 결정, 사용자 질문에 대한 답변).
- 이미 사본이 만들어진 미션 카드는 목록에서 "✓ 공개됨" 배지로 표시되고 버튼이 사라짐(같은 카드를 실수로 중복 게시하는 것 방지, `sourceMissionId` 매칭으로 판별).

