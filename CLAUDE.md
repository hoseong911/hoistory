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

Current sub-apps (LMS 미션 체크 연결, `apps/` 하위): `blind_ryeo/`, `escape/`, `goryeo_choice/`, `j_yugyo/`, `j_interview/`, `j_science/`, `j_wartimeline/`, `oxquiz/`, `s_threads/`, `sillaver/`, `samguk_goods/`
루트 앱 (LMS 연동이지만 미션 체크 앱 아님): `hismile/`, `survey/`

The `mission/` folder contains standalone single-file HTML pages (no sub-folder structure).

### LMS 통합 서브앱 (`lms/admin.html`의 미션 체크에서 연결되는 웹앱)
`lms/admin.html`은 자체 미션 카드(Firestore `cards` 컬렉션, `settings/lms_config`의 `mission_category` 값이 카테고리)를 관리한다. 카드에 `adminUrl`을 지정하면 (a) 미션 카드 목록에 "어드민" 버튼이 생기고 (b) 사이드바 "미션 체크" 하위에 자동으로 서브메뉴 항목이 생겨 바로 그 웹앱 어드민을 iframe으로 연다(예: `j_interview/`).

새 미션 웹앱의 `admin.html`을 만들 때 다음 패턴을 그대로 따른다(기준 예시: `j_interview/admin.html`):
- `<title>` 은 lms 자체 표기(콜론)를 따른다 — `index.html`은 "웹앱 이름", `admin.html`은 "웹앱 이름 : 관리자 모드". (아래 디자인 원칙의 일반 하이픈 형식과 다른, lms 계열 전용 컨벤션.)
- 상단 헤더는 로고/탭/로그아웃을 3열 그리드(`grid-template-columns:1fr auto 1fr`)로 배치하고 각 항목에 `grid-column`을 명시적으로 지정한다. `display:none`인 그리드 아이템은 auto-placement에서 완전히 빠지므로, 명시하지 않으면 로고·로그아웃을 숨겼을 때(임베드 시) 남은 탭이 1번 칸으로 밀려 들어가 중앙정렬이 깨진다.
- `const isEmbedded = window.self !== window.top;`로 lms 안에 iframe으로 열렸는지 판별한다. 임베드된 경우:
  - 로그인 게이트를 건너뛰고 바로 어드민 화면을 보여준다(이미 lms에 로그인돼 있으므로).
  - 자체 로고·로그아웃 버튼은 숨긴다(`body.embedded` 클래스로 제어).
  - `document.documentElement.classList.add('has-own-back')`를 반드시 추가한다 — lms가 이 마커를 보고 자기 쪽 상단의 중복된 "목록으로" 바를 자동으로 숨긴다(같은 origin이라 `frame.contentDocument`로 확인 가능).
  - 헤더 안에 자체 "목록으로" 버튼을 두고(탭과 같은 줄) 클릭 시 `window.parent.closeAppAdmin()`을 호출한다.
- 색상 팔레트는 lms/admin.html의 `:root` 토큰(`--primary:#1E3A8A`, `--accent:#2DD4BF`, `--canvas:#FAFAF9` 등)을 그대로 재사용해 lms와 통일된 톤을 유지한다.
- lms에 등록할 때 "어드민 URL"은 hoistory 루트 기준 상대경로로 입력한다(예: `j_interview/admin.html`, `../`로 시작하면 안 됨 — `lms/admin.html`의 `resolveAppUrl()`이 루트 기준으로 풀어준다).

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
- **카드 가장자리 색 강조 띠("네일팁") 사용 금지 — 방향 불문(왼쪽·위·아래·오른쪽 모두)**
  - AI가 생성한 티가 나는 대표적인 패턴. `border-left`뿐 아니라 `border-top`에 색 띠를 두르는 것도 같은 이유로 금지(왼쪽을 막으면 위로 옮기지 말 것). 없어도 되는 장식이다.
  - 콘텐츠/카테고리 강조가 필요하면 **옅은 배경색 박스(배경 틴트)** 로 대체하거나, 제목 텍스트 색·작은 태그 칩으로 표현한다.
  - 예외: 레이아웃 구조용 얇은 중립색 border(사이드바 경계, 패널 구분선, 리스트 hairline 등)는 허용
