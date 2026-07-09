(() => {
  if (window.__gpaCalcContentInjected) {
    return;
  }

  window.__gpaCalcContentInjected = true;


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
  let injected = false;

  function checkURL() {
    const url = window.location.href;
    return PAGE_URLS.includes(url) || url.includes("courses-per-students");
  }

  const POINT_MAPPING = {
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
    F: 0.0,
  };

  const EXCLUDED_GRADES = new Set(["W", "I", "CON", "P", "AU", "PASS", "PASS/FAIL"]);
  const VALID_POINT_VALUES = new Set(Object.values(POINT_MAPPING));

  function normalizeGrade(value) {
    if (!value && value !== 0) {
      return "";
    }
    let grade = String(value).trim().toUpperCase();
    grade = grade.replace(/\s+/g, "");
    return grade;
  }

  function isExcludedGrade(grade) {
    const normalized = normalizeGrade(grade);
    if (!normalized) {
      return false;
    }
    if (EXCLUDED_GRADES.has(normalized)) {
      return true;
    }
    return false;
  }

  function getGradePointsFromLetter(grade) {
    const normalized = normalizeGrade(grade);
    if (POINT_MAPPING.hasOwnProperty(normalized)) {
      return POINT_MAPPING[normalized];
    }
    return null;
  }

  function getGradeInfo(field) {
    const gradeCandidates = [
      field.grade,
      field.letter,
      field.gradeLetter,
      field.grade_name,
      field.result,
      field.status,
    ];

    for (const gradeValue of gradeCandidates) {
      if (!gradeValue && gradeValue !== 0) {
        continue;
      }
      const points = getGradePointsFromLetter(gradeValue);
      if (points !== null) {
        return { points, grade: normalizeGrade(gradeValue) };
      }
    }

    if (field.points !== undefined && field.points !== null) {
      const points = Number(field.points);
      if (Number.isFinite(points) && VALID_POINT_VALUES.has(points)) {
        return { points, grade: points === 0 ? "F" : null };
      }
    }

    return null;
  }

  function getCellText(cell) {
    if (!cell) {
      return "";
    }
    const text = cell.firstElementChild
      ? cell.firstElementChild.textContent
      : cell.textContent;
    return text ? text.trim() : "";
  }

  function getCourseFromDOM(tableRows) {
    const courses = [];
    tableRows.forEach((row) => {
      const columns = row.querySelectorAll("td");
      const courseName = getCellText(columns[COURSE_NAME_COLUMN_IDX]);
      const hoursText = getCellText(columns[COURSE_HOUR_COLUMN_IDX]);
      const grade = getCellText(columns[COURSE_GRADE_COLUMN_IDX]);

      if (!courseName || courseName === EXCLUDED_COURSE_NAME) {
        return;
      }

      const normalizedGrade = normalizeGrade(grade);
      if (!normalizedGrade || isExcludedGrade(normalizedGrade)) {
        return;
      }

      const hours = Number(hoursText);
      if (!Number.isFinite(hours) || !normalizedGrade) {
        return;
      }

      courses.push({ hours, grade: normalizedGrade, courseName });
    });
    return courses;
  }

  function buildCourseGroups(courses, courseKeyFn) {
    const groups = new Map();
    courses.forEach((course, index) => {
      const key = courseKeyFn(course);
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key).push({ ...course, originalIndex: index });
    });
    return groups;
  }

  function selectCourseResult(attempts) {
    if (!attempts.length) {
      return null;
    }

    const validAttempts = attempts.filter(
      (attempt) => attempt.hours > 0 && attempt.points !== null && attempt.points !== undefined
    );
    if (!validAttempts.length) {
      return null;
    }

    const passedAttempts = validAttempts.filter((attempt) => attempt.points > 0);
    if (passedAttempts.length) {
      const bestPassed = passedAttempts.reduce((best, attempt) =>
        attempt.points > best.points ? attempt : best
      );
      const cappedPoints = attempts.length > 1 ? Math.min(bestPassed.points, 3.0) : bestPassed.points;
      return { hours: bestPassed.hours, points: cappedPoints };
    }

    const latestFail = validAttempts.reduce((latest, attempt) =>
      attempt.originalIndex > latest.originalIndex ? attempt : latest
    );
    return { hours: latestFail.hours, points: 0.0 };
  }

  function calculateGPAFromDOM(courses) {
    const courseGroups = buildCourseGroups(courses, (course) =>
      course.courseName.trim().toUpperCase()
    );

    let totalGrade = 0;
    let totalHour = 0;

    courseGroups.forEach((attempts) => {
      attempts.forEach((attempt) => {
        attempt.points = getGradePointsFromLetter(attempt.grade);
      });
      const result = selectCourseResult(attempts);
      if (!result) {
        return;
      }
      totalGrade += result.points * result.hours;
      totalHour += result.hours;
    });

    if (totalHour === 0) {
      return 0;
    }

    return Math.floor((totalGrade / totalHour) * 100) / 100;
  }

  function calculateGPAFromApiFields(fields) {
    const filtered = fields
      .filter(
        (field) =>
          field.course &&
          field.course.code &&
          field.course.code !== "TR301" &&
          field.course.numOfHours !== undefined &&
          field.course.numOfHours !== null
      )
      .map((field, index) => {
        const gradeInfo = getGradeInfo(field);
        const courseCode = String(field.course.code).trim().toUpperCase();
        const hours = Number(field.course.numOfHours);
        return {
          courseCode,
          hours: Number.isFinite(hours) ? hours : 0,
          points: gradeInfo ? gradeInfo.points : null,
          grade: gradeInfo ? gradeInfo.grade : null,
          originalIndex: index,
        };
      })
      .filter((item) => item.hours > 0 && item.points !== null)
      .filter((item) => !isExcludedGrade(item.grade));

    const courseGroups = buildCourseGroups(filtered, (item) => item.courseCode);

    let totalGrade = 0;
    let totalHour = 0;

    courseGroups.forEach((attempts) => {
      const result = selectCourseResult(attempts);
      if (!result) {
        return;
      }
      totalGrade += result.points * result.hours;
      totalHour += result.hours;
    });

    if (totalHour === 0) {
      return 0;
    }

    return Math.floor((totalGrade / totalHour) * 100) / 100;
  }

  function sendToWorker(gpa, force = false) {
    if (gpa === null || gpa === undefined || Number.isNaN(gpa)) {
      return;
    }
    if (!force && gpa === lastSentGpa) {
      return;
    }

    lastSentGpa = gpa;
    chrome.runtime.sendMessage({ from: "content", to: "popup", data: gpa });
  }

  function tryCalculateFromDOM(force = false) {
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
    sendToWorker(gpa, force);
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
    if (injected) {
      return;
    }

    injected = true;
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

  function patchHistoryMethods() {
    const wrapHistoryMethod = (methodName) => {
      const original = history[methodName];
      history[methodName] = function () {
        const result = original.apply(this, arguments);
        window.dispatchEvent(new Event(methodName));
        return result;
      };
    };

    if (!history.pushState.isPatched) {
      wrapHistoryMethod("pushState");
      history.pushState.isPatched = true;
    }

    if (!history.replaceState.isPatched) {
      wrapHistoryMethod("replaceState");
      history.replaceState.isPatched = true;
    }

    window.addEventListener("pushState", handleRouteChange);
    window.addEventListener("replaceState", handleRouteChange);
  }

  function main() {
    if (!checkURL()) {
      return;
    }

    injectScript();
    tryCalculateFromDOM();
  }

  function handleRouteChange() {
    if (!checkURL()) {
      return;
    }

    injectScript();
    setTimeout(tryCalculateFromDOM, 200);
  }

  function init() {
    patchHistoryMethods();
    observePage();
    window.addEventListener("load", handleRouteChange);
    window.addEventListener("hashchange", handleRouteChange);
    window.addEventListener("popstate", handleRouteChange);
    window.addEventListener("DOMContentLoaded", handleRouteChange);
    setInterval(handleRouteChange, 3000);
    handleRouteChange();
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message && message.action === "CALCULATE_GPA") {
      tryCalculateFromDOM(true);
      sendResponse({ status: "requested" });
    }
    return true;
  });

  init();

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
})();
