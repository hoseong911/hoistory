/* ============================================================
 *  사화에서 살아남기 · game.js
 * ------------------------------------------------------------
 *  사건 표(EVENTS)와 화면 만드는 함수들. index.html(학생 화면)과
 *  screen.html(교실 티비 화면)이 이 파일 하나를 함께 읽는다 —
 *  사건 설명과 선택지가 두 화면에서 어긋나면 안 되기 때문이다.
 *
 *  최상위에서 하는 일은 선언뿐이다. 실제 시작은 각 화면의 모듈
 *  스크립트가 window.startSahwa()를 부를 때부터다.
 * ============================================================ */
"use strict";

/* ══════════════════════════════════════════════════════════════════
   사화에서 살아남기

   진행 방식이 둘이다.
     · 반별 동시 진행(기본) — 학번으로 들어가 자기 반 방에 붙고, 교사가 사건을
       열어야 선택 화면이 뜬다. 죽은 학생은 관전 화면에서 반 상황을 지켜본다.
     · 혼자 하기(?solo=1) — 예전처럼 처음부터 끝까지 혼자 달린다.

   두 방식이 아래 EVENTS 표 하나를 함께 쓴다. 선지마다 key가 있어야 집계가
   맞는다(선지 순서를 매번 섞기 때문에 "몇 번째"로는 셀 수 없다).
   ══════════════════════════════════════════════════════════════════ */

const GAN = {1498:"무오",1504:"갑자",1506:"병인",1519:"기묘",1545:"을사",1575:"을해"};
const PHASE_ORDER = ["1498","1504","1506","1519","1545","1575"];
/* 학생에게 보이는 사건 이름. 사건 이름을 먼저 알려 주면 무슨 일이 벌어질지 알고
   고르게 되므로, 겪는 동안에는 그 사건을 가리키는 은유만 건다. 진짜 이름은
   결과가 공개될 때 EVENT_NAME으로 크게 드러난다. */
const PHASE_LABEL = {
  "1498":"첫 번째 사건 무덤을 파헤친 붓","1504":"두 번째 사건 어머니의 원한",
  "1506":"세 번째 사건 임금이 바뀌던 밤","1519":"네 번째 사건 나뭇잎에 새겨진 글자",
  "1545":"다섯 번째 사건 큰 윤씨와 작은 윤씨","1575":"여섯 번째 사건 동쪽 집과 서쪽 집"
};
/* 결과 공개 때 밝히는 진짜 이름(교실 화면에서 크게 뜬다). */
const EVENT_NAME = {
  "1498":"무오사화","1504":"갑자사화","1506":"중종반정",
  "1519":"기묘사화","1545":"을사사화","1575":"붕당의 형성"
};

/* 관직(官)·명예(名)의 출발값. 여기서 오르내리며 0 아래로는 내려가지 않는다. */
const BASE = 10;
/* 서원 배향 기준. 모든 갈래를 확률까지 펼쳐 세어 본 값(2026-09-09):
     기준 15 → 27명 반에서 평균 14.0명(51.9%)   기준 16 → 6.6명(24.4%)
     기준 17 → 5.5명(20.5%)                     기준 18 → 5.2명(19.3%)
   15는 반의 절반이 배향되어 "이름으로 남는 것은 드문 일"이라는 무게가 없었다.
   18은 배향되는 길이 여섯 갈래로 줄어, 낙향해 서원을 열고 살아남은 사람이나
   한 번 고발했다가 뒤에 개혁으로 갚은 사람이 통째로 빠진다. 그 사이인 16으로 둔다.
   **한양(중앙 관직)에서 시작하면 16부터는 배향이 불가능하다.** 名을 주는 두 자리
   (출신 보너스, 1506년 생존 보너스)가 한양에서는 모두 官으로 치환되고 부활도
   서원이 있어야 하므로, 한양 출신이 닿을 수 있는 최대 名은 15(무오사화에서 스승을
   옹호하고 죽는 길)뿐이다. 官의 길과 名의 길이 갈린다는 뜻이며, 한양에도 배향을
   열어 주려면 기준이 아니라 무오사화 옹호(+5)의 보너스를 함께 올려야 한다. */
const ENSHRINE = BASE + 6;

/* ══════════ 인트로 문구 (관리자 화면에서 고칠 수 있다) ══════════ */
const DEFAULT_CONTENT = {
  title: "사화에서\n살아남기",
  paragraphs: [
    "그대는 1498년 조선의 선비다. 갓 벼슬길에 올라 사림(士林)의 한 사람이 되었다. 앞으로 77년 동안 **사화**가 네 번 몰아친다. 사화란 선비들이 무리로 죽임을 당하는 사건을 말한다.",
    "화면마다 그대는 선택을 한다. 옳은 말을 할 것인가, 입을 다물 것인가. 나설 것인가, 물러설 것인가. 정답은 없다. 다만 **사관**이 그대가 한 일을 **사초**에 적어 둘 뿐이다. 사초는 임금도 함부로 못 보는 기록이지만, 한번 적히면 지워지지 않는다. 그 기록이 훗날 그대를 살릴 수도, 죽일 수도 있다.",
    "끝까지 살아남는 것이 목표는 아니다. 살아남은 자와 이름을 남긴 자가 서로 다른 사람이라는 것, 그것이 이 77년이 보여주는 바다."
  ],
  setupTitle: "인물 설정하기",
  /* 인트로의 두 갈래. 키 이름을 doorPlay/doorMemo에서 바꾼 것은, 이미 저장해 둔
     옛 문구가 새 문구를 덮어써서 [살아남기]라는 옛 이름이 그대로 뜨는 것을 막기
     위해서다(관리자 화면에서 저장하면 새 키로 다시 쌓인다). */
  doorTogether: "함께 살아남기",
  doorTogetherDesc: "수업 시간에 반 전체가 함께 하는 길이다. 선생님이 사건을 열면 화면이 바뀌고, 모두가 같은 사건 앞에서 저마다 선택한다.",
  doorSolo: "혼자 체험하기",
  doorSoloDesc: "수업에 빠진 사람이 혼자 복습하는 길이다. 반 진행과 상관없이 처음부터 끝까지 혼자 겪고 소감까지 남긴다. 수업에 참여했다면 이쪽으로 들어오지 않는다.",
  memoTitle: "소감 남기기",
  memoPrompt: "사화를 겪은 사림은 어떤 사람들이었는지, 오늘 알게 된 것과 생각한 것을 적어 보시오. 게임을 하지 못했더라도 교과서와 수업에서 배운 사림 이야기를 적으면 된다.",
  /* 인트로 맨 아래에 한 줄로 붙는 문. 참여한 기록이 있는 학생에게만 보인다. */
  memoDoorDesc: "활동을 마쳤는데 소감을 아직 남기지 않았다면 여기로 들어온다. 전에 남긴 글이 있으면 불러와 고쳐 쓸 수 있다.",
  hoLabel: "그대의 호(號)", hoHint: "스스로 지어 붙이는 이름",
  masterLabel: "스승을 고르시오",
  masters: [
    { key:"dong", name:"이황 · 조식",
      desc:"마음가짐을 바르게 하는 공부(敬)를 무엇보다 앞세운다. 벼슬에 나아가는 것보다 물러나 자신을 닦는 것을 귀하게 여겨, 임금이 불러도 사양하고 고향에서 제자를 기르는 일이 잦다. 옳지 않은 자리라면 아예 앉지 않는 것이 선비의 도리라고 가르친다. 주로 **영남**(지금의 경상도)에서 공부한 선비들이다." },
    { key:"seo", name:"이이 · 성혼",
      desc:"잘못된 제도는 뜯어고쳐야 한다(更張)고 말한다. 물러나 앉아 몸만 깨끗이 하는 것으로는 백성의 삶이 나아지지 않으니, 조정에 들어가 세금과 군역을 실제로 바꾸어야 한다고 가르친다. 현실에 발을 딛는 학문이다. 주로 **기호**(지금의 경기도와 충청도)에서 공부한 선비들이다." }
  ],
  baseLabel: "기반을 고르시오",
  /* 어느 쪽이 살아남는 길인지는 일러 주지 않는다. 앞선 판에서는 "빨리 오르고 크게
     떨어진다", "돌아갈 자리가 있어 다시 일어설 수 있다"고 결말까지 적어 두어,
     1506년의 판가름을 고르는 자리에서 이미 알려 주는 셈이었다. 무엇을 하는 자리인지만
     그림으로 보여 주고 그 끝은 겪어서 알게 한다. */
  bases: [
    { key:"central", name:"한양에 뿌리를 두다",
      desc:"대궐 앞 **3사**(사헌부·사간원·홍문관)의 뜰을 밟는다. 임금 앞에서 잘못을 따져 묻는 자리다. 젊은 나이에 이름이 도성 안에 퍼지고, 그대의 말 한마디가 조정을 흔든다. 다만 그대를 아는 사람은 모두 이 성 안에 있다." },
    { key:"local", name:"고향에 뿌리를 두다",
      desc:"산 아래에 **서원**을 열어 제자를 앉히고 **향약**으로 마을의 약속을 세운다. 도성의 소식은 늦게 닿고 벼슬도 늦다. 다만 그대를 스승이라 부르는 아이들과 그대의 이름을 아는 마을이 남는다." }
  ],
  startBtn: "사초를 펼친다"
};
let CONTENT = JSON.parse(JSON.stringify(DEFAULT_CONTENT));

