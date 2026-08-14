# 记律视觉系统重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the complete 记律 interface as an editorial learning console with a forest-green day theme and a soft grayscale night theme, without changing storage or scheduling behavior.

**Architecture:** Keep the static HTML/CSS/JS architecture and all existing application IDs. Reshape semantic layout in `index.html`, centralize theme and component tokens in `styles.css`, and make only presentation-level DOM additions in `js/app.js`. A dependency-free Node contract test protects runtime DOM hooks and checks that the night theme remains achromatic.

**Tech Stack:** HTML5, CSS custom properties, vanilla JavaScript, IndexedDB, Node.js built-in test runner.

**Spec:** `docs/superpowers/specs/2026-08-14-jilu-visual-system-design.md`

## Global Constraints

- Do not change IndexedDB stores, FSRS scheduling, import/export payloads, or existing `data-view`/element ID contracts.
- Add no runtime dependency, build step, chart library, backend service, or remote visual asset.
- Day theme uses `#16372C`, `#4D735D`, and `#F3F0E7` as visual anchors.
- Night theme uses only soft black, white, and gray values; no colored emphasis survives within `[data-theme="dark"]`.
- Use stable desktop and mobile layout constraints, with no overlapping controls or overflowing chart labels.

---

### Task 1: Protect Existing UI Contracts and Create the New App Shell

**Files:**
- Create: `tests/ui-contract.test.mjs`
- Modify: `index.html`

**Interfaces:**
- Consumes: Existing selectors including `#main-content`, `#week-chart`, `#heatmap`, `#rating-bars`, `#theme-toggle`, and every `[data-view]` button.
- Produces: `aside.app-rail`, `section.workspace`, `header.workspace-header`, and unchanged selectors for the runtime.

- [ ] **Step 1: Write the failing contract test**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");

test("keeps runtime hooks while adding the workspace shell", () => {
  for (const hook of ["main-content", "week-chart", "heatmap", "rating-bars", "theme-toggle"]) {
    assert.match(html, new RegExp(`id="${hook}"`));
  }
  assert.match(html, /class="app-rail"/);
  assert.match(html, /class="workspace"/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/ui-contract.test.mjs`

Expected: FAIL because `app-rail` and `workspace` do not yet exist.

- [ ] **Step 3: Restructure the desktop shell without changing runtime IDs**

```html
<div id="app" class="app-shell">
  <aside class="app-rail" aria-label="主导航">...</aside>
  <section class="workspace">
    <header class="workspace-header">...</header>
    <main class="main-content" id="main-content" tabindex="-1">...</main>
  </section>
</div>
```

Move the existing brand and view buttons into the rail. Keep action buttons in `workspace-header`. Preserve every existing button ID, `data-view` value, view panel ID, dialog, and bottom navigation.

- [ ] **Step 4: Run the contract test to verify it passes**

Run: `node --test tests/ui-contract.test.mjs`

Expected: PASS with one passing subtest.

- [ ] **Step 5: Commit**

```bash
git add index.html tests/ui-contract.test.mjs
git commit -m "feat: introduce learning console shell"
```

### Task 2: Install Day and Night Design Tokens, Layout Grid, and Responsive Surfaces

**Files:**
- Modify: `styles.css`
- Modify: `tests/ui-contract.test.mjs`

**Interfaces:**
- Consumes: `app-rail`, `workspace`, `workspace-header`, current view/panel classes, and the `data-theme` document attribute.
- Produces: Tokenized day/night theme variables and responsive grid rules used by all views.

- [ ] **Step 1: Extend the test with a failing dark-theme achromatic assertion**

```js
const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");

test("defines a grayscale-only night palette", () => {
  const darkTheme = css.match(/\[data-theme="dark"\]\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.match(darkTheme, /--accent:\s*#[0-9a-f]{6};/i);
  assert.doesNotMatch(darkTheme, /--accent:\s*#(?:[0-9a-f](?!\1)){3,6}/i);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/ui-contract.test.mjs`

Expected: FAIL because the existing dark accent is colored.

- [ ] **Step 3: Replace visual tokens and page geometry**

```css
:root {
  --canvas: #16372c;
  --surface: #f3f0e7;
  --surface-muted: #e7e3d8;
  --ink: #1d261f;
  --accent: #4d735d;
  --radius-md: 8px;
}

[data-theme="dark"] {
  --canvas: #151515;
  --surface: #232323;
  --surface-muted: #2c2c2b;
  --ink: #e9e8e3;
  --accent: #e9e8e3;
}
```

Replace topbar rules with rail/workspace rules, restyle panels and controls with warm-paper surfaces, and define dashboard/stats grids using `minmax(0, ...)` tracks. Below 760px, remove the rail, restore the fixed bottom navigation, and reserve bottom space equal to the navigation height.

- [ ] **Step 4: Run the contract test and inspect CSS parsing**

Run: `node --test tests/ui-contract.test.mjs`

Expected: PASS with all contract and grayscale assertions passing.

- [ ] **Step 5: Commit**

```bash
git add styles.css tests/ui-contract.test.mjs
git commit -m "feat: add editorial day and grayscale night themes"
```

### Task 3: Recompose Dashboard and Statistics Panels for Scan-Friendly Data Visualization

**Files:**
- Modify: `index.html`
- Modify: `styles.css`
- Modify: `js/app.js`
- Modify: `tests/ui-contract.test.mjs`

**Interfaces:**
- Consumes: `renderDashboard`, `renderWeekChart`, `renderStats`, `renderHeatmap`, and `renderRatingBars` and their target element IDs.
- Produces: A stable dashboard hero, metric strip, styled empty states, and visually unified native DOM charts.

- [ ] **Step 1: Extend the test with failing visualization landmarks**

```js
test("contains semantic dashboard visualization landmarks", () => {
  for (const landmark of ["dashboard-hero", "dashboard-metrics", "dashboard-insights"]) {
    assert.match(html, new RegExp(`class="[^"]*${landmark}`));
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/ui-contract.test.mjs`

Expected: FAIL because the new landmark classes do not yet exist.

- [ ] **Step 3: Add visual landmarks and presentation-only chart metadata**

```html
<section class="dashboard-hero focus-panel">...</section>
<section class="dashboard-metrics metric-grid" aria-label="学习数据概览">...</section>
<section class="dashboard-insights dashboard-columns">...</section>
```

Use these classes in the current dashboard. In `js/app.js`, add classes or labels only where required for the new chart style, keeping calculations untouched. In `styles.css`, make bars, heatmap cells, labels, and empty states use active theme tokens; rating buttons and charts remain grayscale at night.

- [ ] **Step 4: Run the contract test and complete visual verification**

Run: `node --test tests/ui-contract.test.mjs`

Expected: PASS with all subtests passing.

Open the page in Chromium at 1440x1000 and 390x844. Check dashboard, library, statistics, settings, dialogs, day theme, night theme, empty data, no clipping or overlap, and no colored night-theme UI.

- [ ] **Step 5: Commit**

```bash
git add index.html styles.css js/app.js tests/ui-contract.test.mjs
git commit -m "feat: rebuild learning data panels"
```