- **버튼·링크·UI 요소에 화살표(←, →, ↑, ↓, ↗, ➡️ 등) 사용 절대 금지**
  - 유일한 예외: 정렬 방향을 명시해야 하는 버튼(예: 학번 ↑ / 학번 ↓), 리스트 순서 이동(↑↓)
  - 게임 콘텐츠 내 스탯 표시(생존↑ 등)는 허용
  - "뒤로가기", "다음", "콘솔", "열기" 같은 버튼에는 절대 붙이지 않는다
- **사용자에게 보이는 문구에 가운뎃점(·, U+00B7) 사용 절대 금지**
  - AI가 생성한 티가 나고 사용자가 싫어한다. 항목 구분은 조사(와/과, 및), 쉼표, 괄호, 슬래시(/), 공백 등 자연스러운 표현으로 대체한다.
  - 적용 범위: 학생 index.html + 어드민 admin.html + 슬라이드/모달 등 실제 화면에 렌더되는 모든 텍스트(정적 HTML, 템플릿 문자열, select 옵션, confirm/alert 문구 포함). 새 문구를 쓰거나 기존 문구를 손볼 때 `·`가 있는지 확인하고 없앤다.
  - 예외: 수업/게임 콘텐츠 자체의 고유명사 병렬(예: "이황·조식", "동인·서인", "경기·충청")과 코드/CSS 주석, Claude에 보내는 프롬프트 문자열은 건드리지 않는다.
- **모든 화면(학생 index.html + 어드민 admin.html + preview)에 유니코드 이모지 사용 절대 금지 — 전부 SVG 아이콘으로**
  - 아이콘은 반드시 공용 헬퍼 `shared/icons.js`로 렌더한다: `import { icon, resolveIcon } from '../../shared/icons.js';` → `icon('crown', 22)`. 필요한 아이콘이 없으면 `icons.js`의 `PATHS`에 Lucide SVG를 추가하고 쓴다(임의로 다른 SVG를 인라인하지 말 것).
  - 로그인 화면·상단바 제목·탭 버튼·섹션 헤더·버튼 레이블·상태 표시·메뉴 아이콘·정오답 마크 전부 이모지 없이 SVG로.
  - **콘텐츠 대표 아이콘도 이모지 문자 대신 아이콘 이름을 데이터로 저장한다**: 데이터 필드는 `emoji`가 아니라 `icon`(Lucide 이름)으로 두고, 렌더는 `icon(resolveIcon(item.icon||item.emoji), size)`로 한다. `resolveIcon`이 과거 이모지 문자를 자동 매핑하므로 기존 Firestore 데이터도 그대로 렌더된다. 어드민에서 아이콘을 고르게 하려면 자유 입력 대신 `ICON_NAMES` 기반 select(또는 `shared/icon-picker.js`)를 쓴다.
  - 정적 HTML에 박힌 아이콘은 `<span data-icon="이름" data-icon-size="24"></span>`로 두고, 스크립트 말미에서 `document.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon, el.dataset.iconSize?+el.dataset.iconSize:24));`로 주입한다.
  - 인라인 SVG 정렬은 공용 `.hi-ic { vertical-align: middle }`(theme.css)로 처리된다.
  - 유일한 예외: 순서 이동용 ↑↓(리스트 재정렬), Claude에 보내는 프롬프트 문자열 내부의 기호 등 UI 표면이 아닌 곳.
