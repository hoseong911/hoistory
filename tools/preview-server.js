/* ════════════════════════════════════════════════════════════════
   로컬 미리보기 서버.
   GitHub Pages와 동일하게 "/hoistory/" 기준 절대경로가 그대로 동작하도록
   요청 앞의 /hoistory 를 떼고 저장소 루트에서 파일을 서빙한다.
   실행:  npm run preview   (기본 포트 4173)
   ════════════════════════════════════════════════════════════════ */
const http = require('http');
const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.PORT || 4173;
const PREVIEW = '/hoistory/lms/_preview_responsive.html';

// 프리뷰에서는 서비스워커가 예전 파일을 캐시해 편집이 안 보이는 문제가 있어,
// sw.js 요청에는 "캐시를 싹 지우고 아무것도 가로채지 않는" 무력화 SW를 대신 내려준다.
// (운영용 sw.js는 그대로 두고, 로컬 프리뷰에서만 이걸 쓴다.)
const NEUTRAL_SW = `self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  const keys = await caches.keys();
  await Promise.all(keys.map((k) => caches.delete(k)));
  await self.clients.claim();
})()));
// fetch 핸들러 없음 → 모든 요청이 네트워크로 직접 나가 항상 최신 파일이 뜬다.`;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.mjs':  'text/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif':  'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp',
  '.ico':  'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.map':  'application/json', '.txt': 'text/plain; charset=utf-8'
};

http.createServer((req, res) => {
  try {
    let url = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
    if (url.startsWith('/hoistory/')) url = url.slice('/hoistory'.length); // /hoistory/x → /x
    if (url === '/' || url === '') url = PREVIEW.replace('/hoistory', '');

    if (url === '/sw.js') {   // 프리뷰용 무력화 서비스워커
      res.writeHead(200, { 'Content-Type': MIME['.js'], 'Cache-Control': 'no-store' });
      return res.end(NEUTRAL_SW);
    }

    let fp = path.normalize(path.join(ROOT, url));
    if (!fp.startsWith(ROOT)) { res.writeHead(403); return res.end('forbidden'); }
    if (fs.existsSync(fp) && fs.statSync(fp).isDirectory()) fp = path.join(fp, 'index.html');
    if (!fs.existsSync(fp)) { res.writeHead(404); return res.end('not found: ' + url); }

    const ext = path.extname(fp).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store'   // 편집 후 새로고침하면 항상 최신 파일이 뜨도록
    });
    fs.createReadStream(fp).pipe(res);
  } catch (e) {
    res.writeHead(500); res.end(String(e));
  }
}).listen(PORT, () => {
  console.log('─────────────────────────────────────────────');
  console.log('  LMS 반응형 미리보기 서버가 켜졌습니다.');
  console.log('  http://localhost:' + PORT + PREVIEW);
  console.log('  (종료: Ctrl+C)');
  console.log('─────────────────────────────────────────────');
});
