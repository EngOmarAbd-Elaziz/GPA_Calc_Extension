function addGPAToDOM(gpa) {
  const gpaDiv = document.querySelector(".gpa-div");
  const gpaText = document.querySelector("#gpa");
  const loading = document.querySelector(".loading");
  const error = document.querySelector(".error");

  loading.style.display = "none";
  error.style.display = "none";

  if (gpa !== undefined && gpa !== null && !Number.isNaN(gpa)) {
    gpaDiv.style.display = "block";
    gpaText.textContent = gpa;
  }
}

function showLoading() {
  const loading = document.querySelector(".loading");
  const gpaDiv = document.querySelector(".gpa-div");
  const error = document.querySelector(".error");

  loading.style.display = "block";
  gpaDiv.style.display = "none";
  error.style.display = "none";
}

function showError(message) {
  const loading = document.querySelector(".loading");
  const gpaDiv = document.querySelector(".gpa-div");
  const error = document.querySelector(".error");

  loading.style.display = "none";
  gpaDiv.style.display = "none";
  error.style.display = "block";
  error.textContent = message;
}

async function getCurrentTab() {
  const queryOptions = { active: true, lastFocusedWindow: true };
  const [tab] = await chrome.tabs.query(queryOptions);
  return tab;
}

document.addEventListener("DOMContentLoaded", async function () {
  const urls = [
    "http://193.227.14.58/#/courses-per-students",
    "http://193.227.14.58/#/courses-per-students/",
    "http://newecom.fci-cu.edu.eg/#/courses-per-students",
    "http://newecom.fci-cu.edu.eg/#/courses-per-students/",
  ];

  showLoading();

  const currentTab = await getCurrentTab();
  if (!currentTab || urls.indexOf(currentTab.url) === -1) {
    showError(
      `Please go to the FCAI grades page and signin for the extension to work\n ${urls[0]}`
    );
    return;
  }

  chrome.runtime.sendMessage(
    { from: "popup", to: "background", message: "handshake" },
    function (response) {
      if (chrome.runtime.lastError) {
        console.error(chrome.runtime.lastError.message);
        showError("Extension backend error. Please try again.");
        return;
      }

      if (response && response.gpa !== undefined && response.gpa !== null) {
        addGPAToDOM(response.gpa);
      }
    }
  );
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.from === "background" && request.to === "popup") {
    if (request.gpa !== undefined && request.gpa !== null) {
      addGPAToDOM(request.gpa);
    }
  }
});
