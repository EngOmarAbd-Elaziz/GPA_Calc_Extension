const PAGE_URLS = [
  "http://193.227.14.58/#/courses-per-students",
  "http://193.227.14.58/#/courses-per-students/",
  "http://newecom.fci-cu.edu.eg/#/courses-per-students",
  "http://newecom.fci-cu.edu.eg/#/courses-per-students/",
];

const COURSE_HOUR_COLUMN_IDX = 3;
const COURSE_GRADE_COLUMN_IDX = 6;
const COURSE_NAME_COLUMN_IDX = 1;
const EXCLUDED_COURSE_NAME = "Field Training";

let lastSentGpa = null;
let mutationObserver = null;
let debounceTimer = null;

function checkURL() {
  const url = window.location.href;
  return PAGE_URLS.includes(url) || url.includes("courses-per-students");
}

function getCourseFromDOM(tableRows) {
  const courses = [];
  tableRows.forEach((row) => {
    const columns = row.querySelectorAll("td");
    if (
      !columns[COURSE_HOUR_COLUMN_IDX] ||
      !columns[COURSE_HOUR_COLUMN_IDX].firstElementChild ||
      !columns[COURSE_GRADE_COLUMN_IDX] ||
      !columns[COURSE_GRADE_COLUMN_IDX].firstElementChild ||
      !columns[COURSE_NAME_COLUMN_IDX]
    ) {
      return;
    }

    const courseName = columns[COURSE_NAME_COLUMN_IDX].textContent.trim();
    if (courseName === EXCLUDED_COURSE_NAME) {
      return;
    }

    const hours = Number(
      columns[COURSE_HOUR_COLUMN_IDX].firstElementChild.textContent.trim()
    );
    const grade = columns[COURSE_GRADE_COLUMN_IDX].firstElementChild.textContent.trim();

    if (!Number.isFinite(hours)) {
      return;
    }

    courses.push({ hours, grade, courseName });
  });
  return courses;
}

function calculateGPAFromDOM(courses) {
  const POINTS = {
    "A+": 4.0,
    A: 3.7,
    "A-": 3.4,
    "B+": 3.2,
    B: 3.0,
    "B-": 2.8,
    "C+": 2.6,
    C: 2.4,
    "C-": 2.2,
    "D+": 2.0,
    D: 1.5,
    "D-": 1.0,
    F: 0,
  };

  let totalGrade = 0;
  let totalHour = 0;

  courses.forEach((course) => {
    const points = POINTS[course.grade];
    if (points === undefined) {
      return;
    }

    totalGrade += points * course.hours;
    totalHour += course.hours;
  });

  if (totalHour === 0) {
    return 0;
  }

  return Math.floor((totalGrade / totalHour) * 100) / 100;
}

function calculateGPAFromApiFields(fields) {
  let totalGrade = 0;
  let totalHour = 0;
  const failedCourses = [];

  fields.forEach((field) => {
    if (
      field.points !== undefined &&
      field.course &&
      field.course.code !== "TR301"
    ) {
      const courseHours = field.course.numOfHours;
      const courseCode = field.course.code;
      const points = field.points;

      if (points === 0) {
        failedCourses.push({
          hours: courseHours,
          points,
          code: courseCode,
        });
      } else {
        const failedIndex = failedCourses.findIndex(
          (course) => course.code === courseCode
        );
        if (failedIndex !== -1) {
          failedCourses.splice(failedIndex, 1);
        }

        totalGrade += points * courseHours;
        totalHour += courseHours;
      }
    }
  });

  failedCourses.forEach((course) => {
    totalHour += course.hours;
  });

  if (totalHour === 0) {
    return 0;
  }

  return Math.floor((totalGrade / totalHour) * 100) / 100;
}

function sendToWorker(gpa) {
  if (gpa === null || gpa === undefined || Number.isNaN(gpa)) {
    return;
  }
  if (gpa === lastSentGpa) {
    return;
  }

  lastSentGpa = gpa;
  chrome.runtime.sendMessage({ from: "content", to: "popup", data: gpa });
}

function tryCalculateFromDOM() {
  const tables = document.querySelectorAll("table");
  if (tables.length <= 1) {
    return;
  }

  const lastTable = tables[tables.length - 1];
  const rows = lastTable.querySelectorAll("tbody tr");
  const courses = getCourseFromDOM(rows);
  if (!courses.length) {
    return;
  }

  const gpa = calculateGPAFromDOM(courses);
  sendToWorker(gpa);
}

function handleCustomEvent(event) {
  const payload = event.detail;
  if (!payload) {
    return;
  }

  try {
    const jsonData = typeof payload === "string" ? JSON.parse(payload) : payload;
    const gpa = calculateGPAFromApiFields(jsonData);
    sendToWorker(gpa);
  } catch (error) {
    console.error("Failed to parse injected event payload", error);
  }
}

function injectScript() {
  document.addEventListener("yourCustomEvent", handleCustomEvent);

  const script = document.createElement("script");
  script.src = chrome.runtime.getURL("scripts/inject.js");
  script.async = false;
  script.onload = function () {
    this.remove();
  };

  (document.head || document.documentElement).appendChild(script);
}

function observePage() {
  const startObserver = () => {
    if (mutationObserver || !document.body) {
      return;
    }

    mutationObserver = new MutationObserver(() => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      debounceTimer = setTimeout(main, 150);
    });

    mutationObserver.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
    });
  };

  if (document.body) {
    startObserver();
  } else {
    document.addEventListener("DOMContentLoaded", startObserver, { once: true });
  }
}

function main() {
  if (!checkURL()) {
    return;
  }

  tryCalculateFromDOM();
}

function init() {
  if (!checkURL()) {
    return;
  }

  injectScript();
  observePage();
  main();

  window.addEventListener("load", main);
  window.addEventListener("hashchange", main);
  setInterval(main, 3000);
}

if (window.location.href.includes("courses-per-students")) {
  init();
}

function create_box(gpa) {
  // Create the box element
  const box = document.createElement("div");
  box.id = "draggableBox";
  box.textContent = `GPA is ${gpa}`;

  // Style the box using JavaScript
  Object.assign(box.style, {
    width: "200px",
    height: "100px",
    backgroundColor: "#4CAF50",
    color: "white",
    textAlign: "center",
    lineHeight: "100px",
    cursor: "grab",
    position: "absolute",
    top: "50px",
    left: "50px",
    userSelect: "none", // Prevent text selection
  });

  // Append the box to the body
  document.body.appendChild(box);

  // Variables to track dragging state
  let isDragging = false;
  let offsetX, offsetY;

  // Event listener for mouse down (start dragging)
  box.addEventListener("mousedown", (e) => {
    isDragging = true;
    offsetX = e.clientX - box.offsetLeft;
    offsetY = e.clientY - box.offsetTop;
    box.style.cursor = "grabbing"; // Change cursor to grabbing
  });

  // Event listener for mouse move (while dragging)
  document.addEventListener("mousemove", (e) => {
    if (isDragging) {
      box.style.left = `${e.clientX - offsetX}px`;
      box.style.top = `${e.clientY - offsetY}px`;
    }
  });

  // Event listener for mouse up (stop dragging)
  document.addEventListener("mouseup", () => {
    isDragging = false;
    box.style.cursor = "grab"; // Change cursor back to grab
  });
}
