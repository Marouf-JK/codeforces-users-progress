function addSafeEventListener(element, eventName, handler, elementName) {
  if (element) {
    element.addEventListener(eventName, handler);
  } else {
    console.warn("Missing optional element:", elementName);
  }
}

function initDashboard() {
const API_BASE = "https://codeforces.com/api/user.status";
    const RATING_API_BASE = "https://codeforces.com/api/user.rating";
    const TIME_ZONE = "Asia/Amman";

    const pageTitle = document.querySelector("#pageTitle");
    const handleForm = document.querySelector("#handleForm");
    const handleInput = document.querySelector("#handleInput");
    const loadButton = document.querySelector("#loadButton");
    const dataStatus = document.querySelector("#dataStatus");
    const errorMessage = document.querySelector("#errorMessage");
    const emptyState = document.querySelector("#emptyState");
    const dashboardShell = document.querySelector("#dashboardShell");
    const tabButtons = document.querySelectorAll("[data-tab]");
    const tabPages = document.querySelectorAll("[data-tab-page]");
    const summaryGrid = document.querySelector("#summaryGrid");
    const profileCountNote = document.querySelector("#profileCountNote");
    const monthsContainer = document.querySelector("#monthsContainer");
    const ratingBreakdown = document.querySelector("#ratingBreakdown");
    const tagsBreakdown = document.querySelector("#tagsBreakdown");
    const verdictAnalysis = document.querySelector("#verdictAnalysis");
    const consistencyStats = document.querySelector("#consistencyStats");
    const attemptsAnalysis = document.querySelector("#attemptsAnalysis");
    const repeatedAccepted = document.querySelector("#repeatedAccepted");
    const bestTrainingDayDetails = document.querySelector("#bestTrainingDayDetails");
    const monthlyImprovement = document.querySelector("#monthlyImprovement");
    const contestPerformance = document.querySelector("#contestPerformance");
    const problemListView = document.querySelector("#problemListView");
    const problemFilter = document.querySelector("#problemFilter");
    let currentAnalysis = null;

    const dateFormatter = new Intl.DateTimeFormat("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: TIME_ZONE
    });

    const weekdayFormatter = new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      timeZone: TIME_ZONE
    });

    const monthFormatter = new Intl.DateTimeFormat("en-US", {
      month: "long",
      year: "numeric",
      timeZone: TIME_ZONE
    });

    function setStatus(text, type = "ready") {
      if (!dataStatus) return;
      dataStatus.lastChild.textContent = ` ${text}`;
      const dot = dataStatus.querySelector(".status-dot");
      const color = type === "error" ? "var(--danger)" : type === "loading" ? "var(--strong)" : "var(--medium)";
      if (dot) dot.style.background = color;
      dataStatus.style.borderColor = type === "error" ? "rgba(255, 107, 107, 0.45)" : "var(--border)";
    }

    function showError(message) {
      if (!errorMessage) return;
      errorMessage.textContent = message;
      errorMessage.classList.add("is-visible");
    }

    function clearError() {
      if (!errorMessage) return;
      errorMessage.textContent = "";
      errorMessage.classList.remove("is-visible");
    }

    function setLoading(isLoading) {
      if (loadButton) {
        loadButton.disabled = isLoading;
        loadButton.textContent = isLoading ? "Loading..." : "Load Dashboard";
      }
      if (handleInput) {
        handleInput.disabled = isLoading;
      }
    }

    function switchTab(tabName) {
      tabButtons.forEach((button) => {
        const isActive = button.dataset.tab === tabName;
        button.classList.toggle("is-active", isActive);
        button.setAttribute("aria-selected", String(isActive));
      });

      tabPages.forEach((page) => {
        page.classList.toggle("is-active", page.dataset.tabPage === tabName);
      });
    }

    function parseDateKey(dateKey) {
      const [year, month, day] = dateKey.split("-").map(Number);
      return new Date(year, month - 1, day);
    }

    function dateKeyFromDate(date) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    }

    function dateKeyFromTimestamp(seconds) {
      const parts = new Intl.DateTimeFormat("en-CA", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        timeZone: TIME_ZONE
      }).formatToParts(new Date(seconds * 1000));

      const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
      return `${values.year}-${values.month}-${values.day}`;
    }

    function todayDateKey() {
      return dateKeyFromTimestamp(Math.floor(Date.now() / 1000));
    }

    function addDays(date, amount) {
      const next = new Date(date);
      next.setDate(next.getDate() + amount);
      return next;
    }

    function dateDiffInDays(start, end) {
      const oneDay = 24 * 60 * 60 * 1000;
      const startUtc = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
      const endUtc = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
      return Math.round((endUtc - startUtc) / oneDay);
    }

    function problemKey(problem) {
      if (!problem) return null;

      if (problem.contestId !== undefined && problem.index !== undefined) {
        return `${problem.contestId}-${problem.index}`;
      }

      return null;
    }

    function problemName(problem) {
      const key = problemKey(problem) || "Unknown";
      return `${key} ${problem.name || "Unnamed problem"}`;
    }

    function problemPayload(problem, key) {
      const rating = Number.isFinite(problem.rating) ? problem.rating : null;
      return {
        key,
        name: problem.name || "Unnamed problem",
        contestId: problem.contestId ?? null,
        index: problem.index ?? "",
        rating,
        ratingLabel: ratingLabel(rating),
        tags: Array.isArray(problem.tags) && problem.tags.length ? problem.tags : ["Untagged"]
      };
    }

    function ratingLabel(rating) {
      return Number.isFinite(rating) ? String(rating) : "Unrated";
    }

    function increment(map, key, amount = 1) {
      map.set(key, (map.get(key) || 0) + amount);
    }

    function escapeHtml(value) {
      return String(value).replace(/[&<>"']/g, (character) => {
        return {
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#039;"
        }[character];
      });
    }

    function sortedEntries(map) {
      return [...map.entries()].sort((a, b) => {
        if (b[1] !== a[1]) return b[1] - a[1];
        return String(a[0]).localeCompare(String(b[0]));
      });
    }

    function getSolveLevel(solved) {
      if (solved === 0) return "level-zero";
      if (solved <= 2) return "level-light";
      if (solved <= 5) return "level-medium";
      return "level-strong";
    }

    function problemLabel(count) {
      return count === 1 ? "problem" : "problems";
    }

    async function fetchSubmissions(handle) {
      const url = `${API_BASE}?handle=${encodeURIComponent(handle)}&from=1&count=100000`;
      let response;

      try {
        response = await fetch(url);
      } catch (error) {
        throw new Error("Codeforces API unavailable, Refresh");
      }

      if (!response.ok) {
        throw new Error(`Codeforces returned HTTP ${response.status}. Please try again.`);
      }

      const payload = await response.json();
      if (payload.status !== "OK") {
        const comment = payload.comment || "Codeforces API returned an error.";
        if (comment.toLowerCase().includes("not found")) {
          throw new Error("Handle not found");
        }
        throw new Error(comment);
      }

      return payload.result || [];
    }

    async function fetchContestRatings(handle) {
      const url = `${RATING_API_BASE}?handle=${encodeURIComponent(handle)}`;
      let response;

      try {
        response = await fetch(url);
      } catch (error) {
        throw new Error("Codeforces API unavailable, Refresh");
      }

      if (!response.ok) {
        throw new Error(`Codeforces rating API returned HTTP ${response.status}. Please try again.`);
      }

      const payload = await response.json();
      if (payload.status !== "OK") {
        const comment = payload.comment || "Codeforces rating API returned an error.";
        if (comment.toLowerCase().includes("not found")) {
          throw new Error("Handle not found");
        }
        throw new Error(comment);
      }

      return payload.result || [];
    }

    function analyzeSubmissions(rawSubmissions, contestRatings = []) {
      const submissions = [...rawSubmissions].sort((a, b) => {
        return (a.creationTimeSeconds || 0) - (b.creationTimeSeconds || 0);
      });

      const solvedProblems = new Set();
      const firstAcceptedByProblem = new Map();
      const attemptsByProblem = new Map();
      const acceptedCountByProblem = new Map();
      const problemDetails = new Map();
      const problemHistory = new Map();
      const solvedByDay = new Map();
      const solvedProblemsByDay = new Map();
      const ratingMap = new Map();
      const tagsMap = new Map();
      const verdictMap = new Map();
      let repeatedAcceptedSubmissions = 0;
      const debug = {
        totalSubmissions: submissions.length,
        acceptedSubmissions: 0,
        uniqueSolvedCount: 0,
        skippedAcceptedSubmissionsBecauseMissingKey: 0,
        acceptedSubmissionsWithMissingContestId: 0,
        acceptedSubmissionsWithMissingIndex: 0,
        acceptedSubmissionsWithProblemsetName: 0,
        acceptedGymLikeSubmissions: 0,
        topSkippedAcceptedSubmissions: [],
        note: "Debug values show how public user.status submissions are counted."
      };

      submissions.forEach((submission) => {
        const verdict = submission.verdict || "UNKNOWN";
        increment(verdictMap, verdict);

        const problem = submission.problem || {};
        const key = problemKey(problem);

        if (verdict === "OK") {
          debug.acceptedSubmissions += 1;

          if (problem.contestId === undefined) {
            debug.acceptedSubmissionsWithMissingContestId += 1;
          }

          if (problem.index === undefined) {
            debug.acceptedSubmissionsWithMissingIndex += 1;
          }

          if (problem.problemsetName !== undefined) {
            debug.acceptedSubmissionsWithProblemsetName += 1;
          }

          if (Number.isInteger(problem.contestId) && problem.contestId >= 100000) {
            debug.acceptedGymLikeSubmissions += 1;
          }

          if (!key) {
            debug.skippedAcceptedSubmissionsBecauseMissingKey += 1;
            if (debug.topSkippedAcceptedSubmissions.length < 20) {
              debug.topSkippedAcceptedSubmissions.push({
                creationTimeSeconds: submission.creationTimeSeconds,
                problem: {
                  name: problem.name,
                  contestId: problem.contestId,
                  problemsetName: problem.problemsetName,
                  index: problem.index
                }
              });
            }
          }
        }

        if (!key) return;

        const dayKey = dateKeyFromTimestamp(submission.creationTimeSeconds);
        if (!problemHistory.has(key)) {
          const payload = problemPayload(problem, key);
          problemHistory.set(key, {
            ...payload,
            dateFirstAttempted: dayKey,
            dateFirstAccepted: null,
            verdictHistory: [],
            attempts: 0,
            attemptsBeforeFirstAC: null,
            solved: false
          });
        }

        const history = problemHistory.get(key);
        history.attempts += 1;
        history.verdictHistory.push(verdict);

        if (!solvedProblems.has(key)) {
          if (verdict !== "OK") {
            increment(attemptsByProblem, key);
          }
        }

        if (verdict !== "OK") {
          return;
        }

        increment(acceptedCountByProblem, key);

        if (solvedProblems.has(key)) {
          repeatedAcceptedSubmissions += 1;
          return;
        }

        solvedProblems.add(key);
        firstAcceptedByProblem.set(key, submission);
        problemDetails.set(key, problem);
        history.solved = true;
        history.dateFirstAccepted = dayKey;
        history.attemptsBeforeFirstAC = attemptsByProblem.get(key) || 0;

        increment(solvedByDay, dayKey);
        increment(ratingMap, ratingLabel(problem.rating));

        const tags = Array.isArray(problem.tags) && problem.tags.length ? problem.tags : ["Untagged"];
        tags.forEach((tag) => increment(tagsMap, tag));

        if (!solvedProblemsByDay.has(dayKey)) {
          solvedProblemsByDay.set(dayKey, []);
        }
        solvedProblemsByDay.get(dayKey).push(problemPayload(problem, key));
      });

      const months = buildMonthlyData(solvedByDay);
      const dailyRows = months.flatMap((month) => month.days);
      const activeDays = dailyRows.filter((day) => day.solved > 0);
      const zeroDays = dailyRows.filter((day) => day.solved === 0);
      const bestDay = activeDays.reduce((best, day) => {
        return !best || day.solved > best.solved ? day : best;
      }, null);
      const problemList = [...problemHistory.values()].sort((a, b) => {
        if (a.dateFirstAttempted !== b.dateFirstAttempted) {
          return a.dateFirstAttempted.localeCompare(b.dateFirstAttempted);
        }
        return a.key.localeCompare(b.key);
      });
      debug.uniqueSolvedCount = solvedProblems.size;
      return {
        submissions,
        months,
        monthlyImprovement: calculateMonthlyImprovement(months, solvedProblemsByDay),
        totalSolved: solvedProblems.size,
        dailyRows,
        activeDays,
        zeroDays,
        bestDay,
        ratingMap,
        tagsMap,
        verdictMap,
        attemptsByProblem,
        acceptedCountByProblem,
        firstAcceptedByProblem,
        problemDetails,
        problemList,
        solvedProblemsByDay,
        contestPerformance: contestRatings.map((contest) => ({
          contestName: contest.contestName || "Unknown contest",
          rank: contest.rank,
          oldRating: contest.oldRating,
          newRating: contest.newRating,
          ratingDelta: (contest.newRating || 0) - (contest.oldRating || 0)
        })),
        repeatedAcceptedSubmissions,
        consistency: calculateConsistency(dailyRows, activeDays),
        debug
      };
    }

    function buildMonthlyData(solvedByDay) {
      if (!solvedByDay.size) {
        return [];
      }

      const sortedDays = [...solvedByDay.keys()].sort();
      let current = parseDateKey(sortedDays[0]);
      const end = parseDateKey(todayDateKey());
      const months = new Map();

      while (current <= end) {
        const dateKey = dateKeyFromDate(current);
        const monthKey = dateKey.slice(0, 7);
        const solved = solvedByDay.get(dateKey) || 0;

        if (!months.has(monthKey)) {
          months.set(monthKey, {
            month: monthKey,
            totalSolved: 0,
            days: []
          });
        }

        const month = months.get(monthKey);
        month.days.push({ date: dateKey, solved });
        month.totalSolved += solved;
        current = addDays(current, 1);
      }

      return [...months.values()];
    }

    function calculateMonthlyImprovement(months, solvedProblemsByDay) {
      return months.map((month) => {
        const solvedProblems = month.days.flatMap((day) => solvedProblemsByDay.get(day.date) || []);
        const ratedProblems = solvedProblems.filter((problem) => problem.rating !== null);
        const ratingTotal = ratedProblems.reduce((sum, problem) => sum + problem.rating, 0);

        return {
          month: month.month,
          totalSolved: month.totalSolved,
          averageRating: ratedProblems.length ? ratingTotal / ratedProblems.length : null,
          activeDays: month.days.filter((day) => day.solved > 0).length
        };
      });
    }

    function calculateConsistency(dailyRows, activeDays) {
      if (!dailyRows.length) {
        return {
          currentStreak: 0,
          longestStreak: 0,
          zeroDays: 0,
          activeDayPercentage: 0,
          averageGap: 0
        };
      }

      let longestStreak = 0;
      let runningStreak = 0;

      dailyRows.forEach((day) => {
        if (day.solved > 0) {
          runningStreak += 1;
          longestStreak = Math.max(longestStreak, runningStreak);
        } else {
          runningStreak = 0;
        }
      });

      let currentStreak = 0;
      for (let index = dailyRows.length - 1; index >= 0; index -= 1) {
        if (dailyRows[index].solved === 0) break;
        currentStreak += 1;
      }

      const activeDayDates = activeDays.map((day) => parseDateKey(day.date));
      const gaps = [];
      for (let index = 1; index < activeDayDates.length; index += 1) {
        const gap = dateDiffInDays(activeDayDates[index - 1], activeDayDates[index]) - 1;
        gaps.push(Math.max(gap, 0));
      }

      return {
        currentStreak,
        longestStreak,
        zeroDays: dailyRows.length - activeDays.length,
        activeDayPercentage: dailyRows.length ? (activeDays.length / dailyRows.length) * 100 : 0,
        averageGap: gaps.length ? gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length : 0
      };
    }

    function renderDashboard(handle, analysis) {
      currentAnalysis = analysis;
      pageTitle.textContent = `${handle} Progress`;
      emptyState.classList.add("is-hidden");
      dashboardShell.classList.remove("is-hidden");
      switchTab("overview");
      renderOverview(analysis);
      renderSkills(analysis);
      renderVerdictsConsistency(analysis);
      renderAttemptsPage(analysis);
      renderMonthly(analysis);
      renderContests(analysis);
      renderProblems(analysis);
    }

    function renderOverview(analysis) {
      renderSummary(analysis);
    }

    function renderSkills(analysis) {
      renderBreakdown(ratingBreakdown, analysis.ratingMap, "No solved ratings found.");
      renderBreakdown(tagsBreakdown, analysis.tagsMap, "No solved tags found.", 12);
    }

    function renderVerdictsConsistency(analysis) {
      renderBreakdown(verdictAnalysis, analysis.verdictMap, "No submissions found.", 10);
      renderConsistency(analysis.consistency, analysis.dailyRows.length);
    }

    function renderAttemptsPage(analysis) {
      renderAttempts(analysis);
      renderRepeatedAccepted(analysis);
      renderBestTrainingDay(analysis);
    }

    function renderMonthly(analysis) {
      renderMonthlyImprovement(analysis.monthlyImprovement);
      renderMonths(analysis.months);
    }

    function renderContests(analysis) {
      renderContestPerformance(analysis.contestPerformance);
    }

    function renderProblems(analysis) {
      renderProblemList(analysis.problemList);
    }

    function renderSummary(analysis) {
      if (!summaryGrid) return;
      const average = analysis.activeDays.length ? analysis.totalSolved / analysis.activeDays.length : 0;
      const bestDayText = analysis.bestDay
        ? `${analysis.bestDay.solved} on ${dateFormatter.format(parseDateKey(analysis.bestDay.date))}`
        : "No accepted submissions";

      if (profileCountNote) {
        profileCountNote.textContent = "Detailed analytics are based on public Codeforces submissions.";
      }

      const metrics = [
        { label: "Active days", value: analysis.activeDays.length, subtext: "Days with at least one solve" },
        { label: "Zero days", value: analysis.zeroDays.length, subtext: "Tracked days with no solves" },
        { label: "Average per active day", value: average.toFixed(2), subtext: "Unique problems per active day" },
        { label: "Best training day", value: analysis.bestDay ? analysis.bestDay.solved : 0, subtext: bestDayText }
      ];

      summaryGrid.innerHTML = metrics.map((metric) => `
        <article class="metric-card">
          <div class="metric-label">${metric.label}</div>
          <div class="metric-value">${metric.value}</div>
          <div class="metric-subtext">${metric.subtext}</div>
        </article>
      `).join("");
    }

    function renderBreakdown(container, map, emptyText, limit = 8) {
      if (!container) return;
      const entries = sortedEntries(map).slice(0, limit);
      const maxValue = entries[0]?.[1] || 1;

      if (!entries.length) {
        container.innerHTML = `<div class="empty">${emptyText}</div>`;
        return;
      }

      container.innerHTML = entries.map(([name, value]) => {
        const percent = Math.round((value / maxValue) * 100);
        const safeName = escapeHtml(name);
        return `
          <div class="table-row">
            <div class="row-name" title="${safeName}">${safeName}</div>
            <div class="row-value">${value}</div>
            <div class="bar"><div class="bar-fill" style="width: ${percent}%"></div></div>
          </div>
        `;
      }).join("");
    }

    function renderConsistency(consistency, totalTrackedDays) {
      if (!consistencyStats) return;
      const stats = [
        { label: "Current streak", value: `${consistency.currentStreak} days` },
        { label: "Longest streak", value: `${consistency.longestStreak} days` },
        { label: "Zero days", value: consistency.zeroDays },
        { label: "Active-day percentage", value: `${consistency.activeDayPercentage.toFixed(1)}%` },
        { label: "Average gap", value: `${consistency.averageGap.toFixed(2)} days` },
        { label: "Tracked range", value: `${totalTrackedDays} days` }
      ];

      consistencyStats.innerHTML = stats.map((stat) => `
        <div class="stat-box">
          <div class="stat-label">${stat.label}</div>
          <div class="stat-value">${stat.value}</div>
        </div>
      `).join("");
    }

    function renderAttempts(analysis) {
      if (!attemptsAnalysis) return;
      const entries = [...analysis.firstAcceptedByProblem.keys()].map((key) => {
        const problem = analysis.problemDetails.get(key);
        return [problemName(problem), analysis.attemptsByProblem.get(key) || 1];
      }).sort((a, b) => b[1] - a[1]).slice(0, 8);

      if (!entries.length) {
        attemptsAnalysis.innerHTML = '<div class="empty">No accepted problems found.</div>';
        return;
      }

      const maxValue = entries[0][1] || 1;
      attemptsAnalysis.innerHTML = entries.map(([name, value]) => `
        <div class="table-row">
          <div class="row-name" title="${escapeHtml(name)}">${escapeHtml(name)}</div>
          <div class="row-value">${value} ${value === 1 ? "attempt" : "attempts"}</div>
          <div class="bar"><div class="bar-fill" style="width: ${Math.round((value / maxValue) * 100)}%"></div></div>
        </div>
      `).join("");
    }

    function renderRepeatedAccepted(analysis) {
      if (!repeatedAccepted) return;
      const entries = [...analysis.acceptedCountByProblem.entries()]
        .filter(([, count]) => count > 1)
        .map(([key, count]) => {
          const problem = analysis.problemDetails.get(key);
          return [problemName(problem), count - 1];
        })
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8);

      if (!entries.length) {
        repeatedAccepted.innerHTML = `<div class="empty">No repeated accepted submissions. Extra AC count: ${analysis.repeatedAcceptedSubmissions}</div>`;
        return;
      }

      const maxValue = entries[0][1] || 1;
      repeatedAccepted.innerHTML = entries.map(([name, value]) => `
        <div class="table-row">
          <div class="row-name" title="${escapeHtml(name)}">${escapeHtml(name)}</div>
          <div class="row-value">+${value} AC</div>
          <div class="bar"><div class="bar-fill" style="width: ${Math.round((value / maxValue) * 100)}%"></div></div>
        </div>
      `).join("");
    }

    function renderBestTrainingDay(analysis) {
      if (!bestTrainingDayDetails) return;
      if (!analysis.bestDay) {
        bestTrainingDayDetails.innerHTML = '<div class="empty">No solved problems found.</div>';
        return;
      }

      const problems = analysis.solvedProblemsByDay.get(analysis.bestDay.date) || [];
      bestTrainingDayDetails.innerHTML = problems.map((problem) => `
        <div class="table-row">
          <div class="row-name" title="${escapeHtml(problem.name)}">${escapeHtml(problem.key)} ${escapeHtml(problem.name)}</div>
          <div class="row-value">${problem.ratingLabel}</div>
          <div class="row-meta">${escapeHtml(problem.tags.join(", "))}</div>
        </div>
      `).join("");
    }

    function renderMonthlyImprovement(months) {
      if (!monthlyImprovement) return;
      if (!months.length) {
        monthlyImprovement.innerHTML = '<div class="empty">No monthly solved data found.</div>';
        return;
      }

      monthlyImprovement.innerHTML = months.slice(-12).reverse().map((month) => `
        <div class="table-row">
          <div class="row-name">${formatMonth(month.month)}</div>
          <div class="row-value">${month.totalSolved} solved</div>
          <div class="row-meta">
            Average rating: ${month.averageRating === null ? "Unrated" : month.averageRating.toFixed(0)}
            | Active days: ${month.activeDays}
          </div>
        </div>
      `).join("");
    }

    function renderContestPerformance(contests) {
      if (!contestPerformance) return;
      if (!contests.length) {
        contestPerformance.innerHTML = '<div class="empty">No rated contest history found.</div>';
        return;
      }

      contestPerformance.innerHTML = contests.slice().reverse().map((contest) => {
        const delta = contest.ratingDelta > 0 ? `+${contest.ratingDelta}` : String(contest.ratingDelta);
        const safeContestName = escapeHtml(contest.contestName);
        return `
          <div class="table-row">
            <div class="row-name" title="${safeContestName}">${safeContestName}</div>
            <div class="row-value">${delta}</div>
            <div class="row-meta">
              Rank ${contest.rank} | ${contest.oldRating} -> ${contest.newRating}
            </div>
          </div>
        `;
      }).join("");
    }

    function renderProblemList(problems) {
      if (!problemListView) return;
      const query = problemFilter ? problemFilter.value.trim().toLowerCase() : "";
      const filteredProblems = query
        ? problems.filter((problem) => {
            const searchable = [
              problem.key,
              problem.name,
              problem.contestId,
              problem.index,
              problem.ratingLabel,
              problem.tags.join(" "),
              problem.verdictHistory.join(" "),
              problem.solved ? "solved" : "unsolved"
            ].join(" ").toLowerCase();
            return searchable.includes(query);
          })
        : problems;

      if (!filteredProblems.length) {
        problemListView.innerHTML = '<div class="empty">No attempted problems found.</div>';
        return;
      }

      problemListView.innerHTML = filteredProblems.slice().reverse().map((problem) => `
        <div class="table-row">
          <div class="row-name" title="${escapeHtml(problem.name)}">
            ${escapeHtml(problem.key)} ${escapeHtml(problem.name)}
          </div>
          <div class="row-value">${problem.solved ? "Solved" : "Unsolved"}</div>
          <div class="row-meta">
            First attempted: ${problem.dateFirstAttempted}
            | First accepted: ${problem.dateFirstAccepted || "Not yet"}
            | Rating: ${problem.ratingLabel}
            | Attempts: ${problem.attempts}
            | Tags: ${escapeHtml(problem.tags.join(", "))}
            | Verdicts: ${escapeHtml(problem.verdictHistory.join(", "))}
          </div>
        </div>
      `).join("");
    }

    function createDayBox(day) {
      const solved = Number(day.solved || 0);
      const date = parseDateKey(day.date);
      const dayBox = document.createElement("article");
      dayBox.className = `day-box ${getSolveLevel(solved)}`;
      dayBox.innerHTML = `
        <div>
          <div class="day-date">${dateFormatter.format(date)}</div>
          <div class="day-weekday">${weekdayFormatter.format(date)}</div>
        </div>
        <div class="day-count" aria-label="${solved} solved ${problemLabel(solved)}">${solved}</div>
      `;
      return dayBox;
    }

    function setPanelHeight(card, panel, isOpen) {
      card.classList.toggle("is-open", isOpen);
      panel.style.maxHeight = isOpen ? `${panel.scrollHeight}px` : "0px";
    }

    function formatMonth(monthString) {
      const [year, month] = monthString.split("-").map(Number);
      return monthFormatter.format(new Date(year, month - 1, 1));
    }

    function createMonthCard(month, index) {
      const card = document.createElement("article");
      card.className = "month-card";

      const button = document.createElement("button");
      button.className = "month-button";
      button.type = "button";
      button.setAttribute("aria-expanded", "false");

      const panelId = `month-panel-${index}`;
      button.setAttribute("aria-controls", panelId);
      button.innerHTML = `
        <div>
          <div class="month-title">${formatMonth(month.month)}</div>
          <div class="month-meta">${(month.days || []).length} tracked days</div>
        </div>
        <div class="month-total">${Number(month.totalSolved || 0)} solved</div>
        <div class="chevron" aria-hidden="true">v</div>
      `;

      const panel = document.createElement("div");
      panel.className = "month-panel";
      panel.id = panelId;

      const daysGrid = document.createElement("div");
      daysGrid.className = "days-grid";
      (month.days || []).forEach((day) => daysGrid.appendChild(createDayBox(day)));
      panel.appendChild(daysGrid);

      addSafeEventListener(button, "click", () => {
        const isOpen = button.getAttribute("aria-expanded") === "true";
        button.setAttribute("aria-expanded", String(!isOpen));
        setPanelHeight(card, panel, !isOpen);
      }, "month accordion button");

      card.append(button, panel);
      return card;
    }

    function renderMonths(months) {
      if (!monthsContainer) return;
      monthsContainer.innerHTML = "";

      if (!months.length) {
        monthsContainer.innerHTML = '<div class="empty">No accepted submissions found for this handle.</div>';
        return;
      }

      months.forEach((month, index) => {
        monthsContainer.appendChild(createMonthCard(month, index));
      });
    }

    function clearDashboard() {
      currentAnalysis = null;
      clearElement(summaryGrid, "summaryGrid");
      clearElement(monthsContainer, "monthsContainer");
      clearElement(ratingBreakdown, "ratingBreakdown");
      clearElement(tagsBreakdown, "tagsBreakdown");
      clearElement(verdictAnalysis, "verdictAnalysis");
      clearElement(consistencyStats, "consistencyStats");
      clearElement(attemptsAnalysis, "attemptsAnalysis");
      clearElement(repeatedAccepted, "repeatedAccepted");
      clearElement(bestTrainingDayDetails, "bestTrainingDayDetails");
      clearElement(monthlyImprovement, "monthlyImprovement");
      clearElement(contestPerformance, "contestPerformance");
      clearElement(problemListView, "problemListView");
      if (problemFilter) {
        problemFilter.value = "";
      }
    }

    function clearElement(element, elementName) {
      if (element) {
        element.innerHTML = "";
      } else {
        console.warn("Missing optional element:", elementName);
      }
    }

    async function loadDashboard(handle) {
      const cleanHandle = String(handle || "").trim();
      if (!cleanHandle) {
        showError("Please enter a Codeforces handle.");
        return;
      }

      clearError();
      clearDashboard();
      setLoading(true);
      setStatus("Loading...", "loading");

      try {
        const [submissions, contestRatings] = await Promise.all([
          fetchSubmissions(cleanHandle),
          fetchContestRatings(cleanHandle)
        ]);
        const analysis = analyzeSubmissions(submissions, contestRatings);
        renderDashboard(cleanHandle, analysis);
        localStorage.setItem("lastCodeforcesHandle", cleanHandle);
        setStatus("Loaded", "ready");
      } catch (error) {
        console.error(error);
        pageTitle.textContent = "Codeforces Progress";
        const message = getUserFacingError(error);
        showError(message);
        setStatus("Load failed", "error");
      } finally {
        setLoading(false);
      }
    }

    function getUserFacingError(error) {
      const message = String(error?.message || "");
      const lowerMessage = message.toLowerCase();

      if (lowerMessage.includes("handle not found") || lowerMessage.includes("not found")) {
        return "Handle not found";
      }

      if (
        lowerMessage.includes("codeforces api unavailable, Refresh")
        || lowerMessage.includes("failed to fetch")
        || lowerMessage.includes("network")
        || lowerMessage.includes("http 5")
      ) {
        return "Codeforces API unavailable, Refresh";
      }

      return "Failed to load data";
    }

    addSafeEventListener(handleForm, "submit", (event) => {
      event.preventDefault();
      if (!handleInput) {
        console.warn("Missing optional element:", "handleInput");
        return;
      }
      loadDashboard(handleInput.value);
    }, "handleForm");

    if (tabButtons.length) {
      tabButtons.forEach((button) => {
        addSafeEventListener(button, "click", () => {
          switchTab(button.dataset.tab);
        }, "tab button");
      });
    } else {
      console.warn("Missing optional element:", "tabButtons");
    }

    addSafeEventListener(problemFilter, "input", () => {
      if (currentAnalysis) {
        renderProblems(currentAnalysis);
      }
    }, "problemFilter");

    addSafeEventListener(window, "resize", () => {
      document.querySelectorAll(".month-card.is-open").forEach((card) => {
        const panel = card.querySelector(".month-panel");
        if (panel) {
          panel.style.maxHeight = `${panel.scrollHeight}px`;
        } else {
          console.warn("Missing optional element:", "month panel");
        }
      });
    }, "window");

}

if (document.readyState === "loading") {
  addSafeEventListener(document, "DOMContentLoaded", initDashboard, "document");
} else {
  initDashboard();
}
