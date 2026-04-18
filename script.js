/* ---------------- GLOBAL STATE ---------------- */

let timerInterval = null;
let soundEnabled = true;
let activeMode = "home";
const ANSWER_REVIEW_DELAY_MS = 3500;
const SCORE_CORRECT = 10;
const SCORE_WRONG = -5;
const SCORE_STREAK_BONUS = 5;
let interactiveAdvanceTimeout = null;
let quizAdvanceTimeout = null;
let lastMistakePayload = null;
const timerState = {
  remaining: 0,
  timerElementId: "",
  onTimeout: null,
  onTick: null,
  paused: false
};

const interactiveState = {
  level: 0,
  score: 0,
  displayedScore: 0,
  timeLeft: 12,
  maxTime: 12,
  locked: false,
  streak: 0,
  bestStreak: 0,
  hintUsed: false,
  hintMessage: "",
  lastFragmentation: null,
  correctAnswers: 0
};

const quizState = {
  index: 0,
  score: 0,
  displayedScore: 0,
  timeLeft: 15,
  locked: false,
  streak: 0,
  bestStreak: 0
};

const quickLabBlocks = [100, 500, 200, 300];

// Aggregated analytics that teachers can inspect in dashboard mode.
const learningStats = {
  interactiveSessions: 0,
  interactiveQuestions: 0,
  interactiveCorrect: 0,
  interactiveTimeouts: 0,
  quizSessions: 0,
  quizQuestions: 0,
  quizCorrect: 0,
  quizTimeouts: 0,
  algorithm: {
    first: { asked: 0, correct: 0 },
    best: { asked: 0, correct: 0 },
    worst: { asked: 0, correct: 0 }
  }
};

const dashboardStats = {
  bestStreak: 0
};

const STATS_STORAGE_KEY = "memoryVisualizerLearningStats";
const DASHBOARD_STORAGE_KEY = "memoryVisualizerDashboardStats";

function loadPersistedStats() {
  try {
    const savedLearningStats = localStorage.getItem(STATS_STORAGE_KEY);
    if (savedLearningStats) {
      const parsed = JSON.parse(savedLearningStats);
      if (parsed && typeof parsed === "object") {
        learningStats.interactiveSessions = Number(parsed.interactiveSessions) || 0;
        learningStats.interactiveQuestions = Number(parsed.interactiveQuestions) || 0;
        learningStats.interactiveCorrect = Number(parsed.interactiveCorrect) || 0;
        learningStats.interactiveTimeouts = Number(parsed.interactiveTimeouts) || 0;
        learningStats.quizSessions = Number(parsed.quizSessions) || 0;
        learningStats.quizQuestions = Number(parsed.quizQuestions) || 0;
        learningStats.quizCorrect = Number(parsed.quizCorrect) || 0;
        learningStats.quizTimeouts = Number(parsed.quizTimeouts) || 0;

        const algo = parsed.algorithm || {};
        const first = algo.first || {};
        const best = algo.best || {};
        const worst = algo.worst || {};

        learningStats.algorithm.first.asked = Number(first.asked) || 0;
        learningStats.algorithm.first.correct = Number(first.correct) || 0;
        learningStats.algorithm.best.asked = Number(best.asked) || 0;
        learningStats.algorithm.best.correct = Number(best.correct) || 0;
        learningStats.algorithm.worst.asked = Number(worst.asked) || 0;
        learningStats.algorithm.worst.correct = Number(worst.correct) || 0;
      }
    }

    const savedDashboardStats = localStorage.getItem(DASHBOARD_STORAGE_KEY);
    if (savedDashboardStats) {
      const parsedDashboard = JSON.parse(savedDashboardStats);
      if (parsedDashboard && typeof parsedDashboard === "object") {
        dashboardStats.bestStreak = Number(parsedDashboard.bestStreak) || 0;
      }
    }
  } catch (error) {
    // Ignore storage errors and keep defaults.
  }
}

function persistStats() {
  try {
    localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify(learningStats));
    localStorage.setItem(DASHBOARD_STORAGE_KEY, JSON.stringify(dashboardStats));
  } catch (error) {
    // Ignore storage errors (private mode / storage restrictions).
  }
}

loadPersistedStats();

function openFeaturePage(feature) {
  const routes = {
    learn: "learn.html",
    simulation: "simulation.html",
    game: "game.html",
    theory: "theory.html",
    compare: "compare.html",
    analytics: "analytics.html"
  };

  const target = routes[feature];
  if (!target) return;
  window.location.href = target;
}

function setActiveDashboardCard(key) {
  const cards = document.querySelectorAll(".dashboard-grid .card");
  cards.forEach(card => {
    const page = card.getAttribute("data-page");
    const isActive = page === key;
    card.classList.toggle("active-selection", isActive);
  });
}

function registerBestStreak(value) {
  if (value > dashboardStats.bestStreak) {
    dashboardStats.bestStreak = value;
  }
  updateDashboardQuickStats();
}

function updateDashboardQuickStats() {
  persistStats();

  const totalAttemptsNode = document.getElementById("dashTotalAttempts");
  const accuracyNode = document.getElementById("dashAccuracy");
  const bestStreakNode = document.getElementById("dashBestStreak");
  if (!totalAttemptsNode || !accuracyNode || !bestStreakNode) return;

  const totalAttempts = learningStats.interactiveQuestions + learningStats.quizQuestions;
  const totalCorrect = learningStats.interactiveCorrect + learningStats.quizCorrect;
  const accuracy = totalAttempts === 0 ? 0 : Math.round((totalCorrect / totalAttempts) * 100);

  totalAttemptsNode.textContent = String(totalAttempts);
  accuracyNode.textContent = `${accuracy}%`;
  bestStreakNode.textContent = String(dashboardStats.bestStreak);
}

/* ---------------- GAME DATA ---------------- */

const interactiveLevels = [
  {
    blocks: [100, 500, 200, 300],
    process: 212,
    algorithm: "best",
    time: 14,
    explain: "Best Fit chooses 300 because it is the smallest block that can hold 212."
  },
  {
    blocks: [90, 140, 450, 310],
    process: 295,
    algorithm: "first",
    time: 13,
    explain: "First Fit scans left to right and selects 450 first."
  },
  {
    blocks: [120, 380, 220, 610, 260],
    process: 240,
    algorithm: "best",
    time: 12,
    explain: "Best Fit chooses 260 because it is the smallest valid block."
  },
  {
    blocks: [180, 430, 150, 560, 320],
    process: 300,
    algorithm: "worst",
    time: 11,
    explain: "Worst Fit chooses 560 because it is the largest available valid block."
  },
  {
    blocks: [95, 205, 470, 260, 510, 340],
    process: 255,
    algorithm: "first",
    time: 10,
    explain: "First Fit picks 470 because it is the first block from the left that can hold 255."
  }
];

const theoryQuestions = [
  {
    question: "What is memory allocation in Operating Systems?",
    options: [
      "Assigning CPU time to processes",
      "Assigning memory space to processes",
      "Saving files in a folder",
      "Sending data over network"
    ],
    answer: 1,
    explain: "Memory allocation means assigning available memory blocks to processes."
  },
  {
    question: "Which algorithm picks the first block that is big enough?",
    options: ["Best Fit", "Worst Fit", "First Fit", "Round Robin"],
    answer: 2,
    explain: "First Fit stops at the first suitable block."
  },
  {
    question: "Which algorithm may reduce leftover space by choosing a tight block?",
    options: ["Best Fit", "Worst Fit", "First Fit", "Paging"],
    answer: 0,
    explain: "Best Fit chooses the smallest block that can still fit the process."
  },
  {
    question: "Worst Fit always selects:",
    options: [
      "The smallest suitable block",
      "The first suitable block",
      "The largest suitable block",
      "The last block"
    ],
    answer: 2,
    explain: "Worst Fit picks the largest free block among valid options."
  },
  {
    question: "A common disadvantage of Best Fit is:",
    options: [
      "It can create many small unusable fragments",
      "It cannot allocate any process",
      "It always wastes maximum memory",
      "It ignores process size"
    ],
    answer: 0,
    explain: "Best Fit can increase external fragmentation by creating tiny gaps."
  },
  {
    question: "A possible advantage of First Fit is:",
    options: [
      "Simple and fast implementation",
      "Always minimum fragmentation",
      "Always best memory use",
      "No searching required"
    ],
    answer: 0,
    explain: "First Fit is easy to implement and usually quick in practice."
  },
  {
    question: "Which statement is true about external fragmentation?",
    options: [
      "Free memory exists but in small separated pieces",
      "Memory is completely full",
      "Only CPU cache is affected",
      "It happens only in paging"
    ],
    answer: 0,
    explain: "External fragmentation means free memory is split into non-contiguous holes."
  },
  {
    question: "If no block can hold a process, what happens?",
    options: [
      "Process is not allocated",
      "Process doubles in size",
      "CPU shuts down",
      "Algorithm restarts automatically"
    ],
    answer: 0,
    explain: "When there is no suitable free block, that process remains unallocated."
  },
  {
    question: "Which method tends to leave large blocks available for future large requests?",
    options: ["Worst Fit", "Best Fit", "First Fit", "None"],
    answer: 0,
    explain: "Worst Fit often leaves medium blocks after taking from the largest one."
  },
  {
    question: "In educational tools, visualizing memory blocks helps because:",
    options: [
      "It shows how algorithm decisions affect space usage",
      "It replaces all OS theory",
      "It removes need for coding",
      "It increases disk speed"
    ],
    answer: 0,
    explain: "Visualization helps learners connect algorithm choices with memory utilization outcomes."
  }
];

