// 오프라인 감지 → 상단 배너 자동 표시/숨김. import만 하면 동작함.
function init() {
  const banner = document.createElement('div');
  banner.style.cssText = [
    'position:fixed', 'top:0', 'left:0', 'right:0', 'z-index:9999',
    'background:#1e3a8a', 'color:#fff',
    'text-align:center', 'font-size:13px', 'font-weight:600', 'letter-spacing:.2px',
    'padding:10px 16px', 'display:none',
    "font-family:'Pretendard',-apple-system,sans-serif",
  ].join(';');
  banner.textContent = '인터넷 연결이 끊겼습니다. 연결 상태를 확인해주세요.';
  document.body.appendChild(banner);

  window.addEventListener('offline', () => { banner.style.display = 'block'; });
  window.addEventListener('online',  () => { banner.style.display = 'none'; });

  if (!navigator.onLine) banner.style.display = 'block';
}

document.readyState === 'loading'
  ? document.addEventListener('DOMContentLoaded', init)
  : init();
