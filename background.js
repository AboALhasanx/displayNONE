// background.js - Command relay for the global keyboard shortcut (MV3)
// Forwards extension commands to the active tab content script,
// injecting it first if the tab was opened before installation or reload.

chrome.runtime.onInstalled.addListener(() => {
  console.log("displayNONE extension installed");
});

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function isInjectableUrl(url) {
  return !!url && !url.startsWith("chrome://") && !url.startsWith("edge://") && !url.startsWith("about:");
}

async function sendToActiveTab(message) {
  const tab = await getActiveTab();
  if (!tab || !tab.id || !isInjectableUrl(tab.url)) return;

  const send = () =>
    new Promise((resolve) => {
      chrome.tabs.sendMessage(tab.id, message, (res) => {
        if (chrome.runtime.lastError) resolve(null);
        else resolve(res);
      });
    });

  let res = await send();
  if (!res) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content.js"]
      });
      res = await send();
    } catch (e) {
      /* restricted page or discarded tab - nothing to do */
    }
  }
  return res;
}

chrome.commands.onCommand.addListener(async (command) => {
  if (command === "toggle-hide-mode") {
    await sendToActiveTab({ action: "toggleMode" });
  }
});