/* ---------------- NAVIGATION ---------------- */

function showSection(section) {
  stopTimer();
  setActiveDashboardCard(section);
  const content = document.getElementById("content");

  if (section === "learn") {
    window.location.href = "learn.html";
    return;
  }

  if (section === "simulation") {
    activeMode = "simulation";
    content.innerHTML = `
      <h2>Simulation</h2>
      <p>Enter comma-separated sizes, pick an algorithm, and watch blocks animate.</p>

      <input id="blocks" placeholder="100,500,200,300"><br><br>
      <input id="processes" placeholder="212,417"><br><br>

      <select id="algo">
        <option value="first">First Fit</option>
        <option value="best">Best Fit</option>
        <option value="worst">Worst Fit</option>
      </select><br><br>

      <button onclick="runSimulation()">Run Simulation</button>

      <div id="simOutput"></div>
    `;
    applyContentTransition();
    return;
  }

  if (section === "theory") {
    activeMode = "theory";
    content.innerHTML = `
      <h2>📚 Theory & Reference</h2>
      <p>Beginner-friendly summary of how each memory allocation method works.</p>

      <div class="theory-grid">
        <article class="theory-card">
          <h3>First Fit</h3>
          <p>Rule: Scan left to right and choose the first block that fits.</p>
          <p>Example: Blocks 100, 500, 200 and Process 180 -> pick 500.</p>
          <div class="mini-memory">
            <span class="mini-block selected-memory">100</span>
            <span class="mini-block">500</span>
            <span class="mini-block">200</span>
          </div>
        </article>

        <article class="theory-card">
          <h3>Best Fit</h3>
          <p>Rule: Choose the smallest block that can still hold the process.</p>
          <p>Example: Blocks 400, 230, 700 and Process 210 -> pick 230.</p>
          <div class="mini-memory">
            <span class="mini-block">400</span>
            <span class="mini-block selected-memory">230</span>
            <span class="mini-block">700</span>
          </div>
        </article>

        <article class="theory-card">
          <h3>Worst Fit</h3>
          <p>Rule: Choose the largest valid block to keep smaller blocks free.</p>
          <p>Example: Blocks 300, 900, 420 and Process 280 -> pick 900.</p>
          <div class="mini-memory">
            <span class="mini-block">300</span>
            <span class="mini-block selected-memory">900</span>
            <span class="mini-block">420</span>
          </div>
        </article>
      </div>
    `;
    applyContentTransition();
    return;
  }

  if (section === "compare") {
    activeMode = "compare";
    content.innerHTML = `
      <h2>Compare Algorithms</h2>
      <p>Use one input set to compare First Fit, Best Fit, and Worst Fit side-by-side.</p>

      <input id="compareBlocks" placeholder="Blocks: 100,500,200,300"><br><br>
      <input id="compareProcess" placeholder="Process: 212"><br><br>
      <button onclick="runComparisonMode()">Run Comparison</button>

      <div id="compareOutput"></div>
    `;
    applyContentTransition();
    return;
  }

  if (section === "game") {
    showGameHub();
  }
}

/* ---------------- GAME HUB ---------------- */

function showGameHub() {
  stopTimer();
  activeMode = "hub";
  setActiveDashboardCard("game");
  const content = document.getElementById("content");

  content.innerHTML = `
    <div class="hub-wrap">
      <h2>Game Hub</h2>
      <p>Choose a mode to practice memory allocation concepts.</p>

      <div class="hub-options">
        <div class="mode-card" onclick="startInteractiveGame()">
          <h3>🎮 Play Interactive Game</h3>
          <p>5 levels, timed rounds, streak bonus, and instant feedback.</p>
        </div>

        <div class="mode-card" onclick="startQuizMode()">
          <h3>🧠 Quiz Mode</h3>
          <p>Answer theory questions on definitions, differences, and pros/cons.</p>
        </div>

        <div class="mode-card" onclick="openFeaturePage('compare')">
          <h3>⚖️ Compare Algorithms</h3>
          <p>See First, Best, and Worst Fit results side-by-side.</p>
        </div>

        <div class="mode-card" onclick="openFeaturePage('analytics')">
          <h3>📊 Overall Analysis</h3>
          <p>View student progress, accuracy, and time-out trends.</p>
        </div>
      </div>

      <button onclick="toggleSound()">${soundEnabled ? "Sound: On" : "Sound: Off"}</button>
    </div>
  `;

  applyContentTransition();
}

/* ---------------- INTERACTIVE GAME MODE ---------------- */

function startInteractiveGame() {
  activeMode = "interactive";
  learningStats.interactiveSessions++;
  interactiveState.level = 0;
  interactiveState.score = 0;
  interactiveState.displayedScore = 0;
  interactiveState.locked = false;
  interactiveState.streak = 0;
  interactiveState.bestStreak = 0;
  interactiveState.lastFragmentation = null;
  interactiveState.correctAnswers = 0;
  lastMistakePayload = null;
  loadInteractiveLevel();
}