/* ── 잡 헬퍼 ── */
const $ = (s)=>document.querySelector(s);
const esc = (s)=>String(s==null?"":s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const fmt = (s)=>esc(s).replace(/\*\*(.+?)\*\*/g,"<b>$1</b>");
function shuffle(a){ a=a.slice(); for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; }
function adj(P,k,n){ P[k]=Math.max(0,P[k]+n); }
function note(P,year,text){ P.log.push({year,text}); }
function kill(P,year,cause){ P.alive=false; P.deathYear=year; P.causeOfDeath=cause; }
function classOf(sid){ const c=parseInt(String(sid||"").slice(1,3),10); return isNaN(c)?null:c; }

function makePlayer(){
  return { id:"", name:"", ho:"", master:null, base:null,
           rank:BASE, fame:BASE, alive:true, seowon:false, noRevive:false,
           deathYear:null, causeOfDeath:null, log:[] };
}

/* ══════════════════ 사건 표 ══════════════════
   apply(P)는 P를 고치고 결과 화면 내용을 돌려준다. */
const EVENTS = {

"1498": {
  eyebrow:PHASE_LABEL["1498"], name:EVENT_NAME["1498"], title:"스승의 글이 사초에 올랐다",
  defaultKey:"silence",   /* 시간이 다 되도록 안 고르면 = 아무 말도 하지 않은 것 */
  situation:`사관 김일손이 스승 김종직의 「조의제문」을 사초에 실었다.
    항우에게 죽임을 당한 초나라 의제를 조문하는 글이라 하나, 조정은 이것을 달리 읽는다.
    의제는 단종이고 항우는 세조이니, 세조가 조카의 왕위를 빼앗은 일을 빗대어 꾸짖은 글이라는 것이다.
    <br><br>
    훈구 대신들에게는 오래 기다린 빌미다. 성종 때부터 조정에 들어와 자기들의 비리를 들추던 사림을
    한꺼번에 쓸어낼 구실이 생겼다. 연산군 또한 자신을 가르치려 드는 신하들이 진작 거슬렸다.
    국문장이 차려지고, 사림의 젊은 관원들이 하나씩 불려 나간다.
    <br><br>
    이제 그대의 차례다. 대신들이 그 글을 그대 앞에 펼쳐 놓고 묻는다. <b>이 글을 어찌 보는가?</b>`,
  choices:[
    { key:"defend", short:"스승을 옹호",
      label:"「조의제문」은 스승께서 옛일을 빌려 도리를 논한 글일 뿐이다. 글에 죄를 물을 수는 없다고 아뢴다.",
      apply(P){
        adj(P,"fame",5);
        note(P,1498,"국문장에서 스승의 글을 옳다 하다. 끝내 뜻을 굽히지 않았다.");
        kill(P,1498,"무오사화에 연루되어 처형되다");
        return { verdict:"그대는 형장으로 끌려갔다.", bad:true, seal:"卒",
          body:"끝내 글을 굽히지 않았다. 국문장에 있던 이들이 그대의 말을 들었고, 그 말은 조정 밖으로 퍼져 나갔다. 사림은 그대의 이름을 오래 기억할 것이다.",
          delta:"名 <b>+5</b> / 사망 1498",
          note:"무오사화로 김일손 등은 처형되고 김종직은 이미 죽은 뒤였음에도 무덤을 파헤쳐 시신을 베는 부관참시를 당했습니다. 사초에 실린 글 한 편이 사림 세력을 조정에서 걷어낸 첫 사건입니다." };
      }},
    { key:"silence", short:"침묵",
      label:"고개를 숙인 채 아무 말도 하지 않는다. 여기서 입을 여는 것은 스승도 나도 구하지 못한다.",
      apply(P){
        adj(P,"fame",-2);
        note(P,1498,"국문장에서 끝내 입을 열지 않다. 동문들이 그 침묵을 보았다.");
        return { verdict:"그대는 살아남았다.",
          body:"아무 말도 하지 않았다. 대신들은 더 물을 것이 없다며 그대를 놓아주었다. 국문장을 나서는 그대의 등 뒤로, 함께 배운 이들의 시선이 오래 머물렀다.",
          delta:"名 <b>-2</b>",
          note:"화를 피한 사림 다수는 지방으로 물러나 학문과 교육에 힘썼습니다. 침묵은 당장은 안전해 보이지만, 다음에 올 사화가 그 침묵을 봐주지는 않습니다." };
      }},
    { key:"betray", short:"스승을 고발",
      label:"스승의 글에 임금을 능멸하는 뜻이 있음을 아뢴다. 스승보다 내가 먼저 살아야 한다.",
      apply(P){
        adj(P,"rank",3); adj(P,"fame",-5);
        note(P,1498,"스승의 글에 역심이 있다 고하다. 훈구가 그 충심을 칭찬했다.");
        return { verdict:"그대는 관직을 얻었다.",
          body:"훈구 대신들이 그대의 충심을 크게 칭찬했고, 벼슬이 올랐다. 그러나 같은 스승 밑에서 배운 이들은 이제 그대를 다른 이름으로 부른다.",
          delta:"官 <b>+3</b> / 名 <b>-5</b> / 훈구에 붙은 자",
          note:"실제로 사림 내부에서도 고변한 인물들이 있었습니다. 다만 훈구에 붙었다고 하여 안전해지는 것은 아니었습니다. 6년 뒤를 보십시오." };
      }}
  ]
},

"1504": {
  kind:"lots", eyebrow:PHASE_LABEL["1504"], name:EVENT_NAME["1504"], title:"선택을 하시오",
  situation:`연산군이 마침내 생모의 일을 알아냈다. 폐비 윤씨가 왕비 자리에서 쫓겨나 사약을 받고 죽었다는 것,
    그리고 그 일에 조정의 신하들이 관계했다는 것이다.
    <br><br>
    임금은 그때 폐위를 건의한 자, 사약을 들고 간 자, 말리지 않고 지켜본 자를 모조리 찾아내라 명한다.
    이미 죽은 자는 무덤을 파헤치고, 살아 있는 자는 그 자손까지 끌어낸다. 훈구도 사림도 가리지 않는다.
    그들을 지켜 줄 명분도, 편을 들어 줄 세력도 이번에는 없다.
    <br><br>
    그대가 무오년에 무슨 말을 했는지, 누구의 편에 섰는지는 아무도 묻지 않는다.
    <b>이번에는 그대의 선택이 아무것도 지켜주지 못한다.</b>`,
  guide:"패를 하나 고르시오. 무엇을 고르든 결과는 그대의 뜻과 무관하다. 禍는 화를 입고, 免은 화를 면한다.",
  /* 5장 중 2장이 禍 — 탈락 40%. 학생마다 따로 섞으므로 서로 독립 시행이다. */
  n:5, bad:2,
  keyOf:(isBad)=> isBad ? "hwa" : "myeon",
  shortOf:{ hwa:"화를 입음", myeon:"화를 면함" },
  apply(P,isBad){
    if(isBad){
      adj(P,"fame",1);
      note(P,1504,"갑자년의 옥사에 휩쓸리다. 묻지도 않고 끌려갔다.");
      kill(P,1504,"갑자사화에 연루되어 화를 입다");
      return { verdict:"그대는 화를 입었다.", bad:true, seal:"卒",
        body:"무슨 말을 했는지, 어느 편에 섰는지 묻지 않았다. 그저 그 자리에 있었다는 것만으로 충분했다.",
        delta:"名 <b>+1</b> / 사망 1504",
        note:"갑자사화는 훈구와 사림을 가리지 않고 휩쓸었습니다. 몸을 사려 살아남는 전략이 아예 통하지 않는 시기가 있었다는 뜻입니다." };
    }
    note(P,1504,"갑자년의 옥사를 겨우 비켜 가다. 까닭은 알 수 없었다.");
    return { verdict:"그대는 화를 면했다.",
      body:"이유는 없었다. 옆자리에 앉아 있던 이는 끌려갔고 그대는 남았다. 조정에 남은 사람이 눈에 띄게 줄었다.",
      note:"이 시기 연산군의 폭정은 훈구 세력마저 등을 돌리게 만들었습니다. 그것이 2년 뒤 반정의 배경이 됩니다." };
  }
},

"1506": {
  kind:"auto", eyebrow:PHASE_LABEL["1506"], name:EVENT_NAME["1506"], title:"반정이 일어났다",
  /* 고를 것이 없는 장면. 그래도 교실 화면과 학생 화면에 걸 설명은 있어야 한다 —
     없으면 티비에 제목만 덩그러니 뜬다. */
  situation:`연산군의 폭정이 도를 넘자, 갑자년에 자기들도 피를 본 훈구 세력이 끝내 등을 돌렸다.
    박원종과 성희안 등이 군사를 일으켜 임금을 쫓아내고 진성대군을 새 임금으로 세웠다.
    <br><br>
    새 조정은 그동안 화를 입은 사림을 다시 불러들인다. 그러나 반정을 이끈 것은 훈구였으므로
    공신의 자리는 이미 그들의 것이었고, 왕위를 그들의 손에 빚진 중종은 그들을 견제할 다른 사람이 필요했다.
    <br><br>
    <b>이 장면에는 고를 것이 없다.</b> 지난 8년 동안 그대가 무엇을 해 두었는지가 그대로 판가름한다.
    갑자년에 화를 입은 이들 가운데, 고향에 서원을 두어 이름을 불러 줄 제자가 있는 사람만 조정으로 돌아온다.`,
  shortOf:{ revive:"부활", lost:"돌아오지 못함", stay:"조정에 서다" },
  /* 새로고침 등으로 결과 본문을 잃은 학생에게 다시 들려줄 짧은 판정. 서버에 남은
     선택 key만 있으면 되살릴 수 있어야 한다 — 아무것도 누르지 않은 장면이라
     "건너뛰었다"는 화면으로 끝나면 자기가 살아 돌아왔는지조차 모른 채 지나간다. */
  recap:{
    revive:{ verdict:"그대의 학맥이 그대를 살렸다.",
      body:`고향의 서원에는 그대에게 글을 배운 제자들이 남아 스승의 이름을 계속 불렀다.
        훈구를 견제할 사람을 찾던 새 조정에 올라간 천거의 글에 그대의 이름이 있었다.
        <b>그대는 다시 살아 조정으로 돌아왔다.</b>` },
    lost:{ verdict:"그대는 돌아오지 못했다.", bad:true,
      body:`반정으로 조정이 새로 서고 화를 입은 사림이 다시 불려 들어갔다.
        그러나 명부에서 지워진 그대의 이름을 대신 말해 줄 사람이 없었다.` },
    stay:{ verdict:"중종이 왕이 되었다.",
      body:`새 조정이 그대를 부른다. 그러나 반정을 이끈 것은 훈구였으므로,
        공신의 자리는 이미 그들의 것이었다.` }
  },
  apply(P){
    if(!P.alive){
      /* 갑자년에 시간이 다 되도록 패를 잡지 않은 학생. 스스로 고르지 않았으므로
         서원이 있어도 되살아나지 않는다(autoSubmit이 noRevive를 세워 둔다). */
      if(P.noRevive){
        return { key:"lost", verdict:"그대는 돌아오지 못했다.", bad:true,
          body:`반정이 일어나 연산군이 쫓겨나고 중종이 왕이 되었다. 새 조정은 그동안 화를 입은 사림을 다시 불러들인다.
            <br><br>
            그러나 갑자년의 그대는 끝내 아무 패도 잡지 않았다. 스스로 고르지 않은 자리에서 끌려간 이름은
            아무도 대신 불러 주지 않는다. 천거의 글에 그대의 이름은 없었다.`,
          note:"사화의 한복판에서 아무것도 하지 않는 것은 선택하지 않는 것이 아니라, 남이 대신 정하게 두는 것입니다." };
      }
      if(P.seowon){
        P.alive=true; P.deathYear=null; P.causeOfDeath=null; adj(P,"fame",1);
        note(P,1506,"서원의 제자들이 이름을 지켜 조정의 부름을 다시 받다.");
        return { key:"revive", verdict:"그대의 학맥이 그대를 살렸다.",
          body:`벼슬은 끊겼고 이름은 조정의 명부에서 지워졌다. 그러나 고향에는 그대가 세운 서원이 남아 있었고,
            그 안에서 글을 배운 제자들이 스승의 이름을 계속 불렀다.
            <br><br>
            연산군이 쫓겨나고 새 임금 중종이 서자, 조정은 훈구를 견제할 사람을 찾는다.
            제자들이 올린 천거의 글에 그대의 이름이 있었다.
            <b>${esc(P.ho)}, 그대는 다시 살아 조정으로 돌아왔다.</b>`,
          delta:"名 <b>+1</b> / <b>부활</b>",
          note:"사화로 중앙에서 밀려난 사림은 향촌의 서원과 향약을 기반으로 힘을 길러 다시 중앙에 진출했습니다. 서원이 사림의 정치적 기반이었다는 말은 이런 뜻입니다." };
      }
      return { key:"lost", verdict:"훈구가 연산군을 몰아냈다.", bad:true,
        body:`반정이 일어나 연산군이 쫓겨나고 중종이 왕이 되었다. 새 조정은 그동안 화를 입은 사림을 다시 불러들인다.
          <br><br>
          그러나 한양의 벼슬자리 하나에만 기대어 살았던 그대에게는 그대의 이름을 대신 말해 줄 사람이 없었다.
          가르친 제자도, 돌아갈 서원도 없었다. 명부에서 지워진 이름은 그대로 지워진 채 남았다.
          <b>그대는 돌아오지 못했다.</b>`,
        note:"중앙 관직만을 기반으로 삼은 사림은 사화 한 번에 뿌리째 사라졌습니다. 서원과 향약이라는 돌아갈 자리를 만들어 둔 이들만이 되살아났습니다." };
    }
    const gain = P.base==="central" ? "官 <b>+2</b>" : "名 <b>+2</b>";
    if(P.base==="central") adj(P,"rank",2); else adj(P,"fame",2);
    note(P,1506,"반정으로 새로 선 조정에 서다. 훈구의 세상은 그대로였다.");
    return { key:"stay", verdict:"중종이 왕이 되었다.",
      body:`연산군의 폭정이 도를 넘자, 갑자년에 자기들도 피를 본 훈구 세력이 끝내 등을 돌렸다.
        박원종과 성희안 등이 군사를 일으켜 임금을 쫓아내고 진성대군을 새 임금으로 세웠다.
        <br><br>
        새 조정이 그대를 부른다. 그러나 반정을 이끈 것은 훈구였으므로, 공신의 자리는 이미 그들의 것이었다.`,
      delta:gain,
      note:"반정을 주도한 것은 훈구였습니다. 그래서 중종 초의 조정은 다시 훈구의 것이었고, 왕위를 그들의 손에 빚진 중종은 그들을 견제할 다른 사람이 필요했습니다." };
  }
},

"1519": {
  eyebrow:PHASE_LABEL["1519"], name:EVENT_NAME["1519"], title:"조광조가 그대를 부른다",
  defaultKey:"quiet",     /* 안 고르면 = 이름을 올리지 않은 것 */
  situation:`훈구에게 눌려 지내던 중종이 마침내 젊은 사림 조광조를 불러들였다. 조광조는 거침이 없다.
    <br><br>
    시험 성적이 아니라 사람됨을 보고 뽑겠다며 <b>현량과</b>를 열고, 반정 때 공도 없이 이름만 올린 자들의
    자격을 도로 빼앗는 <b>위훈 삭제</b>를 밀어붙인다. 도교 제사를 지내던 <b>소격서</b>도 유교의 나라에
    있을 수 없다며 없앤다. 임금에게조차 성인의 도덕을 요구하니, 중종은 점점 지쳐 간다.
    <br><br>
    훈구는 숨을 죽인 채 때를 기다리고 있다. 그 사이 조광조가 그대를 찾아와, 함께 서겠느냐고 묻는다.`,
  choices:[
    { key:"reform", short:"개혁에 가담",
      label:"함께 서겠다고 답한다. 이 기회를 놓치면 사림이 조정을 바로잡을 날은 다시 오지 않는다.",
      apply(P){
        adj(P,"fame",6);
        note(P,1519,"조광조와 함께 개혁의 명부에 이름을 올리다.");
        kill(P,1519,"기묘사화로 사사되다");
        return { verdict:"주초위왕(走肖爲王).", bad:true, seal:"卒",
          body:`어느 날 궁궐 나뭇잎에 벌레가 갉아먹은 네 글자가 임금 앞에 놓였다. 走와 肖를 합치면 趙,
            곧 조씨가 왕이 된다는 뜻이라 했다. 꿀로 글자를 써 두면 벌레가 그대로 갉아먹는다는 것을
            모르는 이는 없었으나, 아무도 그 말을 하지 않았다. 그대는 조광조와 함께 끌려갔다.`,
          delta:"名 <b>+6</b> / 사망 1519",
          note:"급진적인 개혁, 특히 공신의 자격을 빼앗는 위훈 삭제에 부담을 느낀 중종이 훈구와 손잡고 조광조 세력을 제거했습니다. 사림을 불러들인 것도, 죽인 것도 같은 임금이었습니다." };
      }},
    { key:"quiet", short:"이름은 올리지 않음",
      label:"이름을 올리지는 않되 뜻은 같이한다고 답한다. 앞에 나서지 않으면 화가 미치지 않을 것이다.",
      lot:{ n:5, bad:2, title:"그대의 이름은 명단에 있는가",
        situation:`그대는 앞에 나서지 않았다. 상소에 이름을 적지도, 조광조의 곁에 서지도 않았다.
          그러나 훈구가 조광조를 따르는 자들의 명단을 작성하고 있다는 소문이 돈다.
          누가 어디까지 적어 넣었는지는 그 명단을 쥔 자들만 안다.`,
        guide:"패를 하나 고르시오. 禍는 명단에 이름이 있었다는 뜻이다." },
      apply(P,isBad){
        note(P,1519,"개혁에 뜻은 같이하되 이름은 올리지 않다.");
        if(isBad){
          adj(P,"fame",3); kill(P,1519,"기묘사화에 연루되어 유배지에서 죽다");
          P.log[P.log.length-1].text = "명단에 이름이 올라 유배지로 끌려가다.";
          return { verdict:"명단에 그대의 이름이 있었다.", bad:true, seal:"卒",
            body:"나서지 않았다는 말은 통하지 않았다. 그대는 먼 유배지로 보내졌고, 그곳에서 돌아오지 못했다.",
            delta:"名 <b>+3</b> / 사망 1519",
            note:"기묘사화로 처벌받은 사림을 기묘명현이라 부릅니다. 앞에 나서지 않았는데도 명단에 이름이 오른 이들이 적지 않았습니다." };
        }
        adj(P,"fame",1);
        P.log[P.log.length-1].text = "명단에 이름이 없어 화를 면하다. 조광조는 사약을 받았다.";
        return { verdict:"명단에 없었다.",
          body:"그대는 살아남았다. 조광조는 사약을 받았고, 그를 따르던 젊은 관원들은 유배지로 흩어졌다. 조정은 다시 조용해졌다.",
          delta:"名 <b>+1</b>",
          note:"기묘사화 이후 사림은 다시 향촌으로 물러났습니다. 이때부터 서원과 향약이 전국으로 본격적으로 퍼집니다." };
      }},
    { key:"retire", short:"낙향하여 서원",
      label:"사양하고 벼슬을 버린다. 고향으로 내려가 서원을 열고 제자를 기르겠다.",
      apply(P){
        P.seowon=true; adj(P,"fame",2);
        const lost=P.rank; P.rank=0;
        note(P,1519,"벼슬을 버리고 낙향하여 서원을 열다. 제자들이 모여들었다.");
        return { verdict:"그대는 고향으로 돌아갔다.",
          body:`벼슬을 내려놓고 짐을 꾸렸다. 고향에 서원을 열어 선현에게 제사를 지내고, 모여든 아이들에게 글을 가르쳤다.
            마을에는 향약을 세워 서로 돕고 잘못을 바로잡게 했다. 한양에서 무슨 일이 벌어졌는지는 한참 뒤에야 전해 들었다.`,
          delta:`官 <b>${lost} → 0</b> / 名 <b>+2</b> / <b>서원</b>`,
          note:"주세붕이 백운동 서원을 세운 것이 1543년, 이것이 명종 대에 소수서원이라는 최초의 사액 서원이 됩니다. 물러난 것이 곧 진 것은 아니었습니다." };
      }}
  ]
},

"1545": {
  eyebrow:PHASE_LABEL["1545"], name:EVENT_NAME["1545"], title:"외척과 외척이 맞붙었다",
  defaultKey:"neutral",   /* 안 고르면 = 어느 편에도 서지 않은 것 */
  situation:`중종이 죽고 인종이 즉위했으나 여덟 달 만에 세상을 떠났다. 뒤를 이은 명종은 아직 열두 살,
    어머니 문정왕후가 대신 정사를 본다.
    <br><br>
    이제 조정은 훈구와 사림의 싸움터가 아니다. 인종의 외삼촌 윤임을 중심으로 한 <b>대윤</b>과,
    명종의 외삼촌 윤원형을 중심으로 한 <b>소윤</b>이 왕실의 외척끼리 권력을 놓고 맞선다.
    성이 같은 두 집안의 싸움에 사림이 어느 한쪽으로 끌려 들어간다.
    <br><br>
    양쪽 모두 그대에게 사람을 보냈다. 조정에 있든 벼슬을 놓고 고향에 물러나 있든,
    어느 편인지는 반드시 물어 온다. 답하지 않는 것 또한 하나의 답으로 헤아려진다.
    <b>그대는 어디에 서겠는가?</b>`,
  choices:[
    { key:"daeyun", short:"대윤",
      label:"대윤 편에 선다. 인종께서 세우려 하시던 뜻을 이어받는 것이 옳다.",
      apply(P){
        adj(P,"fame",2);
        note(P,1545,"대윤에 서다. 이긴 쪽은 소윤이었다.");
        kill(P,1545,"을사사화로 화를 입다");
        return { verdict:"소윤이 대윤을 몰아냈다.", bad:true, seal:"卒",
          body:"문정왕후가 소윤의 손을 들어 주었다. 윤임과 그를 따르던 이들이 역모로 몰렸고, 그대의 이름도 그 명부에 있었다.",
          delta:"名 <b>+2</b> / 사망 1545",
          note:"을사사화는 본래 왕실 외척 간의 권력 다툼이었으나, 그 과정에서 대윤 편에 섰던 많은 사림이 함께 피해를 입었습니다." };
      }},
    { key:"soyun", short:"소윤",
      label:"소윤 편에 선다. 지금 권력을 쥔 쪽에 서야 살아남고, 살아남아야 뜻도 펼 수 있다.",
      apply(P){
        adj(P,"rank",4); adj(P,"fame",-4);
        note(P,1545,"소윤에 붙어 벼슬이 크게 오르다.");
        return { verdict:"그대는 권력을 얻었다.",
          body:"소윤이 이겼다. 인사 명부의 윗자리에 그대의 이름이 올랐다. 물러나 있던 이도 이때 다시 불려 올라갔다. 그러나 사림은 이제 그대를 사림이라 부르지 않는다.",
          delta:"官 <b>+4</b> / 名 <b>-4</b>",
          note:"이긴 쪽에 서면 관직은 얻습니다. 다만 훗날 사림이 다시 조정을 장악할 때, 그 명단에 이름을 올리는 것은 다른 사람들이었습니다." };
      }},
    { key:"neutral", short:"중립",
      label:"어느 쪽에도 서지 않는다. 외척끼리의 싸움에 선비가 끼어들 일이 아니다.",
      lot:{ n:5, bad:2, title:"중립이 지켜지는가",
        situation:`그대는 양쪽의 사람을 모두 돌려보냈다. 그러나 이긴 쪽에게는 편들지 않은 것도
          반대한 것과 다르지 않다. 사림을 조정에서 몰아내려는 자들에게는 그것으로 충분한 이유가 된다.`,
        guide:"패를 하나 고르시오. 禍는 그대도 연루되었다는 뜻이다." },
      apply(P,isBad){
        if(isBad){
          adj(P,"fame",1);
          note(P,1545,"편들지 않은 것이 죄가 되어 화를 입다.");
          kill(P,1545,"을사사화에 연루되어 화를 입다");
          return { verdict:"그대도 연루되었다.", bad:true, seal:"卒",
            body:"편들지 않았다는 것이 죄가 되었다. 그대는 끝내 조정으로 돌아오지 못했다.",
            delta:"名 <b>+1</b> / 사망 1545",
            note:"을사사화의 여파는 이후 몇 년간 계속되었습니다. 벽서 한 장을 빌미로 또 한 차례 사림을 쳐낸 양재역 벽서 사건이 그 예입니다." };
        }
        adj(P,"fame",1);
        note(P,1545,"어느 편에도 서지 않은 채 조정이 조용해지기를 기다리다.");
        return { verdict:"그대는 살아남았다.",
          body:"문을 닫아걸고 조정이 조용해질 때까지 기다렸다. 그 사이 많은 이름이 명부에서 지워졌다.",
          delta:"名 <b>+1</b>",
          note:"명종 말년에 문정왕후가 죽고 외척 세력이 무너지자, 살아남은 사림이 조정을 채웁니다. 이제 상대할 훈구가 없습니다." };
      }}
  ]
},

"1575": {
  eyebrow:PHASE_LABEL["1575"], name:EVENT_NAME["1575"], title:"자리는 하나뿐이다",
  defaultKey:"watch",     /* 안 고르면 = 다투지 않고 지켜본 것 */
  situation:`77년이 지났다. 훈구는 사라졌고 조정은 마침내 사림의 것이 되었다.
    그러나 이긴 자들에게는 이제 함께 싸울 상대가 없다.
    <br><br>
    비어 있는 <b>이조 전랑</b> 자리에 모두의 눈이 쏠린다. 정5품에 지나지 않는 낮은 벼슬이지만,
    관리의 인사를 실질적으로 좌우하고 후임자를 자기 손으로 추천해 대를 잇는다.
    이 자리를 잡는 쪽이 앞으로 조정을 잡는다는 것을 모두가 안다.
    <br><br>
    한쪽에서는 김효원을 밀고, 다른 쪽에서는 심의겸이 그를 막아선다. 그대도 이 다툼 앞에 섰다.`,
  choices:[
    { key:"contest", short:"직접 다툼",
      label:"직접 그 자리를 다툰다. 인사를 쥐어야 사람을 쓸 수 있고, 사람을 써야 뜻을 편다.",
      apply(P){ adj(P,"rank",2); note(P,1575,"전랑의 자리를 직접 다투다.");
        return { verdict:"그대는 그 자리를 두고 다투었다.",
          body:"물러서지 않았다. 같은 학문을 배운 이들이 그대의 뒤에 섰고, 반대편에도 꼭 그만큼의 사람이 섰다.",
          delta:"官 <b>+2</b>",
          note:"이조 전랑 자리를 둘러싼 김효원과 심의겸의 대립이 사림을 동인과 서인으로 갈라놓았습니다. 붕당의 시작입니다." }; }},
    { key:"back", short:"같은 학맥을 밂",
      label:"같은 스승 밑에서 배운 이를 민다. 내가 앉지 않아도 우리 쪽이 앉으면 된다.",
      apply(P){ adj(P,"rank",1); adj(P,"fame",1); note(P,1575,"같은 학맥의 사람을 전랑으로 밀다.");
        return { verdict:"그대는 같은 학맥의 사람을 밀었다.",
          body:"직접 나서지는 않았으나, 누구를 미느냐가 곧 누구 편이냐였다. 그대가 어느 쪽인지는 이미 모두가 안다.",
          delta:"官 <b>+1</b> / 名 <b>+1</b>",
          note:"붕당은 개인의 야심만으로 갈린 것이 아니라 학맥을 따라 갈렸습니다. 누구에게 배웠느냐가 곧 어느 편이냐였습니다." }; }},
    { key:"watch", short:"물러나 지켜봄",
      label:"다투지 않고 지켜본다. 자리 하나를 두고 선비끼리 갈라서는 것이 옳은지 모르겠다.",
      apply(P){ adj(P,"fame",1); note(P,1575,"전랑의 다툼에서 물러나 지켜보다.");
        return { verdict:"그대는 다투지 않았다.",
          body:"자리 하나를 두고 선비가 선비와 갈라서는 것을 그대는 끝내 옳다 여기지 않았다. 그러나 갈라섬은 그대의 뜻과 무관하게 진행되었다.",
          delta:"名 <b>+1</b>",
          note:"다투지 않아도 학맥에 따라 어느 한쪽으로 분류되었습니다. 붕당은 개인이 빠질 수 있는 싸움이 아니었습니다." }; }}
  ]
}
};

/* 사건이 끝난 뒤 갈 곳. 죽었으면 결말로 가되, 갑자년의 죽음만은 반정(부활 판정)까지 간다. */
function nextPhase(phase, P){
  const i = PHASE_ORDER.indexOf(phase);
  if(i < 0 || i === PHASE_ORDER.length-1) return null;
  if(!P.alive && phase !== "1504") return null;
  return PHASE_ORDER[i+1];
}

/* ══════════════════ 화면 조각 ══════════════════ */
/* hold = 냈지만 아직 공개되지 않은 사이. 이때는 생사도 관작도 적지 않는다 —
   고른 순간 표시줄이 졸(卒)로 바뀌거나 名이 뛰면 선생님이 열기도 전에 학생이
   자기 결과를 알아 버린다. 결과는 반이 함께 받는 것이라야 한다. */
function barHTML(P, extra, hold){
  const g = GAN[P.year] ? GAN[P.year]+"년" : "";
  return `
    <span class="yr">${P.year||""}</span>
    <span class="gan">${g}</span>
    <span class="ho">${esc(P.ho)}</span>
    ${hold
      ? `<span class="tag hold">봉(封)</span>`
      : `<span class="tag ${P.alive?"":"dead"}">${P.alive?"생존":"졸(卒)"}</span>`}
    <span class="spacer"></span>
    ${extra||""}
    <span class="stat">官 <b>${hold?"?":P.rank}</b></span>
    <span class="stat">名 <b>${hold?"?":P.fame}</b></span>`;
}

function eventHTML(ev, choices){
  return `
    <div class="eyebrow">${ev.eyebrow}</div>
    <h2>${ev.title}</h2>
    <div class="situation">${ev.situation}</div>
    <div class="choices" id="ch">
      ${choices.map((c,i)=>`<button class="choice" data-i="${i}">${c.label}</button>`).join("")}
    </div>`;
}

function lotsHTML(cfg, slips, hold){
  return `
    <div class="eyebrow">${cfg.eyebrow||""}</div>
    <h2>${cfg.title}</h2>
    <div class="situation">${cfg.situation}</div>
    <p class="quiet">${cfg.guide}${hold ? " 뽑은 패는 봉해 두었다가, 선생님이 열 때 모두 함께 본다." : ""}</p>
    <div class="lots" id="lots">
      ${slips.map((_,i)=>`<button class="lot" data-i="${i}" aria-label="패 ${i+1}">?</button>`).join("")}
    </div>`;
}

/* 결과 화면. 겪는 동안에는 은유로만 걸어 두었던 사건의 진짜 이름을 여기서 밝힌다
   — 무슨 일이었는지 다 겪은 뒤에 이름을 받아야 이름이 기억에 붙는다. */
function outcomeHTML(res, btn, ev){
  return `
    ${ev && ev.name ? `<div class="eyebrow">${esc(ev.name)}</div>` : ""}
    ${res.seal?`<div class="seal">${res.seal}</div>`:""}
    <div class="verdict ${res.bad?"bad":""}">${res.verdict}</div>
    <p class="lede">${res.body}</p>
    ${res.delta?`<div class="delta">${res.delta}</div>`:""}
    ${res.note?`<div class="note"><div class="t">사관의 주(註)</div><p>${res.note}</p></div>`:""}
    ${btn||""}`;
}

function finalHTML(P){
  const dong = P.master==="dong";
  const enshrined = P.fame >= ENSHRINE;
  const seal = enshrined ? "配享" : (P.alive ? "生" : "卒");
  const fate = P.alive
    ? `${esc(P.ho)}, 그대는 77년을 건너 살아남았다.`
    : `${esc(P.ho)}, 그대는 ${P.deathYear}년에 멈추었다. ${P.causeOfDeath}.`;
  const heir = P.alive ? "그대는 그 자리에 있었다."
    : "그러나 그대의 제자들이 학문을 이었고, 그들이 그 자리에 있었다.";
  const party = dong ? {
    cls:"dong", nm:"동인(東人)",
    why:"그대의 스승 이황과 조식의 학문을 이은 이들은 김효원을 중심으로 모였다. 김효원의 집이 한양 동쪽 건천동에 있었으므로 사람들은 그들을 동인이라 불렀다.",
    base:"영남 지역 사림 중심", split:"이후 북인과 남인으로 갈라진다."
  } : {
    cls:"seo", nm:"서인(西人)",
    why:"그대의 스승 이이와 성혼의 학문을 이은 이들은 심의겸을 중심으로 모였다. 심의겸의 집이 한양 서쪽 정릉방에 있었으므로 사람들은 그들을 서인이라 불렀다.",
    base:"경기·충청 지역 사림 중심", split:"이후 노론과 소론으로 갈라진다."
  };
  return `
  <div class="seal">${seal}</div>
  <div class="eyebrow">1575 을해년 사초를 덮다</div>
  <h2>${P.alive ? "길이 갈렸다" : "그대의 학맥이 남았다"}</h2>
  <p class="lede">${fate} ${heir}
  ${enshrined ? "<br><br>고을의 선비들이 그대를 서원에 <b>배향</b>했다. 벼슬이 아니라 이름으로 남은 것이다." : ""}</p>
  <div class="party ${party.cls}">
    <div class="nm">${party.nm}</div>
    <p class="quiet">${party.why}</p>
    <p class="quiet" style="margin-top:.6rem"><b>${party.base}</b>, ${party.split}</p>
  </div>
  <div class="delta">최종 官 <b>${P.rank}</b> &nbsp; 名 <b>${P.fame}</b> &nbsp; ${P.alive?"생존":"졸(卒) "+P.deathYear} ${enshrined?"&nbsp; 서원 배향":""}</div>
  <div class="scroll">
    <h3>${esc(P.ho)}의 사초</h3>
    <ul>${P.log.map(e=>`<li><span class="y">${e.year?e.year:"　　"}</span>${esc(e.text)}</li>`).join("")}</ul>
  </div>`;
}

/* ══════════════════ 시작 화면(호·스승·기반) ══════════════════ */
function setupHTML(showIntro){
  const C = CONTENT;
  return `
  ${showIntro ? `<h1>${esc(C.title).replace(/\n/g,"<br>")}</h1>
  ${C.paragraphs.map(p=>`<p class="lede">${fmt(p)}</p>`).join("")}` : ""}
  <h2 class="setup-h">${esc(C.setupTitle || "인물 설정하기")}</h2>
  <div class="field">
    <label class="label" for="ho">${esc(C.hoLabel)} <span>— ${esc(C.hoHint)}</span></label>
    <input type="text" id="ho" maxlength="4" placeholder="예) 퇴헌" autocomplete="off">
    <div class="ho-row">
      <div class="ho-sug" id="hoSug"></div>
      <button type="button" class="ho-again" id="hoAgain">다시 추천받기</button>
    </div>
    <div class="ho-hint" id="hoHint">추천을 눌러 고르거나, 직접 지어 적어도 된다.</div>
    <div class="ho-mean" id="hoMean"></div>
  </div>
  <div class="field">
    <span class="label">${esc(C.masterLabel)}</span>
    <div class="pick" id="pickMaster">
      ${C.masters.map(m=>`<button data-v="${esc(m.key)}" aria-pressed="false"><strong>${esc(m.name)}</strong><small>${fmt(m.desc)}</small></button>`).join("")}
    </div>
  </div>
  <div class="field">
    <span class="label">${esc(C.baseLabel)}</span>
    <div class="pick" id="pickBase">
      ${C.bases.map(b=>`<button data-v="${esc(b.key)}" aria-pressed="false"><strong>${esc(b.name)}</strong><small>${fmt(b.desc)}</small></button>`).join("")}
    </div>
  </div>
  <div class="go-row"><button class="go" id="start">${esc(C.startBtn)}</button></div>`;
}

/* ── 호 추천 ── AI가 지어 주되, 실패하면 내장 목록에서 뽑는다 */
const CLAUDE_PROXY_URL = "https://asia-northeast3-ho0911seong-56638.cloudfunctions.net/claudeProxy";
/* 호는 뜻을 알고 골라야 제 이름이 된다. 짝지어 둔 풀이는 AI 추천이 실패했을 때도 쓴다. */
const HO_POOL = [
  ["퇴헌","退軒","물러나 사는 집"],     ["남계","南溪","남쪽으로 흐르는 시내"],
  ["청재","淸齋","맑게 지내는 서재"],   ["소암","素巖","꾸밈없는 바위"],
  ["죽계","竹溪","대나무 우거진 시내"], ["우헌","愚軒","어리석음을 지키는 집"],
  ["매창","梅窓","매화가 보이는 창"],   ["송재","松齋","소나무 곁의 서재"],
  ["눌재","訥齋","말수가 적은 서재"],   ["백운","白雲","흰 구름"],
  ["한재","寒齋","차고 검소한 서재"],   ["서산","西山","해 지는 서쪽 산"],
  ["동리","東籬","국화를 심은 동쪽 울타리"], ["만취","晩翠","늦도록 푸르름"],
  ["지산","芝山","영지가 자라는 산"],   ["석천","石泉","바위 사이에서 솟는 샘"],
  ["운곡","雲谷","구름이 머무는 골짜기"], ["묵재","默齋","말없이 지내는 서재"],
  ["월담","月潭","달이 비치는 못"],     ["춘포","春浦","봄날의 물가"],
  ["지헌","止軒","멈출 줄 아는 집"],    ["소계","小溪","작은 시내"],
  ["청강","淸江","맑은 강"],            ["우졸","愚拙","어리석고 서툰 대로"],
  ["만송","晩松","늦게까지 푸른 소나무"]
];
/* AI 추천을 걸러 내는 데만 쓴다. 학생이 직접 지은 호는 이 자로 재지 않는다. */
const HANJA_RE = /^[一-鿿]{2}$/;
const HO_RE = /^[가-힣]{2}$/;
async function askClaude(prompt, maxTokens){
  const res = await fetch(CLAUDE_PROXY_URL, {
    method:"POST", headers:{"Content-Type":"application/json"},
    body: JSON.stringify({ model:"claude-haiku-4-5-20251001", max_tokens:maxTokens,
      messages:[{role:"user",content:prompt}] })
  });
  if(!res.ok) throw new Error("API "+res.status);
  const data = await res.json();
  return (data.content?.[0]?.text || "").replace(/```json|```/g,"").trim();
}
/* 모델이 설명을 앞뒤에 붙여 오는 일이 있어 괄호 사이만 오려 낸다.
   닫는 괄호는 반드시 마지막 것을 써야 한다 — 첫 것을 쓰면 [["퇴헌","退軒","..."]에서
   끊겨 파싱이 늘 실패하고, 추천이 조용히 내장 목록으로만 돌아간다. */
function cutJson(raw, open, close){
  const s = raw.indexOf(open), e = raw.lastIndexOf(close);
  return (s !== -1 && e > s) ? raw.slice(s, e+1) : raw;
}

async function fetchHoSuggestions(){
  const prompt = `조선 시대 선비가 스스로 지어 쓰던 호(號)를 3개 지어 주세요.
조건
- 반드시 한자어로 지을 것. 순우리말은 호가 아닙니다(맑은숲, 돌샘 같은 것은 안 됩니다).
- 한글 두 글자와, 그에 맞는 한자 두 자를 함께 적을 것.
- 실존 인물의 유명한 호는 피할 것. 자연이나 마음가짐을 담을 것.
- 뜻은 중학생이 알아들을 한 줄(20자 이내)로 붙일 것.
JSON 배열만 출력하세요.
예) [["퇴헌","退軒","물러나 사는 집"],["남계","南溪","남쪽으로 흐르는 시내"],["청재","淸齋","맑게 지내는 서재"]]`;
  const arr = JSON.parse(cutJson(await askClaude(prompt, 300) || "[]", "[", "]"));
  const ok = arr.filter(Array.isArray)
    .map(x=>[String(x[0]||"").trim(), String(x[1]||"").trim(), String(x[2]||"").trim()])
    .filter(([h,j])=>HO_RE.test(h) && HANJA_RE.test(j));
  if(!ok.length) throw new Error("빈 응답");
  return ok.slice(0,3);
}


/* ── 호가 겹치지 않게 ──
   교실 화면도, 명단도, 결말의 동인·서인 칸도 호만 보여 준다. 같은 반에 같은 호가
   둘이면 선생님도 아이들도 누가 누구인지 가릴 수 없다. 그래서 반별 진행에서는
   이미 쓰이고 있는 호를 추천에서 빼고, 그래도 겹쳐 적으면 시작을 막는다.
   띄어쓰기와 대소문자만 다른 것은 같은 호로 본다. */
const hoKey = (s)=> String(s||"").replace(/\s+/g,"").toLowerCase();
function refreshTakenHos(){
  if(!MODE.room || !MODE.cls){ MODE.takenHos = null; MODE.takenLoad = null; return Promise.resolve(null); }
  MODE.takenLoad = SahwaNet.loadPlayers(MODE.cls).then(ps=>{
    const s = new Set();
    Object.keys(ps || {}).forEach(sid=>{
      if(sid === MODE.P.id) return;          // 내가 전에 쓰던 호는 걸림돌이 아니다
      const k = hoKey((ps[sid] || {}).ho);
      if(k) s.add(k);
    });
    MODE.takenHos = s;
    return s;
  }).catch(()=>{ MODE.takenHos = null; return null; });
  return MODE.takenLoad;
}

async function loadHoSuggestions(){
  const box = $("#hoSug"), btn = $("#hoAgain"), hint = $("#hoHint"), mean = $("#hoMean");
  if(!box) return;
  btn.disabled = true;
  if(mean) mean.textContent = "";
  box.innerHTML = `<span class="ho-hint">호를 지어 보는 중…</span>`;
  let list;
  try { list = await fetchHoSuggestions(); }
  catch(e){ list = shuffle(HO_POOL).slice(0,3); }
  // 이미 쓰이고 있는 호는 내놓지 않는다 — 골라 놓고 무르게 하면 번거롭다.
  if(MODE.takenLoad){ try{ await MODE.takenLoad; }catch(e){} }
  const taken = MODE.takenHos;
  if(taken && taken.size){
    list = list.filter(([h])=> !taken.has(hoKey(h)));
    if(list.length < 3){
      const spare = shuffle(HO_POOL).filter(([h])=>
        !taken.has(hoKey(h)) && !list.some(([x])=> hoKey(x) === hoKey(h)));
      list = list.concat(spare.slice(0, 3 - list.length));
    }
  }
  if(!$("#hoSug")) return;
  box.innerHTML = list.map(([h,j,m])=>`<button type="button" class="ho-chip" data-ho="${esc(h)}" data-hanja="${esc(j||"")}" data-mean="${esc(m||"")}" aria-pressed="false">${esc(h)}</button>`).join("");
  box.querySelectorAll(".ho-chip").forEach(chip=>{
    chip.onclick = ()=>{
      box.querySelectorAll(".ho-chip").forEach(c=>c.setAttribute("aria-pressed","false"));
      chip.setAttribute("aria-pressed","true");
      $("#ho").value = chip.dataset.ho;
      hint.classList.remove("bad");
      hint.textContent = "마음에 들지 않으면 직접 고쳐 적어도 된다.";
      showHoMean(chip.dataset.ho, chip.dataset.hanja, chip.dataset.mean);
    };
  });
  btn.disabled = false;
}

function showHoMean(ho, hanja, m){
  const el = $("#hoMean"); if(!el) return;
  if(!ho){ el.textContent = ""; return; }
  el.textContent = ho + (hanja ? `(${hanja})` : "") + (m ? ` — ${m}` : "");
}

/* checkTaken이 주어지면(반별 진행) 시작을 누를 때 호가 겹치는지 한 번 더 본다.
   추천에서 미리 걸러 두어도 직접 적을 수 있고, 그 사이에 다른 학생이 같은 호로
   들어와 있을 수도 있어서다. 혼자 체험하기는 반 방에 붙지 않으므로 검사하지 않는다. */
function bindSetup(onDone, checkTaken){
  const wire = (sel)=>{
    const box = $(sel); if(!box) return;
    box.querySelectorAll("button").forEach(b=>{
      b.onclick = ()=>{
        box.querySelectorAll("button").forEach(x=>x.setAttribute("aria-pressed","false"));
        b.setAttribute("aria-pressed","true");
      };
    });
  };
  wire("#pickMaster"); wire("#pickBase");
  const again = $("#hoAgain"); if(again) again.onclick = loadHoSuggestions;
  const hoInput = $("#ho");
  if(hoInput) hoInput.oninput = ()=>{
    const h = $("#hoHint"); if(h) h.classList.remove("bad");   // 고쳐 적기 시작하면 되돌린다
    const chip = $("#hoSug .ho-chip[aria-pressed=true]");
    if(chip && chip.dataset.ho === hoInput.value.trim()) return;   // 추천 그대로면 그대로 둔다
    if(chip) chip.setAttribute("aria-pressed","false");
    showHoMean("", "", "");
  };
  loadHoSuggestions();
  const go = $("#start"); if(!go) return;
  /* 학생이 직접 지은 호는 그대로 받는다. 추천은 한자어로만 내놓되, 스스로 지은
     이름까지 형식으로 되돌리지는 않는다 — 지어 보는 것 자체가 이 화면의 몫이다. */
  go.onclick = async ()=>{
    const ho = $("#ho").value.trim();
    const master = $("#pickMaster [aria-pressed=true]")?.dataset.v;
    const base   = $("#pickBase [aria-pressed=true]")?.dataset.v;
    const hint = $("#hoHint");
    if(hint) hint.classList.remove("bad");
    if(!ho){ $("#ho").focus(); $("#ho").placeholder="호를 지어야 시작한다"; return; }
    if(!master || !base){ alert("스승과 기반을 모두 고르시오."); return; }
    if(checkTaken){
      go.disabled = true;
      let dup = false;
      try{ dup = await checkTaken(ho); }catch(e){ dup = false; }   // 못 읽었으면 막지 않는다
      go.disabled = false;
      if(dup){
        if(hint){ hint.textContent = "같은 반의 다른 이가 이미 쓰고 있는 호요. 다른 호로 지으시오."; hint.classList.add("bad"); }
        const el = $("#ho"); el.focus(); el.select();
        return;
      }
    }
    onDone(ho, master, base);
  };
}

/* 참여 표시를 남기는 자리. 혼자 하기는 서버에 아무것도 남기지 않으므로, 이 표시가
   있어야 나중에 인트로에서 소감 문을 열어 줄 수 있다. */
const PLAY_MARK = "sahwa_played_";

function applySetup(P, ho, master, base){
  P.ho = ho; P.master = master; P.base = base;
  try{ localStorage.setItem(PLAY_MARK + (P.id||""), "1"); }catch(e){}
  if(base==="local"){ adj(P,"fame",2); P.seowon = true; } else adj(P,"rank",2);
  // 사초의 첫 줄. 연도를 0으로 두면 결말의 사초에 연도 칸이 비어 어색했다.
  // 도입 문단이 "그대는 1498년 조선의 선비다"로 시작하므로 그 해에 맞춘다.
  note(P, 1498, `${ho}, 사림의 길에 들다. ${base==="local"
    ? "고향에 서원의 터를 보아 두었다." : "한양에 자리를 얻어 3사의 말석에 섰다."}`);
}

/* ══════════════════ 공용 진행기 ══════════════════
   한 사건을 그리고, 학생이 고르면 결과(res)를 만들어 onResolved로 넘긴다.
   solo와 반별 진행이 이 함수를 함께 쓴다. */
function playPhase(phase, P, onResolved, hold){
  const ev = EVENTS[phase];
  P.year = +phase;

  if(ev.kind === "auto"){ const r = ev.apply(P); onResolved(r, r.key); return; }

  if(ev.kind === "lots"){
    drawLots(ev, ev.n, ev.bad, (isBad)=>{
      const res = ev.apply(P, isBad);
      // 세 번째 인자가 "봉인". 이 사건은 뽑은 패가 곧 결과라, 낸 뒤에도 알려주지 않는다.
      onResolved(res, ev.keyOf(isBad), hold);
    }, hold);
    return;
  }

  const order = shuffle(ev.choices);           // 선지 순서는 매번 섞는다
  paint(eventHTML(ev, order));
  $("#ch").querySelectorAll("button").forEach(b=>{
    b.onclick = ()=>{
      const c = order[+b.dataset.i];
      if(c.lot){
        drawLots({ eyebrow:ev.eyebrow, ...c.lot }, c.lot.n, c.lot.bad, (isBad)=>{
          onResolved(c.apply(P, isBad), c.key);
        }, hold);
      } else {
        onResolved(c.apply(P), c.key);
      }
    };
  });
}

/* 패 뽑기. hold(반별 진행)면 뽑기만 하고 열지 않는다 — 교사가 공개를 눌러야
   반 전체가 함께 결과를 본다. 혼자 하기에서는 예전처럼 그 자리에서 편다. */
function drawLots(cfg, n, bad, done, hold){
  const slips = shuffle(Array.from({length:n},(_,i)=> i<bad ? "禍" : "免"));
  paint(lotsHTML(cfg, slips, hold));
  const box = $("#lots");
  box.querySelectorAll(".lot").forEach(el=>{
    el.onclick = ()=>{
      const mine = slips[+el.dataset.i];
      box.querySelectorAll(".lot").forEach(x=>{ x.classList.add("done"); x.onclick = null; });
      if(hold){
        el.classList.add("mine","sealed"); el.textContent = "封";
        setTimeout(()=> done(mine==="禍"), 700);
        return;
      }
      box.querySelectorAll(".lot").forEach((x,i)=>{
        x.textContent = slips[i];
        x.classList.add(slips[i]==="禍" ? "hwa" : "myeon");
      });
      el.classList.add("mine");
      setTimeout(()=> done(mine==="禍"), 850);
    };
  });
}

/* 화면에 그리는 단 하나의 출구 */
function paint(html, barExtra, hold){
  const bar = $("#bar");
  if(["boot","setup","intro","memo","blocked"].indexOf(MODE.screen) >= 0){ bar.innerHTML=""; bar.style.display="none"; }
  else { bar.style.display=""; bar.innerHTML = barHTML(MODE.P, barExtra, hold); }
  $("#stage").innerHTML = html;
  window.scrollTo(0,0);
}

/* 진행 상태 — 화면 종류와 현재 선비 */
const MODE = { room:false, screen:"boot", P:makePlayer(), cls:null, phase:null,
               answered:null, lastRes:null, lastResKey:null, sealed:false,
               // 고르기 전의 모습과 그것이 어느 판의 것인지([다시 선택하기]가 쓴다)
               before:null, beforeKey:null,
               viewKey:null, rosterFull:false,
               // 같은 반에서 이미 쓰이고 있는 호(정규화한 것). null이면 아직 모르거나 혼자 하기.
               takenHos:null, takenLoad:null };

/* ══════════════════ LMS를 거쳐 들어왔는가 ══════════════════
   이 활동은 LMS 허브에서만 연다. 학번을 직접 받지 않는 대신 LMS가 남겨 둔
   로그인 흔적을 읽는다. sessionStorage는 LMS 탭에서 새 탭을 열면 그대로 복사되고,
   localStorage(자동 로그인)는 탭을 닫았다 다시 열어도 남는다 — 둘 중 하나면 통과. */
const LMS = (function(){
  const g = (store, k)=>{ try{ return store.getItem(k) || ""; }catch(e){ return ""; } };
  const sid  = g(sessionStorage,'lms_sid')   || g(localStorage,'lms_autosave_sid');
  const name = g(sessionStorage,'lms_sname') || g(localStorage,'lms_autosave_sname');
  return { sid:String(sid||"").trim(), name:String(name||"").trim() };
})();

function paintBlocked(why){
  MODE.screen = "blocked";
  paint(`<div class="blocked">
    <h2>LMS에서 열어 주시오</h2>
    <p>이 활동은 <b>수업 홈(LMS)</b>에 로그인한 뒤 그 안에서 열어야 합니다.
       주소를 직접 치거나 즐겨찾기로 들어오면 누가 하는 활동인지 알 수 없어
       기록이 남지 않습니다.${why ? "<br><br>" + esc(why) : ""}</p>
    <button class="ghost" id="toLms">수업 홈으로 가기</button>
  </div>`);
  const b = $("#toLms"); if(b) b.onclick = ()=>{ location.href = "../../lms/"; };
}

/* ══════════════════ 소감 ══════════════════
   활동을 마친 학생이 남기는 글. 결석해서 게임을 못 한 학생도 여기로 들어와
   사림 이야기를 적을 수 있다 — 활동 여부는 이 글로 가린다. */
/* 글자 수는 공백을 빼고 센다. 띄어쓰기로 칸을 채워 분량을 맞추는 것을 막기 위해서다.
   textarea의 maxlength는 공백까지 합한 안전선일 뿐, 실제 상한은 MEMO_MAX가 잡는다. */
const MEMO_MIN = 30;
const MEMO_MAX = 500;
const MEMO_RAW_MAX = 1200;
function memoBare(s){ return String(s == null ? "" : s).replace(/\s/g, "").length; }

function memoStart(){
  MODE.screen = "memo"; MODE.viewKey = null;
  // 학번과 이름은 화면에 적지 않는다. 누가 쓰는 글인지는 저장할 때 딸려 가면 되고,
  // 그것 하나 보여 주자고 머리줄을 따로 세울 이유가 없다.
  paint(`<h2>${esc(CONTENT.memoTitle)}</h2>
    <p class="lede">${fmt(CONTENT.memoPrompt)}</p>
    <textarea class="memo" id="memoText" maxlength="${MEMO_RAW_MAX}" placeholder="여기에 적으시오."></textarea>
    <div class="memo-foot">
      <button class="go" id="memoSave" style="margin-top:0">남기기</button>
      <button class="ghost" id="memoBack" style="margin-top:0">돌아가기</button>
      <span class="memo-count" id="memoCount">0 / ${MEMO_MAX}</span>
    </div>
    <div class="memo-msg" id="memoMsg">불러오는 중…</div>`);

  const ta = $("#memoText"), msg = $("#memoMsg"), cnt = $("#memoCount");
  const T = window.SahwaText;   // index.html이 shared/textLimit.js를 열어 준다
  const count = ()=>{ cnt.textContent = memoBare(ta.value) + " / " + MEMO_MAX; };
  if(T && T.mountCharCounter){
    // 공백을 뺀 글자 수를 세고, 넘치면 그 자리에서 자른다.
    T.mountCharCounter({ input:ta, counter:cnt, max:MEMO_MAX, excludeSpaces:true, truncate:true });
  } else {
    ta.oninput = count;   // 공용 모듈을 못 불러왔을 때의 대비
  }
  // 남의 글을 옮겨 오지 못하게 붙여넣기와 끌어놓기, 오른쪽 단추를 막는다.
  if(T && T.blockPaste) T.blockPaste(ta, { notice:true });
  $("#memoBack").onclick = ()=> paintIntro();

  // 전에 남긴 글이 있으면 그대로 불러와 고쳐 쓰게 한다 — 두 번 내면 덮어쓴다.
  SahwaNet.loadMemo(MODE.P.id).then(prev=>{
    if(MODE.screen !== "memo") return;
    if(prev && prev.text){
      // 상한을 줄이기 전에 남긴 글은 여기서 잘린다. 조용히 자르면 사라진 줄 모르므로 알린다.
      const wasOver = memoBare(prev.text) > MEMO_MAX;
      ta.value = prev.text;
      msg.textContent = wasOver
        ? `전에 남긴 글을 불러왔습니다. 이제 ${MEMO_MAX}자까지만 남길 수 있어 뒷부분이 잘렸습니다.`
        : "전에 남긴 글을 불러왔습니다. 고쳐 쓰고 다시 남길 수 있습니다.";
    }
    else msg.textContent = "";
    // 카운터는 input을 듣고 있으므로, 값을 넣어 준 뒤에는 한 번 알려 줘야 한다.
    ta.dispatchEvent(new Event("input"));
    if(!(T && T.mountCharCounter)) count();
  });

  $("#memoSave").onclick = async ()=>{
    const text = ta.value.trim();
    msg.classList.remove("bad");
    const n = memoBare(text);
    if(n < MEMO_MIN){
      msg.textContent = `공백을 빼고 ${MEMO_MIN}자 이상 적어야 남길 수 있소. 지금은 ${n}자요.`;
      msg.classList.add("bad"); return;
    }
    $("#memoSave").disabled = true; msg.textContent = "남기는 중…";
    const ok = await SahwaNet.saveMemo({
      studentId: MODE.P.id, name: MODE.P.name, classNum: MODE.cls,
      ho: MODE.P.ho || "", text
    });
    $("#memoSave").disabled = false;
    if(ok){ msg.textContent = "남겼습니다. 고쳐 쓰고 다시 남겨도 됩니다."; }
    else { msg.textContent = "남기지 못했습니다. 잠시 뒤 다시 눌러 주시오."; msg.classList.add("bad"); }
  };
}

/* ══════════════════ 혼자 하기 ══════════════════ */
function soloStart(){
  MODE.screen = "setup";
  // 혼자 체험하기는 반 방에 붙지 않는다. 반의 호 목록에 매일 이유가 없다.
  MODE.takenHos = null; MODE.takenLoad = null;
  paint(setupHTML(true));
  bindSetup((ho,master,base)=>{
    applySetup(MODE.P, ho, master, base);
    MODE.screen = "round";
    soloPhase("1498");
  });
}
function soloPhase(phase){
  MODE.screen = "round";
  playPhase(phase, MODE.P, (res)=>{
    const nxt = nextPhase(phase, MODE.P);
    paint(outcomeHTML(res, `<button class="go" id="next">${nxt?"다음":"사초를 덮는다"}</button>`, EVENTS[phase]));
    $("#next").onclick = ()=>{
      if(nxt) soloPhase(nxt);
      else { MODE.screen="final"; MODE.P.year=1575;
        if(MODE.P.alive) note(MODE.P,1575,"사림이 두 갈래로 갈라서다. 그대가 배운 학문이 그대의 편을 정했다.");
        /* 혼자 체험하기는 결석생이 복습으로 하는 길이라 소감까지가 한 묶음이다.
           끝났다고 처음으로만 돌려보내면 소감을 남길 자리가 없다. */
        paint(finalHTML(MODE.P) + `<div class="go-row">
          <button class="go" id="toMemo">소감 남기기</button>
          <button class="ghost" id="again" style="margin-top:0;margin-left:.7rem">다시 하기</button>
        </div>`);
        $("#toMemo").onclick = ()=> memoStart();
        $("#again").onclick = ()=>{
          const { id, name } = MODE.P;
          MODE.P = Object.assign(makePlayer(), { id, name });
          soloStart();
        };
      }
    };
  });
}

/* ══════════════════ 반별 동시 진행 ══════════════════ */
let ROOM = null;      // 교사가 쓰는 방 상태
let TICK = null;      // 남은 시간 타이머

/* 인트로 — 학번은 LMS에서 받아 오므로 따로 묻지 않는다. 여기서 두 갈래로 나뉜다.
   [함께 살아남기] 기본. 자기 반 방에 붙어 선생님이 여는 사건을 함께 겪는다.
   [혼자 체험하기] 결석한 학생이 복습으로 혼자 달리고 소감까지 남긴다. 반 방에는
                   붙지 않으므로 이 학생의 호는 교실 화면 명단에 뜨지 않는다. */
function introHTML(){
  const C = CONTENT;
  return `
  <h1 class="intro-title">${esc(C.title).split("\n").join("<br>")}</h1>
  ${C.paragraphs.map(p=>`<p class="lede">${fmt(p)}</p>`).join("")}
  <div class="doors">
    <button class="door main" id="doorTogether"><strong>${esc(C.doorTogether)}</strong>
      <small>${esc(C.doorTogetherDesc)}</small></button>
    <button class="door" id="doorSolo"><strong>${esc(C.doorSolo)}</strong>
      <small>${esc(C.doorSoloDesc)}</small></button>
  </div>
  <div id="doorMemoSlot"></div>`;
}

/* 참여한 기록이 있는가. 방에 만들어 둔 인물이 먼저고(반 활동), 없으면 혼자 하기
   표시와 이미 남긴 글을 차례로 본다. 어느 하나라도 있으면 소감 문을 열어 준다.
   기록이 있으면 그 인물을 돌려주므로, 소감에 호까지 함께 남길 수 있다. */
async function playRecord(){
  try{
    const saved = await SahwaNet.loadPlayer(MODE.cls, MODE.P.id);
    if(saved && saved.ho) return saved;
  }catch(e){}
  try{ if(localStorage.getItem(PLAY_MARK + MODE.P.id) === "1") return {}; }catch(e){}
  try{
    const prev = await SahwaNet.loadMemo(MODE.P.id);
    if(prev && prev.text) return {};
  }catch(e){}
  return null;
}

/* 소감 문은 확인이 끝난 뒤에 붙는다. 참여하지 않은 학생에게는 아예 보이지 않으므로
   눌렀다 막히는 일이 없고, 활동을 하지 않은 채 글만 남기고 가는 것도 막는다. */
function mountMemoDoor(){
  playRecord().then(rec=>{
    if(!rec || MODE.screen !== "intro") return;
    if(rec.ho && !MODE.P.ho) MODE.P.ho = rec.ho;
    const slot = $("#doorMemoSlot");
    if(!slot) return;
    slot.innerHTML = `<button class="door" id="doorMemo"><strong>${esc(CONTENT.memoTitle)}</strong>
      <small>${esc(CONTENT.memoDoorDesc || "")}</small></button>`;
    $("#doorMemo").onclick = ()=> memoStart();
  });
}

function roomStart(){
  MODE.room = true;
  const sid = LMS.sid, cls = classOf(sid);
  // 여기까지 왔다는 건 LMS를 거쳤다는 뜻이다. 그래도 명단에 없는 학번이면 되돌린다.
  const r = SahwaNet.verifyId(sid);
  if(!r.ok || !cls){ paintBlocked(r.message || "학번에서 반을 읽을 수 없습니다."); return; }
  MODE.P.id = sid; MODE.P.name = r.name || LMS.name || ""; MODE.cls = cls;
  paintIntro();
}

function paintIntro(){
  MODE.screen = "intro"; MODE.viewKey = null;
  paint(introHTML());
  mountMemoDoor();
  $("#doorTogether").onclick = ()=>{
    // 이미 인물을 만들어 둔 학생은 곧바로 하던 자리로 돌아간다.
    SahwaNet.loadPlayer(MODE.cls, MODE.P.id).then(saved=>{
      if(saved && saved.ho){ MODE.P = Object.assign(makePlayer(), saved); roomJoin(); }
      else roomSetup();
    });
  };
  /* 혼자 체험하기 — 반 방에 붙지 않는다. 인물도 새로 만든다(반 진행에서 죽어 있던
     상태를 그대로 들고 들어가면 복습이 첫 사건부터 시작되지 않는다). 학번과 이름은
     소감을 학생 것으로 남기기 위해 그대로 지닌다. */
  $("#doorSolo").onclick = ()=>{
    const { id, name } = MODE.P;
    MODE.P = Object.assign(makePlayer(), { id, name });
    MODE.room = false;
    soloStart();
  };
}
function roomSetup(){
  MODE.screen = "setup"; MODE.viewKey = null;
  refreshTakenHos();          // 추천이 그려지기 전에 걸러 낼 목록을 받아 둔다
  paint(setupHTML(false));
  bindSetup((ho,master,base)=>{
    applySetup(MODE.P, ho, master, base);
    SahwaNet.savePlayer(MODE.cls, MODE.P);
    roomJoin();
  }, hoTakenCheck);
}

/* 누르는 그 순간의 명단으로 다시 본다 — 화면을 열어 둔 사이에 들어온 학생이 있다. */
async function hoTakenCheck(ho){
  const taken = await refreshTakenHos();
  return !!(taken && taken.has(hoKey(ho)));
}

function roomJoin(){
  MODE.screen = "lobby";
  SahwaNet.onRoom(MODE.cls, room=>{
    // 학생이 자기 상태만 쓰면 방 노드가 players만 담은 채로 먼저 되돌아오고, 쓰기가 실패하면
    // 아예 빈 스냅샷이 흘러온다. 둘 다 "선생님이 아직 사건을 안 열었다"는 뜻이 아니므로,
    // 이미 사건을 받아 둔 상태에서는 phase가 없는 스냅샷을 믿지 않는다.
    // 교사의 "방 초기화"는 지운 뒤 phase:"lobby"를 다시 써 주므로 이 무시가 안전하다.
    if(ROOM && ROOM.phase && !(room && room.phase)) return;
    ROOM = room || {};
    roomRender();
  });
  roomRender();
}

function fmtLeft(ms){
  const s = Math.max(0, Math.ceil(ms/1000));
  return String(Math.floor(s/60)).padStart(2,"0")+":"+String(s%60).padStart(2,"0");
}

function roomRender(){
  const room = ROOM || {};
  const phase = room.phase ? String(room.phase) : null;

  // 소감을 쓰는 중에는 화면을 건드리지 않는다. 방이 바뀔 때마다 다시 그리면
  // 학생이 적던 글이 통째로 날아간다.
  if(MODE.screen === "memo") return;

  const roundKey = phase + ":" + (room.round || 0);

  /* 서버가 이 학생의 최신 상태를 쥐고 있는 경우가 있다 — 튕겼다 새로고침해 로컬
     기억이 비었거나, 교사가 미제출을 대신 처리했거나, 죽었다가 서원으로 되살아난
     때다. 이번 판을 아직 로컬에서 내지 않았다면 서버 쪽을 정본으로 받아들인다.
     이미 냈다면 방금 화면에 반영한 것을 서버 메아리가 되돌리면 안 되므로 두지 않는다.
     자리(참조)는 그대로 두고 값만 덮는다 — playPhase가 이 객체를 쥔 채 결과를 쓴다. */
  const mySaved = (room.players || {})[MODE.P.id];
  if(mySaved && MODE.answered !== roundKey) Object.assign(MODE.P, mySaved);
  const P = MODE.P;

  /* 방 노드 하나를 통째로 구독하고 있어서, 같은 반 친구가 하나 낼 때마다 스냅샷이
     새로 온다. 그때마다 화면을 다시 그리면 타이머가 깜빡이고, 더 나쁘게는 선택지
     순서가 새로 섞여 누르려던 자리가 바뀐다. 화면의 뼈대가 달라질 때만 다시 그리고,
     그렇지 않으면 사람 수만 갈아 끼운다. */
  const viewKey = [phase, room.state || "", room.round || 0,
                   MODE.answered === roundKey ? 1 : 0,
                   P.alive ? 1 : 0].join("|");
  if(viewKey === MODE.viewKey){ refreshRoster(room); return; }
  MODE.viewKey = viewKey;

  if(TICK){ clearInterval(TICK); TICK = null; }

  // 결말
  if(phase === "final"){
    MODE.screen = "final"; P.year = 1575;
    if(P.alive && !P.log.some(l=>l.year===1575 && l.text.indexOf("갈라서다")>=0))
      note(P,1575,"사림이 두 갈래로 갈라서다. 그대가 배운 학문이 그대의 편을 정했다.");
    SahwaNet.savePlayer(MODE.cls, P);
    paint(finalHTML(P) + `<div class="go-row"><button class="go" id="toMemo">소감 남기기</button></div>`);
    const mb = $("#toMemo"); if(mb) mb.onclick = ()=> memoStart();
    return;
  }

  // 대기실
  if(!phase || phase === "lobby" || room.state === "waiting"){
    MODE.screen = "lobby"; MODE.rosterFull = false;
    // 반 번호는 걷었다. 상태 표시줄에 이미 호가 있고, 자기 반은 학생이 안다.
    paint(`<h2>${esc(P.ho)}</h2>
      <div class="wait">
        <div class="big">선생님을 기다리는 중<span class="dots"></span></div>
        <div class="sub">${P.alive
          ? "사건이 열리면 이 화면이 바로 바뀐다. 그때까지 조용히 기다리시오."
          : "그대는 이미 졸(卒)했다. 남은 사건은 지켜보게 된다."}</div>
        ${roomRosterHTML(room)}
      </div>`);
    return;
  }

  const ev = EVENTS[phase];
  if(!ev){ paint(`<div class="wait"><div class="big">알 수 없는 사건</div></div>`); return; }

  /* 고를 것이 없는 장면(중종반정)은 죽은 학생도 함께 통과시킨다. 서원을 둔 이가
     되살아나는 판가름이라, 여기서 관전으로 빠지면 자기가 살아 돌아왔는지 아닌지를
     끝내 못 본다. 누를 것이 없어도 결과는 모두가 받아야 한다. */
  const autoScene = ev.kind === "auto";

  /* 이번 판에 이 학생이 낸 것. 서버 기록이 정본이라, 튕겼다 돌아와 로컬 기억이
     비었어도 여기서 "이미 냈다"를 되살린다. */
  const mine = ((room.answers || {})[phase] || {})[P.id];
  const played = !!mine || MODE.answered === roundKey;

  /* ── 냈고, 아직 공개 전 ──
     이 갈래가 아래 관전보다 먼저 와야 한다. 방금 고른 것이 죽는 선택이었으면
     P.alive가 그 자리에서 꺼지는데, 그대로 흘러가면 "그대는 지켜본다"가 떠서
     선생님이 열기도 전에 생사가 새어 나간다. 낸 뒤에는 공개 전까지 아무것도
     알려주지 않는다 — 표시줄의 생사와 관작도 봉해 둔다. */
  if(room.state === "open" && played){
    if(MODE.answered !== roundKey){
      // 서버에만 답이 있는 학생(튕겼다 돌아온 때) — 다시 고르게 하지 않는다.
      MODE.answered = roundKey;
      MODE.autoPicked = !!mine.auto;
      MODE.sealed = ev.kind === "lots";
      MODE.answeredLabel = MODE.autoPicked
        ? (MODE.sealed ? "끝내 패를 뽑지 않았다." : "고르지 않아 이렇게 기록되었다")
        : (MODE.sealed ? "패를 하나 뽑아 봉해 두었다."
           : ((ev.choices||[]).find(c=>c.key===mine.choice)?.label
              || (ev.shortOf && ev.shortOf[mine.choice]) || mine.choice));
      // 결과 본문은 서버에 없다 — 공개 때는 대기 화면만 보인다
      MODE.lastRes = null; MODE.lastResKey = null;
    }
    paintSubmitted(ev, room, phase);
    return;
  }

  /* ── 결과 공개 ──
     이 갈래도 관전보다 먼저다. 이번 판에 죽은 학생은 관전으로 새기 전에 자기가
     어쩌다 그렇게 되었는지를 먼저 읽어야 한다(예전에는 죽는 선택을 한 학생이
     자기 결과 화면을 끝내 못 보고 곧장 관전으로 넘어갔다). */
  if(room.state === "revealed"){
    const wait = `<div class="wait" style="margin-top:1.4rem">
        <div class="big">다음 사건을 기다리는 중<span class="dots"></span></div>
      </div>`;
    // 지난 판의 결과가 남아 있을 수 있으므로 이번 판의 것인지 확인하고 쓴다.
    let res = MODE.lastResKey === roundKey ? MODE.lastRes : null;
    // 본문을 잃었어도 서버에 남은 판정으로 되살린다(새로고침, 늦게 들어온 학생).
    if(!res && ev.recap && mine){
      const r = ev.recap[mine.choice];
      if(r) res = Object.assign({}, r);
    }
    if(res){ MODE.screen = "round"; paint(outcomeHTML(res, wait, ev)); return; }
    // 보여 줄 본문이 없다. 산 학생은 다음 사건을 기다리고, 죽은 학생은 아래 관전으로 간다.
    if(P.alive || autoScene){
      MODE.screen = "round";
      paint(`<div class="wait"><div class="big">이번 사건은 건너뛰었다</div>
        <div class="sub">선생님이 다음 사건을 열 때까지 기다리시오.</div></div>`);
      return;
    }
  }

  // 이미 죽은 학생 — 관전
  if(!P.alive && !autoScene){
    MODE.screen = "watch"; MODE.rosterFull = true;
    paint(`<div class="eyebrow">${ev.eyebrow} 관전</div>
      <h2>그대는 지켜본다</h2>
      <div class="situation">${esc(P.ho)}, 그대는 ${P.deathYear}년에 멈추었다. ${esc(P.causeOfDeath)}.
        조정에서 벌어지는 일은 이제 그대의 손을 떠났다.</div>
      ${roomRosterHTML(room, true)}
      <div class="scroll" style="margin-top:1.6rem">
        <h3>${esc(P.ho)}의 사초</h3>
        <ul>${P.log.map(e=>`<li><span class="y">${e.year?e.year:"　　"}</span>${esc(e.text)}</li>`).join("")}</ul>
      </div>`);
    return;
  }

  // 사건 열림 — 여기까지 온 학생은 아직 내지 않았다(낸 학생은 위에서 갈라져 나갔다)
  if(room.state === "open"){ paintChoice(phase, room); return; }

  paint(`<div class="wait"><div class="big">잠시 기다리시오<span class="dots"></span></div></div>`);
}

/* ══════════════════ 다시 선택하기 ══════════════════
   고르는 순간 선비의 상태가 이미 바뀌므로(관작·명성·생사·사초), 무르려면 고르기
   전의 모습을 어딘가에 적어 두어야 한다. 그 자리가 여기다. 새로고침하고 돌아와도
   무를 수 있게 sessionStorage에 둔다(탭 하나 안에서만 사는 기억이라 다음 수업에
   남지 않는다). */
function beforeKey(phase, room){
  return "sahwa_before_" + MODE.cls + "_" + MODE.P.id + "_" + phase + ":" + (room.round||0);
}
function keepBefore(phase, room, P){
  const key = beforeKey(phase, room);
  const raw = JSON.stringify(slimPlayer(P));
  MODE.before = raw; MODE.beforeKey = key;
  try{ sessionStorage.setItem(key, raw); }catch(e){}
}
/* 반드시 이번 판의 것이라야 한다. 열쇠를 함께 보지 않고 기억에 남은 것을 그냥
   꺼내 쓰면, 이 판에 고른 적이 없는 학생을 지난 판의 모습으로 되돌려 버린다. */
function takeBefore(phase, room){
  const key = beforeKey(phase, room);
  try{
    const v = sessionStorage.getItem(key);
    if(v) return v;
  }catch(e){}
  return MODE.beforeKey === key ? MODE.before : null;
}

/* 무를 수 있는가. 공개 전이고, 시간이 남아 있고, 고를 것이 있는 사건이라야 한다.
   패 뽑기(갑자사화)와 판가름(중종반정)에는 무를 선택이 없고, 시간이 다 되어
   대신 기록된 것은 이미 "아무것도 하지 않았다"는 판정이라 손대지 않는다. */
function canRedo(ev, room, phase){
  if(!ev || !ev.choices || !ev.choices.length) return false;
  if((room.state || "") !== "open") return false;
  if(MODE.autoPicked) return false;
  if(room.endsAt && Date.now() >= room.endsAt) return false;
  return !!takeBefore(phase, room);
}

function redoChoice(phase, room){
  const raw = takeBefore(phase, room);
  if(!raw) return;
  let before;
  try{ before = JSON.parse(raw); }catch(e){ return; }
  Object.assign(MODE.P, before);
  MODE.P.year = +phase;
  MODE.answered = null; MODE.answeredLabel = null;
  MODE.lastRes = null; MODE.lastResKey = null;
  MODE.sealed = false; MODE.autoPicked = false;
  /* 서버에서도 이번 판의 답을 지운다 — 그대로 두면 교사 화면의 낸 사람 수가
     맞지 않고, 새로고침했을 때 다시 "이미 냈음"으로 되살아난다. */
  SahwaNet.unsubmit(MODE.cls, phase, MODE.P.id, MODE.P);
  // 되돌린 지금의 모습으로 열쇠를 맞춰 둔다. 다음 스냅샷이 화면을 새로 그리면
  // 선택지 순서가 다시 섞여 누르려던 자리가 바뀐다.
  MODE.viewKey = [phase, room.state || "", room.round || 0, 0, MODE.P.alive ? 1 : 0].join("|");
  paintChoice(phase, room);
}

/* 선택 화면. 처음 열릴 때와 무르고 다시 고를 때가 같은 자리라야 한다. */
function paintChoice(phase, room){
  const P = MODE.P;
  MODE.screen = "round"; MODE.autoPicked = false; MODE.sealed = false;
  keepBefore(phase, room, P);
  // 마지막 인자 true = 뽑기는 봉인해 둔다(교사가 공개할 때 함께 연다).
  playPhase(phase, P, (res, key, sealed)=> submitChoice(phase, room, res, key, sealed), true);
  // playPhase가 그린 뒤에 표시줄의 타이머만 덧붙인다
  $("#bar").innerHTML = barHTML(P, timerHTML(room));
  startTick(room, ()=> autoSubmit(phase, room));
}

/* 고른 것을 서버에 올리고 곧바로 대기 화면으로 (서버 응답을 기다리지 않는다) */
function submitChoice(phase, room, res, key, sealed){
  const P = MODE.P, ev = EVENTS[phase];
  MODE.answered = phase + ":" + (room.round||0);
  // 어느 판의 결과인지 함께 적어 둔다. 공개 화면이 지난 판의 본문을 다시 꺼내
  // 보여 주는 일을 막는다(죽은 뒤 관전만 하는 학생에게 특히 그랬다).
  MODE.lastRes = res; MODE.lastResKey = MODE.answered;
  // 봉인된 뽑기는 key(hwa/myeon)가 곧 생사라, 낸 뒤 화면에도 적지 않는다.
  MODE.sealed = !!sealed;
  MODE.answeredLabel = sealed
    ? (MODE.autoPicked ? "끝내 패를 뽑지 않았다." : "패를 하나 뽑아 봉해 두었다.")
    : ((ev.choices||[]).find(c=>c.key===key)?.label
       || (ev.shortOf && ev.shortOf[key]) || key);
  SahwaNet.submit(MODE.cls, phase, P.id, key, P, MODE.autoPicked);
  paintSubmitted(ev, ROOM && ROOM.phase ? ROOM : room, phase);
}

/* 시간이 다 되도록 안 골랐으면 "아무것도 하지 않은 것"에 해당하는 선지로 대신 낸다.
   그냥 두면 그 학생만 다음 사건에서 상태가 비어 버린다. */
function autoSubmit(phase, room){
  const P = MODE.P, ev = EVENTS[phase];
  if(!P.alive || MODE.answered === phase + ":" + (room.round||0)) return;
  MODE.autoPicked = true;
  if(ev.kind === "lots"){
    /* 패를 뽑지 않은 것은 운에 맡긴 것이 아니라 아무것도 하지 않은 것이다.
       그대로 화를 입고, 서원이 있어도 1506년에 되살아나지 않는다.
       휩쓸린 사람에게 붙던 名 +1도 주지 않는다 — 한 일이 없기 때문이다. */
    const res = ev.apply(P, true);
    adj(P, "fame", -1);
    P.noRevive = true;
    if(P.log.length) P.log[P.log.length-1].text = "갑자년의 옥사에 휩쓸리다. 끝내 패를 잡지 않았다.";
    res.verdict = "그대는 패를 뽑지 않았다.";
    res.body = "시간이 다 되도록 아무 패도 잡지 않았다. 고르지 않은 자에게 남는 것은 화(禍)뿐이다.";
    res.delta = "사망 1504";
    submitChoice(phase, room, res, ev.keyOf(true), true);
    return;
  }
  const c = (ev.choices||[]).find(x=>x.key===ev.defaultKey) || (ev.choices||[])[0];
  if(!c) return;
  const res = c.lot ? c.apply(P, Math.random() < c.lot.bad / c.lot.n) : c.apply(P);
  submitChoice(phase, room, res, c.key);
}

/* 서버(RTDB)에 넣기 좋은 평평한 모양. index.html의 slim과 같은 결과를 낸다 —
   교사 화면이 미제출 학생을 대신 써 넣을 때도 같은 모양이라야 한다. */
function slimPlayer(P){
  return {
    id:P.id||"", name:P.name||"", ho:P.ho||"", master:P.master||"", base:P.base||"",
    rank:P.rank|0, fame:P.fame|0, alive:!!P.alive, seowon:!!P.seowon, noRevive:!!P.noRevive,
    deathYear:P.deathYear||null, causeOfDeath:P.causeOfDeath||null,
    log:(P.log||[]).map(e=>({year:e.year|0, text:String(e.text||"")}))
  };
}

/* 교사 화면(screen.html)이 공개/다음을 누를 때 부른다. 시간이 다 되도록, 또는
   접속이 끊겨 끝내 답을 내지 않은 학생을 autoSubmit과 똑같은 규칙으로 대신
   처리한다. 접속이 나빠 한 사건을 통째로 건너뛰는 일을 막기 위해서다.
   반환 { key, player } — player는 서버에 그대로 써도 되는 평평한 모양.
   대신 낼 것이 없으면(죽어 관전인 선택 사건 등) null. */
window.resolveDefaultFor = function(phase, praw){
  const ev = EVENTS[phase];
  if(!ev) return null;
  const P = Object.assign(makePlayer(), praw || {});
  P.log = Array.isArray(P.log) ? P.log.map(e=>({year:e.year|0, text:String(e.text||"")})) : [];

  // 중종반정(1506)은 고를 것이 없는 판가름이다. 죽은 학생도 반드시 통과해야
  // 서원을 둔 이가 되살아난다 — 관전만 하다 이 판정을 건너뛰면 안 된다.
  if(ev.kind === "auto"){
    const r = ev.apply(P);
    return { key:String(r.key||""), player:slimPlayer(P) };
  }
  // 그 밖의 사건은 산 사람만 낸다. 죽은 학생은 관전이라 대신 낼 것이 없다.
  if(!P.alive) return null;
  if(ev.kind === "lots"){
    // 패를 뽑지 않은 것은 운에 맡긴 것이 아니라 아무것도 하지 않은 것이다(autoSubmit과 같다).
    ev.apply(P, true);
    adj(P,"fame",-1); P.noRevive = true;
    if(P.log.length) P.log[P.log.length-1].text = "갑자년의 옥사에 휩쓸리다. 끝내 패를 잡지 않았다.";
    return { key:ev.keyOf(true), player:slimPlayer(P) };
  }
  const c = (ev.choices||[]).find(x=>x.key===ev.defaultKey) || (ev.choices||[])[0];
  if(!c) return null;
  if(c.lot) c.apply(P, Math.random() < c.lot.bad / c.lot.n);
  else c.apply(P);
  return { key:c.key, player:slimPlayer(P) };
};

/* 이미 낸 학생이 보는 화면 */
function paintSubmitted(ev, room, phase){
  MODE.screen = "round"; MODE.rosterFull = false;
  const auto = MODE.autoPicked, sealed = MODE.sealed;
  const noPick = ev.kind === "auto";   // 중종반정처럼 고를 것이 없는 장면
  const redo  = canRedo(ev, room, phase);
  const head  = noPick ? "판가름을 기다린다" : auto ? "시간이 다 되었다" : sealed ? "패를 뽑았다" : "제출했다";
  const label = auto ? "고르지 않아 이렇게 기록되었다" : sealed ? "봉해 둔 패" : "그대의 선택";
  const sub   = noPick ? "이 장면에는 고를 것이 없다. 그동안 그대가 해 둔 것이 판가름한다."
              : sealed ? "모두가 뽑으면 봉한 패를 함께 연다."
              : redo ? "모두가 고르면 결과가 함께 공개된다. 그전까지는 고쳐 낼 수 있다."
              : "모두가 고르면 결과가 함께 공개된다.";
  paint(`<div class="eyebrow">${ev.eyebrow}</div>
    <h2>${head}</h2>
    ${noPick ? "" : `<div class="picked"><div class="t">${label}</div>${esc(MODE.answeredLabel||"")}</div>`}
    ${redo ? `<div class="go-row" id="redoBox"><button class="ghost" id="redo">다시 선택하기</button></div>` : ""}
    <div class="wait"><div class="big">다른 이들을 기다리는 중<span class="dots"></span></div>
      <div class="sub">${sub}</div>
      ${roomRosterHTML(room)}</div>`, timerHTML(room), true);
  const rb = $("#redo");
  if(rb) rb.onclick = ()=> redoChoice(phase, ROOM && ROOM.phase === phase ? ROOM : room);
  // 시간이 다 되면 무를 수 있는 자리도 함께 닫는다.
  startTick(room, ()=>{ const box = $("#redoBox"); if(box) box.innerHTML = ""; });
}

function timerHTML(room){
  if(!room.endsAt) return "";
  const left = room.endsAt - Date.now();
  return `<span class="timer ${left<15000?"low":""}" id="tmr">${fmtLeft(left)}</span>`;
}
window.goMemo = ()=> memoStart();

/* 남은 시간 시계.
   반드시 앞서 돌던 시계를 먼저 끈다. 안 그러면 지난 판의 시계가 그대로 살아
   남아, 이미 지난 endsAt으로 계산한 "00:00"과 이번 판의 진짜 남은 시간을
   0.5초마다 번갈아 써 넣는다 — 화면에서는 시간이 붉게 깜빡이는 것으로 보인다.
   더 나쁘게는, 지난 시계가 만료되면서 공용 TICK에 담긴 "이번 판" 시계를 대신
   꺼 버려 카운트다운이 00:00에 붉게 멈춘 채로 남았다.
   시계 번호를 지역 변수로 쥐고 자기 자신만 끄게 해 두 경우를 함께 막는다. */
function startTick(room, onExpire){
  if(TICK){ clearInterval(TICK); TICK = null; }
  if(!room.endsAt) return;
  const id = setInterval(()=>{
    const el = $("#tmr");
    const left = room.endsAt - Date.now();
    // 같은 값을 다시 써 넣지 않는다. 1초에 두 번 도는 시계라 그대로 쓰면 깜빡인다.
    if(el){
      const t = fmtLeft(left);
      if(el.textContent !== t) el.textContent = t;
      el.classList.toggle("low", left < 15000);
    }
    if(left <= 0){
      clearInterval(id);
      if(TICK === id) TICK = null;
      if(onExpire) onExpire();
    }
  }, 500);
  TICK = id;
}

/* 방이 바뀔 때마다 화면을 통째로 다시 그리지 않고, 사람 수 칸만 갈아 끼운다. */
function refreshRoster(room){
  const box = document.getElementById("rosterBox");
  if(box) box.outerHTML = roomRosterHTML(room, MODE.rosterFull);
}

/* 반 현황 — 대기 화면과 관전 화면에서 함께 보여 준다.
   사건이 열려 있는 동안에는 생사와 관작을 적지 않는다. 친구들이 하나씩 낼 때마다
   생존 숫자가 줄고 이름에 줄이 그어지는 것만 봐도 이번 판의 결과를 짐작하게 되고,
   자기 것이 아직 안 열렸는데 남의 것부터 알게 된다. 공개가 끝나면 다시 적는다.
   동인·서인 숫자는 아예 걷었다. 스승을 고르는 자리에서는 그것이 무엇으로 갈리는지
   일러 주지 않는데, 대기 화면에 두 편의 머릿수가 떠 있으면 결말에서 처음 밝혀야 할
   붕당의 갈림을 시작하자마자 알려 주는 셈이었다. */
function roomRosterHTML(room, full){
  const ps = Object.values(room.players || {});
  if(!ps.length) return `<div id="rosterBox"></div>`;
  const hold = (room.state || "") === "open";
  const alive = ps.filter(p=>p.alive).length;
  const head = `<div class="roster">
      <span>들어온 사람 <b>${ps.length}</b></span>
      ${hold ? "" : `<span>생존 <b>${alive}</b></span>
      <span>졸(卒) <b>${ps.length-alive}</b></span>`}
    </div>`;
  if(!full) return `<div id="rosterBox">${head}</div>`;
  const cards = ps.sort((a,b)=>String(a.id).localeCompare(String(b.id)))
    .map(p=>`<div class="wp ${(hold||p.alive)?"":"gone"}"><span class="h">${esc(p.ho||p.name||"")}</span>${
      hold ? "" : `<span class="s">官 ${p.rank} / 名 ${p.fame}</span>`}</div>`).join("");
  return `<div id="rosterBox">${head}<div class="watch-grid">${cards}</div></div>`;
}

/* 관리자 화면에서 저장한 인트로 문구를 덮어쓴다(모듈 스크립트가 호출). */
window.applyIntroContent = function(c){
  if(!c || typeof c !== "object") return;
  CONTENT = Object.assign(JSON.parse(JSON.stringify(DEFAULT_CONTENT)), c);
  if(MODE.screen === "setup"){
    paint(setupHTML(!MODE.room));
    bindSetup(MODE.room ? onRoomSetupDone : onSoloSetupDone, MODE.room ? hoTakenCheck : null);
  }
};
function onSoloSetupDone(ho,m,b){ applySetup(MODE.P,ho,m,b); MODE.screen="round"; soloPhase("1498"); }
function onRoomSetupDone(ho,m,b){ applySetup(MODE.P,ho,m,b); SahwaNet.savePlayer(MODE.cls,MODE.P); roomJoin(); }

/* 네트워크 계층이 준비되면 시작한다(모듈 스크립트가 호출). */
window.startSahwa = function(){
  // 학번을 못 얻었으면 어느 문도 열지 않는다. solo=1(교사 시연)도 예외가 아니다.
  if(!LMS.sid){ paintBlocked(""); return; }
  if(new URLSearchParams(location.search).get("solo") === "1"){
    // 주소로 바로 들어온 혼자 하기(교사 시연). 소감을 학생 것으로 남기려면
    // 여기서도 학번과 이름을 지녀야 한다 — 인트로를 거치지 않기 때문이다.
    MODE.P.id = LMS.sid; MODE.P.name = LMS.name || "";
    MODE.cls = classOf(LMS.sid);
    soloStart();
  }
  else roomStart();
};
