# displayNONE — Hide Element Inspector

**فاحص وإخفاء العناصر — اضغط على اي عنصر بالصفحة وولّى `display:none`**

A lightweight Chrome/Edge extension (Manifest V3) that hides any element on the current page by setting its inline `display` style — and brings it back exactly as it was.

---

## 🎯 Features

- **Hide on click**: enable Hide mode, hover any element (red outline + live tooltip), click it → `display:none` is applied to the live page styles.
- **Exact restore**: the original inline display (`flex`, `grid`, `inline-block`, or empty) is saved in `data-dn-display` and restored byte-for-byte — no layout drift.
- **Reveal mode**: temporarily shows everything you hid (green dashed outlines), click one to restore it permanently, exit the mode and anything not picked goes back to hidden.
- **No persistent overlays**: nothing stays on the page — the top bar was removed on request because it covered content. Live element details (`<p#para> 600x24 [HIDE]`) ride in the cursor tooltip, feedback appears in transient toasts, and counter / Undo / Restore All / Stop live in the popup.
- **Undo stack**: last 50 hides; **Restore All** clears every `data-dn-*` marker in one shot.
- **Protected targets**: `<html>`, `<body>`, `<head>`, `<style>`, `<script>` and the extension own UI can never be hidden.
- **Bilingual popup (EN / عربي)** with hidden counter and adjustable highlight border (1–4px).
- **Global shortcut**: `Ctrl+Shift+X` toggles Hide mode (remap at `chrome://extensions/shortcuts`). `Esc` exits.

## 🧠 Memory discipline

The extension is designed to consume essentially nothing while idle:

- **No** `setInterval`, no `MutationObserver`, no rAF loops.
- Event listeners are attached **only while a mode is active** and removed on exit (hover listeners, click capture, key handler).
- All state lives **on the page elements themselves** (`data-dn-hidden`, `data-dn-display`, `data-dn-peek`) — no JS arrays grow with page content; the undo stack is capped at 50.
- The hover highlight is a **single injected stylesheet** driven by a `data-dn-hover` attribute and CSS variables — zero per-mousemove style writes, no inline outlines left behind.
- Vanilla JS, zero dependencies, no `node_modules`.

## 📦 Installation

1. Open `chrome://extensions/` (or `edge://extensions/`).
2. Enable **Developer mode**.
3. **Load unpacked** → select this folder.

## 🗂 Files

| File | Purpose |
|---|---|
| `manifest.json` | MV3 manifest, permissions `activeTab, scripting, storage` |
| `background.js` | Relays the keyboard command to the active tab (injects content script if needed) |
| `content.js` | The engine: hide/reveal modes, HUD, tooltip, toast, i18n |
| `popup.html/css/js` | Controller popup (mode buttons, counter, undo/restore, border slider, language) |
| `icons/` + `generate_icons.ps1` | Eye-off icon set (16/32/48/128), generated with System.Drawing |
| `test.js` | Playwright regression suite (47 assertions) |

## ✅ Tests

```bash
NODE_PATH=../rtl-direction-extension/node_modules node test.js
```

Covers: hide applies `display:none` · exact display restore · undo · reveal peek + permanent restore · re-hide on reveal exit · restore all · body protection · **top bar never rendered** · cursor tooltip details/label · attribute-driven highlight (no inline styles) · Esc cleanup (listeners/cursor) · live border-width config · Arabic tooltip label · double-injection guard · churn cleanup · stop path.

Regenerate icons (Windows PowerShell):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File generate_icons.ps1
```

## 📄 License

MIT