function loadInteractiveLevel() {
  clearInteractiveAdvanceTimeout();
  stopTimer();
  interactiveState.locked = false;
  interactiveState.hintUsed = false;
  interactiveState.hintMessage = "";

  const content = document.getElementById("content");
  const totalLevels = interactiveLevels.length;

  if (interactiveState.level >= totalLevels) {
    const maxPossibleScore = totalLevels * (SCORE_CORRECT + SCORE_STREAK_BONUS);
    content.innerHTML = `
      <h2>Interactive Game Complete</h2>
      <p>Your Score: <span id="finalInteractiveScore">0</span>/${maxPossibleScore}</p>
      <button onclick="startInteractiveGame()">Play Again</button>
      <button onclick="showGameHub()">Back to Hub</button>
    `;
    applyContentTransition();
    animateValue(
      interactiveState.displayedScore,
      interactiveState.score,
      "finalInteractiveScore",
      value => {
        interactiveState.displayedScore = value;
      }
    );

    if (interactiveState.correctAnswers === totalLevels) {
      showPerfectCelebration("Interactive", totalLevels);
    }
    return;
  }

  const level = interactiveLevels[interactiveState.level];
  const progressPercent = ((interactiveState.level + 1) / totalLevels) * 100;
  interactiveState.maxTime = level.time || 12;
  interactiveState.timeLeft = interactiveState.maxTime;

  learningStats.interactiveQuestions++;
  learningStats.algorithm[level.algorithm].asked++;
  updateDashboardQuickStats();

  const blocksHTML = level.blocks
    .map((blockValue, index) => {
      return `
        <button
          class="block game-block"
          onclick="handleBlockSelection(${index})"
        >
          ${blockValue}
        </button>
      `;
    })
    .join("");

  content.innerHTML = `
    <div class="game-top-bar">
      <div class="hud-item"><span>Score</span><strong id="interactiveScore">${interactiveState.displayedScore}</strong></div>
      <div class="hud-item"><span>Timer</span><strong><span id="interactiveTimer">${interactiveState.timeLeft}</span>s</strong></div>
      <div class="hud-item"><span>Level</span><strong>${interactiveState.level + 1}/${totalLevels}</strong></div>
    </div>

    <div class="progress-wrap">
      <div class="progress-text">Level ${interactiveState.level + 1} of ${totalLevels}</div>
      <div class="progress">
        <div class="progress-fill" style="width:${progressPercent}%"></div>
      </div>
    </div>

    <div class="timer-bar-wrap">
      <div id="interactiveTimerBar" class="timer-bar-fill" style="width:100%"></div>
    </div>

    <div class="game-process-card">
      <p><b>Algorithm:</b> ${capitalize(level.algorithm)} Fit</p>
      <p><b>Process Size:</b> ${level.process}</p>
      <p>Choose the memory block this algorithm will allocate.</p>
    </div>

    <div class="memory game-memory" id="gameMemory">${blocksHTML}</div>

    <div class="fragmentation-wrap">
      <div class="perf-head"><span>Fragmentation Meter</span><span id="fragPercent">-</span></div>
      <div class="fragmentation-meter"><div id="fragFill" class="frag-fill"></div></div>
      <p id="fragHint" class="keyboard-tip">Complete an allocation to see unused-space fragmentation.</p>
    </div>

    <p class="keyboard-tip">Scoring: +10 correct, -5 wrong, +5 streak bonus. Keys: 1-9 select, H hint, P pause.</p>
    <div class="streak-row" id="interactiveStreakRow">
      <span>Streak: <b id="interactiveStreak">${interactiveState.streak}</b></span>
      <span>Best: <b id="interactiveBestStreak">${interactiveState.bestStreak}</b></span>
    </div>
    <div id="comboText" class="combo-text"></div>
    <div id="interactiveFeedback" class="feedback"></div>
    <div id="interactiveExplanation"></div>
    <div id="explainMistakeRow" class="action-row"></div>

    <div class="action-row">
      <button id="pauseBtn" onclick="toggleTimerPause()">Pause Timer</button>
      <button id="hintBtn" onclick="useInteractiveHint()">Use Hint</button>
      <button onclick="showGameHub()">Back to Hub</button>
    </div>
  `;

  applyContentTransition();

  animateValue(
    interactiveState.displayedScore,
    interactiveState.score,
    "interactiveScore",
    value => {
      interactiveState.displayedScore = value;
    }
  );

  startTimer(
    "interactiveTimer",
    interactiveState.maxTime,
    () => {
      onInteractiveTimeUp();
    },
    value => {
      interactiveState.timeLeft = value;
      updateInteractiveTimerBar();
    }
  );
}

function handleBlockSelection(selectedIndex) {
  if (interactiveState.locked || timerState.paused) return;
  interactiveState.locked = true;
  stopTimer();

  const level = interactiveLevels[interactiveState.level];
  const correctIndex = findTargetBlockIndex(level.blocks, level.process, level.algorithm);

  const memory = document.getElementById("gameMemory");
  const feedback = document.getElementById("interactiveFeedback");
  const explanationNode = document.getElementById("interactiveExplanation");
  const comboNode = document.getElementById("comboText");

  if (!memory || !feedback) return;

  const blockButtons = memory.querySelectorAll(".game-block");
  blockButtons.forEach(btn => {
    btn.disabled = true;
  });

  if (selectedIndex === correctIndex) {
    interactiveState.streak++;
    interactiveState.correctAnswers++;
    interactiveState.bestStreak = Math.max(interactiveState.bestStreak, interactiveState.streak);
    registerBestStreak(interactiveState.bestStreak);
    interactiveState.score += SCORE_CORRECT;
    if (interactiveState.streak >= 2) {
      interactiveState.score += SCORE_STREAK_BONUS;
    }
    learningStats.interactiveCorrect++;
    learningStats.algorithm[level.algorithm].correct++;
    playTone("correct");

    blockButtons[selectedIndex].classList.add("selected-correct");
    blockButtons[selectedIndex].classList.add("selected-memory");
    blockButtons[selectedIndex].classList.add("good-hit");
    memory.classList.add("correct-glow");
    triggerSuccessPop(blockButtons[selectedIndex]);

    feedback.className = "feedback correct";
    feedback.textContent = interactiveState.streak >= 2
      ? `Correct ✅ Level Complete 🎉 +${SCORE_CORRECT} (+${SCORE_STREAK_BONUS} streak bonus). ${level.explain}`
      : `Correct ✅ Level Complete 🎉 +${SCORE_CORRECT}. ${level.explain}`;

    updateFragmentationMeter(level.blocks, level.process, correctIndex);
    hideExplainMistakeButton();
    lastMistakePayload = null;

    if (explanationNode) {
      explanationNode.textContent = buildInteractiveActionExplanation(level, selectedIndex, correctIndex, false);
    }

    updateStreakUI("interactiveStreak", interactiveState.streak);
    updateStreakUI("interactiveBestStreak", interactiveState.bestStreak);
    setHotStreakEffect("interactiveStreakRow", interactiveState.streak >= 3);
    if (comboNode) {
      comboNode.textContent = interactiveState.streak >= 3
        ? `Combo x${interactiveState.streak}!`
        : "Nice!";
    }

    animateValue(
      interactiveState.displayedScore,
      interactiveState.score,
      "interactiveScore",
      value => {
        interactiveState.displayedScore = value;
      }
    );

    showLevelCompletePanel(true);
    updateDashboardQuickStats();
  } else {
    interactiveState.score = Math.max(0, interactiveState.score + SCORE_WRONG);
    interactiveState.streak = 0;
    updateStreakUI("interactiveStreak", interactiveState.streak);
    setHotStreakEffect("interactiveStreakRow", false);
    if (comboNode) {
      comboNode.textContent = "";
    }
    playTone("wrong");

    if (blockButtons[selectedIndex]) {
      blockButtons[selectedIndex].classList.add("selected-wrong");
      blockButtons[selectedIndex].classList.add("selected-memory");
      blockButtons[selectedIndex].classList.add("bad-hit");
    }
    if (blockButtons[correctIndex]) {
      blockButtons[correctIndex].classList.add("selected-correct");
    }

    memory.classList.add("wrong-shake");

    feedback.className = "feedback wrong";
    feedback.textContent = `Wrong ❌ ${SCORE_WRONG} points. ${level.explain}`;

    updateFragmentationMeter(level.blocks, level.process, selectedIndex);
    lastMistakePayload = {
      level,
      selectedIndex,
      correctIndex,
      isTimeout: false
    };
    showExplainMistakeButton();

    if (explanationNode) {
      explanationNode.textContent = buildInteractiveActionExplanation(level, selectedIndex, correctIndex, false);
    }

    showLevelCompletePanel(false);
    updateDashboardQuickStats();
  }
}

function onInteractiveTimeUp() {
  if (interactiveState.locked) return;
  interactiveState.locked = true;
  interactiveState.streak = 0;
  updateStreakUI("interactiveStreak", interactiveState.streak);
  setHotStreakEffect("interactiveStreakRow", false);
  const comboNode = document.getElementById("comboText");
  if (comboNode) {
    comboNode.textContent = "";
  }
  learningStats.interactiveTimeouts++;

  const level = interactiveLevels[interactiveState.level];
  const correctIndex = findTargetBlockIndex(level.blocks, level.process, level.algorithm);
  const feedback = document.getElementById("interactiveFeedback");
  const explanationNode = document.getElementById("interactiveExplanation");
  const memory = document.getElementById("gameMemory");

  if (memory) {
    const blockButtons = memory.querySelectorAll(".game-block");
    blockButtons.forEach(btn => {
      btn.disabled = true;
    });

    if (blockButtons[correctIndex]) {
      blockButtons[correctIndex].classList.add("selected-correct");
    }

    memory.classList.add("wrong-shake");
  }

  playTone("wrong");

  if (feedback) {
    feedback.className = "feedback wrong";
    feedback.textContent = `Wrong ❌ Time over. ${level.explain}`;
  }

  if (explanationNode) {
    explanationNode.textContent = buildInteractiveActionExplanation(level, null, correctIndex, true);
  }

  updateFragmentationMeter(level.blocks, level.process, correctIndex);
  lastMistakePayload = {
    level,
    selectedIndex: null,
    correctIndex,
    isTimeout: true
  };
  showExplainMistakeButton();

  showLevelCompletePanel(false);
  updateDashboardQuickStats();
}

