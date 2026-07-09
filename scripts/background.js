let GPA = null;
let popupStatus = "inactive";

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

chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  if (message.from === "content" && message.to === "popup") {
    GPA = message.data;
    console.log("Background received GPA:", GPA, "popupStatus:", popupStatus);
    if (popupStatus === "active" && GPA !== null && GPA !== undefined) {
      sendToPopup(GPA);
    }
  } else if (message.from === "popup" && message.to === "background") {
    popupStatus = "active";

    let tabId = sender.tab?.id;
    if (!tabId) {
      const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      tabId = tabs[0]?.id;
    }

    if (tabId !== undefined) {
      await ensureContentScript(tabId);
    }

    if (GPA !== null && GPA !== undefined) {
      sendResponse({ gpa: GPA });
    } else {
      sendResponse({ message: "not calculated yet" });
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