- **어드민 탭(main-tabs / sub-tabs) 항상 중앙 정렬** — `justify-content: center` 필수
- **어드민 사이드바/탭의 메뉴 라벨은 (콘텐츠 이름·데이터 항목이 아닌 카테고리 메뉴에 한해) 항상 영문 대문자로 표기** (예: `FEED`, `ANSWER`, `QUESTION`, `SETTING`, `SYSTEM`, `STUDENT`, `CARDS`, `UPLOAD`, `STATUS`). 새 앱을 만들거나 기존 한글 탭을 발견하면 짧고 명확한 영단어로 바꾸고, 이미 쓰인 라벨과 겹치는 개념이면 그 단어를 그대로 재사용해 앱마다 통일한다.
  - 예외: 에피소드 제목·강의 회차처럼 콘텐츠 자체의 이름(고유명사·번호)인 서브탭은 번역하지 않는다(예: escape의 "프롤로그"/"엔딩", 반별 탭의 "1반"~"6반").
- **어드민 브라우저 `<title>` 형식: `"웹앱 제목 - 관리자 모드"`**
- **웹앱 어드민 본문 폭은 공용 `.admin-container`(`shared/admin-base.css`)의 1000px을 그대로 쓴다.** 어드민은 표·목록·반 태그처럼 가로로 늘어나는 것이 많아 넉넉해야 한다. 앱마다 `max-width`를 따로 덮어쓰지 말고, 좁아서 잘리는 곳이 생기면 공용값을 올린다(2026-08-31에 720px에서 올림).
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


## LMS 미션 체크 자동 연동 (2026-08-27)

`lms/admin.js`의 **성적 체크**는 미션 항목을 손으로 체크하지 않고, 강의에 연결된 미션 앱의 제출·채점 결과를 그대로 끌어온다.

- **연결 고리**: 미션 카드(`cards`)의 `lessonNum`(연결 강의번호) == 성적 체크에서 고른 개념 강의 번호. 카드 `url`의 `apps/<앱키>/...`에서 앱키를 뽑아 `MISSION_SOURCES` 표를 찾는다.
- **`MISSION_SOURCES`** (`lms/admin.js`, `missionAutoDetect()` 바로 위): `{ coll, timeFields, graded }`. 새 앱을 연동하려면 여기 한 줄만 추가한다. 표에 없는 앱은 예전처럼 수동 체크.
- **판정 규칙** (2026-08-31 개정):
  - 달성 = 그 학생 제출물이 **전부** `status === 'pass'`. 하나라도 `fail`이면 미달성.
  - 미채점(`pass`/`fail`이 아님)이면 **달성과 기한을 둘 다 끈다**(판정 자체가 없는 상태라 미제출과 같이 본다). 웹앱 어드민에서 통과/미흡을 누르는 순간 실시간 구독이 다시 계산한다.
  - 미흡(`fail`)은 판정이 난 것이라 기한 체크는 제출 시각 기준을 그대로 따른다(생각 체크의 '조금 미흡'과 같은 규칙).
  - 기한 = `class_progress` 스케줄의 그 반 수업일과 **가장 이른 제출 시각**을 비교. 스케줄 정보가 없으면 통과로 둔다(정보 부족으로 불이익 주지 않음). 판정 함수는 생각 체크와 같은 `thScheduledDate()`를 재사용.
  - **웹앱 어드민의 채점이 언제나 기준이다.** 자동 감지를 막는 건 (a) 결석 처리된 학생, (b) 이번 세션에 표에서 직접 만진 칸 두 가지뿐이다(`gradeCanAutoApply(sid, block)` / `_gradeManualEdit`, 열쇠는 `sid|mission` 형태로 **항목별**).
  - **예전 규칙(제거됨)**: "이미 저장된 채점 기록이 있는 학생(`savedSet`)은 덮어쓰지 않는다". 저장은 개념/미션/생각을 학생 전원에 대해 한꺼번에 쓰기 때문에, [성적 반영]을 한 번이라도 누른 강의는 그 순간부터 자동 감지가 영구히 죽는 버그가 있었다. 다시 넣지 말 것.
