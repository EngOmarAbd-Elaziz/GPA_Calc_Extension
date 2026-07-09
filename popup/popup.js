const MIN_LOADING_DURATION_MS = 800;
let popupOpenedAt = null;
let pendingGpa = null;
let gpaTransitioning = false;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function markVisible(element) {
  element.style.display = "block";
  requestAnimationFrame(() => {
    element.classList.add("visible");
  });
}

function markHidden(element) {
  element.classList.remove("visible");
  const duration = 240;
  setTimeout(() => {
    if (!element.classList.contains("visible")) {
      element.style.display = "none";
    }
  }, duration);
}

function showLoading() {
  popupOpenedAt = Date.now();
  const loading = document.querySelector(".loading");
  const gpaDiv = document.querySelector(".gpa-div");
  const error = document.querySelector(".error");

  markHidden(gpaDiv);
  markHidden(error);
  markVisible(loading);
}

async function showError(message) {
  await ensureMinimumLoading();

  const loading = document.querySelector(".loading");
  const gpaDiv = document.querySelector(".gpa-div");
  const error = document.querySelector(".error");

  markHidden(loading);
  markHidden(gpaDiv);
  markVisible(error);
  error.textContent = message;
}

async function ensureMinimumLoading() {
  if (!popupOpenedAt) {
    return;
  }
  const elapsed = Date.now() - popupOpenedAt;
  const remaining = MIN_LOADING_DURATION_MS - elapsed;
  if (remaining > 0) {
    await delay(remaining);
  }
}

async function showGpaScreen(gpa) {
  if (gpaTransitioning) {
    return;
  }

  gpaTransitioning = true;
  await ensureMinimumLoading();

  const loading = document.querySelector(".loading");
  const gpaDiv = document.querySelector(".gpa-div");
  const gpaText = document.querySelector("#gpa");

  gpaText.textContent = gpa;
  markHidden(loading);
  markVisible(gpaDiv);
  gpaTransitioning = false;
}

function addGPAToDOM(gpa) {
  if (gpa === undefined || gpa === null || Number.isNaN(gpa)) {
    return;
  }

  pendingGpa = gpa;
  showGpaScreen(gpa);
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
