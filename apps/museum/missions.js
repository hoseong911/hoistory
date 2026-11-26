// 국립중앙박물관 관람 활동지의 문항. 학생 화면(index.html)과 어드민(admin.html)이 같이 읽는다.
// 문항 id는 museum_works 문서의 answers 열쇠다. 이미 낸 답이 있으면 id를 바꾸지 않는다.
// type: text, textarea, radio, checkbox, select, photo, rating, timer
// modes: ['group'] 또는 ['solo'] 이면 그 관람 방법에서만 보인다(섹션, 문항 둘 다).
// showIf: { field, equals } 이면 다른 답에 따라 보인다.

export const ROOMS = [
  '1층 선사·고대관',
  '1층 중·근세관',
  '1층 역사의 길 (경천사 십층석탑)',
  '2층 서화실 1실과 2실',
  '2층 사유의 방',
  '2층 기증관',
  '3층 청자실',
  '3층 분청사기·백자실',
  '3층 세계문화관'
];

export const CLOSED_NOTE =
  '2027년 1월 28일까지 휴실: 2층 불교회화실, 목칠공예실, 서화실 3실과 4실 / 3층 불교조각실, 금속공예실';

export const ROLES = ['길잡이', '기록', '사진', '시간지킴이'];

export const MODES = {
  group: { label: '모둠 관람', desc: '4~5명이 역할을 나눠 함께 미션을 풀어요' },
  solo: { label: '개인 관람', desc: '나만의 동선으로 미션을 풀어요' }
};

