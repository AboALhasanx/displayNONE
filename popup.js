// popup.js - displayNONE controller (Hide / Reveal modes, live counter)

const translations = {
  en: {
    appTitle: "displayNONE",
    appDesc: "Hide Element Inspector",
    statusReady: "Ready",
    statusHiding: "Hiding",
    statusRevealing: "Revealing",
    counterLabel: "Hidden on this page",
    btnHideTitle: "Hide Element",
    btnHideDesc: "Click any element to set display:none",
    btnRevealTitle: "Reveal Hidden",
    btnRevealDesc: "Click a hidden element to restore it",
    btnUndo: "Undo Last",
    btnRestoreAll: "Restore All",
    btnStop: "Stop",
    lblOutline: "Highlight border",
    footerTip: "toggle hide mode",
    footerEsc: "exit"
  },
  ar: {
    appTitle: "displayNONE",
    appDesc: "فاحص اخفاء العناصر",
    statusReady: "جاهز",
    statusHiding: "جاري الاخفاء",
    statusRevealing: "جاري الاظهار",
    counterLabel: "مخفي في هذه الصفحة",
    btnHideTitle: "اخفاء عنصر",
    btnHideDesc: "اضغط على اي عنصر ليصبح display:none",
    btnRevealTitle: "اظهار المخفي",
    btnRevealDesc: "اضغط على عنصر مخفي لاعادته",
    btnUndo: "تراجع",
    btnRestoreAll: "استرجاع الكل",
    btnStop: "ايقاف",
    lblOutline: "حدود التمييز",
    footerTip: "تبديل وضع الاخفاء",
    footerEsc: "خروج"
  }
};

let currentLang = "en";

document.addEventListener("DOMContentLoaded", async () => {
  const htmlRoot = document.getElementById("htmlRoot");
  const btnLangToggle = document.getElementById("btnLangToggle");
  const langEn = document.getElementById("langEn");
  const langAr = document.getElementById("langAr");

  const statusBadge = document.getElementById("statusBadge");
  const hiddenCountNum = document.getElementById("hiddenCountNum");
  const btnHideMode = document.getElementById("btnHideMode");
  const btnRevealMode = document.getElementById("btnRevealMode");
  const btnUndo = document.getElementById("btnUndo");
  const btnRestoreAll = document.getElementById("btnRestoreAll");
  const btnStop = document.getElementById("btnStop");
  const outlineWidth = document.getElementById("outlineWidth");
  const outlineVal = document.getElementById("outlineVal");

  let currentStatus = null;

  function applyLanguage(lang) {
    currentLang = lang;
    const t = translations[lang] || translations.en;

    htmlRoot.setAttribute("dir", lang === "ar" ? "rtl" : "ltr");
    htmlRoot.setAttribute("lang", lang);

    if (lang === "ar") {
      langAr.classList.add("active");
      langEn.classList.remove("active");
    } else {
      langEn.classList.add("active");
      langAr.classList.remove("active");
    }

    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      if (t[key]) el.innerHTML = t[key];
    });

    updateStatusUi(currentStatus);
  }

  btnLangToggle.addEventListener("click", () => {
    const nextLang = currentLang === "ar" ? "en" : "ar";
    applyLanguage(nextLang);
    chrome.storage.local.set({ lang: nextLang });
    sendTabMessage("setLanguage", { lang: nextLang });
  });

  async function getActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
  }

  function getOptionsConfig() {
    return {
      outlineWidth: parseInt(outlineWidth.value, 10) || 2,
      lang: currentLang
    };
  }

  async function ensureContentScriptInjected(tabId) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["content.js"]
      });
    } catch (e) {}
  }

  async function sendTabMessage(action, payload = {}) {
    const tab = await getActiveTab();
    if (!tab || !tab.id || !tab.url || tab.url.startsWith("chrome://") || tab.url.startsWith("edge://")) {
      return null;
    }

    const message = Object.assign({ action, config: getOptionsConfig() }, payload);

    return new Promise((resolve) => {
      chrome.tabs.sendMessage(tab.id, message, async (res) => {
        if (chrome.runtime.lastError) {
          await ensureContentScriptInjected(tab.id);
          chrome.tabs.sendMessage(tab.id, message, (retryRes) => {
            if (chrome.runtime.lastError) resolve(null);
            else resolve(retryRes);
          });
        } else {
          resolve(res);
        }
      });
    });
  }

  function updateStatusUi(status) {
    currentStatus = status;
    const t = translations[currentLang] || translations.en;

    if (!status) {
      statusBadge.textContent = t.statusReady;
      statusBadge.className = "status-pill";
      hiddenCountNum.textContent = "0";
      return;
    }

    hiddenCountNum.textContent = String(status.hiddenCount || 0);

    if (status.isHiding) {
      statusBadge.textContent = t.statusHiding;
      statusBadge.className = "status-pill hiding";
    } else if (status.isRevealing) {
      statusBadge.textContent = t.statusRevealing;
      statusBadge.className = "status-pill revealing";
    } else {
      statusBadge.textContent = t.statusReady;
      statusBadge.className = "status-pill";
    }
  }

  // Load preferences
  const saved = await chrome.storage.local.get(["outlineWidth", "lang"]);
  if (saved.outlineWidth !== undefined) {
    outlineWidth.value = saved.outlineWidth;
    outlineVal.textContent = saved.outlineWidth;
  }
  applyLanguage(saved.lang || "en");

  function persistOptions() {
    chrome.storage.local.set({
      outlineWidth: parseInt(outlineWidth.value, 10) || 2,
      lang: currentLang
    });
  }

  outlineWidth.addEventListener("input", () => {
    outlineVal.textContent = outlineWidth.value;
    persistOptions();
    sendTabMessage("updateConfig");
  });

  // Hero: Hide mode
  btnHideMode.addEventListener("click", async () => {
    await sendTabMessage("startHideMode");
    window.close();
  });

  // Hero: Reveal mode
  btnRevealMode.addEventListener("click", async () => {
    await sendTabMessage("startRevealMode");
    window.close();
  });

  // Undo last hidden element
  btnUndo.addEventListener("click", async () => {
    const res = await sendTabMessage("undoLast");
    updateStatusUi(res?.status);
  });

  // Restore everything
  btnRestoreAll.addEventListener("click", async () => {
    const res = await sendTabMessage("restoreAll");
    updateStatusUi(res?.status);
  });

  // Stop current mode
  btnStop.addEventListener("click", async () => {
    const res = await sendTabMessage("stopMode");
    updateStatusUi(res?.status);
  });

  // Initial state
  const initial = await sendTabMessage("getStatus");
  updateStatusUi(initial?.status);
});