function showExplainMistakeButton() {
  const row = document.getElementById("explainMistakeRow");
  if (!row || !lastMistakePayload) return;

  row.innerHTML = "";
  const btn = document.createElement("button");
  btn.textContent = "Explain Why";
  btn.onclick = showMistakeExplanation;
  row.appendChild(btn);
}

function hideExplainMistakeButton() {
  const row = document.getElementById("explainMistakeRow");
  if (!row) return;
  row.innerHTML = "";
}

function showMistakeExplanation() {
  if (!lastMistakePayload) return;
  const explanationNode = document.getElementById("interactiveExplanation");
  if (!explanationNode) return;

  const { level, selectedIndex, correctIndex, isTimeout } = lastMistakePayload;
  explanationNode.textContent = buildInteractiveActionExplanation(level, selectedIndex, correctIndex, isTimeout);
  triggerSuccessPop(explanationNode);
}

function useInteractiveHint() {
  if (interactiveState.locked || interactiveState.hintUsed || timerState.paused) return;

  const level = interactiveLevels[interactiveState.level];
  const memory = document.getElementById("gameMemory");
  const feedback = document.getElementById("interactiveFeedback");
  const hintBtn = document.getElementById("hintBtn");

  if (!memory) return;

  const blockButtons = memory.querySelectorAll(".game-block");
  let highlighted = 0;
  const hintByAlgorithm = {
    first: "Hint: scan left to right and pick the first highlighted block that fits.",
    best: "Hint: among highlighted blocks, choose the tightest fit with least leftover space.",
    worst: "Hint: among highlighted blocks, choose the largest block."
  };

  for (let i = 0; i < level.blocks.length; i++) {
    if (level.blocks[i] >= level.process && blockButtons[i]) {
      blockButtons[i].classList.add("hint-candidate");
      highlighted++;
    }
  }

  interactiveState.hintUsed = true;

  if (hintBtn) {
    hintBtn.disabled = true;
    hintBtn.textContent = "Hint Used";
  }

  if (feedback) {
    feedback.className = "feedback";
    interactiveState.hintMessage = highlighted > 0
      ? hintByAlgorithm[level.algorithm]
      : "Hint: no block can fit this process in this round.";
    feedback.textContent = interactiveState.hintMessage;
  }
}

/* ---------------- QUIZ MODE ---------------- */

function startQuizMode() {
  activeMode = "quiz";
  learningStats.quizSessions++;
  quizState.index = 0;
  quizState.score = 0;
  quizState.displayedScore = 0;
  quizState.locked = false;
  quizState.streak = 0;
  quizState.bestStreak = 0;
  loadQuizQuestion();
}

function loadQuizQuestion() {
  clearQuizAdvanceTimeout();
  stopTimer();
  quizState.locked = false;

  const content = document.getElementById("content");
  const totalQuestions = theoryQuestions.length;

  if (quizState.index >= totalQuestions) {
    content.innerHTML = `
      <h2>Quiz Completed</h2>
      <p>Your Quiz Score: <span id="finalQuizScore">0</span>/${totalQuestions}</p>
      <button onclick="startQuizMode()">Retry Quiz</button>
      <button onclick="showGameHub()">Back to Hub</button>
    `;
    applyContentTransition();

    animateValue(
      quizState.displayedScore,
      quizState.score,
      "finalQuizScore",
      value => {
        quizState.displayedScore = value;
      }
    );

    if (quizState.score === totalQuestions) {
      showPerfectCelebration("Quiz", totalQuestions);
    }
    return;
  }

  const q = theoryQuestions[quizState.index];
  const progressPercent = ((quizState.index + 1) / totalQuestions) * 100;
  quizState.timeLeft = 15;

  learningStats.quizQuestions++;
  updateDashboardQuickStats();

  const optionsHTML = q.options
    .map((option, i) => {
      return `<button class="quiz-option" onclick="checkQuizAnswer(${i})">${option}</button>`;
    })
    .join("");

  content.innerHTML = `
    <div class="status-row">
      <h2>Quiz Mode</h2>
      <div class="timer">Time Left: <span id="quizTimer">${quizState.timeLeft}</span>s</div>
    </div>

    <div class="progress-wrap">
      <div class="progress-text">Question ${quizState.index + 1} of ${totalQuestions}</div>
      <div class="progress">
        <div class="progress-fill" style="width:${progressPercent}%"></div>
      </div>
    </div>

    <p><b>Q${quizState.index + 1}.</b> ${q.question}</p>

    <div class="quiz-options" id="quizOptions">${optionsHTML}</div>

    <div class="score-board">Score: <span id="quizScore">${quizState.displayedScore}</span></div>
    <div class="streak-row" id="quizStreakRow">
      <span>Streak: <b id="quizStreak">${quizState.streak}</b></span>
      <span>Best: <b id="quizBestStreak">${quizState.bestStreak}</b></span>
    </div>
    <div id="quizFeedback" class="feedback"></div>

    <div class="action-row">
      <button id="pauseBtn" onclick="toggleTimerPause()">Pause Timer</button>
      <button onclick="showGameHub()">Back to Hub</button>
    </div>
  `;

  applyContentTransition();

  animateValue(
    quizState.displayedScore,
    quizState.score,
    "quizScore",
    value => {
      quizState.displayedScore = value;
    }
  );

  startTimer(
    "quizTimer",
    15,
    () => {
      onQuizTimeUp();
    },
    value => {
      quizState.timeLeft = value;
    }
  );
}

function checkQuizAnswer(selectedIndex) {
  if (quizState.locked || timerState.paused) return;
  quizState.locked = true;
  stopTimer();

  const q = theoryQuestions[quizState.index];
  const feedback = document.getElementById("quizFeedback");
  const optionsContainer = document.getElementById("quizOptions");

  if (!feedback || !optionsContainer) return;

  const buttons = optionsContainer.querySelectorAll(".quiz-option");
  optionsContainer.classList.add("answer-locked");
  buttons.forEach(btn => {
    btn.disabled = true;
  });

  if (selectedIndex === q.answer) {
    quizState.score++;
    quizState.streak++;
    quizState.bestStreak = Math.max(quizState.bestStreak, quizState.streak);
    registerBestStreak(quizState.bestStreak);
    learningStats.quizCorrect++;
    playTone("correct");

    if (buttons[selectedIndex]) {
      buttons[selectedIndex].classList.add("selected-correct");
      triggerSuccessPop(buttons[selectedIndex]);
    }

    feedback.className = "feedback correct";
    feedback.textContent = quizState.streak >= 3
      ? `Correct! Quiz streak x${quizState.streak}. ${q.explain}`
      : `Correct! ${q.explain}`;

    updateStreakUI("quizStreak", quizState.streak);
    updateStreakUI("quizBestStreak", quizState.bestStreak);
    setHotStreakEffect("quizStreakRow", quizState.streak >= 3);

    animateValue(
      quizState.displayedScore,
      quizState.score,
      "quizScore",
      value => {
        quizState.displayedScore = value;
      }
    );
  } else {
    quizState.streak = 0;
    updateStreakUI("quizStreak", quizState.streak);
    setHotStreakEffect("quizStreakRow", false);
    playTone("wrong");

    if (buttons[selectedIndex]) {
      buttons[selectedIndex].classList.add("selected-wrong");
    }
    if (buttons[q.answer]) {
      buttons[q.answer].classList.add("selected-correct");
    }

    optionsContainer.classList.add("wrong-shake");

    feedback.className = "feedback wrong";
    feedback.textContent = `Incorrect. ${q.explain}`;
  }

  showNextActionButton("quiz");
  updateDashboardQuickStats();
  scheduleQuizAdvance(optionsContainer);
}

