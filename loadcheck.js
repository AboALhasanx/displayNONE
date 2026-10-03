// loadcheck.js - loads the unpacked extension in a real Chromium and verifies:
// 1) MV3 manifest parses (background SW registers)
// 2) content script is injected on a http(s) page (matches all_urls)
// 3) the background -> content message path drives the engine (HUD renders)
// Note: content scripts run in an isolated world, so injection is proven by the
// HUD DOM appearing in the main world after sendMessage from the service worker.
const { chromium } = require('playwright');
const path = require('path');
const os = require('os');
const fs = require('fs');

const PAGE_HTML = [
  '<!DOCTYPE html>',
  '<html><head><title>loadcheck</title></head>',
  '<body><div id=probe style=padding:20px>probe</div></body></html>'
].join('');

(async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dn-profile-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    ignoreDefaultArgs: ['--disable-extensions'],
    args: [
      '--disable-extensions-except=' + __dirname,
      '--load-extension=' + __dirname
    ]
  });

  let sw = context.serviceWorkers()[0];
  if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 15000 }).catch(() => null);
  if (!sw) throw new Error('extension service worker never registered - manifest problem');
  if (sw.url().indexOf('background.js') === -1) throw new Error('unexpected service worker: ' + sw.url());
  console.log('PASS: manifest parsed, background service worker registered');

  const page = await context.newPage();
  await page.route('https://loadcheck.test/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: PAGE_HTML })
  );
  await page.goto('https://loadcheck.test/');
  await page.waitForTimeout(500);

  // Background relays the command; a response proves the content script is alive
  const relay = (msg) => sw.evaluate((m) => new Promise((resolve) => {
    chrome.tabs.query({}, (tabs) => {
      let pending = tabs.length;
      if (!pending) return resolve({ error: "no tabs" });
      let answered = false;
      tabs.forEach((tab) => {
        chrome.tabs.sendMessage(tab.id, m, (res) => {
          if (!answered && !chrome.runtime.lastError && res) { answered = true; resolve(res); }
          if (--pending === 0 && !answered) resolve({ error: "no content script responded" });
        });
      });
    });
  }), msg);

  const status = await relay({ action: "startHideMode", config: { outlineWidth: 2, lang: "en" } });
  const ok = status && status.success === true && status.status && status.status.isHiding === true;
  console.log('startHideMode via background ->', JSON.stringify(status));
  if (!ok) throw new Error('content script did not respond - not injected?');

  // The top bar was removed by user request: no #dn-hud may ever be created.
  const pageUi = await page.evaluate(() => ({
    hud: document.getElementById('dn-hud') !== null,
    cursor: document.documentElement.style.cursor,
    hint: Array.from(document.querySelectorAll('[data-dn-ui]')).map((el) => el.textContent).filter(Boolean)
  }));
  if (pageUi.hud) throw new Error('top bar must not exist: ' + JSON.stringify(pageUi));
  if (pageUi.cursor !== 'crosshair') throw new Error('hide mode cursor missing: ' + JSON.stringify(pageUi));
  if (!pageUi.hint.some((t) => t.includes('display:none'))) throw new Error('start hint toast missing: ' + JSON.stringify(pageUi.hint));
  console.log('PASS: no top bar; mode hint toast shown, crosshair cursor active');

  const stopped = await relay({ action: "stopMode", config: {} });
  if (!stopped || !stopped.success) throw new Error('stopMode failed: ' + JSON.stringify(stopped));
  const afterStop = await page.evaluate(() => ({
    hud: document.getElementById('dn-hud') !== null,
    cursor: document.documentElement.style.cursor
  }));
  if (afterStop.hud) throw new Error('top bar appeared after stop');
  if (afterStop.cursor !== '') throw new Error('cursor not restored after stop: ' + JSON.stringify(afterStop));
  console.log('PASS: stopMode restores page (no bar, cursor cleared)');

  await context.close();
  console.log('loadcheck done');
  process.exit(0);
})().catch((err) => {
  console.error('LOADCHECK FAIL:', err.message);
  process.exit(1);
});
