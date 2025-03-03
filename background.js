chrome.runtime.onInstalled.addListener(() => {
  console.log("Gemini Nano Autofill extension installed or updated.");
  
  chrome.storage.local.get('geminiApiKey', (data) => {
    if (!data.geminiApiKey) {
      console.log("No API key found. User needs to set one.");
    } else {
      console.log("API key found and loaded.");
    }
  });
});

chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    if (tab.url && (tab.url.startsWith('http://') || tab.url.startsWith('https://'))) {
      console.log("Injecting content script into tab:", tab.id);
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      }).catch(err => console.error("Error injecting content script:", err));
    }
  });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "showAlert") {
    console.log("Alert from content script:", request.message);
    return true;
  }
  
  return false;
});