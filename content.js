// content.js - displayNONE engine v1.0 (Hide / Reveal element inspector)
// Memory discipline: no intervals, no observers, no detached DOM references.
// Listeners attach only while a mode is active and are removed on exit.

(function () {
  if (window.__displayNoneLoaded) return;
  window.__displayNoneLoaded = true;

  var mode = "off"; // "off" | "hide" | "reveal"
  var activeHoverEl = null;
  var tooltipEl = null;
  var toastEl = null;
  var styleEl = null;
  var undoStack = [];
  var UNDO_CAP = 50;

  var config = { outlineWidth: 2, lang: "en" };

  var MODE_COLORS = { hide: "#f43f5e", reveal: "#22c55e" };

  // Elements that must never be display:none-ed (page would break or vanish)
  var BLOCKED_TAGS = ["html", "body", "head", "style", "script", "link", "meta", "title", "base", "noscript", "template"];

  var i18n = {
    en: {
      hudHide: "Click any element to hide it (display:none)",
      hudReveal: "Click a hidden element to restore it",
      stateHiding: "HIDE",
      stateRevealing: "REVEAL",
      toastHidden: "Hidden {desc}",
      toastRestored: "Restored {desc}",
      toastUndo: "Restored last hidden element",
      toastRestoreAll: "All hidden elements restored",
      toastNothing: "Nothing hidden on this page",
      toastProtected: "This element cannot be hidden",
      toastRevealNone: "That element is not hidden",
      toastOff: "displayNONE off"
    },
    ar: {
      hudHide: "اضغط على اي عنصر لاخفاءه (display:none)",
      hudReveal: "اضغط على عنصر مخفي لاعادته",
      stateHiding: "اخفاء",
      stateRevealing: "اظهار",
      toastHidden: "تم اخفاء {desc}",
      toastRestored: "تم ارجاع {desc}",
      toastUndo: "تم ارجاع اخر عنصر مخفي",
      toastRestoreAll: "تم ارجاع كل العناصر المخفية",
      toastNothing: "لا يوجد عناصر مخفية",
      toastProtected: "لا يمكن اخفاء هذا العنصر",
      toastRevealNone: "هذا العنصر غير مخفي",
      toastOff: "تم ايقاف displayNONE"
    }
  };

  function t(key, params) {
    var dict = i18n[config.lang] || i18n.en;
    var str = dict[key] || i18n.en[key] || key;
    if (params) {
      Object.keys(params).forEach(function (k) {
        str = str.replace("{" + k + "}", params[k]);
      });
    }
    return str;
  }

  function getElementDescriptor(el) {
    if (!el || !el.tagName) return "element";
    var tag = el.tagName.toLowerCase();
    var idStr = el.id ? "#" + el.id : "";
    var classStr = "";
    var cls = typeof el.className === "string" ? el.className : (el.className && el.className.baseVal) || "";
    if (cls) classStr = "." + cls.split(/\s+/).filter(Boolean).slice(0, 2).join(".");
    return "<" + tag + idStr + classStr + ">";
  }

  function getElementSize(el) {
    try {
      var r = el.getBoundingClientRect();
      return Math.round(r.width) + "x" + Math.round(r.height);
    } catch (e) {
      return "?x?";
    }
  }

  function hiddenCount() {
    return document.querySelectorAll("[data-dn-hidden]").length;
  }

  // ============ Injected stylesheet (one node, attribute-driven highlight) ============
  // Highlight = data-dn-hover attribute, width = CSS var. No per-mousemove writes.
  function ensureStyle() {
    if (styleEl && styleEl.isConnected) return;
    styleEl = document.createElement("style");
    styleEl.dataset.dnUi = "true";
    styleEl.textContent = [
      ":root { --dn-outline-w: " + config.outlineWidth + "px; --dn-hover-color: " + (MODE_COLORS[mode] || MODE_COLORS.hide) + "; }",
      "[data-dn-hover] { outline: var(--dn-outline-w) solid var(--dn-hover-color, #f43f5e) !important; outline-offset: -1px !important; }",
      "[data-dn-peek] { outline: 2px dashed #22c55e !important; outline-offset: -1px !important; }",
    ].join("\n");
    document.documentElement.appendChild(styleEl);
  }

  function refreshStyleVars() {
    if (!styleEl || !styleEl.isConnected) return;
    styleEl.textContent = [
      ":root { --dn-outline-w: " + config.outlineWidth + "px; --dn-hover-color: " + (MODE_COLORS[mode] || MODE_COLORS.hide) + "; }",
      "[data-dn-hover] { outline: var(--dn-outline-w) solid var(--dn-hover-color, #f43f5e) !important; outline-offset: -1px !important; }",
      "[data-dn-peek] { outline: 2px dashed #22c55e !important; outline-offset: -1px !important; }",
    ].join("\n");
  }

  // ============ Floating tooltip near hovered element ============
  function getOrCreateTooltip() {
    if (tooltipEl) return tooltipEl;
    tooltipEl = document.createElement("div");
    tooltipEl.dataset.dnUi = "true";
    tooltipEl.style.cssText = [
      "position:fixed", "z-index:2147483646", "background:#0f172a",
      "border:1px solid #f43f5e", "border-radius:4px", "padding:2px 6px",
      "font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace",
      "font-size:11px", "font-weight:600", "color:#f43f5e",
      "pointer-events:none", "box-shadow:0 2px 8px rgba(0,0,0,0.5)",
      "display:none", "white-space:nowrap"
    ].join(";");
    document.documentElement.appendChild(tooltipEl);
    return tooltipEl;
  }

  function updateTooltip(el) {
    try {
      var tip = getOrCreateTooltip();
      if (!el || mode === "off") {
        tip.style.display = "none";
        return;
      }
      var rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) {
        tip.style.display = "none";
        return;
      }
      var label = mode === "reveal" ? t("stateRevealing") : t("stateHiding");
      tip.textContent = getElementDescriptor(el) + " " + getElementSize(el) + " [" + label + "]";
      var color = MODE_COLORS[mode];
      tip.style.borderColor = color;
      tip.style.color = color;
      var top = rect.top - 24;
      var left = rect.left;
      if (top < 4) top = rect.bottom + 4;
      var tipWidth = tip.offsetWidth || 220;
      if (left + tipWidth + 10 > window.innerWidth) left = window.innerWidth - tipWidth - 10;
      if (left < 4) left = 4;
      tip.style.top = top + "px";
      tip.style.left = left + "px";
      tip.style.display = "block";
    } catch (e) {}
  }

  function hideTooltip() {
    if (tooltipEl) tooltipEl.style.display = "none";
  }

  // ============ Mini toast ============
  function showToast(msg, isSuccess) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.dataset.dnUi = "true";
      toastEl.style.cssText = [
        "position:fixed", "bottom:20px", "left:50%", "transform:translateX(-50%)",
        "z-index:2147483647", "background:#0f172a", "border-radius:6px",
        "padding:6px 12px", "font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif",
        "font-size:12px", "font-weight:500", "box-shadow:0 4px 16px rgba(0,0,0,0.5)",
        "pointer-events:none", "transition:opacity 0.15s ease, transform 0.15s ease", "opacity:0"
      ].join(";");
      document.documentElement.appendChild(toastEl);
    }
    toastEl.setAttribute("dir", config.lang === "ar" ? "rtl" : "ltr");
    toastEl.textContent = msg;
    toastEl.style.border = isSuccess ? "1px solid #38bdf8" : "1px solid #f43f5e";
    toastEl.style.color = isSuccess ? "#38bdf8" : "#f43f5e";
    toastEl.style.opacity = "1";
    toastEl.style.transform = "translateX(-50%) translateY(0)";
    clearTimeout(toastEl._timer);
    toastEl._timer = setTimeout(function () {
      if (!toastEl) return;
      toastEl.style.opacity = "0";
      toastEl.style.transform = "translateX(-50%) translateY(6px)";
    }, 1800);
  }

  // ============ Safe target ============
  function getSafeTarget(target) {
    if (!target) return null;
    var el = target.nodeType === Node.TEXT_NODE ? target.parentElement : target;
    if (!el || !el.getAttribute) return null;
    if (el.closest && el.closest("[data-dn-ui]")) return null;
    return el;
  }

  function isBlockedTarget(el) {
    if (!el || !el.tagName) return true;
    var tag = el.tagName.toLowerCase();
    if (BLOCKED_TAGS.indexOf(tag) !== -1) return true;
    if (el === document.documentElement || el === document.body) return true;
    return false;
  }

  // ============ Hide / Restore core ============
  function hideElement(el) {
    if (isBlockedTarget(el)) {
      showToast(t("toastProtected"), false);
      return false;
    }
    if (el.hasAttribute("data-dn-hidden")) return false;
    // Save the site original inline display so restore brings it back exactly
    el.setAttribute("data-dn-display", el.style.display || "");
    el.style.display = "none";
    el.setAttribute("data-dn-hidden", "1");
    undoStack.push(el);
    if (undoStack.length > UNDO_CAP) undoStack.shift();
    return true;
  }

  function restoreElement(el) {
    if (!el || !el.hasAttribute("data-dn-hidden")) return false;
    el.style.display = el.getAttribute("data-dn-display") || "";
    el.removeAttribute("data-dn-hidden");
    el.removeAttribute("data-dn-display");
    el.removeAttribute("data-dn-peek");
    return true;
  }

  function undoLast() {
    while (undoStack.length) {
      var el = undoStack.pop();
      if (el && el.isConnected && el.hasAttribute("data-dn-hidden")) {
        restoreElement(el);
        showToast(t("toastUndo"), true);
        return;
      }
    }
    showToast(t("toastNothing"), false);
  }

  function restoreAll() {
    var nodes = document.querySelectorAll("[data-dn-hidden]");
    var n = 0;
    Array.prototype.forEach.call(nodes, function (el) {
      if (restoreElement(el)) n++;
    });
    undoStack.length = 0;
    showToast(n > 0 ? t("toastRestoreAll") : t("toastNothing"), n > 0);
  }

  // ============ Hover / click handlers (attached only while mode active) ============
  function clearHover() {
    if (activeHoverEl && activeHoverEl.hasAttribute && activeHoverEl.hasAttribute("data-dn-hover")) {
      activeHoverEl.removeAttribute("data-dn-hover");
    }
    activeHoverEl = null;
    hideTooltip();
  }

  function handleMouseOver(e) {
    if (mode === "off") return;
    var el = getSafeTarget(e.target);
    if (!el || el === activeHoverEl) return;
    clearHover();
    activeHoverEl = el;
    el.setAttribute("data-dn-hover", "1");
    updateTooltip(el);
  }

  function handleMouseOut(e) {
    if (mode === "off") return;
    var el = getSafeTarget(e.target);
    if (el && el === activeHoverEl) clearHover();
  }

  function handleClick(e) {
    if (mode === "off") return;
    var el = getSafeTarget(e.target);
    if (!el) return;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    if (mode === "hide") {
      if (isBlockedTarget(el)) {
        showToast(t("toastProtected"), false);
        return;
      }
      if (hideElement(el)) {
        showToast(t("toastHidden", { desc: getElementDescriptor(el) }), true);
      }
      clearHover();
      return;
    }

    // reveal mode: click a temporarily-shown element to restore it for good
    var target = el.closest("[data-dn-hidden]") || (el.hasAttribute("data-dn-hidden") ? el : null);
    if (target && restoreElement(target)) {
      showToast(t("toastRestored", { desc: getElementDescriptor(target) }), true);
      clearHover();
    } else {
      showToast(t("toastRevealNone"), false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Escape" && mode !== "off") {
      e.stopImmediatePropagation();
      stopMode();
    }
  }

  // ============ Reveal mode: temporarily show everything hidden ============
  function peekAll() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-dn-hidden]"), function (el) {
      el.setAttribute("data-dn-peek", "1");
      el.style.display = el.getAttribute("data-dn-display") || "";
    });
  }

  function unpeekAll() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-dn-peek]"), function (el) {
      el.removeAttribute("data-dn-peek");
      if (el.hasAttribute("data-dn-hidden")) el.style.display = "none";
    });
  }

  // ============ Mode lifecycle ============
  function startMode(next) {
    var valid = next === "hide" || next === "reveal" ? next : "hide";
    if (mode !== "off") stopMode(true);

    mode = valid;
    ensureStyle();
    refreshStyleVars();

    document.addEventListener("mouseover", handleMouseOver, { passive: true, capture: true });
    document.addEventListener("mouseout", handleMouseOut, { passive: true, capture: true });
    document.addEventListener("click", handleClick, true);
    document.addEventListener("keydown", handleKeyDown, true);
    document.documentElement.style.cursor = "crosshair";

    if (mode === "reveal") peekAll();

    // No persistent bar: a transient toast carries the mode hint instead
    showToast(mode === "reveal" ? t("hudReveal") : t("hudHide"), mode === "reveal");
  }

  function stopMode(silent) {
    if (mode === "off") return;
    if (mode === "reveal") unpeekAll();
    mode = "off";

    document.removeEventListener("mouseover", handleMouseOver, { capture: true });
    document.removeEventListener("mouseout", handleMouseOut, { capture: true });
    document.removeEventListener("click", handleClick, true);
    document.removeEventListener("keydown", handleKeyDown, true);

    clearHover();
    document.documentElement.style.cursor = "";
    if (!silent) showToast(t("toastOff"), false);
  }

  function updateConfig(partial) {
    if (!partial) return;
    var widthChanged = partial.outlineWidth !== undefined && partial.outlineWidth !== config.outlineWidth;
    config.outlineWidth = partial.outlineWidth !== undefined ? partial.outlineWidth : config.outlineWidth;
    if (partial.lang) config.lang = partial.lang;
    if (widthChanged) refreshStyleVars();
  }

  function getStatus() {
    return {
      mode: mode,
      active: mode !== "off",
      isHiding: mode === "hide",
      isRevealing: mode === "reveal",
      hiddenCount: hiddenCount()
    };
  }

  // ============ Runtime message listener ============
  chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    if (message.config) updateConfig(message.config);

    switch (message.action) {
      case "setLanguage":
        config.lang = message.lang || "en";
        sendResponse({ success: true, status: getStatus() });
        break;
      case "startHideMode":
        startMode("hide");
        sendResponse({ success: true, status: getStatus() });
        break;
      case "startRevealMode":
        startMode("reveal");
        sendResponse({ success: true, status: getStatus() });
        break;
      case "stopMode":
        stopMode();
        sendResponse({ success: true, status: getStatus() });
        break;
      case "toggleMode":
        if (mode === "off") startMode("hide");
        else stopMode();
        sendResponse({ success: true, status: getStatus() });
        break;
      case "undoLast":
        undoLast();
        sendResponse({ success: true, status: getStatus() });
        break;
      case "restoreAll":
        restoreAll();
        sendResponse({ success: true, status: getStatus() });
        break;
      case "updateConfig":
      case "getStatus":
        sendResponse({ success: true, status: getStatus() });
        break;
    }
    return true;
  });
})();
