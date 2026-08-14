(function () {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const DECAY = -0.5;
  const FACTOR = 19 / 81;

  // FSRS v5 default parameters.
  const DEFAULT_W = [
    0.4872, 1.4003, 3.7145, 13.8206, 5.1618,
    1.2298, 0.8975, 0.031, 1.6474, 0.1367,
    1.0461, 2.1072, 0.0793, 0.3246, 1.587,
    0.2272, 2.8755, 0.5701, 0.5312
  ];

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  function getDaysSince(timestamp, now) {
    return Math.max(0, (now - timestamp) / DAY_MS);
  }

  function retrievability(elapsedDays, stability) {
    if (!stability || stability <= 0) return 1;
    return Math.pow(1 + (FACTOR * elapsedDays) / stability, DECAY);
  }

  function interval(stability, desiredRetention) {
    if (!stability || stability <= 0) return 0;
    const retention = clamp(desiredRetention, 0.75, 0.99);
    return Math.max(0.01, (stability / FACTOR) * (Math.pow(retention, 1 / DECAY) - 1));
  }

  function initStability(rating) {
    return DEFAULT_W[clamp(rating, 1, 4) - 1];
  }

  function initDifficulty(rating) {
    return clamp(DEFAULT_W[4] - (rating - 3) * DEFAULT_W[5], 1, 10);
  }

  function nextDifficulty(currentDifficulty, rating) {
    const d = currentDifficulty == null ? initDifficulty(rating) : currentDifficulty;
    const delta = d - DEFAULT_W[5] * (rating - 3);
    const mean = DEFAULT_W[4] - DEFAULT_W[5];
    const reverted = DEFAULT_W[6] * mean + (1 - DEFAULT_W[6]) * delta;
    return clamp(reverted, 1, 10);
  }

  function nextStability(state, rating, elapsedDays, desiredRetention) {
    const s = Math.max(0.01, state.stability || initStability(rating));
    const d = state.difficulty == null ? initDifficulty(rating) : state.difficulty;
    const r = retrievability(elapsedDays, state.stability || 0);

    if (rating === 1) {
      return Math.max(
        0.1,
        DEFAULT_W[10] *
          Math.pow(d, -DEFAULT_W[11]) *
          (Math.pow(s + 1, DEFAULT_W[12]) - 1) *
          Math.exp(DEFAULT_W[13] * (1 - r))
      );
    }

    const hardPenalty = rating === 2 ? DEFAULT_W[14] : 1;
    const easyBonus = rating === 4 ? DEFAULT_W[15] : 1;
    const growth =
      Math.exp(DEFAULT_W[7]) *
      (11 - d) *
      Math.pow(s, -DEFAULT_W[8]) *
      (Math.exp(DEFAULT_W[9] * (1 - r)) - 1) *
      hardPenalty *
      easyBonus;

    return s * (1 + growth);
  }

  function createInitialState() {
    return {
      stability: 0,
      difficulty: null,
      reps: 0,
      lapses: 0,
      lastReview: null,
      due: Date.now(),
      intervalDays: 0,
      elapsedDays: 0,
      retrievability: 1,
      scheduledDays: 0,
      state: "new"
    };
  }

  function schedule(previousState, rating, now, desiredRetention) {
    const nowMs = now || Date.now();
    const last = previousState && previousState.lastReview;
    const elapsedDays = last ? getDaysSince(last, nowMs) : 0;
    const previousStability = previousState ? previousState.stability || 0 : 0;
    const previousRetrievability = previousState
      ? retrievability(elapsedDays, previousStability)
      : 1;
    const difficulty =
      previousState && previousState.difficulty != null
        ? previousState.difficulty
        : initDifficulty(rating);
    const newDifficulty = nextDifficulty(difficulty, rating);
    const newStability = nextStability(
      previousState || createInitialState(),
      rating,
      elapsedDays,
      desiredRetention
    );
    const newInterval = interval(newStability, desiredRetention);
    const due =
      rating === 1
        ? nowMs + 10 * 1000
        : nowMs + newInterval * DAY_MS;

    return {
      stability: newStability,
      difficulty: newDifficulty,
      reps: (previousState ? previousState.reps : 0) + 1,
      lapses:
        (previousState ? previousState.lapses : 0) + (rating === 1 ? 1 : 0),
      lastReview: nowMs,
      due,
      intervalDays: newInterval,
      elapsedDays,
      retrievability: previousRetrievability,
      scheduledDays: newInterval,
      state: "learning"
    };
  }

  function mastery(state) {
    if (!state || !state.stability) return 0;
    const stability = state.stability;
    const repetitions = Math.min(1, (state.reps || 0) / 7);
    const stabilityScore = Math.min(1, Math.log(stability + 1) / Math.log(365 + 1));
    const retrievabilityScore = Math.max(0, state.retrievability ?? 1);
    const score = 0.32 * repetitions + 0.42 * stabilityScore + 0.26 * retrievabilityScore;
    return clamp(Math.round(score * 100), 0, 100);
  }

  window.FSRS = {
    DAY_MS,
    DEFAULT_W,
    createInitialState,
    schedule,
    retrievability,
    interval,
    mastery,
    getDaysSince
  };
})();