- **반영 시점**: 표를 열어 둔 채 채점이 바뀌면 실시간으로 따라오고(`startMissionLive`), [불러오기] 때 저장값과 달라진 학생은 **이미 반영(공개)한 반에 한해** 학생 성적 문서까지 바로 갱신한다(`gradePushLive`). 아직 반영하지 않은 반은 표만 바뀐다 — 공개 시점은 선생님이 정하는 것이므로.
- **연동된 앱**: `j_interview`(interview_joseon_answers), `j_wartimeline`(j_wartimeline_results), `j_4cut`(fourcut_submissions).
- **`fourcut_submissions` 예외**: 네컷 작품 문서(`fourcut_works`)에는 base64 JPEG가 통째로 들어 있어 LMS가 전량 조회하면 수십 MB가 오간다. 그래서 학번당 1문서짜리 가벼운 요약 컬렉션을 따로 둔다 — 학생이 공유할 때 제출 사실·시각을 남기고(`apps/j_4cut/index.html`의 `saveSubmissionMark`), 선생님이 작품별 통과/미흡을 누를 때 합산 `status`를 써 넣는다(`apps/j_4cut/admin.html`의 `syncSubmissionSummary`). **채점 결과를 제출 문서 자신에 둔다는 표준 스키마의 유일한 예외**이며, 이유는 오직 이미지 용량이다. 작품별 `status`는 표준대로 `fourcut_works` 문서에 그대로 남는다.

## 사화 네컷 만화 이미지는 레포 파일 (2026-08-31)

`apps/j_4cut`의 만화 그림은 **레포에 직접 올린 파일**에서 끌어온다. 사건 순서대로 무오사화 `1`, 갑자사화 `2`, 기묘사화 `3`이며, 확장자는 `resolveEventImage()`가 png/jpg/jpeg/webp 순으로 찾아 먼저 열리는 것을 쓴다(어드민과 학생 화면에 같은 함수가 각각 들어 있다).

- 예전에는 어드민에서 파일을 올려 `settings/fourcut_img_<id>`에 base64로 넣었다. Firestore 문서 1MB 상한 때문에 긴 변 2400px부터 품질을 낮춰가며 다시 굽는 코드가 있었고, 그만큼 화질이 깎였다. 레포 파일에는 그 제약이 없다. **업로드 UI를 되살리지 말 것.**
- 어드민에는 [그림 다시 불러오기]만 남았다(`?t=` 캐시 무시). 그림을 바꾸려면 파일을 다시 푸시하고 이 버튼을 누른다.
- 캐시하는 주소는 `im.src`(브라우저가 푼 절대 주소)다. 상대 주소를 그대로 쓰면 학생 화면의 완성 이미지 합성(html2canvas가 DOM을 복제해 그린다)에서 그림을 못 찾을 수 있다.
- 그림은 같은 origin이라 canvas가 오염되지 않는다. 다른 도메인에서 끌어오면 `toDataURL`이 막히므로 외부 URL로 바꾸지 말 것.
- 말풍선 기본 배치와 본문은 그대로 `settings/fourcut_content`에 저장된다. 저장 버튼은 이제 그것만 쓴다.

## 성적 체크는 저장 버튼이 없다 (2026-08-31)

**체크를 누르는 순간이 곧 저장이자 반영이다.** 개별 체크박스, 열 전체 선택, 이름 앞 행 체크박스, 결석 토글 네 가지 모두 `gradeQueueSave()`로 들어가 400ms 디바운스 뒤 `writeBatch`로 `grade_records`에 `published: true`로 쓴다. 그래서 [임시 저장]과 반별 [갱신] 버튼을 없앴다(`saveGradeRecords` / `refreshClassGrades` / `refreshAllPublishedClasses` 삭제). 되살리지 말 것 — 누르는 걸 잊으면 표만 맞고 성적은 옛날 값으로 남는 게 원래 문제였다.

- **아직 한 번도 공개하지 않은 반**에서 첫 체크를 누르면 그 반 **전체**를 함께 쓴다. 한 명만 써 두고 반을 공개하면 나머지 학생 화면이 비기 때문이다. 이때만 토스트로 알린다.
- 남은 버튼은 [성적 반영하기] / [반영 취소] 둘뿐이다. 자동 감지만으로 채워져 손댈 게 없는 반은 이 버튼으로 처음 공개한다(`publishClassGrades`).
- 저장 상태는 버튼 자리의 `#gradeAutoSaveLbl`에 "저장 중… / 저장됨 HH:MM / 저장 실패"로 뜬다. 실패한 학번은 큐에 되돌려 두므로 다음 체크 때 같이 저장된다.
- 강의를 새로 불러올 때 대기열(`_gradePendingSave`)과 타이머를 반드시 비운다 — 안 그러면 이전 강의 체크가 새 강의에 쓰인다.

