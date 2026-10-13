// Pixel Dead service worker: keeps the toolbar button in sync with the "open in" preference.
// Popup mode: the toolbar button opens game.html?popup=1.  Tab mode: popup is cleared and onClicked opens/focuses a tab.
const POPUP = 'game.html?popup=1';
async function applyPref() {
  let pref = 'popup';
  try { const o = await chrome.storage.local.get('openIn'); if (o.openIn === 'tab') pref = 'tab'; } catch (e) {}
  try { await chrome.action.setPopup({ popup: pref === 'tab' ? '' : POPUP }); } catch (e) {}
}
chrome.runtime.onInstalled.addListener(applyPref);
chrome.runtime.onStartup.addListener(applyPref);
chrome.storage.onChanged.addListener((c, area) => { if (area === 'local' && c.openIn) applyPref(); });
applyPref();

chrome.action.onClicked.addListener(async () => {      // only fires when no popup is set
  const url = chrome.runtime.getURL('game.html');
  const tabs = await chrome.tabs.query({ url });
  if (tabs.length) { await chrome.tabs.update(tabs[0].id, { active: true }); await chrome.windows.update(tabs[0].windowId, { focused: true }); }
  else await chrome.tabs.create({ url });
});