function onQuizTimeUp() {
  if (quizState.locked) return;
  quizState.locked = true;
  quizState.streak = 0;
  updateStreakUI("quizStreak", quizState.streak);
  setHotStreakEffect("quizStreakRow", false);
  learningStats.quizTimeouts++;

  const q = theoryQuestions[quizState.index];
  const feedback = document.getElementById("quizFeedback");
  const optionsContainer = document.getElementById("quizOptions");

  if (optionsContainer) {
    const buttons = optionsContainer.querySelectorAll(".quiz-option");
    optionsContainer.classList.add("answer-locked");
    buttons.forEach(btn => {
      btn.disabled = true;
    });
    if (buttons[q.answer]) {
      buttons[q.answer].classList.add("selected-correct");
    }
    optionsContainer.classList.add("wrong-shake");
  }

  playTone("wrong");

  if (feedback) {
    feedback.className = "feedback wrong";
    feedback.textContent = `Time's Up! ${q.explain}`;
  }

  showNextActionButton("quiz");
  updateDashboardQuickStats();
  scheduleQuizAdvance(optionsContainer);
}

function scheduleInteractiveAdvance(memory) {
  clearInteractiveAdvanceTimeout();
  interactiveAdvanceTimeout = setTimeout(() => {
    if (memory) {
      memory.classList.remove("correct-glow");
      memory.classList.remove("wrong-shake");
    }
    goNextInteractiveLevel();
  }, ANSWER_REVIEW_DELAY_MS);
}

function scheduleQuizAdvance(optionsContainer) {
  clearQuizAdvanceTimeout();
  quizAdvanceTimeout = setTimeout(() => {
    if (optionsContainer) {
      optionsContainer.classList.remove("wrong-shake");
    }
    goNextQuizQuestion();
  }, ANSWER_REVIEW_DELAY_MS);
}

function goNextInteractiveLevel() {
  clearInteractiveAdvanceTimeout();
  interactiveState.level++;
  loadInteractiveLevel();
}

function goNextQuizQuestion() {
  clearQuizAdvanceTimeout();
  quizState.index++;
  loadQuizQuestion();
}

function clearInteractiveAdvanceTimeout() {
  if (interactiveAdvanceTimeout) {
    clearTimeout(interactiveAdvanceTimeout);
    interactiveAdvanceTimeout = null;
  }
}

function clearQuizAdvanceTimeout() {
  if (quizAdvanceTimeout) {
    clearTimeout(quizAdvanceTimeout);
    quizAdvanceTimeout = null;
  }
}

function showNextActionButton(mode) {
  const actionRow = document.querySelector(".action-row");
  if (!actionRow || document.getElementById("nextActionBtn")) return;

  const btn = document.createElement("button");
  btn.id = "nextActionBtn";
  btn.className = "active-pulse";
  btn.textContent = mode === "interactive" ? "Next Level" : "Next Question";
  btn.onclick = () => {
    if (mode === "interactive") {
      goNextInteractiveLevel();
    } else {
      goNextQuizQuestion();
    }
  };
  actionRow.appendChild(btn);
}

function triggerSuccessPop(node) {
  if (!node) return;
  node.classList.remove("success-pop");
  requestAnimationFrame(() => {
    node.classList.add("success-pop");
  });
}

function triggerClickFeedback(node) {
  if (!node) return;
  node.classList.remove("click-pop");
  requestAnimationFrame(() => {
    node.classList.add("click-pop");
  });
}

function setHotStreakEffect(rowId, isHot) {
  const row = document.getElementById(rowId);
  if (!row) return;

  row.classList.toggle("hot-streak", isHot);
}

function showPerfectCelebration(modeLabel, total) {
  const existing = document.getElementById("perfectOverlay");
  if (existing) {
    existing.remove();
  }

  const funnyLines = [
    "CPU says: You are officially overqualified for this level.",
    "Memory manager status: calm, efficient, and impressed.",
    "No fragmentation in your brain today."
  ];
  const line = funnyLines[Math.floor(Math.random() * funnyLines.length)];

  const overlay = document.createElement("div");
  overlay.id = "perfectOverlay";
  overlay.className = "perfect-overlay";
  overlay.innerHTML = `
    <div class="perfect-card">
      <h2>Perfect Score!</h2>
      <p>You got all ${total} ${modeLabel.toLowerCase()} answers correct.</p>
      <p>${line}</p>
      <button onclick="dismissPerfectCelebration()">Nice!</button>
    </div>
  `;

  document.body.appendChild(overlay);
}

function dismissPerfectCelebration() {
  const overlay = document.getElementById("perfectOverlay");
  if (!overlay) return;
  overlay.classList.add("closing");
  setTimeout(() => {
    overlay.remove();
  }, 260);
}

function showLevelCompletePanel(wasCorrect) {
  const existing = document.getElementById("levelCompletePanel");
  if (existing) {
    existing.remove();
  }

  const totalPlayed = interactiveState.level + 1;
  const accuracy = Math.round((interactiveState.correctAnswers / Math.max(1, totalPlayed)) * 100);
  const feedback = document.getElementById("interactiveFeedback");
  if (!feedback || !feedback.parentNode) return;

  const panel = document.createElement("div");
  panel.id = "levelCompletePanel";
  panel.className = "level-complete-panel";
  panel.innerHTML = `
    <h3>${wasCorrect ? "Level Complete" : "Level Result"}</h3>
    <p>Score: ${interactiveState.score} | Accuracy: ${accuracy}%</p>
    <div class="level-panel-actions">
      <button id="nextLevelBtn">Next</button>
      <button id="retryLevelBtn">Retry</button>
    </div>
  `;

  feedback.parentNode.insertBefore(panel, feedback.nextSibling);

  const nextBtn = document.getElementById("nextLevelBtn");
  const retryBtn = document.getElementById("retryLevelBtn");

  if (nextBtn) {
    nextBtn.onclick = () => {
      goNextInteractiveLevel();
    };
  }

  if (retryBtn) {
    retryBtn.onclick = () => {
      loadInteractiveLevel();
    };
  }
}

/* ---------------- SHARED HELPERS ---------------- */

function findTargetBlockIndex(blocks, process, algorithm) {
  let index = -1;

  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i] >= process) {
      if (algorithm === "first") {
        return i;
      }
      if (algorithm === "best") {
        if (index === -1 || blocks[i] < blocks[index]) {
          index = i;
        }
      }
      if (algorithm === "worst") {
        if (index === -1 || blocks[i] > blocks[index]) {
          index = i;
        }
      }
    }
  }

  return index;
}

function updateInteractiveTimerBar() {
  const timerBar = document.getElementById("interactiveTimerBar");
  if (!timerBar || interactiveState.maxTime <= 0) return;

  const percent = Math.max(0, Math.min(100, Math.round((interactiveState.timeLeft / interactiveState.maxTime) * 100)));
  timerBar.style.width = `${percent}%`;
  timerBar.classList.toggle("warn", percent <= 35 && percent > 15);
  timerBar.classList.toggle("danger", percent <= 15);
}

function getFragmentationFromSelection(blocks, process, selectedIndex) {
  if (selectedIndex === -1 || selectedIndex === null || blocks[selectedIndex] === undefined) {
    return 100;
  }

  const selectedBlock = blocks[selectedIndex];
  if (selectedBlock < process) {
    return 100;
  }
  const unused = Math.max(0, selectedBlock - process);
  const percent = Math.round((unused / selectedBlock) * 100);
  return Math.max(0, Math.min(100, percent));
}

function getFragmentationMeta(percent) {
  if (percent <= 25) return { label: "Low", tone: "low" };
  if (percent <= 50) return { label: "Medium", tone: "medium" };
  return { label: "High", tone: "high" };
}

function updateFragmentationMeter(blocks, process, selectedIndex) {
  const fill = document.getElementById("fragFill");
  const percentNode = document.getElementById("fragPercent");
  const hint = document.getElementById("fragHint");
  if (!fill || !percentNode || !hint) return;

  const percent = getFragmentationFromSelection(blocks, process, selectedIndex);
  const meta = getFragmentationMeta(percent);
  interactiveState.lastFragmentation = percent;

  fill.style.width = `${percent}%`;
  fill.classList.remove("low", "medium", "high");
  fill.classList.add(meta.tone);
  percentNode.textContent = `${percent}% (${meta.label})`;
  hint.textContent = `Unused space after allocation: ${percent}%. Lower is better.`;
}

function buildAllocationSummary(blocks, process, algorithm) {
  const selected = findTargetBlockIndex(blocks, process, algorithm);
  const remaining = selected === -1 ? null : blocks[selected] - process;
  const fragmentation = getFragmentationFromSelection(blocks, process, selected);
  const fragMeta = getFragmentationMeta(fragmentation);

  return {
    algorithm,
    selected,
    remaining,
    fragmentation,
    fragMeta
  };
}