### [전체 갱신] (`gradeRefreshAllLessons`)

강의 선택 줄에 있는 버튼(불러오기 옆). **만들어 둔 모든 강의**를 지금 채점 결과 기준으로 다시 계산해 저장한다. 웹앱에서 뒤늦게 채점을 고쳤거나 표를 안 열어 둔 채 학생이 늦게 낸 것을 한 번에 따라잡는 용도이며, 강의를 고르지 않아도 눌린다.

- 이미 반영(공개)한 반만 갱신한다. 저장된 성적이 없는 학생, 결석 학생, 개념 체크(자동 소스 없음), 미실시로 꺼 둔 항목은 건드리지 않는다.
- 생각 체크는 **제출한 학생만** 다시 매긴다(불러오기 때와 같은 규칙).
- 강의마다 컬렉션을 다시 읽으면 읽기가 강의 수만큼 곱해지므로, 필요한 컬렉션(cards / grade_lecture_config / grade_publish_status / grade_records / think_lectures / think_submissions / gradeOverrides / 미션 앱별 제출 컬렉션)을 **먼저 한 번씩만 통째로 읽고** 계산은 메모리에서 한다. 여기에 컬렉션을 강의별로 다시 읽는 코드를 넣지 말 것.
- 미션 판정은 `missionVerdictFor()` 한 곳에 모여 있다. 불러오기(`missionAutoDetect`)와 전체 갱신이 같은 함수를 쓰므로, 규칙을 바꾸려면 여기만 고친다.

## 성적 피드백 즉시 노출 (2026-08-27)

피드백도 작성 즉시 저장되지만(`persistFeedbackOnly()`), 체크 쪽과 달리 **반영 상태(`published`)를 건드리지 않고 `feedback` 필드만 병합**한다. 학생 `lms/index.js`가 미반영 강의의 피드백을 `feedbacks` 배열로 따로 모아 보여주므로, 아직 공개하지 않은 반이어도 피드백은 바로 보인다. 점수와 "세부 채점 내역"은 그대로 공개된 강의만 쓴다.

피드백 템플릿(`settings/feedback_templates`)은 두 곳에서 쓴다 — 템플릿 모달의 "일괄 적용"(피드백이 비어 있는 학생에게만)과, 개별 피드백 모달의 템플릿 고르기 줄(`renderGradeFeedbackTplSelect` / `insertFeedbackTemplateIntoInput`). 개별 쪽은 덮어쓰지 않고 **커서 자리에 끼워 넣는다** — 템플릿을 뼈대로 두고 학생별 한마디를 앞뒤에 붙이는 방식이라서다.

## 대시보드 공개 관리의 [수정] 버튼 (2026-08-31)

미션 Check 항목의 [수정]은 카드에 `adminUrl`이 적혀 있으면 그 **웹앱 어드민을 오버레이로 연다**(`openAppAdmin`). 채점하러 들어갈 일이 카드 설정을 고칠 일보다 훨씬 많아서다. `adminUrl`이 없는 카드만 예전처럼 미션 카드 편집 탭으로 간다. 개념/생각 Check의 [수정]은 그대로 각 편집 탭으로 간다.

## 성적 체크 표 조작 (2026-08-31)

