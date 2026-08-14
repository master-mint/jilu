import { buildMonthCalendar, selectMonthDate, weekKeysForDate } from "./calendar-utils.mjs";
import {
  dailyReviewSeries,
  dailyProgress,
  estimateReviewSeconds,
  formatEstimatedDuration,
  rollingRetentionSeries,
  todayLearningCount,
  tomorrowReviewCount,
  companionDay
} from "./analytics-utils.mjs";

(function () {
  const { Icon, Store, FSRS } = window;
  const DAY_MS = 24 * 60 * 60 * 1000;
  const MINUTE_MS = 60 * 1000;
  const LIBRARY_PAGE_SIZE = 20;

  const state = {
    cards: [],
    reviews: [],
    settings: null,
    currentView: "dashboard",
    currentFilter: "all",
    search: "",
    libraryPage: 1,
    reviewSession: null,
    selectedImages: [],
    reminderTimer: null,
    notificationPermission: "default",
    dailyEncouragement: "",
    statsMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    selectedStatsDateKey: todayKey()
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function iconName(name) {
    return name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
  }

  function hydrateIcons(root = document) {
    $$("[data-icon]", root).forEach((element) => {
      if (element.dataset.iconBound) return;
      element.innerHTML = Icon.icon(iconName(element.dataset.icon));
      element.dataset.iconBound = "true";
    });
  }

  function todayKey(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function dateFromKey(key) {
    const [y, m, d] = key.split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  function isSameDay(a, b = Date.now()) {
    const da = new Date(a);
    const db = new Date(b);
    return (
      da.getFullYear() === db.getFullYear() &&
      da.getMonth() === db.getMonth() &&
      da.getDate() === db.getDate()
    );
  }

  function addDays(key, amount) {
    const date = dateFromKey(key);
    date.setDate(date.getDate() + amount);
    return todayKey(date);
  }

  function formatDate(timestamp) {
    if (!timestamp) return "尚未复习";
    return new Intl.DateTimeFormat("zh-CN", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(timestamp));
  }

  function formatInterval(days) {
    if (!Number.isFinite(days)) return "0 天";
    if (days < 1) {
      const hours = Math.max(1, Math.round(days * 24));
      return `${hours} 小时`;
    }
    return `${Math.round(days * 10) / 10} 天`;
  }

  function formatDue(timestamp) {
    const diff = timestamp - Date.now();
    if (diff <= 0) return "现在";
    if (diff < MINUTE_MS) return "1 分钟内";
    if (diff < 60 * MINUTE_MS) return `${Math.ceil(diff / MINUTE_MS)} 分钟后`;
    if (diff < DAY_MS) return `${Math.ceil(diff / (60 * MINUTE_MS))} 小时后`;
    return `${Math.round(diff / DAY_MS)} 天后`;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function showToast(message, type = "success") {
    const region = $("#toast-region");
    const toast = document.createElement("div");
    toast.className = `toast ${type === "error" ? "error" : ""}`;
    toast.innerHTML = `
      <span>${Icon.icon(type === "error" ? "alert" : "check")}</span>
      <span>${esc(message)}</span>
      <button type="button" aria-label="关闭">${Icon.icon("x")}</button>
    `;
    region.appendChild(toast);
    toast.querySelector("button").addEventListener("click", () => toast.remove());
    window.setTimeout(() => toast.remove(), 3600);
  }

  const KNOWLEDGE_SAMPLE = [
    ["海马体的主要作用是什么？", "海马体参与形成和巩固新的陈述性记忆，也与空间导航有关。"],
    ["睡眠为什么有助于记忆？", "睡眠会帮助大脑重新激活和巩固白天获得的信息，尤其有利于长期记忆稳定。"],
    ["运动后心率升高的直接原因是什么？", "运动时身体需要更多氧气和能量，心脏会加快泵血以提高血液循环。"],
    ["光合作用主要发生在植物细胞的哪里？", "主要发生在叶绿体中，植物利用光能把二氧化碳和水转化为有机物。"],
    ["DNA 的基本功能是什么？", "DNA 储存并传递遗传信息，指导生物体蛋白质的合成与性状表达。"],
    ["为什么天空通常呈蓝色？", "空气分子对短波长蓝光的瑞利散射更强，因此从各个方向进入眼睛的散射光偏蓝。"],
    ["维生素 C 的一个重要作用是什么？", "维生素 C 参与胶原蛋白合成，也是抗氧化剂，并能帮助非血红素铁吸收。"],
    ["人体最大的器官是什么？", "皮肤是人体最大的器官，承担屏障、感受、调节体温等功能。"],
    ["什么是惯性？", "惯性是物体保持原有静止或匀速直线运动状态的性质。"],
    ["海水为什么是咸的？", "岩石风化释放的盐类随河流进入海洋，水蒸发后盐分留下并长期累积。"],
    ["血红蛋白的主要作用是什么？", "血红蛋白在红细胞中结合并运输氧气，同时参与部分二氧化碳运输。"],
    ["为什么需要接种疫苗？", "疫苗让免疫系统提前认识病原体特征，降低之后感染时发生重症的风险。"],
    ["地球自转带来什么现象？", "地球自转造成昼夜交替，并使不同经度地区出现时区差异。"],
    ["什么是机会成本？", "选择一个方案时放弃的最佳替代方案的价值，称为机会成本。"],
    ["珊瑚为什么会白化？", "高温等压力会使珊瑚失去共生藻类，因而失去颜色和重要能量来源。"],
    ["抗生素对病毒有效吗？", "通常无效。抗生素针对细菌，病毒感染需要依靠免疫系统或特定抗病毒药物。"]
  ];

  const ENCOURAGEMENTS = [
    "今天的记忆，已经比昨天更扎实。",
    "每一次回想，都是在加深一条路径。",
    "你完成的这一轮，会在需要时帮到你。",
    "节奏已经建立，明天继续就好。",
    "小小的复习，正在变成长期的掌握。",
    "今天的专注值得被记住。",
    "你已经为未来的自己省下了时间。",
    "学习不必冲刺，稳定前进就很有效。",
    "这一页完成了，知识正在留下来。",
    "今天到这里，做得很稳。"
  ];

  function sampleTimestamp(dayOffset, hour) {
    const date = new Date();
    date.setDate(date.getDate() + dayOffset);
    date.setHours(hour, 0, 0, 0);
    return date.getTime();
  }

  async function seedKnowledgeData({ allowExisting = false } = {}) {
    const [existingCards, settings] = await Promise.all([Store.getAllCards(), Store.getSettings()]);
    if (settings.sampleKnowledgeSeeded || (!allowExisting && existingCards.length)) return false;

    const seedCards = KNOWLEDGE_SAMPLE.map(([title, content], index) => {
      const card = Store.createCard({ title, content, kind: "text" });
      card.createdAt = sampleTimestamp(-31 + (index % 5), 8 + (index % 4));
      card.updatedAt = card.createdAt;
      card.tags = ["常识练习集"];
      return card;
    });
    const reviews = [];

    seedCards.forEach((card, index) => {
      if (index >= 13) return;
      let cardState = FSRS.createInitialState();
      const reviewCount = 4 + (index % 3);
      for (let round = 0; round < reviewCount; round += 1) {
        const dayOffset = -29 + round * 5 + ((index + round * 2) % 4);
        const timestamp = sampleTimestamp(dayOffset, 8 + ((index * 3 + round * 2) % 11));
        const rating = [3, 4, 2, 3, 4, 3][(index + round) % 6];
        cardState = FSRS.schedule(cardState, rating, timestamp, settings.desiredRetention);
        const ratingKey = ["", "again", "hard", "good", "easy"][rating];
        card.ratingTotals[ratingKey] = (card.ratingTotals[ratingKey] || 0) + 1;
        reviews.push({
          cardId: card.id,
          rating,
          timestamp,
          stability: cardState.stability,
          difficulty: cardState.difficulty,
          intervalDays: cardState.intervalDays,
          elapsedDays: cardState.elapsedDays,
          wasNew: round === 0
        });
      }
      card.state = cardState;
      card.reviewCount = reviewCount;
    });

    seedCards.forEach((card, index) => {
      if (index < 4) card.state.due = Date.now() - (index + 1) * 60 * MINUTE_MS;
      else if (index < 10) card.state.due = sampleTimestamp(1, 8 + index);
      else if (index < 13) card.state.due = sampleTimestamp(2, 9 + index);
    });

    await Store.putCards(seedCards);
    for (const review of reviews) await Store.addReview(review);
    await Store.saveSettings({ sampleKnowledgeSeeded: true });
    return true;
  }

  async function loadData() {
    const seeded = await seedKnowledgeData();
    const [cards, reviews, settings] = await Promise.all([
      Store.getAllCards(),
      Store.getReviews(),
      Store.getSettings()
    ]);
    state.cards = cards;
    state.reviews = reviews;
    state.settings = settings.startedAt ? settings : await Store.saveSettings({ startedAt: Date.now() });
    applyTheme(state.settings.theme);
    renderAll();
    setupReminder();
    if (seeded) showToast("已载入常识练习集，可直接开始测试。");
  }

  async function saveCard(card) {
    await Store.putCard(card);
    await refreshCards();
  }

  async function refreshCards() {
    state.cards = await Store.getAllCards();
  }

  function renderAll() {
    hydrateIcons();
    renderWorkspaceStatus();
    renderDashboard();
    renderLibrary();
    renderStats();
    renderAnalysis();
    renderSettings();
    updateReminderButton();
  }

  function renderWorkspaceStatus() {
    if (!state.settings) return;
    const days = companionDay(state.settings.startedAt);
    $("#workspace-greeting").textContent = "你好";
    $("#workspace-companion-days").textContent = `今天是你与记律同行的第 ${days} 天`;
  }

  function switchView(view) {
    state.currentView = view;
    $$("[data-view-panel]").forEach((panel) => {
      panel.classList.toggle("is-active", panel.dataset.viewPanel === view);
    });
    $$("[data-view]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.view === view);
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function applyTheme(theme) {
    const resolved = theme === "dark" ? "dark" : "light";
    document.documentElement.dataset.theme = resolved;
    document.documentElement.style.colorScheme = resolved;
    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) {
      themeColor.content = resolved === "dark" ? "#151515" : "#16372c";
    }
    const themeIcon = $("#theme-toggle [data-icon]");
    if (themeIcon) {
      themeIcon.innerHTML = Icon.icon(resolved === "dark" ? "sun" : "moon");
      themeIcon.dataset.iconBound = "true";
    }
  }

  function activeUnarchivedCards() {
    return state.cards.filter((card) => !card.archived);
  }

  function reviewsOnDay(key) {
    return state.reviews.filter((review) => todayKey(new Date(review.timestamp)) === key);
  }

  function reviewsToday() {
    return reviewsOnDay(todayKey());
  }

  function newCardsLearnedToday() {
    return reviewsToday().filter((review) => review.wasNew).length;
  }

  function getDueCards() {
    const now = Date.now();
    return activeUnarchivedCards()
      .filter((card) => card.state.reps > 0 && card.state.due <= now)
      .sort((a, b) => a.state.due - b.state.due);
  }

  function getNewCards() {
    return activeUnarchivedCards()
      .filter((card) => card.state.reps === 0)
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  function cardMastery(card) {
    return FSRS.mastery(card.state);
  }

  function averageMastery() {
    const cards = activeUnarchivedCards();
    if (!cards.length) return 0;
    return Math.round(cards.reduce((sum, card) => sum + cardMastery(card), 0) / cards.length);
  }

  function computeStreak() {
    if (!state.reviews.length) return 0;
    const reviewDays = new Set(state.reviews.map((review) => todayKey(new Date(review.timestamp))));
    let cursor = todayKey();
    if (!reviewDays.has(cursor)) {
      cursor = addDays(cursor, -1);
    }
    let streak = 0;
    while (reviewDays.has(cursor)) {
      streak += 1;
      cursor = addDays(cursor, -1);
    }
    return streak;
  }

  function renderDashboard() {
    const due = getDueCards();
    const newCards = getNewCards();
    const newToday = newCardsLearnedToday();
    const dailyNew = state.settings.dailyNewCards || 0;
    const availableNew = Math.max(0, dailyNew - newToday);
    const remainingTasks = Math.min(state.settings.maxReviewsPerDay, due.length + Math.min(newCards.length, availableNew));
    const learnedToday = todayLearningCount(state.reviews);
    const normalizedProgress = clamp(dailyProgress(learnedToday, remainingTasks), 0, 100);

    const focusTitle = $("#focus-title");
    const focusSubtitle = $("#focus-subtitle");
    if (remainingTasks === 0 && learnedToday > 0) {
      if (!state.dailyEncouragement) {
        state.dailyEncouragement = ENCOURAGEMENTS[Math.floor(Math.random() * ENCOURAGEMENTS.length)];
      }
      focusTitle.textContent = state.dailyEncouragement;
      focusSubtitle.textContent = `今天已完成 ${learnedToday} 张卡片的学习。`;
      $("#start-review-button").disabled = true;
    } else if (remainingTasks === 0) {
      focusTitle.textContent = "准备好开始了吗？";
      focusSubtitle.textContent = "先添加一张卡片，系统会帮你安排节奏。";
      $("#start-review-button").disabled = true;
    } else if (due.length > 0) {
      focusTitle.textContent = `还有 ${due.length} 张卡片等你复习`;
      focusSubtitle.textContent = `今天还有 ${Math.min(newCards.length, availableNew)} 张新卡片可学习。`;
      $("#start-review-button").disabled = false;
    } else {
      focusTitle.textContent = "今天适合学点新的";
      focusSubtitle.textContent = `还有 ${Math.min(newCards.length, availableNew)} 张新卡片可以开始。`;
      $("#start-review-button").disabled = false;
    }

    $("#today-progress-value").textContent = `${normalizedProgress}%`;
    const ring = $(".ring-value");
    if (ring) {
      const circumference = 314;
      ring.style.strokeDashoffset = String(
        circumference - (circumference * normalizedProgress) / 100
      );
    }

    $("#due-count").textContent = String(due.length);
    $("#new-count").textContent = String(Math.min(newCards.length, availableNew));
    $("#today-completed-count").textContent = `${normalizedProgress}%`;
    $("#today-review-count").textContent = String(learnedToday);

    renderUpcomingList(due, newCards, availableNew);
  }

  function renderUpcomingList(due, newCards, availableNew) {
    const container = $("#upcoming-list");
    const upcoming = [
      ...due.slice(0, 5).map((card) => ({ card, label: "复习" })),
      ...newCards.slice(0, Math.min(availableNew, Math.max(0, 5 - due.length))).map((card) => ({ card, label: "新学" }))
    ];

    if (!upcoming.length) {
      container.className = "card-list empty-hint";
      container.textContent = "暂无需要复习的卡片。";
      return;
    }

    container.className = "card-list";
    container.innerHTML = upcoming
      .map(({ card, label }) => {
        const mastery = cardMastery(card);
        const thumb = card.image
          ? `<img src="${card.image.dataUrl}" alt="" />`
          : Icon.icon(card.kind === "image" ? "image" : "type");
        return `
          <div class="upcoming-item">
            <div class="upcoming-thumb">${thumb}</div>
            <div>
              <div class="upcoming-title">${esc(card.title || "未命名卡片")}</div>
              <div class="upcoming-meta">${label} · ${esc(card.content ? card.content.slice(0, 28) : "图片卡片")}</div>
            </div>
            <div class="upcoming-progress">
              <strong>${mastery}%</strong>
              <div class="progress-track"><span class="progress-fill" style="width:${mastery}%"></span></div>
            </div>
          </div>
        `;
      })
      .join("");
  }

  function renderWeekChart() {
    const container = $("#week-chart");
    const days = weekKeysForDate(state.selectedStatsDateKey);
    const max = Math.max(
      1,
      ...days.map((key) => reviewsOnDay(key).length)
    );

    const firstDate = dateFromKey(days[0]);
    const lastDate = dateFromKey(days.at(-1));
    $("#week-range-label").textContent = `${firstDate.getMonth() + 1}.${firstDate.getDate()} - ${lastDate.getMonth() + 1}.${lastDate.getDate()}`;

    container.innerHTML = days
      .map((key) => {
        const count = reviewsOnDay(key).length;
        const height = Math.max(4, Math.round((count / max) * 100));
        const date = dateFromKey(key);
        const label = new Intl.DateTimeFormat("zh-CN", { weekday: "short" }).format(date);
        return `
          <div class="week-bar">
            <div class="week-bar-track" title="${count} 次复习">
              <span class="week-bar-fill" style="height:${count ? height : 4}%"></span>
            </div>
            <div class="week-bar-label">${label}</div>
          </div>
        `;
      })
      .join("");
  }

  function renderLibrary() {
    const now = Date.now();
    const query = state.search.trim().toLowerCase();
    const summary = $("#library-summary");
    const grid = $("#library-grid");
    const pagination = $("#library-pagination");
    const total = activeUnarchivedCards().length;
    summary.textContent = `${total} 张卡片 · 平均掌握度 ${averageMastery()}%`;

    const filtered = activeUnarchivedCards().filter((card) => {
      const matchesSearch =
        !query ||
        card.title.toLowerCase().includes(query) ||
        card.content.toLowerCase().includes(query);
      if (!matchesSearch) return false;

      if (state.currentFilter === "new") return card.state.reps === 0;
      if (state.currentFilter === "due") {
        return card.state.reps > 0 && card.state.due <= now;
      }
      if (state.currentFilter === "mastered") return cardMastery(card) >= 80;
      return true;
    });

    if (!filtered.length) {
      grid.className = "library-grid empty-hint";
      grid.textContent = query ? "没有找到匹配的卡片。" : "还没有卡片，先添加第一张。";
      pagination.hidden = true;
      pagination.innerHTML = "";
      return;
    }

    const pageCount = Math.max(1, Math.ceil(filtered.length / LIBRARY_PAGE_SIZE));
    state.libraryPage = Math.min(state.libraryPage, pageCount);
    const pageStart = (state.libraryPage - 1) * LIBRARY_PAGE_SIZE;
    const pageCards = filtered.slice(pageStart, pageStart + LIBRARY_PAGE_SIZE);

    grid.className = "library-grid";
    grid.innerHTML = pageCards
      .map((card) => {
        const mastery = cardMastery(card);
        const isNew = card.state.reps === 0;
        const dueText = isNew ? "新学" : card.state.due <= now ? "待复习" : formatDue(card.state.due);
        const media = card.image
          ? `<img src="${card.image.dataUrl}" alt="${esc(card.title || "学习图片")}" />`
          : "";
        const type = card.image ? (card.image.placement === "back" ? "答案图片" : "提示图片") : "文字卡片";
        return `
          <article class="library-card" data-card-id="${card.id}">
            <div class="library-card-media">
              ${media}
              <span class="library-card-type">${Icon.icon(card.image ? "image" : "type")}${type}</span>
            </div>
            <div class="library-card-body">
              <h3 class="library-card-title">${esc(card.title || "未命名卡片")}</h3>
              <p class="library-card-content">${esc(card.content || "图片学习内容")}</p>
            </div>
            <div class="library-card-progress">
              <div class="progress-copy">
                <span>${dueText}</span>
                <strong>${mastery}%</strong>
              </div>
              <div class="progress-track"><span class="progress-fill" style="width:${mastery}%"></span></div>
            </div>
            <div class="library-card-actions">
              <button class="card-action" type="button" data-edit-card="${card.id}" aria-label="编辑卡片" title="编辑">${Icon.icon("edit")}</button>
              <button class="card-action danger" type="button" data-delete-card="${card.id}" aria-label="删除卡片" title="删除">${Icon.icon("trash")}</button>
            </div>
          </article>
        `;
      })
      .join("");

    pagination.hidden = pageCount <= 1;
    pagination.innerHTML = pageCount > 1
      ? `
        <button class="library-pagination-button" type="button" data-library-page="${state.libraryPage - 1}" aria-label="上一页" ${state.libraryPage === 1 ? "disabled" : ""}>
          ${Icon.icon("chevron-left")}
        </button>
        <span class="library-pagination-status" aria-live="polite">第 ${state.libraryPage} / ${pageCount} 页</span>
        <button class="library-pagination-button" type="button" data-library-page="${state.libraryPage + 1}" aria-label="下一页" ${state.libraryPage === pageCount ? "disabled" : ""}>
          ${Icon.icon("chevron-right")}
        </button>
      `
      : "";
  }

  function renderStats() {
    const totalReviews = state.reviews.length;
    const success = state.reviews.filter((review) => review.rating >= 3).length;
    const retention = totalReviews ? Math.round((success / totalReviews) * 100) : 0;
    $("#total-reviews").textContent = String(totalReviews);
    $("#retention-rate").textContent = `${retention}%`;
    $("#stats-mastery").textContent = `${averageMastery()}%`;
    renderMonthCalendar();
    renderSelectedDayDetails();
    renderWeekChart();
    renderRatingBars();
  }

  function shortDateLabel(key) {
    const date = dateFromKey(key);
    return `${date.getMonth() + 1}.${date.getDate()}`;
  }

  function chartLabels(series, base, left, right) {
    const middle = series[Math.floor(series.length / 2)];
    const last = series.at(-1);
    return `
      <text class="chart-axis-label" x="${left}" y="${base + 20}">${shortDateLabel(series[0].key)}</text>
      <text class="chart-axis-label" x="210" y="${base + 20}" text-anchor="middle">${shortDateLabel(middle.key)}</text>
      <text class="chart-axis-label" x="${right}" y="${base + 20}" text-anchor="end">${shortDateLabel(last.key)}</text>
      <text class="chart-axis-title" x="210" y="${base + 40}" text-anchor="middle">日期</text>
    `;
  }

  function smoothChartPath(series, x, y) {
    const points = series.map((item, index) => ({ x: x(index), y: y(item.value) }));
    if (!points.length) return "";
    if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
    let path = `M ${points[0].x} ${points[0].y}`;
    for (let index = 0; index < points.length - 1; index += 1) {
      const previous = points[index - 1] || points[index];
      const current = points[index];
      const next = points[index + 1];
      const after = points[index + 2] || next;
      path += ` C ${current.x + (next.x - previous.x) / 6} ${current.y + (next.y - previous.y) / 6} ${next.x - (after.x - current.x) / 6} ${next.y - (after.y - current.y) / 6} ${next.x} ${next.y}`;
    }
    return path;
  }

  function renderHairlineLineChart(container, series) {
    const width = 420;
    const left = 46;
    const right = 392;
    const top = 32;
    const base = 166;
    const max = Math.max(1, ...series.map((item) => item.value));
    const x = (index) => left + (series.length === 1 ? 0 : (index * (right - left)) / (series.length - 1));
    const y = (value) => base - ((base - top) * value) / max;
    const path = smoothChartPath(series, x, y);

    container.innerHTML = `
      <svg viewBox="0 0 ${width} 220" role="img" aria-label="近三十天每日复习次数，横轴为日期，纵轴为当天完成的复习次数">
        <line class="chart-axis" x1="${left}" y1="${top}" x2="${left}" y2="${base}"></line>
        <line class="chart-baseline" x1="${left}" y1="${base}" x2="${right}" y2="${base}"></line>
        <text class="chart-axis-value" x="${left - 8}" y="${top + 4}" text-anchor="end">${max} 次</text>
        <text class="chart-axis-value" x="${left - 8}" y="${base + 3}" text-anchor="end">0</text>
        <text class="chart-axis-title" transform="translate(14 100) rotate(-90)" text-anchor="middle">复习次数</text>
        <path class="chart-hairline" d="${path}"></path>
        ${series.map((item, index) => `<circle class="chart-hover-target" cx="${x(index)}" cy="${y(item.value)}" r="10"><title>${shortDateLabel(item.key)}：${item.value} 次复习</title></circle>`).join("")}
        ${chartLabels(series, base, left, right)}
      </svg>
    `;
  }

  function renderHairlineAreaChart(container, series) {
    const left = 46;
    const right = 392;
    const top = 32;
    const base = 166;
    const x = (index) => left + (series.length === 1 ? 0 : (index * (right - left)) / (series.length - 1));
    const y = (value) => base - ((base - top) * value) / 100;
    const path = smoothChartPath(series, x, y);

    container.innerHTML = `
      <svg viewBox="0 0 420 220" role="img" aria-label="滚动七天记忆留存率，横轴为日期，纵轴为七天滚动留存率">
        <line class="chart-axis" x1="${left}" y1="${top}" x2="${left}" y2="${base}"></line>
        <line class="chart-baseline" x1="${left}" y1="${base}" x2="${right}" y2="${base}"></line>
        <text class="chart-axis-value" x="${left - 8}" y="${top + 4}" text-anchor="end">100%</text>
        <text class="chart-axis-value" x="${left - 8}" y="${base + 3}" text-anchor="end">0%</text>
        <text class="chart-axis-title" transform="translate(14 100) rotate(-90)" text-anchor="middle">留存率（%）</text>
        <path class="chart-area-fill" d="${path} L ${right} ${base} L ${left} ${base} Z"></path>
        <path class="chart-hairline" d="${path}"></path>
        ${series.map((item, index) => `<circle class="chart-hover-target" cx="${x(index)}" cy="${y(item.value)}" r="10"><title>${shortDateLabel(item.key)}：${item.value}%</title></circle>`).join("")}
        ${chartLabels(series, base, left, right)}
      </svg>
    `;
  }

  function renderForecastCards(container, count, duration) {
    const visibleCards = Math.max(1, Math.min(10, count));
    container.innerHTML = `
      <svg viewBox="0 0 420 230" role="img" aria-label="预计明日复习量">
        <text class="forecast-total" x="42" y="94">${count}</text>
        <text class="forecast-caption" x="44" y="128">张待复习卡片</text>
        <text class="forecast-duration" x="44" y="155">预计 ${duration}</text>
        ${Array.from({ length: visibleCards }, (_, index) => {
          const offset = index * 6;
          return `<rect class="forecast-card${count ? " is-active" : " is-empty"}" x="238" y="${43 + offset}" width="118" height="76" rx="3"></rect>`;
        }).join("")}
        <rect class="forecast-card-detail" x="${238 + (visibleCards - 1) * 6}" y="${43 + (visibleCards - 1) * 6}" width="118" height="76" rx="3"></rect>
        <line class="forecast-card-line" x1="${258 + (visibleCards - 1) * 6}" y1="${71 + (visibleCards - 1) * 6}" x2="${328 + (visibleCards - 1) * 6}" y2="${71 + (visibleCards - 1) * 6}"></line>
        <line class="forecast-card-line short" x1="${258 + (visibleCards - 1) * 6}" y1="${87 + (visibleCards - 1) * 6}" x2="${308 + (visibleCards - 1) * 6}" y2="${87 + (visibleCards - 1) * 6}"></line>
      </svg>
    `;
  }

  function renderAnalysis() {
    const endKey = todayKey();
    const volume = dailyReviewSeries(state.reviews, endKey, 30);
    const retention = rollingRetentionSeries(state.reviews, endKey, 30, 7);
    const tomorrowCount = tomorrowReviewCount(activeUnarchivedCards());
    const seconds = estimateReviewSeconds(tomorrowCount);
    const total = volume.reduce((sum, item) => sum + item.value, 0);

    $("#tomorrow-review-count").textContent = String(tomorrowCount);
    $("#tomorrow-review-time").textContent = formatEstimatedDuration(seconds);
    $("#analysis-volume-note").textContent = `共 ${total} 次`;
    $("#analysis-retention-note").textContent = `${retention.at(-1).value}%`;
    $("#analysis-forecast-note").textContent = `预计 ${formatEstimatedDuration(seconds)} 学完`;
    renderHairlineLineChart($("#analysis-volume-chart"), volume);
    renderHairlineAreaChart($("#analysis-retention-chart"), retention);
    renderForecastCards($("#analysis-forecast-chart"), tomorrowCount, formatEstimatedDuration(seconds));
  }

  function reviewedDateKeys() {
    return state.reviews.map((review) => todayKey(new Date(review.timestamp)));
  }

  function dateLabel(key, options = { month: "long", day: "numeric", weekday: "long" }) {
    return new Intl.DateTimeFormat("zh-CN", options).format(dateFromKey(key));
  }

  function reviewCountByDate() {
    return state.reviews.reduce((counts, review) => {
      const key = todayKey(new Date(review.timestamp));
      counts.set(key, (counts.get(key) || 0) + 1);
      return counts;
    }, new Map());
  }

  function reviewLevel(count, max) {
    if (!count) return 0;
    if (count < max * 0.34) return 1;
    if (count < max * 0.68) return 2;
    return 3;
  }

  function renderMonthCalendar() {
    const container = $("#stats-calendar");
    const calendar = buildMonthCalendar(state.statsMonth);
    const counts = reviewCountByDate();
    const monthCounts = calendar.cells.filter(Boolean).map((cell) => counts.get(cell.key) || 0);
    const max = Math.max(1, ...monthCounts);
    $("#calendar-month-label").textContent = new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "long"
    }).format(calendar.month);

    container.innerHTML = calendar.cells
      .map((cell) => {
        if (!cell) return '<span class="calendar-day calendar-day-empty" aria-hidden="true"></span>';
        const count = counts.get(cell.key) || 0;
        const selected = cell.key === state.selectedStatsDateKey;
        const isToday = cell.key === todayKey();
        const label = `${dateLabel(cell.key)}，${count} 次复习`;
        return `
          <button class="calendar-day${selected ? " is-selected" : ""}${isToday ? " is-today" : ""}" type="button" role="gridcell" data-calendar-day="${cell.key}" data-level="${reviewLevel(count, max)}" aria-label="${label}" aria-pressed="${selected}">
            <span class="calendar-day-number">${cell.day}</span>
            <span class="calendar-day-count">${count ? `${count} 次` : "-"}</span>
          </button>
        `;
      })
      .join("");
  }

  function renderSelectedDayDetails() {
    const container = $("#selected-day-details");
    const reviews = reviewsOnDay(state.selectedStatsDateKey).sort((a, b) => a.timestamp - b.timestamp);
    const ratingLabels = ["", "忘记", "模糊", "记得", "轻松"];
    const dayTitle = dateLabel(state.selectedStatsDateKey);

    if (!reviews.length) {
      container.innerHTML = `
        <div class="selected-day-heading">
          <p class="eyebrow">${dayTitle}</p>
          <h3>当天没有复习记录</h3>
        </div>
        <p class="selected-day-empty">选择其他日期查看复习记录。</p>
      `;
      return;
    }

    container.innerHTML = `
      <div class="selected-day-heading">
        <p class="eyebrow">${dayTitle}</p>
        <h3>${reviews.length} 次复习</h3>
      </div>
      <ol class="review-detail-list">
        ${reviews
          .map((review) => {
            const card = state.cards.find((item) => item.id === review.cardId);
            const title = card ? card.title || "未命名卡片" : "已删除卡片";
            const time = new Intl.DateTimeFormat("zh-CN", {
              hour: "2-digit",
              minute: "2-digit",
              hour12: false
            }).format(new Date(review.timestamp));
            const detail = card
              ? `
                <button class="review-detail-button" type="button" data-review-card="${card.id}" aria-label="查看：${esc(title)}">
                  <time datetime="${new Date(review.timestamp).toISOString()}">${time}</time>
                  <span class="review-detail-title">${esc(title)}</span>
                  <span class="review-rating">${ratingLabels[review.rating] || "未评分"}</span>
                </button>
              `
              : `
                <span class="review-detail-static">
                  <time datetime="${new Date(review.timestamp).toISOString()}">${time}</time>
                  <span class="review-detail-title">${esc(title)}</span>
                  <span class="review-rating">${ratingLabels[review.rating] || "未评分"}</span>
                </span>
              `;
            return `
              <li class="review-detail-item">
                ${detail}
              </li>
            `;
          })
          .join("")}
      </ol>
    `;
  }

  function openReviewPreview(card) {
    if (!card) return;
    const dialog = $("#review-preview-dialog");
    const title = card.title || "未命名卡片";
    const frontImage =
      card.image && card.image.placement === "front"
        ? `<img src="${card.image.dataUrl}" alt="问题图片" />`
        : "";
    const backImage =
      card.image && card.image.placement === "back"
        ? `<img src="${card.image.dataUrl}" alt="答案图片" />`
        : "";

    $("#review-preview-title").textContent = title;
    $("#review-preview-question").innerHTML = `
      <p>${esc(title)}</p>
      ${frontImage}
    `;
    $("#review-preview-answer").innerHTML = `
      ${card.content ? `<p>${esc(card.content)}</p>` : ""}
      ${backImage}
      ${!card.content && !backImage ? "<p>这张卡片没有保存答案。</p>" : ""}
    `;
    dialog.showModal();
    window.setTimeout(() => $("#close-review-preview").focus(), 50);
  }

  function closeReviewPreview() {
    const dialog = $("#review-preview-dialog");
    if (dialog.open) dialog.close();
  }

  function setStatsMonth(month) {
    state.statsMonth = new Date(month.getFullYear(), month.getMonth(), 1);
    state.selectedStatsDateKey = selectMonthDate(state.statsMonth, reviewedDateKeys());
    renderStats();
  }

  function renderRatingBars() {
    const container = $("#rating-bars");
    const labels = ["忘记", "模糊", "记得", "轻松"];
    const ratings = [1, 2, 3, 4];
    const totals = ratings.map((rating) =>
      state.reviews.filter((review) => review.rating === rating).length
    );
    const max = Math.max(1, ...totals);
    container.innerHTML = ratings
      .map((rating, index) => {
        const count = totals[index];
        const width = Math.round((count / max) * 100);
        return `
          <div class="rating-row">
            <span class="rating-name">${labels[index]}</span>
            <div class="rating-track"><span class="rating-fill" style="width:${width}%"></span></div>
            <span class="rating-value">${count}</span>
          </div>
        `;
      })
      .join("");
  }

  function renderSettings() {
    if (!state.settings) return;
    $("#daily-new-cards").value = state.settings.dailyNewCards;
    $("#max-reviews").value = state.settings.maxReviewsPerDay;
    $("#desired-retention").value = state.settings.desiredRetention;
    $("#desired-retention-value").textContent = `${Math.round(state.settings.desiredRetention * 100)}%`;
    $("#reminder-time").value = state.settings.reminderTime;
    const toggle = $("#notification-toggle");
    toggle.setAttribute("aria-checked", String(Boolean(state.settings.notificationsEnabled)));
  }

  function updateReminderButton() {
    const dot = $(".notification-dot");
    const due = getDueCards();
    dot.hidden = due.length === 0;
    if (due.length) {
      $("#reminder-button").setAttribute("data-tooltip", `${due.length} 张待复习`);
    }
  }

  function openCardDialog(card) {
    const dialog = $("#card-dialog");
    const form = $("#card-form");
    form.reset();
    state.selectedImages = [];
    $("#card-id").value = card ? card.id : "";
    $("#card-title").value = card ? card.title : "";
    $("#card-content").value = card ? card.content : "";
    $("#image-placement").value = card && card.image ? card.image.placement : "front";
    state.selectedImages = card && card.image ? [card.image] : [];
    $("#card-dialog-eyebrow").textContent = card ? "编辑卡片" : "新卡片";
    $("#card-dialog-title").textContent = card ? "编辑学习内容" : "添加学习内容";
    $("#save-card-label").textContent = card ? "保存修改" : "保存卡片";
    updateUploadPreview();
    dialog.showModal();
    window.setTimeout(() => $("#card-title").focus(), 50);
  }

  function updateUploadPreview() {
    const preview = $("#upload-preview");
    const actions = $("#upload-actions");
    const hasImage = state.selectedImages.length > 0;
    preview.classList.toggle("has-image", hasImage);
    actions.hidden = !hasImage;

    if (!hasImage) {
      preview.innerHTML = `
        <span class="upload-placeholder-icon">${Icon.icon("image")}</span>
        <strong>拖入图片，或点击选择</strong>
        <span>支持 JPG、PNG、WebP，多张图片会生成多张卡片</span>
      `;
      return;
    }

    const image = state.selectedImages[0];
    preview.innerHTML = `
      <img src="${image.dataUrl}" alt="预览图片" />
      <div>
        <strong>${esc(image.name)}</strong>
        <span>${state.selectedImages.length > 1 ? `共 ${state.selectedImages.length} 张图片` : `${Math.round(image.size / 1024)} KB`}</span>
      </div>
    `;
  }

  function readImageFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () =>
        resolve({
          dataUrl: reader.result,
          name: file.name,
          mimeType: file.type,
          size: file.size
        });
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  async function handleImageFiles(files) {
    const images = Array.from(files || []).filter((file) => file.type.startsWith("image/"));
    if (!images.length) return;
    try {
      state.selectedImages = await Promise.all(images.map(readImageFile));
      updateUploadPreview();
    } catch (error) {
      showToast("图片读取失败，请换一张图片。", "error");
    }
  }

  async function handleCardSubmit(event) {
    event.preventDefault();
    const id = $("#card-id").value;
    const title = $("#card-title").value.trim();
    const content = $("#card-content").value.trim();
    const placement = $("#image-placement").value;

    if (!title && !content && !state.selectedImages.length) {
      showToast("至少填写标题、答案或上传一张图片。", "error");
      return;
    }

    if (id) {
      const existing = await Store.getCard(id);
      if (!existing) {
        showToast("没有找到这张卡片。", "error");
        return;
      }
      const image = state.selectedImages[0]
        ? { ...state.selectedImages[0], placement }
        : existing.image
          ? { ...existing.image, placement }
          : null;
      await saveCard({
        ...existing,
        title,
        content,
        image,
        kind: image ? "image" : "text"
      });
      closeCardDialog();
      showToast("卡片已更新。");
      return;
    }

    const cardsToCreate = state.selectedImages.length
      ? state.selectedImages.map((image) =>
          Store.createCard({
            title,
            content,
            image: { ...image, placement },
            kind: "image"
          })
        )
      : [Store.createCard({ title, content, kind: "text" })];

    await Store.putCards(cardsToCreate);
    await refreshCards();
    closeCardDialog();
    renderAll();
    showToast(cardsToCreate.length > 1 ? `已添加 ${cardsToCreate.length} 张图片卡片。` : "卡片已添加。");
  }

  function closeCardDialog() {
    $("#card-dialog").close();
  }

  function buildReviewQueue() {
    const due = getDueCards();
    const newCards = getNewCards();
    const newToday = newCardsLearnedToday();
    const availableNew = Math.max(0, (state.settings.dailyNewCards || 0) - newToday);
    const limitedNew = newCards.slice(0, availableNew);
    const maxReviews = state.settings.maxReviewsPerDay || 100;
    const queue = [
      ...due.slice(0, maxReviews),
      ...limitedNew.slice(0, Math.max(0, maxReviews - due.length))
    ].map((card) => card.id);

    return queue;
  }

  function startReview() {
    const queue = buildReviewQueue();
    if (!queue.length) {
      showToast("现在没有需要复习的卡片。", "error");
      return;
    }

    state.reviewSession = {
      queue: [...queue],
      completed: 0,
      total: queue.length,
      currentId: null,
      revealed: false
    };

    const dialog = $("#review-dialog");
    dialog.showModal();
    renderReviewCard();
  }

  async function renderReviewCard() {
    const session = state.reviewSession;
    if (!session || !session.queue.length) {
      endReview();
      return;
    }

    const cardId = session.queue[0];
    const card = await Store.getCard(cardId);
    if (!card) {
      session.queue.shift();
      renderReviewCard();
      return;
    }

    session.currentId = cardId;
    session.revealed = false;
    $("#review-card").classList.remove("is-leaving");
    $("#review-actions").classList.remove("is-visible");
    $("#reveal-button").classList.remove("is-hidden");
    $("#reveal-hint").textContent = "准备好后显示答案";
    $("#review-card-type").textContent = card.state.reps === 0 ? "新卡片" : `已复习 ${card.state.reps} 次`;
    $("#review-card-progress").textContent = `掌握度 ${cardMastery(card)}%`;
    $("#review-count").textContent = `${session.completed + 1} / ${session.completed + session.queue.length}`;
    const progress = session.completed / (session.completed + session.queue.length) * 100;
    $("#review-progress-bar").style.width = `${progress}%`;

    const content = $("#review-card-content");
    const title = card.title ? `<h3>${esc(card.title)}</h3>` : "";
    const frontImage =
      card.image && card.image.placement === "front"
        ? `<img src="${card.image.dataUrl}" alt="学习图片" />`
        : "";
    content.innerHTML = `
      ${title}
      ${frontImage}
      ${!title && !frontImage ? `<h3>${esc(card.image ? "回忆下面这张图片" : "请回忆这张卡片")}</h3>` : ""}
    `;

    updateIntervalLabels(card);
  }

  function updateIntervalLabels(card) {
    const now = Date.now();
    const good = FSRS.schedule(card.state, 3, now, state.settings.desiredRetention);
    const easy = FSRS.schedule(card.state, 4, now, state.settings.desiredRetention);
    $("#good-interval").textContent = formatInterval(good.intervalDays);
    $("#easy-interval").textContent = formatInterval(easy.intervalDays);
  }

  function revealReviewCard() {
    const session = state.reviewSession;
    if (!session || !session.currentId) return;
    const card = state.cards.find((item) => item.id === session.currentId);
    if (!card) return;

    session.revealed = true;
    $("#review-actions").classList.add("is-visible");
    $("#reveal-button").classList.add("is-hidden");
    $("#reveal-hint").textContent = "根据你的记忆程度选择评分";

    const content = $("#review-card-content");
    const frontImage =
      card.image && card.image.placement === "front"
        ? `<img src="${card.image.dataUrl}" alt="学习图片" />`
        : "";
    const backImage =
      card.image && card.image.placement === "back"
        ? `<img src="${card.image.dataUrl}" alt="答案图片" />`
        : "";
    const title = card.title ? `<h3>${esc(card.title)}</h3>` : "";
    const text = card.content ? `<p>${esc(card.content)}</p>` : "";
    const emptyAnswer =
      !card.content && !backImage && card.image && card.image.placement !== "front"
        ? `<p>${esc("这张图片就是答案。")}</p>`
        : "";

    content.innerHTML = `
      ${title}
      ${frontImage}
      <div class="answer-content">
        ${text}
        ${backImage}
        ${emptyAnswer}
      </div>
    `;
  }

  async function handleRating(rating) {
    const session = state.reviewSession;
    if (!session || !session.currentId || !session.revealed) return;

    const card = state.cards.find((item) => item.id === session.currentId);
    if (!card) return;

    const now = Date.now();
    const newState = FSRS.schedule(
      card.state,
      rating,
      now,
      state.settings.desiredRetention
    );
    const updatedCard = {
      ...card,
      state: newState,
      reviewCount: card.reviewCount + 1,
      ratingTotals: {
        ...card.ratingTotals,
        [["", "again", "hard", "good", "easy"][rating]]:
          (card.ratingTotals[["", "again", "hard", "good", "easy"][rating]] || 0) + 1
      }
    };

    await Store.putCard(updatedCard);
    await Store.addReview({
      cardId: card.id,
      rating,
      timestamp: now,
      stability: newState.stability,
      difficulty: newState.difficulty,
      intervalDays: newState.intervalDays,
      elapsedDays: newState.elapsedDays,
      wasNew: card.state.reps === 0
    });

    state.cards = await Store.getAllCards();
    state.reviews = await Store.getReviews();
    session.queue.shift();
    session.completed += 1;

    if (rating === 1) {
      session.queue.push(card.id);
    }

    $("#review-card").classList.add("is-leaving");
    window.setTimeout(() => renderReviewCard(), 150);
  }

  function endReview() {
    if (!state.reviewSession) return;
    const completed = state.reviewSession.completed;
    state.reviewSession = null;
    const dialog = $("#review-dialog");
    if (dialog.open) dialog.close();
    renderAll();
    showToast(completed > 0 ? `本次复习完成，共 ${completed} 次。` : "复习结束。");
  }

  function closeReview() {
    if (state.reviewSession) {
      state.reviewSession = null;
    }
    const dialog = $("#review-dialog");
    if (dialog.open) dialog.close();
    renderAll();
  }

  function setupReminder() {
    if (state.reminderTimer) {
      window.clearTimeout(state.reminderTimer);
    }
    if (!state.settings || !state.settings.reminderTime) return;

    const [hours, minutes] = state.settings.reminderTime.split(":").map(Number);
    const now = new Date();
    const next = new Date(now);
    next.setHours(hours, minutes, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);

    const delay = next.getTime() - now.getTime();
    state.reminderTimer = window.setTimeout(async () => {
      const due = getDueCards();
      const message = due.length
        ? `今天有 ${due.length} 张卡片等待复习。`
        : "今天没有到期卡片，可以学点新的。";
      showToast(message);
      if (
        state.settings.notificationsEnabled &&
        "Notification" in window &&
        Notification.permission === "granted"
      ) {
        new Notification("记律 · 复习提醒", { body: message });
      }
      setupReminder();
    }, delay);
  }

  async function toggleNotifications(force) {
    const next = force ?? !state.settings.notificationsEnabled;
    if (!("Notification" in window)) {
      showToast("当前浏览器不支持系统通知。", "error");
      return;
    }
    if (next && Notification.permission === "default") {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        showToast("浏览器通知权限未开启。", "error");
        return;
      }
    }
    state.settings = await Store.saveSettings({ notificationsEnabled: next });
    renderSettings();
    showToast(next ? "提醒已开启。" : "提醒已关闭。");
  }

  async function testNotification() {
    if (!("Notification" in window)) {
      showToast("当前浏览器不支持系统通知。", "error");
      return;
    }
    if (Notification.permission !== "granted") {
      await toggleNotifications(true);
    }
    if (Notification.permission === "granted") {
      new Notification("记律 · 测试提醒", { body: "提醒功能工作正常。" });
      showToast("测试提醒已发送。");
    }
  }

  async function exportData() {
    try {
      const payload = await Store.exportData();
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json"
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const stamp = todayKey().replaceAll("-", "");
      a.href = url;
      a.download = `jilu-backup-${stamp}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast("备份已导出。");
    } catch (error) {
      showToast("导出失败。", "error");
    }
  }

  async function importData(file) {
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      await Store.importData(payload);
      await loadData();
      showToast("备份已导入。");
    } catch (error) {
      showToast("导入失败，请检查备份文件。", "error");
    }
  }

  async function deleteCard(id) {
    const card = state.cards.find((item) => item.id === id);
    if (!card) return;
    const confirmed = window.confirm(`确定删除「${card.title || "未命名卡片"}」吗？`);
    if (!confirmed) return;
    await Store.deleteCard(id);
    await loadData();
    showToast("卡片已删除。");
  }

  function bindEvents() {
    $$("[data-view]").forEach((button) => {
      button.addEventListener("click", () => switchView(button.dataset.view));
    });

    $("#add-card-button").addEventListener("click", () => openCardDialog());
    $("#quick-add-button").addEventListener("click", () => openCardDialog());
    $("#library-add-button").addEventListener("click", () => openCardDialog());
    $("#bottom-add-button").addEventListener("click", () => openCardDialog());
    $("#close-card-dialog").addEventListener("click", closeCardDialog);
    $("#cancel-card-dialog").addEventListener("click", closeCardDialog);
    $("#card-form").addEventListener("submit", handleCardSubmit);
    $("#image-input").addEventListener("change", (event) => handleImageFiles(event.target.files));
    $("#clear-image-button").addEventListener("click", () => {
      state.selectedImages = [];
      $("#image-input").value = "";
      updateUploadPreview();
    });

    const uploadZone = $("#upload-zone");
    uploadZone.addEventListener("click", () => $("#image-input").click());
    uploadZone.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        $("#image-input").click();
      }
    });
    uploadZone.addEventListener("dragover", (event) => {
      event.preventDefault();
      uploadZone.classList.add("is-dragging");
    });
    uploadZone.addEventListener("dragleave", () => uploadZone.classList.remove("is-dragging"));
    uploadZone.addEventListener("drop", (event) => {
      event.preventDefault();
      uploadZone.classList.remove("is-dragging");
      handleImageFiles(event.dataTransfer.files);
    });

    $("#start-review-button").addEventListener("click", startReview);
    $("#close-review-button").addEventListener("click", closeReview);
    $("#reveal-button").addEventListener("click", revealReviewCard);
    $$(".review-action").forEach((button) => {
      button.addEventListener("click", () => handleRating(Number(button.dataset.rating)));
    });

    $("#search-input").addEventListener("input", (event) => {
      state.search = event.target.value;
      state.libraryPage = 1;
      renderLibrary();
    });
    $$(".filter-tab").forEach((button) => {
      button.addEventListener("click", () => {
        state.currentFilter = button.dataset.filter;
        state.libraryPage = 1;
        $$(".filter-tab").forEach((tab) => tab.classList.toggle("is-active", tab === button));
        renderLibrary();
      });
    });

    $("#library-pagination").addEventListener("click", (event) => {
      const button = event.target.closest("[data-library-page]");
      if (!button || button.disabled) return;
      state.libraryPage = Number(button.dataset.libraryPage);
      renderLibrary();
      $("#library-grid").scrollIntoView({ block: "start", behavior: "smooth" });
    });

    $("#calendar-previous").addEventListener("click", () => {
      setStatsMonth(new Date(state.statsMonth.getFullYear(), state.statsMonth.getMonth() - 1, 1));
    });
    $("#calendar-next").addEventListener("click", () => {
      setStatsMonth(new Date(state.statsMonth.getFullYear(), state.statsMonth.getMonth() + 1, 1));
    });
    $("#calendar-current").addEventListener("click", () => setStatsMonth(new Date()));
    $("#stats-calendar").addEventListener("click", (event) => {
      const day = event.target.closest("[data-calendar-day]");
      if (!day) return;
      state.selectedStatsDateKey = day.dataset.calendarDay;
      renderStats();
    });
    $("#selected-day-details").addEventListener("click", (event) => {
      const reviewCard = event.target.closest("[data-review-card]");
      if (!reviewCard) return;
      openReviewPreview(state.cards.find((card) => card.id === reviewCard.dataset.reviewCard));
    });
    $("#close-review-preview").addEventListener("click", closeReviewPreview);

    $("#library-grid").addEventListener("click", async (event) => {
      const editButton = event.target.closest("[data-edit-card]");
      const deleteButton = event.target.closest("[data-delete-card]");
      if (editButton) {
        const card = await Store.getCard(editButton.dataset.editCard);
        if (card) openCardDialog(card);
        return;
      }
      if (deleteButton) {
        await deleteCard(deleteButton.dataset.deleteCard);
        return;
      }

      const cardElement = event.target.closest(".library-card");
      if (cardElement && cardElement.dataset.cardId) {
        const card = await Store.getCard(cardElement.dataset.cardId);
        if (card) openCardDialog(card);
      }
    });

    $("#desired-retention").addEventListener("input", (event) => {
      $("#desired-retention-value").textContent = `${Math.round(Number(event.target.value) * 100)}%`;
    });

    $("#notification-toggle").addEventListener("click", () => toggleNotifications());
    $("#test-notification-button").addEventListener("click", testNotification);
    $("#reminder-button").addEventListener("click", () => switchView("dashboard"));

    $("#theme-toggle").addEventListener("click", async () => {
      const next = state.settings.theme === "dark" ? "light" : "dark";
      state.settings = await Store.saveSettings({ theme: next });
      applyTheme(next);
    });

    $("#settings-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const patch = {
        dailyNewCards: clamp(Number($("#daily-new-cards").value) || 0, 0, 200),
        desiredRetention: clamp(Number($("#desired-retention").value) || 0.9, 0.75, 0.97),
        maxReviewsPerDay: clamp(Number($("#max-reviews").value) || 100, 10, 1000),
        reminderTime: $("#reminder-time").value || "20:00"
      };
      state.settings = await Store.saveSettings(patch);
      renderAll();
      setupReminder();
      showToast("设置已保存。");
    });

    $("#export-data-button").addEventListener("click", exportData);
    $("#import-data-button").addEventListener("click", () => $("#import-file-input").click());
    $("#seed-knowledge-data").addEventListener("click", async () => {
      const seeded = await seedKnowledgeData({ allowExisting: true });
      if (!seeded) {
        showToast("常识练习集已载入，无需重复添加。");
        return;
      }
      await loadData();
      switchView("analysis");
    });
    $("#import-file-input").addEventListener("change", (event) => {
      const file = event.target.files[0];
      if (file) importData(file);
      event.target.value = "";
    });

    $("#review-dialog").addEventListener("close", () => {
      if (state.reviewSession) {
        state.reviewSession = null;
        renderAll();
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && $("#card-dialog").open) {
        closeCardDialog();
      }
    });

    window.addEventListener("beforeunload", () => {
      if (state.reminderTimer) window.clearTimeout(state.reminderTimer);
    });
  }

  async function init() {
    bindEvents();
    hydrateIcons();
    try {
      await loadData();
    } catch (error) {
      console.error(error);
      showToast("本地数据初始化失败，请刷新页面。", "error");
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
