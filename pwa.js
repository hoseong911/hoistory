/* ════════════════════════════════════════════════════════════════
   HOISTORY 공용 PWA 부트스트랩.
   어느 앱 페이지든 <head>에 <script src="/hoistory/pwa.js"></script> 한 줄만 넣으면
   루트와 동일하게 manifest·아이콘·애플 메타태그가 붙고 서비스워커가 등록된다.
   경로는 모두 /hoistory/ 기준 절대경로라 어느 하위 폴더에서 넣어도 동작한다.
   ════════════════════════════════════════════════════════════════ */
(function () {
  var head = document.head || document.getElementsByTagName('head')[0];

  function add(sel, el) { if (!document.querySelector(sel)) head.appendChild(el); }
  function mkLink(rel, href) { var l = document.createElement('link'); l.rel = rel; l.href = href; return l; }
  function mkMeta(name, content) { var m = document.createElement('meta'); m.name = name; m.content = content; return m; }

  add('link[rel="manifest"]',                          mkLink('manifest', '/hoistory/manifest.json'));
  add('meta[name="theme-color"]',                      mkMeta('theme-color', '#0F766E'));
  add('meta[name="apple-mobile-web-app-capable"]',     mkMeta('apple-mobile-web-app-capable', 'yes'));
  add('meta[name="apple-mobile-web-app-status-bar-style"]', mkMeta('apple-mobile-web-app-status-bar-style', 'default'));
  add('meta[name="apple-mobile-web-app-title"]',       mkMeta('apple-mobile-web-app-title', 'HOISTORY'));
  add('link[rel="apple-touch-icon"]',                  mkLink('apple-touch-icon', '/hoistory/main.png'));

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/hoistory/sw.js').catch(function () {});
    });
  }
})();