function runComparisonMode() {
  const blocksRaw = document.getElementById("compareBlocks");
  const processRaw = document.getElementById("compareProcess");
  const output = document.getElementById("compareOutput");
  if (!blocksRaw || !processRaw || !output) return;

  const blocks = blocksRaw.value.split(",").map(Number).filter(n => !Number.isNaN(n) && n > 0);
  const process = Number(processRaw.value);

  if (blocks.length === 0 || Number.isNaN(process) || process <= 0) {
    output.innerHTML = "<p class='feedback wrong'>Enter valid blocks and a valid process size.</p>";
    return;
  }

  const summaries = ["first", "best", "worst"].map(algo => buildAllocationSummary(blocks, process, algo));
  const validSummaries = summaries.filter(item => item.selected !== -1);

  let bestAlgorithm = "none";
  if (validSummaries.length > 0) {
    bestAlgorithm = validSummaries.reduce((best, current) => {
      return current.fragmentation < best.fragmentation ? current : best;
    }).algorithm;
  }

  output.innerHTML = `
    <div class="compare-grid">
      ${summaries
        .map(item => {
          const selectedLabel = item.selected === -1 ? "Not allocated" : `Block ${item.selected + 1}`;
          const remainingLabel = item.remaining === null ? "-" : `${item.remaining}`;
          return `
            <article class="compare-card ${item.algorithm === bestAlgorithm ? "best-performer" : ""}">
              <h3>${capitalize(item.algorithm)} Fit</h3>
              <p><b>Selected Block:</b> ${selectedLabel}</p>
              <p><b>Remaining Space:</b> ${remainingLabel}</p>
              <p><b>Fragmentation:</b> ${item.fragmentation}% (${item.fragMeta.label})</p>
              <div class="fragmentation-meter">
                <div class="frag-fill ${item.fragMeta.tone}" style="width:${item.fragmentation}%"></div>
              </div>
            </article>
          `;
        })
        .join("")}
    </div>
    <p class="keyboard-tip">Best performer: <b>${bestAlgorithm === "none" ? "No algorithm could allocate" : `${capitalize(bestAlgorithm)} Fit`}</b></p>
  `;

  animateFillWidths(output);
}

function animateFillWidths(scope) {
  if (!scope) return;
  const bars = scope.querySelectorAll(".progress-fill, .sim-fill, .frag-fill");

  bars.forEach(bar => {
    const target = bar.style.width;
    if (!target || target === "0%") return;

    bar.style.width = "0%";
    requestAnimationFrame(() => {
      bar.style.width = target;
    });
  });
}

function startTimer(timerElementId, seconds, onTimeout, onTick) {
  stopTimer();

  timerState.remaining = seconds;
  timerState.timerElementId = timerElementId;
  timerState.onTimeout = onTimeout;
  timerState.onTick = onTick;
  timerState.paused = false;

  syncTimerUI();
  timerInterval = setInterval(tickTimer, 1000);
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }

  timerState.remaining = 0;
  timerState.timerElementId = "";
  timerState.onTimeout = null;
  timerState.onTick = null;
  timerState.paused = false;
}

function tickTimer() {
  if (timerState.paused) return;

  timerState.remaining--;
  syncTimerUI();

  if (timerState.remaining <= 0) {
    const onTimeout = timerState.onTimeout;
    stopTimer();
    if (onTimeout) {
      onTimeout();
    }
  }
}

function syncTimerUI() {
  const timerEl = document.getElementById(timerState.timerElementId);
  if (timerEl) {
    timerEl.textContent = timerState.remaining;
    const timerChip = timerEl.closest(".timer");
    if (timerChip) {
      timerChip.classList.toggle("paused", timerState.paused);
    }
  }

  if (timerState.onTick) {
    timerState.onTick(timerState.remaining);
  }

  const pauseBtn = document.getElementById("pauseBtn");
  if (pauseBtn) {
    pauseBtn.textContent = timerState.paused ? "Resume Timer" : "Pause Timer";
  }
}

function toggleTimerPause() {
  if (!timerInterval || !timerState.timerElementId) return;

  timerState.paused = !timerState.paused;
  syncTimerUI();

  const feedbackId = activeMode === "interactive" ? "interactiveFeedback" : "quizFeedback";
  const feedback = document.getElementById(feedbackId);
  if (feedback && timerState.paused) {
    feedback.className = "feedback";
    feedback.textContent = "Timer paused. Press P or click Resume Timer to continue.";
  }

  if (feedback && !timerState.paused && activeMode === "interactive" && interactiveState.hintUsed && interactiveState.hintMessage) {
    feedback.className = "feedback";
    feedback.textContent = interactiveState.hintMessage;
  }
}

function applyContentTransition() {
  const content = document.getElementById("content");
  content.classList.remove("level-enter");

  requestAnimationFrame(() => {
    content.classList.add("level-enter");
  });
}

function animateValue(from, to, elementId, onDone) {
  const node = document.getElementById(elementId);
  if (!node) return;

  const duration = 420;
  const start = performance.now();

  function step(now) {
    const progress = Math.min((now - start) / duration, 1);
    const value = Math.floor(from + (to - from) * progress);
    node.textContent = value;

    if (progress < 1) {
      requestAnimationFrame(step);
    } else {
      node.textContent = to;
      if (onDone) {
        onDone(to);
      }
    }
  }

  requestAnimationFrame(step);
}

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function updateStreakUI(elementId, value) {
  const node = document.getElementById(elementId);
  if (!node) return;

  node.textContent = value;
  node.classList.remove("streak-pop");
  requestAnimationFrame(() => {
    node.classList.add("streak-pop");
  });
}

function handleGlobalKeydown(event) {
  if (isTypingTarget(event.target)) return;
  if (event.repeat) return;

  if ((activeMode === "interactive" || activeMode === "quiz") && event.key.toLowerCase() === "p") {
    toggleTimerPause();
    return;
  }

  if (activeMode === "interactive") {
    if (!interactiveState.locked && event.key.toLowerCase() === "h") {
      useInteractiveHint();
      return;
    }

    const blockIndex = Number(event.key) - 1;
    if (!Number.isNaN(blockIndex) && blockIndex >= 0 && !interactiveState.locked) {
      const gameMemory = document.getElementById("gameMemory");
      const blocks = gameMemory ? gameMemory.querySelectorAll(".game-block") : [];
      if (blockIndex < blocks.length) {
        handleBlockSelection(blockIndex);
      }
    }
    return;
  }

  if (activeMode === "quiz") {
    const optionIndex = Number(event.key) - 1;
    if (!Number.isNaN(optionIndex) && optionIndex >= 0 && !quizState.locked) {
      const options = document.querySelectorAll("#quizOptions .quiz-option");
      if (optionIndex < options.length) {
        checkQuizAnswer(optionIndex);
      }
    }
  }
}

