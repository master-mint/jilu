import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");
const app = await readFile(new URL("../js/app.js", import.meta.url), "utf8");

test("keeps runtime hooks while adding the workspace shell", () => {
  for (const hook of ["main-content", "rating-bars", "theme-toggle"]) {
    assert.match(html, new RegExp(`id="${hook}"`));
  }

  assert.match(html, /class="app-rail"/);
  assert.match(html, /class="workspace"/);
});

test("places global tools in the workspace header beside the companion status", () => {
  const header = html.match(/<header class="workspace-header">[\s\S]*?<\/header>/)?.[0] ?? "";
  const rail = html.match(/<aside class="app-rail"[\s\S]*?<\/aside>/)?.[0] ?? "";

  for (const hook of ["workspace-greeting", "workspace-companion-days", "reminder-button", "theme-toggle"]) {
    assert.match(header, new RegExp(`id="${hook}"`));
  }
  assert.match(header, /class="workspace-actions"/);
  assert.doesNotMatch(rail, /id="reminder-button"/);
  assert.doesNotMatch(rail, /id="theme-toggle"/);
});

test("calculates companion days from the first active day", async () => {
  const analytics = await import(new URL("../js/analytics-utils.mjs", import.meta.url));
  const startedAt = new Date(2026, 7, 14, 23, 30).getTime();

  assert.equal(analytics.companionDay(startedAt, new Date(2026, 7, 14, 23, 59).getTime()), 1);
  assert.equal(analytics.companionDay(startedAt, new Date(2026, 7, 15, 23, 29).getTime()), 1);
  assert.equal(analytics.companionDay(startedAt, new Date(2026, 7, 15, 23, 30).getTime()), 2);
});