- **이름 앞 체크박스**(`.grade-row-cb`): 그 학생의 **실시 중인 항목** 달성과 기한을 한 번에 켜고 끈다. 미실시로 꺼 둔 항목은 표에 열이 없으므로 세지 않는다(`gradeRowBlocks()`). 결석 학생은 비활성.
- **이름 클릭**: 결석 표시/해제. 결석이면 세 항목을 미달성으로 고정하고, 이미 반영한 반이면 학생 성적까지 바로 갱신한다. 체크박스 클릭이 여기까지 올라가지 않도록 `stopPropagation`이 걸려 있다.
- 결석 취소선은 `td.tc-name` 전체가 아니라 `.tc-name-label`에만 긋는다(td에 걸면 앞의 체크박스까지 지워진 것처럼 보인다).

## 생각 체크 통과/미흡 토글 (2026-08-31)

교사가 AI 채점 결과를 손으로 뒤집으면(`thToggleOverride`) 세 가지가 함께 움직인다.
- `gradeOverrides` 저장(기존 동작)
- **포인트**: 미흡으로 내리면 그 강의 생각 체크 지급분을 회수하고, 통과로 올리면 포인트가 없을 때 10pt를 준다. 토글을 되돌리면 회수/지급도 되돌린다. 지금 걸려 있는 효과는 제출 문서의 `ovrState` / `ovrRemovedPt` / `ovrGrantedPt`에 적어 두므로 여러 번 눌러도 어긋나지 않는다(`thApplyOverrideXP`). 재채점하면 이 필드도 초기화된다.
- **성적 체크**: 표가 열려 있으면 그 자리에서 고치고, 안 열려 있으면 `grade_lecture_config.thinkLectureDocId`로 강의를 거꾸로 찾아 `grade_records`의 생각 칸만 덮어쓴다(`thPushThinkStandalone`). 아직 반영하지 않은 반, 저장된 성적이 없는 학생, 결석 학생은 건드리지 않는다.

## 슬라이드 글꼴 크기 설정 (2026-08-27)

**항목 정의는 `lms/slide-render.js`의 `FONT_SPEC` 한 곳뿐이다.** 어드민 디자인 탭의 슬라이더와 수업 화면(`lecture.html`)의 CSS 변수 주입이 같은 표를 읽으므로, 조절 항목을 늘리려면 여기 한 줄만 추가하면 양쪽에 동시에 반영된다.

- 구조: 섹션(표지 / Dive / 개념 Check / 미션 Check / 생각 Check / 공통) > 그룹(슬라이드 형식) > 행(조절 항목). 행의 `key`는 `settings/class_design`의 `fonts`에 저장되는 이름, `v`는 CSS 변수명.
- 어드민 패널은 `ceRenderFontPanel()`이 스펙에서 **생성**한다(항목이 47개라 HTML로 적어 두면 관리가 안 됨). 섹션마다 `<details>`로 접히고 안쪽은 2열로 흐른다.
- **미션 Check는 개념 Check와 같은 CSS 규칙을 쓴다.** 그래서 미션 값은 변수 이름 뒤에 `-m`을 붙여 따로 저장하고, `slide-style.css`의 `.slide-mission { ... }` 블록에서 `--fs-rows-label: var(--fs-rows-label-m, var(--fs-rows-label))` 식으로 갈아끼운다. 새 항목을 추가하면 이 블록에도 한 줄 넣어야 미션에 반영된다.
- `SlideRender.normalizeFonts(fonts)`가 예전 설정(개념/미션이 `label`·`body`·`bodyMission` 3개만 갖고 있던 시절)을 형식별 값으로 펴 준다. 이미 있는 값은 건드리지 않으므로 **저장을 다시 안 해도 화면이 이전과 똑같이 나온다.** 연표 연도는 예전에 `calc(--fs-label * 1.1)`이었으므로 그 비율로 환산한다.
- `label`/`body`/`bodyMission`은 슬라이더에서 빠졌지만 데이터에는 그대로 남긴다 — 스펙에 아직 안 올라온 CSS 규칙이 있어도 예전처럼 동작하게 하는 안전판이다.
- 페이지(슬라이드) 단위 예외는 콘텐츠 편집의 "형식 변경 / 페이지 설정"에 있는 글자 크기 입력칸이며, `renderSlideHTML`이 그 슬라이드에만 인라인 스타일로 변수를 덮어쓴다.
