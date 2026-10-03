// test.js - Playwright regression tests for displayNONE
// Runs against content.js injected with a minimal chrome.runtime shim
// (same harness pattern as the RTL Direction extension).

const { chromium } = require("playwright");
const path = require("path");

const EXT_PATH = __dirname;

async function injectContentScript(page) {
  await page.evaluate(() => {
    window.chrome = window.chrome || {};
    window.chrome.runtime = {
      lastError: null,
      onMessage: {
        addListener(fn) {
          window.__dnMessageHandlers = window.__dnMessageHandlers || [];
          window.__dnMessageHandlers.push(fn);
        }
      }
    };
  });
  await page.addScriptTag({ path: path.join(EXT_PATH, "content.js") });
}

async function sendToPage(page, message) {
  return page.evaluate((msg) => {
    const response = { value: undefined };
    (window.__dnMessageHandlers || []).forEach((fn) => {
      fn(msg, {}, (res) => { response.value = res; });
    });
    return response.value;
  }, message);
}

async function clickElement(page, selector, position = null) {
  const opts = position ? { position } : {};
  await page.locator(selector).first().hover(opts);
  await page.locator(selector).first().click(opts);
}

let passed = 0;
let failed = 0;
function check(name, cond, extra = "") {
  if (cond) { console.log("PASS: " + name); passed++; }
  else { console.log("FAIL: " + name + " " + extra); failed++; }
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.setContent(`
    <!DOCTYPE html>
    <html lang="en">
    <head><style>body { margin-top: 90px; }</style></head>
    <body>
      <header id="hdr" style="display:flex;height:40px;background:#eee;">Header</header>
      <div id="box" style="padding:8px;">Box content</div>
      <section id="sec" style="padding:8px;">
        <p id="para">Paragraph text</p>
        <button id="btn" style="display:inline-block;">Click me</button>
      </section>
      <div id="flexItem" style="display:grid;gap:4px;"><span id="inner">inner</span></div>
      <footer id="ftr">Footer</footer>
    </body>
    </html>
  `);

  await injectContentScript(page);

  const cfg = { outlineWidth: 2, lang: "en" };

  // T1: Hide mode applies display:none + saves original display
  await sendToPage(page, { action: "startHideMode", config: cfg });
  let st = await sendToPage(page, { action: "getStatus", config: cfg });
  check("T1: hide mode activates", st && st.status.isHiding === true, JSON.stringify(st));

  await clickElement(page, "#box");
  const boxState = await page.locator("#box").evaluate((el) => ({
    display: el.style.display,
    hidden: el.getAttribute("data-dn-hidden"),
    saved: el.getAttribute("data-dn-display")
  }));
  check("T1: click sets display:none", boxState.display === "none", JSON.stringify(boxState));
  check("T1: data-dn-hidden marker set", boxState.hidden === "1");
  check("T1: original inline display saved", boxState.saved === "", JSON.stringify(boxState));

  st = await sendToPage(page, { action: "getStatus", config: cfg });
  check("T1: hiddenCount is 1", st.status.hiddenCount === 1, "(got " + st.status.hiddenCount + ")");

  // T2: Hide preserves a non-empty inline display (display:flex)
  await clickElement(page, "#hdr");
  const hdrState = await page.locator("#hdr").evaluate((el) => ({
    display: el.style.display,
    saved: el.getAttribute("data-dn-display")
  }));
  check("T2: header hidden", hdrState.display === "none");
  check("T2: original display:flex saved", hdrState.saved === "flex", JSON.stringify(hdrState));

  // T3: Undo restores the exact original display
  await sendToPage(page, { action: "undoLast", config: cfg });
  const hdrAfterUndo = await page.locator("#hdr").evaluate((el) => ({
    display: el.style.display,
    hidden: el.getAttribute("data-dn-hidden")
  }));
  check("T3: undo restores display:flex", hdrAfterUndo.display === "flex", JSON.stringify(hdrAfterUndo));
  check("T3: undo removes hidden marker", hdrAfterUndo.hidden === null);
  st = await sendToPage(page, { action: "getStatus", config: cfg });
  check("T3: count back to 1", st.status.hiddenCount === 1, "(got " + st.status.hiddenCount + ")");

  // T4: Reveal mode temporarily shows hidden elements (data-dn-peek)
  await sendToPage(page, { action: "startRevealMode", config: cfg });
  st = await sendToPage(page, { action: "getStatus", config: cfg });
  check("T4: reveal mode activates", st && st.status.isRevealing === true, JSON.stringify(st));

  const peekState = await page.locator("#box").evaluate((el) => ({
    display: el.style.display,
    peek: el.getAttribute("data-dn-peek"),
    hidden: el.getAttribute("data-dn-hidden")
  }));
  check("T4: hidden element visible again while peeking", peekState.display === "", JSON.stringify(peekState));
  check("T4: peek marker set", peekState.peek === "1");
  check("T4: hidden marker kept during peek", peekState.hidden === "1");

  // T5: Clicking a peeked element restores it permanently
  await clickElement(page, "#box");
  const boxRestored = await page.locator("#box").evaluate((el) => ({
    display: el.style.display,
    hidden: el.getAttribute("data-dn-hidden"),
    peek: el.getAttribute("data-dn-peek")
  }));
  check("T5: click restores display", boxRestored.display === "", JSON.stringify(boxRestored));
  check("T5: hidden marker removed", boxRestored.hidden === null);
  check("T5: peek marker removed", boxRestored.peek === null);

  // T6: Exiting reveal re-hides remaining hidden elements
  await sendToPage(page, { action: "startHideMode", config: cfg });
  await clickElement(page, "#ftr");
  await clickElement(page, "#hdr");
  st = await sendToPage(page, { action: "getStatus", config: cfg });
  const countBeforeRevealExit = st.status.hiddenCount;
  await sendToPage(page, { action: "startRevealMode", config: cfg });
  await sendToPage(page, { action: "stopMode", config: cfg });
  const footerAfterExit = await page.locator("#ftr").evaluate((el) => ({
    display: el.style.display,
    peek: el.getAttribute("data-dn-peek"),
    hidden: el.getAttribute("data-dn-hidden")
  }));
  check("T6: two elements hidden before reveal", countBeforeRevealExit === 2, "(got " + countBeforeRevealExit + ")");
  check("T6: footer re-hidden after reveal exit", footerAfterExit.display === "none", JSON.stringify(footerAfterExit));
  check("T6: peek marker cleared on exit", footerAfterExit.peek === null);

  // T7: Restore All clears everything
  await sendToPage(page, { action: "restoreAll", config: cfg });
  const afterAll = await page.evaluate(() => ({
    count: document.querySelectorAll("[data-dn-hidden]").length,
    displays: ["#hdr", "#ftr"].map((s) => document.querySelector(s).style.display)
  }));
  check("T7: no hidden markers remain", afterAll.count === 0, JSON.stringify(afterAll));
  check("T7: hdr display restored to flex", afterAll.displays[0] === "flex");
  check("T7: ftr display restored", afterAll.displays[1] === "", JSON.stringify(afterAll));
  st = await sendToPage(page, { action: "getStatus", config: cfg });
  check("T7: hiddenCount is 0", st.status.hiddenCount === 0);

  // T8: Protected targets (body) cannot be hidden
  await sendToPage(page, { action: "startHideMode", config: cfg });
  await page.evaluate(() => {
    document.body.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
  const bodyDisplay = await page.evaluate(() => document.body.style.display);
  check("T8: body cannot be hidden", bodyDisplay !== "none", "(got " + bodyDisplay + ")");
  await clickElement(page, "#box"); // one hidden element for the HUD count assertions below

  // T9: top bar removed by user request - no #dn-hud element may exist,
  // while the cursor tooltip still shows live element details.
  const barInfo = await page.evaluate(() => ({
    hud: document.getElementById("dn-hud") !== null,
    hudCount: document.getElementById("dn-hud-count") !== null,
    dnUiDivs: Array.from(document.querySelectorAll("[data-dn-ui]")).map((el) => el.tagName + "#" + (el.id || ""))
  }));
  check("T9: top bar NOT rendered", barInfo.hud === false && barInfo.hudCount === false, JSON.stringify(barInfo));

  await page.hover("#para");
  const tipInfo = await page.evaluate(() => {
    const tip = Array.from(document.querySelectorAll("[data-dn-ui]")).find((el) => el.textContent.includes("p#para"));
    return tip ? { text: tip.textContent, display: tip.style.display } : null;
  });
  check("T9: cursor tooltip shows hovered descriptor", !!tipInfo && tipInfo.display === "block" && tipInfo.text.includes("p#para"), JSON.stringify(tipInfo));
  check("T9: tooltip shows mode label HIDE", !!tipInfo && tipInfo.text.includes("[HIDE]"), JSON.stringify(tipInfo));

  // T10: Hover highlight uses data-dn-hover attribute (no inline styles)
  const hoverState = await page.locator("#para").evaluate((el) => ({
    attr: el.getAttribute("data-dn-hover"),
    outline: el.style.outline
  }));
  check("T10: data-dn-hover attribute set", hoverState.attr === "1", JSON.stringify(hoverState));
  check("T10: no inline outline written", hoverState.outline === "", JSON.stringify(hoverState));

  // T11: Escape exits mode, removes listeners and highlight
  await page.keyboard.press("Escape");
  st = await sendToPage(page, { action: "getStatus", config: cfg });
  check("T11: Escape turns mode off", st && st.status.active === false, JSON.stringify(st));

  const afterExit = await page.evaluate(() => ({
    hover: document.querySelector("[data-dn-hover]") !== null,
    cursor: document.documentElement.style.cursor,
    hud: document.getElementById("dn-hud"),
    toast: document.querySelector("[data-dn-ui][style*=fixed]") !== null
  }));
  check("T11: hover attribute cleared", afterExit.hover === false, JSON.stringify(afterExit));
  check("T11: cursor restored", afterExit.cursor === "", "(got " + afterExit.cursor + ")");
  check("T11: no top bar element at all", afterExit.hud === null, JSON.stringify(afterExit.hud));

  await clickElement(page, "#btn");
  const btnDisplay = await page.locator("#btn").evaluate((el) => el.style.display);
  check("T11: click ignored when mode off", btnDisplay === "inline-block", "(got " + btnDisplay + ")");

  // T12: outlineWidth config updates the injected stylesheet var
  await sendToPage(page, { action: "startHideMode", config: { outlineWidth: 4, lang: "en" } });
  const styleText = await page.evaluate(() => {
    const s = document.querySelector("style[data-dn-ui]");
    return s ? s.textContent : "";
  });
  check("T12: injected stylesheet exists", styleText.length > 0);
  check("T12: outline width var = 4px", styleText.includes("--dn-outline-w: 4px"), "(got " + styleText.slice(0, 60) + ")");
  const hoverColor = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--dn-hover-color").trim());
  check("T12: hover color var follows mode", hoverColor === "#f43f5e", "(got " + hoverColor + ")");

  // T13: Arabic language reaches the page UI (tooltip label)
  await sendToPage(page, { action: "setLanguage", lang: "ar", config: { outlineWidth: 4, lang: "ar" } });
  await page.hover("#para");
  const arTip = await page.evaluate(() => {
    const tip = Array.from(document.querySelectorAll("[data-dn-ui]")).find((el) => el.textContent.includes("p#para"));
    return tip ? tip.textContent : "";
  });
  check("T13: tooltip label in Arabic", arTip.includes("[اخفاء]"), "(got " + arTip + ")");
  await sendToPage(page, { action: "setLanguage", lang: "en", config: { outlineWidth: 4, lang: "en" } });

  // T14: Double-injection guard
  await page.addScriptTag({ path: path.join(EXT_PATH, "content.js") });
  const handlerCount = await page.evaluate(() => (window.__dnMessageHandlers || []).length);
  check("T14: re-injection guarded, single handler", handlerCount === 1, "(got " + handlerCount + ")");
  const alive = await sendToPage(page, { action: "getStatus", config: cfg });
  check("T14: messaging still works", !!(alive && alive.success));

  // T15: repeated hide/restore churn does not leak markers
  await sendToPage(page, { action: "restoreAll", config: cfg });
  await sendToPage(page, { action: "startHideMode", config: cfg });
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => {
      const d = document.createElement("div");
      d.className = "churn";
      d.style.height = "10px";
      d.textContent = "churn";
      document.body.appendChild(d);
    });
    await clickElement(page, ".churn:not([data-dn-hidden])");
  }
  const churnCount = await page.evaluate(() => document.querySelectorAll("[data-dn-hidden].churn").length);
  check("T15: 5 churn elements hidden", churnCount === 5, "(got " + churnCount + ")");
  await sendToPage(page, { action: "restoreAll", config: cfg });
  const churnLeft = await page.evaluate(() => document.querySelectorAll("[data-dn-hidden]").length);
  check("T15: restoreAll clears churn", churnLeft === 0, "(got " + churnLeft + ")");

  // T16: stopMode via message (popup Stop button path)
  const stopRes = await sendToPage(page, { action: "stopMode", config: cfg });
  check("T16: stopMode returns success", stopRes && stopRes.success === true);
  st = await sendToPage(page, { action: "getStatus", config: cfg });
  check("T16: mode off after stop", st.status.active === false);

  await browser.close();

  console.log("");
  console.log(passed + "/" + (passed + failed) + " tests passed");
  process.exit(failed === 0 ? 0 : 1);
})().catch((err) => {
  console.error("Test runner error:", err);
  process.exit(1);
});