export const PHASES = [
  {
    id: 'pre',
    label: '사전',
    when: '교실에서',
    title: '관람 전: 나의 유물 고르기',
    intro: '박물관에 가기 전에 꼭 보고 싶은 유물과 질문을 정해요.',
    sections: [
      {
        id: 'pre-artifact',
        badge: '필수',
        title: '나의 유물 고르기',
        place: '박물관 누리집 소장품 검색',
        intro: '열려 있는 전시실에서 꼭 실물로 보고 싶은 유물 1점을 골라요.',
        fields: [
          { id: 'pre_artifact', type: 'text', label: '나의 유물 이름', required: true, placeholder: '예: 백자 달항아리' },
          { id: 'pre_room', type: 'select', label: '전시실', required: true, options: ROOMS, help: CLOSED_NOTE },
          { id: 'pre_reason', type: 'textarea', label: '이 유물을 고른 이유', required: true }
        ]
      },
      {
        id: 'pre-question',
        badge: '필수',
        title: '실물에게 던질 질문',
        intro: '설명판만 읽어서는 답할 수 없고, 실물을 직접 봐야 답할 수 있는 질문을 만들어요.',
        tip: '좋은 질문: “금관은 정말 머리에 썼을까? 크기를 보면 알 수 있을까?”\n아쉬운 질문: “언제 만들었나요?” (설명판만 읽으면 끝나요)',
        fields: [
          { id: 'pre_question', type: 'textarea', label: '나의 질문', required: true },
          { id: 'pre_guess', type: 'textarea', label: '지금 내가 예상하는 답' }
        ]
      },
      {
        id: 'pre-team',
        badge: '모둠',
        modes: ['group'],
        title: '모둠 관람 계획',
        intro: '모둠마다 출발 층을 다르게 정하면 붐비는 곳을 피할 수 있어요.',
        fields: [
          { id: 'pre_startFloor', type: 'radio', label: '우리 모둠 출발 층', required: true, options: ['1층', '2층', '3층'] },
          { id: 'pre_teamMust', type: 'textarea', label: '모둠이 함께 꼭 볼 유물 2~3개', required: true }
        ]
      },
      {
        id: 'pre-route',
        badge: '개인',
        modes: ['solo'],
        title: '나만의 동선 짜기',
        intro: '‘나의 유물’이 있는 전시실부터 시작하면 좋아요.',
        fields: [
          { id: 'pre_route', type: 'checkbox', label: '가 보고 싶은 전시실', required: true, options: ROOMS }
        ]
      },
      {
        id: 'pre-manners',
        badge: '필수',
        title: '관람 약속',
        fields: [
          {
            id: 'pre_manners',
            type: 'checkbox',
            label: '모두 확인하고 체크해 주세요',
            required: true,
            requireAll: true,
            options: [
              '사진은 플래시를 끄고 찍어요',
              '삼각대와 셀카봉은 쓰지 않아요',
              '전시실 안에서는 먹거나 마시지 않아요',
              '뛰지 않고, 진열장에 기대거나 만지지 않아요',
              '집합 시간과 장소를 지켜요'
            ]
          }
        ]
      }
    ]
  },

  {
    id: 'onsite',
    label: '현장',
    when: '박물관에서',
    title: '관람 중: 미션 풀기',
    intro: '필수 미션을 먼저 하고, 시간이 남으면 선택 미션에 도전해요. 사진은 플래시를 끄고 찍어요.',
    sections: [
      {
        id: 'm1',
        badge: '필수',
        title: '나의 유물을 찾아라',
        dynamicPlace: (a) => a.pre_room || '사전 단계에서 고른 전시실',
        dynamicNote: (a) => (a.pre_artifact ? `나의 유물: ${a.pre_artifact}` : '사전 단계에서 ‘나의 유물’을 먼저 골라 주세요.'),
        fields: [
          { id: 'm1_found', type: 'radio', label: '찾았나요?', required: true, options: ['찾았다', '못 찾았다 (전시 교체 등)'] },
          { id: 'm1_alt', type: 'text', label: '대신 고른 유물', required: true, showIf: { field: 'm1_found', equals: '못 찾았다 (전시 교체 등)' } },
          { id: 'm1_photo', type: 'photo', label: '유물 사진' },
          { id: 'm1_answer', type: 'textarea', label: '내 질문의 답, 또는 실물을 보고 새로 알게 된 것', required: true }
        ]
      },
      {
        id: 'm2',
        badge: '필수',
        title: '두 사람의 생각',
        place: '2층 사유의 방',
        intro: '나란히 놓인 두 반가사유상을 천천히 둘러보며 비교해요.',
        fields: [
          { id: 'm2_diff', type: 'textarea', label: '두 불상의 다른 점 2가지 (얼굴, 머리에 쓴 관, 옷 주름, 자세 등)', required: true },
          { id: 'm2_pick', type: 'textarea', label: '더 마음에 드는 쪽과 그 이유' },
          { id: 'm2_think', type: 'text', label: '반가사유상은 지금 무슨 생각을 하고 있을까?', placeholder: '자유롭게 상상해 보세요' }
        ]
      },
      {
        id: 'm3',
        badge: '필수',
        title: '타임머신: 그때도 지금도',
        place: '1층 선사·고대관 또는 중·근세관',
        intro: '지금 우리가 쓰는 물건과 하는 일이 비슷한 유물을 찾아요.',
        fields: [
          { id: 'm3_artifact', type: 'text', label: '유물 이름', required: true },
          { id: 'm3_today', type: 'text', label: '오늘날 비슷한 역할을 하는 물건', required: true, placeholder: '예: 맥가이버 칼' },
          { id: 'm3_photo', type: 'photo', label: '유물 사진' }
        ]
      },
      {
        id: 'team',
        badge: '모둠',
        modes: ['group'],
        title: '모둠 포즈 챌린지',
        place: '어느 전시실이든',
        intro: '유물 하나의 자세나 표정을 모둠원이 함께 따라 하고 사진을 찍어요. 다른 관람객을 가리지 않게 짧게! 얼굴이 나오지 않게 찍어도 돼요.',
        fields: [
          { id: 'team_artifact', type: 'text', label: '따라 한 유물', required: true },
          { id: 'team_photo', type: 'photo', label: '모둠 사진', required: true }
        ]
      },
      {
        id: 'solo',
        badge: '개인',
        modes: ['solo'],
        title: '3분 멈춤 관찰',
        place: '어느 전시실이든',
        intro: '한 유물 앞에서 3분 동안 머물러요. 처음에는 안 보이던 것이 보이기 시작해요.',
        fields: [
          { id: 'solo_artifact', type: 'text', label: '관찰한 유물', required: true },
          { id: 'solo_timer', type: 'timer', seconds: 180, label: '3분 타이머' },
          { id: 'solo_find', type: 'textarea', label: '3분 동안 새로 발견한 것 3가지', required: true }
        ]
      },
      {
        id: 's1',
        badge: '선택',
        title: '탑 올려다보기',
        place: '1층 역사의 길',
        intro: '경천사 십층석탑의 층마다 새겨진 장면을 아래에서 위로 살펴봐요.',
        fields: [
          { id: 's1_photo', type: 'photo', label: '가장 마음에 드는 장면 사진' },
          { id: 's1_scene', type: 'textarea', label: '그 장면은 무엇처럼 보이나요?' }
        ]
      },
      {
        id: 's2',
        badge: '선택',
        title: '청자 vs 백자',
        place: '3층 청자실, 분청사기·백자실',
        intro: '고려청자 하나, 조선의 분청사기나 백자 하나를 골라 비교해요.',
        fields: [
          { id: 's2_celadon', type: 'text', label: '고른 청자' },
          { id: 's2_white', type: 'text', label: '고른 분청사기 또는 백자' },
          { id: 's2_compare', type: 'textarea', label: '색, 무늬, 모양은 어떻게 다른가요?' },
          { id: 's2_photo', type: 'photo', label: '사진' }
        ]
      },
      {
        id: 's3',
        badge: '선택',
        title: '그림 속으로',
        place: '2층 서화실 1실과 2실',
        intro: '그림 하나를 골라 그 안으로 들어갔다고 상상해요.',
        fields: [
          { id: 's3_title', type: 'text', label: '그림 제목' },
          { id: 's3_sound', type: 'textarea', label: '그림 속에서 들릴 것 같은 소리 3가지' }
        ]
      },
      {
        id: 's4',
        badge: '선택',
        title: '세계 속의 닮은꼴',
        place: '3층 세계문화관',
        intro: '오늘 본 한국 유물과 닮은 다른 나라 유물을 찾아요.',
        fields: [
          { id: 's4_artifact', type: 'text', label: '다른 나라 유물' },
          { id: 's4_similar', type: 'textarea', label: '닮은 한국 유물과 비슷한 점' }
        ]
      },
      {
        id: 's5',
        badge: '선택',
        title: '나는 큐레이터',
        place: '어느 전시실이든',
        intro: '이 전시실에서 딱 한 점만 남겨야 한다면?',
        fields: [
          { id: 's5_room', type: 'select', label: '전시실', options: ROOMS },
          { id: 's5_keep', type: 'text', label: '남길 유물' },
          { id: 's5_why', type: 'textarea', label: '그 이유' },
          { id: 's5_photo', type: 'photo', label: '사진' }
        ]
      },
      {
        id: 'visited',
        badge: '필수',
        title: '오늘 들른 전시실',
        fields: [
          { id: 'visited_rooms', type: 'checkbox', label: '들른 곳을 모두 체크해요', required: true, options: ROOMS }
        ]
      }
    ]
  },

  {
    id: 'post',
    label: '사후',
    when: '다녀와서',
    title: '관람 후: 돌아보기',
    intro: '박물관에서 보고 느낀 것을 정리해요.',
    sections: [
      {
        id: 'post-answer',
        badge: '필수',
        title: '내 질문의 답을 찾았나요?',
        dynamicNote: (a) => (a.pre_question ? `나의 질문: ${a.pre_question}` : ''),
        fields: [
          { id: 'post_found', type: 'radio', label: '결과', required: true, options: ['찾았다', '일부 찾았다', '못 찾았다'] },
          { id: 'post_foundDetail', type: 'textarea', label: '찾은 답, 또는 더 알아보고 싶은 점', required: true }
        ]
      },
      {
        id: 'post-best',
        badge: '필수',
        title: '가장 기억에 남는 유물',
        fields: [
          { id: 'post_best', type: 'text', label: '유물 이름', required: true },
          { id: 'post_bestWhy', type: 'textarea', label: '기억에 남는 이유', required: true }
        ]
      },
      {
        id: 'post-eyes',
        badge: '필수',
        title: '역사의 눈, 미술의 눈',
        intro: '오늘 본 유물 중에서 하나씩 골라요.',
        fields: [
          { id: 'post_history', type: 'textarea', label: '역사의 눈: 그 시대 사람들의 생활이나 생각을 알려 준 유물과 알게 된 점', required: true },
          { id: 'post_art', type: 'textarea', label: '미술의 눈: 모양, 색, 무늬, 만드는 기술이 놀라웠던 유물과 그 이유', required: true }
        ]
      },
      {
        id: 'post-reflect',
        badge: '선택',
        title: '돌아보기',
        fields: [
          { id: 'post_rating', type: 'rating', label: '오늘 관람 만족도' },
          { id: 'post_team', type: 'textarea', label: '모둠 활동에서 잘된 점과 아쉬운 점', modes: ['group'] },
          {
            id: 'post_next',
            type: 'checkbox',
            label: '다음에 또 간다면 가 보고 싶은 곳',
            options: [...ROOMS, '휴실이었던 전시실 (재개관 후)', '특별전']
          },
          { id: 'post_recommend', type: 'text', label: '친구에게 추천하는 한 줄' }
        ]
      }
    ]
  }
];