test("defines a grayscale-only night palette", () => {
  const darkTheme = css.match(/\[data-theme="dark"\]\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
  const hexValues = [...darkTheme.matchAll(/#([0-9a-f]{6})/gi)].map((match) => match[1]);

  assert.ok(hexValues.length >= 6, "dark theme should define a complete palette");
  for (const hex of hexValues) {
    assert.equal(hex.slice(0, 2), hex.slice(2, 4), `${hex} is not grayscale`);
    assert.equal(hex.slice(2, 4), hex.slice(4, 6), `${hex} is not grayscale`);
  }
});

test("contains semantic dashboard visualization landmarks", () => {
  for (const landmark of ["dashboard-hero", "dashboard-metrics", "dashboard-insights", "dashboard-ledger"]) {
    assert.match(html, new RegExp(`class="[^"]*${landmark}`));
  }
});

test("synchronizes browser theme color with the selected theme", () => {
  assert.match(app, /meta\[name="theme-color"\]/);
  assert.match(app, /#151515/);
  assert.match(app, /#16372c/i);
});

test("does not collapse the desktop rail into icon-only navigation", () => {
  const desktopNarrowRules = css.match(/@media \(max-width: 900px\) \{([\s\S]*?)\n\}/)?.[1] ?? "";

  assert.doesNotMatch(desktopNarrowRules, /grid-template-columns:\s*76px/);
  assert.doesNotMatch(desktopNarrowRules, /\.nav-item span:last-child/);
});

test("keeps the dashboard scoped to today's work and gives statistics calendar landmarks", () => {
  const dashboard = html.match(/<section class="view is-active" id="view-dashboard"[\s\S]*?<\/section>\s*<section class="view" id="view-library"/)?.[0] ?? "";

  assert.doesNotMatch(dashboard, /id="week-chart"/);
  for (const hook of ["today-completed-count", "today-review-count", "stats-calendar", "selected-day-details", "week-chart"]) {
    assert.match(html, new RegExp(`id="${hook}"`));
  }
});

test("makes dense daily review history scrollable and previewable without scheduling it", () => {
  assert.match(html, /id="review-preview-dialog"/);
  assert.match(html, /id="close-review-preview"/);
  assert.match(app, /data-review-card/);
  assert.match(app, /#selected-day-details[\s\S]*data-review-card/);
  assert.match(app, /function openReviewPreview\(card\)/);
  assert.match(css, /\.review-detail-list\s*\{[\s\S]*overflow-y:\s*auto/);
  assert.match(css, /\.review-detail-list\s*\{[\s\S]*scrollbar-gutter:\s*stable/);
  assert.match(css, /\.review-detail-button:hover/);
  assert.doesNotMatch(html.match(/<dialog id="review-preview-dialog"[\s\S]*?<\/dialog>/)?.[0] ?? "", /data-rating=/);
});

test("provides a dedicated analysis view with the three requested study charts", () => {
  assert.match(html, /data-view="analysis"/);
  assert.match(html, /id="view-analysis"/);
  for (const hook of ["analysis-volume-chart", "analysis-retention-chart", "analysis-forecast-chart", "tomorrow-review-count", "tomorrow-review-time"]) {
    assert.match(html, new RegExp(`id="${hook}"`));
  }
  assert.match(html, /id="analysis-forecast-note"/);
});

test("wires the knowledge sample action and keeps analysis charts responsive", () => {
  assert.match(app, /#seed-knowledge-data[\s\S]*seedKnowledgeData\(\{ allowExisting: true \}\)/);
  assert.match(css, /\.analysis-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(2,/);
  assert.match(css, /@media \(max-width: 700px\)[\s\S]*\.analysis-grid\s*\{[\s\S]*grid-template-columns:\s*1fr/);
});

test("keeps the forecast chart center clear for its predicted count", () => {
  assert.match(app, /forecast-card/);
  assert.match(app, /analysis-forecast-note/);
  assert.match(app, /forecast-caption" x="44" y="128"/);
  assert.match(app, /forecast-duration" x="44" y="155"/);
});

test("uses hover targets instead of persistent chart labels", () => {
  assert.match(app, /chart-hover-target/);
  assert.doesNotMatch(app, /chart-peak-label/);
});

test("keeps analysis chart axes explicit and supporting type lightweight", () => {
  assert.match(app, /chart-axis-title/);
  assert.match(app, />日期<\/text>/);
  assert.match(app, />复习次数<\/text>/);
  assert.match(app, />留存率（%）<\/text>/);
  assert.match(css, /\.chart-axis-label,[\s\S]*font-weight:\s*400/);
  assert.match(css, /\.forecast-total\s*\{[\s\S]*font-weight:\s*600/);
  assert.match(css, /\.forecast-duration\s*\{[\s\S]*font-weight:\s*400/);
  assert.match(css, /\.editorial-chart svg text\s*\{[\s\S]*stroke:\s*none/);
});

test("keeps completed cards in today progress and counts each card once", async () => {
  const analytics = await import(new URL("../js/analytics-utils.mjs", import.meta.url));
  const now = new Date(2026, 7, 14, 18);
  const reviews = [
    { cardId: "a", timestamp: new Date(2026, 7, 14, 9).getTime() },
    { cardId: "a", timestamp: new Date(2026, 7, 14, 10).getTime() },
    { cardId: "b", timestamp: new Date(2026, 7, 14, 11).getTime() },
    { cardId: "c", timestamp: new Date(2026, 7, 13, 11).getTime() }
  ];

  assert.equal(analytics.todayLearningCount(reviews, now), 2);
  assert.equal(analytics.dailyProgress(2, 0), 100);
  assert.equal(analytics.dailyProgress(2, 2), 50);
});

test("shows the daily learning count and an encouragement after the queue is complete", () => {
  assert.match(html, /今日学习次数/);
  assert.match(app, /const ENCOURAGEMENTS = \[/);
  assert.match(app, /todayLearningCount\(state\.reviews\)/);
});

test("calculates Monday-first month grids and selected-week ranges", async () => {
  const calendar = await import(new URL("../js/calendar-utils.mjs", import.meta.url));

  const february2026 = calendar.buildMonthCalendar(new Date(2026, 1, 1));
  assert.equal(february2026.offset, 6);
  assert.equal(february2026.daysInMonth, 28);
  assert.equal(february2026.cells.length, 35);
  assert.equal(february2026.cells[6].key, "2026-02-01");

  const february2028 = calendar.buildMonthCalendar(new Date(2028, 1, 1));
  assert.equal(february2028.daysInMonth, 29);
  assert.equal(february2028.cells[february2028.offset + 28].key, "2028-02-29");
  assert.equal(calendar.buildMonthCalendar(new Date(2026, 3, 1)).daysInMonth, 30);
  assert.equal(calendar.buildMonthCalendar(new Date(2026, 4, 1)).daysInMonth, 31);

  assert.equal(
    calendar.selectMonthDate(new Date(2026, 7, 1), ["2026-08-03", "2026-08-19", "2026-07-31"]),
    "2026-08-19"
  );
  assert.equal(calendar.selectMonthDate(new Date(2026, 7, 1), []), "2026-08-01");
  assert.deepEqual(calendar.weekKeysForDate("2026-08-19"), [
    "2026-08-17",
    "2026-08-18",
    "2026-08-19",
    "2026-08-20",
    "2026-08-21",
    "2026-08-22",
    "2026-08-23"
  ]);
});

test("builds daily learning, retention, and tomorrow forecast data from real review records", async () => {
  const analytics = await import(new URL("../js/analytics-utils.mjs", import.meta.url));
  const reviews = [
    { timestamp: new Date(2026, 7, 12, 9).getTime(), rating: 3 },
    { timestamp: new Date(2026, 7, 12, 13).getTime(), rating: 1 },
    { timestamp: new Date(2026, 7, 14, 10).getTime(), rating: 4 }
  ];

  assert.deepEqual(
    analytics.dailyReviewSeries(reviews, "2026-08-14", 3).map((item) => [item.key, item.value]),
    [["2026-08-12", 2], ["2026-08-13", 0], ["2026-08-14", 1]]
  );
  assert.deepEqual(
    analytics.rollingRetentionSeries(reviews, "2026-08-14", 3, 7).map((item) => [item.key, item.value]),
    [["2026-08-12", 50], ["2026-08-13", 50], ["2026-08-14", 67]]
  );

  const tomorrow = new Date(2026, 7, 15, 9).getTime();
  assert.equal(
    analytics.tomorrowReviewCount([
      { state: { reps: 2, due: tomorrow } },
      { state: { reps: 1, due: tomorrow + 1_000 } },
      { state: { reps: 0, due: tomorrow } },
      { state: { reps: 3, due: tomorrow - 24 * 60 * 60 * 1000 } }
    ], new Date(2026, 7, 14, 9)),
    2
  );
  assert.equal(analytics.estimateReviewSeconds(4), 60);
  assert.equal(analytics.formatEstimatedDuration(90), "1 分钟 30 秒");
});
