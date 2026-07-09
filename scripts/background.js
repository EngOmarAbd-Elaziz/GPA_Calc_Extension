const gpaCache = new Map();
let popupStatus = "inactive";
let popupTabId = null;

function cacheGpa(tabId, gpa) {
  if (tabId === undefined || tabId === null) {
    return;
  }
  gpaCache.set(tabId, gpa);
}

function getCachedGpa(tabId) {
  if (tabId === undefined || tabId === null) {
    return undefined;
  }
  return gpaCache.get(tabId);
}

async function ensureContentScript(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["scripts/content.js"],
    });
  } catch (error) {
    console.error("Failed to inject content script:", error);
  }
}

function sendToPopup(gpa) {
  chrome.runtime.sendMessage(
    { from: "background", to: "popup", gpa },
    (response) => {
      if (chrome.runtime.lastError) {
        console.log("Runtime error:", chrome.runtime.lastError.message);
        popupStatus = "inactive";
      }
    }
  );
}

function requestContentRecalc(tabId) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { action: "CALCULATE_GPA" }, (response) => {
      if (chrome.runtime.lastError) {
        console.warn("Content script not available for CALCULATE_GPA:", chrome.runtime.lastError.message);
        return resolve(false);
      }
      resolve(true);
    });
  });
}

async function ensureInjectedAndRequestRecalc(tabId) {
  const sent = await requestContentRecalc(tabId);
  if (sent) {
    return;
  }

  await ensureContentScript(tabId);
  await requestContentRecalc(tabId);
}

chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  if (message.from === "content" && message.to === "popup") {
    const tabId = sender.tab?.id;
    cacheGpa(tabId, message.data);
    console.log("Background received GPA:", message.data, "popupStatus:", popupStatus, "tabId:", tabId);
    if (popupStatus === "active" && tabId === popupTabId && message.data !== null && message.data !== undefined) {
      sendToPopup(message.data);
    }
  } else if (message.from === "popup" && message.to === "background") {
    popupStatus = "active";

    let tabId = sender.tab?.id;
    if (!tabId) {
      const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      tabId = tabs[0]?.id;
    }

    popupTabId = tabId;

    if (tabId !== undefined) {
      const cachedGpa = getCachedGpa(tabId);
      sendResponse(cachedGpa !== undefined ? { gpa: cachedGpa } : { message: "calculating" });
      ensureInjectedAndRequestRecalc(tabId);
    } else {
      sendResponse({ message: "tab_not_found" });
    }
  }
  return true;
});

/* chrome.action.onClicked.addListener(function() {
  console.log('extension clicked')
  if(GPA){
    sendResponse({gpa : GPA});

  }else {

    sendResponse({message : "not calculated yet"}, function(response) {
      var lastError = chrome.runtime.lastError;
      console.log(lastError)
      if (lastError) {
          console.log(lastError.message);
          // 'Could not establish connection. Receiving end does not exist.'
          return;
      }
      
  })

    
  }
  
  popupStatus = 'active';

}) */