function isTypingTarget(target) {
  if (!target) return false;

  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

function getEventElementTarget(event) {
  if (!event || !event.target) return null;
  if (event.target instanceof Element) return event.target;
  if (event.target.parentElement) return event.target.parentElement;
  return null;
}

document.addEventListener("keydown", handleGlobalKeydown);

function handleGlobalClickFeedback(event) {
  const target = getEventElementTarget(event);
  if (!target) return;

  const clickable = target.closest("button, .mode-card, .card");
  if (!clickable) return;

  if (clickable.classList && clickable.classList.contains("card")) {
    spawnCardRipple(event, clickable);
  }

  triggerClickFeedback(clickable);
  playTone("click");
}

document.addEventListener("click", handleGlobalClickFeedback);

function handleHomeCardNavigation(event) {
  const target = getEventElementTarget(event);
  if (!target) return;

  const card = target.closest(".card[data-page]");

  if (target.closest("button")) {
    return;
  }

  if (!card) return;

  const page = card.getAttribute("data-page");
  if (!page) return;
  openFeaturePage(page);
}

function handleHomeCardKeyboardNavigation(event) {
  const target = getEventElementTarget(event);
  if (!target) return;

  const card = target.closest(".card[data-page]");
  if (!card) return;

  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();

  const page = card.getAttribute("data-page");
  if (!page) return;
  openFeaturePage(page);
}

function spawnCardRipple(event, card) {
  const rect = card.getBoundingClientRect();
  const ripple = document.createElement("span");
  ripple.className = "card-ripple";

  const size = Math.max(rect.width, rect.height);
  const offsetX = event.clientX - rect.left - size / 2;
  const offsetY = event.clientY - rect.top - size / 2;

  ripple.style.width = `${size}px`;
  ripple.style.height = `${size}px`;
  ripple.style.left = `${offsetX}px`;
  ripple.style.top = `${offsetY}px`;

  card.appendChild(ripple);
  setTimeout(() => {
    ripple.remove();
  }, 520);
}

document.addEventListener("click", handleHomeCardNavigation);
document.addEventListener("keydown", handleHomeCardKeyboardNavigation);

function toggleSound() {
  soundEnabled = !soundEnabled;
  playTone("correct");

  if (document.getElementById("content").textContent.includes("Game Hub")) {
    showGameHub();
  }
}

function playTone(type) {
  if (!soundEnabled) return;

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;

  const audioCtx = new AudioContextClass();
  const oscillator = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  oscillator.connect(gain);
  gain.connect(audioCtx.destination);

  oscillator.type = "sine";
  let frequency = 250;
  if (type === "click") {
    frequency = 430;
  } else if (type === "correct") {
    frequency = 620;
  }
  oscillator.frequency.setValueAtTime(frequency, audioCtx.currentTime);

  gain.gain.setValueAtTime(0.0001, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(type === "click" ? 0.08 : 0.14, audioCtx.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + (type === "click" ? 0.12 : 0.24));

  oscillator.start();
  oscillator.stop(audioCtx.currentTime + (type === "click" ? 0.13 : 0.25));
}

/* ---------------- SIMULATION (UNCHANGED LOGIC) ---------------- */

function runSimulation() {
  activeMode = "simulation";
  const blockInput = document.getElementById("blocks").value;
  const processInput = document.getElementById("processes").value;
  let blocks = blockInput.split(",").map(Number).filter(n => !Number.isNaN(n) && n > 0);
  let processes = processInput.split(",").map(Number).filter(n => !Number.isNaN(n) && n > 0);
  let algo = document.getElementById("algo").value;

  let output = document.getElementById("simOutput");
  let allocation = new Array(processes.length).fill(-1);

  if (blocks.length === 0 || processes.length === 0) {
    output.innerHTML = "<p class='feedback wrong'>Enter valid positive numbers for blocks and processes.</p>";
    return;
  }

  const originalBlocks = [...blocks];
  const allocationLabels = new Array(blocks.length).fill(0).map(() => []);
  const stepLogs = [];

  const allocationFragmentation = [];

  for (let i = 0; i < processes.length; i++) {
    let index = -1;
    const processSteps = [];

    for (let j = 0; j < blocks.length; j++) {
      const isEnough = blocks[j] >= processes[i];
      processSteps.push(`checking Block ${j + 1} (${blocks[j]}) ${isEnough ? "(fits)" : "(not enough)"}`);

      if (isEnough) {
        if (algo === "first") {
          index = j;
          break;
        }
        if (algo === "best") {
          if (index === -1 || blocks[j] < blocks[index]) index = j;
        }
        if (algo === "worst") {
          if (index === -1 || blocks[j] > blocks[index]) index = j;
        }
      }
    }

    if (index !== -1) {
      allocation[i] = index;
      allocationLabels[index].push(`P${i + 1}`);
      const selectedBlockBefore = blocks[index];
      blocks[index] -= processes[i];
      allocationFragmentation.push(
        Math.round(((selectedBlockBefore - processes[i]) / selectedBlockBefore) * 100)
      );
      processSteps.push(`allocated to Block ${index + 1}`);
    } else {
      processSteps.push("not allocated");
    }

    stepLogs.push(`<li><b>P${i + 1} (${processes[i]})</b> -> ${processSteps.join(" -> ")}</li>`);
  }

  let result = "<h3>Allocation Result</h3><ul class='sim-result-list'>";

  for (let i = 0; i < processes.length; i++) {
    if (allocation[i] !== -1) {
      result += `<li>Process ${processes[i]} -> Block ${allocation[i] + 1}</li>`;
    } else {
      result += `<li>Process ${processes[i]} -> Not allocated</li>`;
    }
  }

  result += "</ul>";
  result += `<h3>Step-by-Step Allocation</h3><ul class='sim-result-list'>${stepLogs.join("")}</ul>`;

  if (allocationFragmentation.length > 0) {
    const avgFragmentation = Math.round(
      allocationFragmentation.reduce((sum, item) => sum + item, 0) / allocationFragmentation.length
    );
    const fragMeta = getFragmentationMeta(avgFragmentation);
    result += `
      <div class="fragmentation-wrap compact">
        <div class="perf-head"><span>Fragmentation Meter (Average)</span><span>${avgFragmentation}% (${fragMeta.label})</span></div>
        <div class="fragmentation-meter"><div class="frag-fill ${fragMeta.tone}" style="width:${avgFragmentation}%"></div></div>
      </div>
    `;
  }

  const memoryBars = originalBlocks
    .map((total, i) => {
      const free = blocks[i];
      const allocated = total - free;
      const fillPercent = Math.max(0, Math.min(100, Math.round((allocated / total) * 100)));
      const labels = allocationLabels[i].length > 0 ? `Allocated (${allocationLabels[i].join(", ")})` : "Free";
      const stateClass = allocationLabels[i].length > 0 ? "allocated" : "free";

      return `
        <div class="sim-block-card ${stateClass}">
          <div class="sim-block-head">
            <span>Block ${i + 1}</span>
            <span>${labels}</span>
          </div>
          <div class="sim-track">
            <div class="sim-fill" style="width:${fillPercent}%"></div>
          </div>
          <p>Total: ${total} | Used: ${allocated} | Free: ${free}</p>
        </div>
      `;
    })
    .join("");

  result += `<div class="sim-grid">${memoryBars}</div>`;
  output.innerHTML = result;
  animateFillWidths(output);
}

function showTeacherDashboard() {
  stopTimer();
  activeMode = "dashboard";
  setActiveDashboardCard("analytics");

  const content = document.getElementById("content");

  const interactiveAccuracy = getPercent(learningStats.interactiveCorrect, learningStats.interactiveQuestions);
  const quizAccuracy = getPercent(learningStats.quizCorrect, learningStats.quizQuestions);
  const overallCorrect = learningStats.interactiveCorrect + learningStats.quizCorrect;
  const overallQuestions = learningStats.interactiveQuestions + learningStats.quizQuestions;
  const overallAccuracy = getPercent(overallCorrect, overallQuestions);

  const firstAccuracy = getPercent(learningStats.algorithm.first.correct, learningStats.algorithm.first.asked);
  const bestAccuracy = getPercent(learningStats.algorithm.best.correct, learningStats.algorithm.best.asked);
  const worstAccuracy = getPercent(learningStats.algorithm.worst.correct, learningStats.algorithm.worst.asked);

  content.innerHTML = `
    <div class="dashboard-wrap">
      <h2>Overall Analysis</h2>
      <p>Use this panel to monitor learning outcomes from both practical and theory sessions.</p>

      <div class="stats-grid">
        <div class="stat-card">
          <h3>Overall Accuracy</h3>
          <p class="stat-value">${overallAccuracy}%</p>
          <p>${overallCorrect} correct out of ${overallQuestions} attempts</p>
        </div>

        <div class="stat-card">
          <h3>Interactive Game</h3>
          <p class="stat-value">${interactiveAccuracy}%</p>
          <p>Sessions: ${learningStats.interactiveSessions}</p>
          <p>Timeouts: ${learningStats.interactiveTimeouts}</p>
        </div>

        <div class="stat-card">
          <h3>Quiz Mode</h3>
          <p class="stat-value">${quizAccuracy}%</p>
          <p>Sessions: ${learningStats.quizSessions}</p>
          <p>Timeouts: ${learningStats.quizTimeouts}</p>
        </div>
      </div>

      <div class="metric-bars">
        <div class="metric-item">
          <div class="perf-head"><span>Overall Accuracy</span><span>${overallAccuracy}%</span></div>
          <div class="progress"><div class="progress-fill" style="width:${overallAccuracy}%"></div></div>
        </div>
        <div class="metric-item">
          <div class="perf-head"><span>Interactive Accuracy</span><span>${interactiveAccuracy}%</span></div>
          <div class="progress"><div class="progress-fill" style="width:${interactiveAccuracy}%"></div></div>
        </div>
        <div class="metric-item">
          <div class="perf-head"><span>Quiz Accuracy</span><span>${quizAccuracy}%</span></div>
          <div class="progress"><div class="progress-fill" style="width:${quizAccuracy}%"></div></div>
        </div>
      </div>

      <h3>Algorithm Performance</h3>
      <div class="perf-list">
        <div class="perf-item">
          <div class="perf-head">
            <span>First Fit</span>
            <span>${firstAccuracy}% (${learningStats.algorithm.first.correct}/${learningStats.algorithm.first.asked})</span>
          </div>
          <div class="progress"><div class="progress-fill" style="width:${firstAccuracy}%"></div></div>
        </div>

        <div class="perf-item">
          <div class="perf-head">
            <span>Best Fit</span>
            <span>${bestAccuracy}% (${learningStats.algorithm.best.correct}/${learningStats.algorithm.best.asked})</span>
          </div>
          <div class="progress"><div class="progress-fill" style="width:${bestAccuracy}%"></div></div>
        </div>

        <div class="perf-item">
          <div class="perf-head">
            <span>Worst Fit</span>
            <span>${worstAccuracy}% (${learningStats.algorithm.worst.correct}/${learningStats.algorithm.worst.asked})</span>
          </div>
          <div class="progress"><div class="progress-fill" style="width:${worstAccuracy}%"></div></div>
        </div>
      </div>

      <div class="action-row">
        <button onclick="resetLearningStats()">Reset Analytics</button>
        <button onclick="showGameHub()">Back to Hub</button>
      </div>
    </div>
  `;

  applyContentTransition();
  animateFillWidths(content);
}

function resetLearningStats() {
  learningStats.interactiveSessions = 0;
  learningStats.interactiveQuestions = 0;
  learningStats.interactiveCorrect = 0;
  learningStats.interactiveTimeouts = 0;

  learningStats.quizSessions = 0;
  learningStats.quizQuestions = 0;
  learningStats.quizCorrect = 0;
  learningStats.quizTimeouts = 0;

  learningStats.algorithm.first.asked = 0;
  learningStats.algorithm.first.correct = 0;
  learningStats.algorithm.best.asked = 0;
  learningStats.algorithm.best.correct = 0;
  learningStats.algorithm.worst.asked = 0;
  learningStats.algorithm.worst.correct = 0;

  dashboardStats.bestStreak = 0;
  updateDashboardQuickStats();

  showTeacherDashboard();
}

function getPercent(correct, total) {
  if (total === 0) return 0;
  return Math.round((correct / total) * 100);
}

function buildInteractiveActionExplanation(level, selectedIndex, correctIndex, isTimeout) {
  const validIndices = level.blocks
    .map((value, index) => ({ value, index }))
    .filter(item => item.value >= level.process)
    .map(item => item.index);

  const selectedLabel = selectedIndex === null ? "no block" : `Block ${selectedIndex + 1}`;
  const correctLabel = correctIndex === -1 ? "no block" : `Block ${correctIndex + 1}`;

  if (validIndices.length === 0) {
    return `Explanation: No memory block can hold process ${level.process}, so no allocation is possible.`;
  }

  if (level.algorithm === "first") {
    if (isTimeout) {
      return `Explanation: First Fit checks blocks from left to right and picks the first one that fits. Here, ${correctLabel} is the first valid choice.`;
    }
    if (selectedIndex === correctIndex) {
      return `Explanation: First Fit always takes the first block that is large enough. You selected ${correctLabel}, so that is correct.`;
    }
    return `Explanation: In First Fit, ${selectedLabel} is not the first block that can fit process ${level.process}. The correct choice is ${correctLabel}.`;
  }

  if (level.algorithm === "best") {
    if (isTimeout) {
      return `Explanation: Best Fit chooses the smallest block that can still fit the process. Here, ${correctLabel} leaves the least unused space.`;
    }
    if (selectedIndex === correctIndex) {
      return `Explanation: Best Fit picks the tightest valid block to reduce waste. ${correctLabel} is the best match for process ${level.process}.`;
    }
    if (selectedIndex !== null && level.blocks[selectedIndex] < level.process) {
      return `Explanation: ${selectedLabel} is too small for process ${level.process}. Best Fit must choose a block that fits, and the tightest one is ${correctLabel}.`;
    }
    return `Explanation: ${selectedLabel} can fit, but Best Fit chooses the smallest valid block. Here that is ${correctLabel}.`;
  }

  if (isTimeout) {
    return `Explanation: Worst Fit picks the largest block among all valid options. Here, ${correctLabel} is the largest block that can hold process ${level.process}.`;
  }
  if (selectedIndex === correctIndex) {
    return `Explanation: Worst Fit keeps smaller blocks free by selecting the largest valid block. You correctly chose ${correctLabel}.`;
  }
  if (selectedIndex !== null && level.blocks[selectedIndex] < level.process) {
    return `Explanation: ${selectedLabel} cannot hold process ${level.process}. Worst Fit must pick the largest valid block, which is ${correctLabel}.`;
  }
  return `Explanation: ${selectedLabel} is valid, but not the largest valid block. Worst Fit requires choosing ${correctLabel}.`;
}

function renderHomeWelcome() {
  const content = document.getElementById("content");
  if (!content) return;

  content.innerHTML = `
    <div class="welcome-panel">
      <article class="welcome-note">
        <h3>Start With Learn</h3>
        <p>Build intuition using guided examples for First Fit, Best Fit, and Worst Fit.</p>
      </article>
      <article class="welcome-note">
        <h3>Then Move to Practice</h3>
        <p>Use Simulation for custom inputs, then test speed and accuracy in Game mode.</p>
      </article>
    </div>
  `;

  applyContentTransition();
}

function updateQuickLab() {
  const slider = document.getElementById("quickProcess");
  const valueNode = document.getElementById("quickProcessValue");
  const memoryNode = document.getElementById("quickMemory");

  if (!slider || !valueNode || !memoryNode) return;

  const process = Number(slider.value);
  valueNode.textContent = process;

  const first = findTargetBlockIndex(quickLabBlocks, process, "first");
  const best = findTargetBlockIndex(quickLabBlocks, process, "best");
  const worst = findTargetBlockIndex(quickLabBlocks, process, "worst");

  document.getElementById("quickFirstFit").textContent = first === -1 ? "No fit" : `Block ${first + 1}`;
  document.getElementById("quickBestFit").textContent = best === -1 ? "No fit" : `Block ${best + 1}`;
  document.getElementById("quickWorstFit").textContent = worst === -1 ? "No fit" : `Block ${worst + 1}`;

  memoryNode.innerHTML = quickLabBlocks
    .map((size, index) => {
      const active = index === first || index === best || index === worst;
      const height = Math.max(56, Math.round((size / 520) * 118));
      return `<div class="quick-memory-block ${active ? "active" : ""}" style="height:${height}px">${size}</div>`;
    })
    .join("");
}

function initQuickLab() {
  const slider = document.getElementById("quickProcess");
  if (!slider) return;

  slider.addEventListener("input", updateQuickLab);
  updateQuickLab();
}

document.addEventListener("DOMContentLoaded", () => {
  const isHomePage = Boolean(document.querySelector(".dashboard-shell"));
  if (isHomePage) {
    renderHomeWelcome();
    initQuickLab();
    updateDashboardQuickStats();
    setActiveDashboardCard("");
    return;
  }

  updateDashboardQuickStats();
});

// Expose actions used by inline onclick attributes so all buttons stay functional.
Object.assign(window, {
  showSection,
  openFeaturePage,
  runSimulation,
  runComparisonMode,
  startInteractiveGame,
  handleBlockSelection,
  useInteractiveHint,
  toggleTimerPause,
  startQuizMode,
  checkQuizAnswer,
  showTeacherDashboard,
  resetLearningStats,
  showGameHub,
  toggleSound,
  dismissPerfectCelebration
});