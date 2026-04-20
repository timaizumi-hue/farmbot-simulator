
(() => {
  let deferredPrompt = null;
  const topBtn = document.getElementById('installAppBtnTop');
  const homeBtn = document.getElementById('installAppBtnHome');
  const buttons = [topBtn, homeBtn].filter(Boolean);
  const hint = document.getElementById('installHint');
  const showHint = (msg) => { if (hint) { hint.textContent = msg; hint.hidden = false; } };
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
  if (isStandalone) {
    buttons.forEach(btn => btn.hidden = true);
    showHint('ホーム画面から起動できます。');
  }
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    buttons.forEach(btn => btn.hidden = false);
    showHint('「アプリを追加」を押すとホーム画面へ追加できます。');
  });
  buttons.forEach(btn => btn.addEventListener('click', async () => {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        await deferredPrompt.userChoice;
        deferredPrompt = null;
buttons.forEach(b => b.hidden = true);
        showHint('インストール操作を完了してください。');
      } else {
        const ua = navigator.userAgent || '';
        if (/iPhone|iPad|iPod/i.test(ua)) {
          showHint('Safariの共有ボタン → 「ホーム画面に追加」を押してください。');
        } else {
          showHint('ブラウザのメニューから「ホーム画面に追加」または「アプリをインストール」を選んでください。');
        }
      }
    }));
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
  }
})();
