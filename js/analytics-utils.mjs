const DAY_MS = 24 * 60 * 60 * 1000;

function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateFromKey(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDays(key, amount) {
  const date = dateFromKey(key);
  date.setDate(date.getDate() + amount);
  return dateKey(date);
}

export function dailyReviewSeries(reviews, endKey, days) {
  const counts = reviews.reduce((map, review) => {
    const key = dateKey(new Date(review.timestamp));
    map.set(key, (map.get(key) || 0) + 1);
    return map;
  }, new Map());

  return Array.from({ length: days }, (_, index) => {
    const key = addDays(endKey, index - days + 1);
    return { key, value: counts.get(key) || 0 };
  });
}

export function rollingRetentionSeries(reviews, endKey, days, windowDays = 7) {
  return Array.from({ length: days }, (_, index) => {
    const key = addDays(endKey, index - days + 1);
    const windowStart = addDays(key, -windowDays + 1);
    const windowReviews = reviews.filter((review) => {
      const reviewKey = dateKey(new Date(review.timestamp));
      return reviewKey >= windowStart && reviewKey <= key;
    });
    const remembered = windowReviews.filter((review) => review.rating >= 3).length;
    return {
      key,
      value: windowReviews.length ? Math.round((remembered / windowReviews.length) * 100) : 0
    };
  });
}

export function tomorrowReviewCount(cards, now = new Date()) {
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const tomorrowKey = dateKey(tomorrow);
  return cards.filter((card) =>
    !card.archived &&
    card.state?.reps > 0 &&
    dateKey(new Date(card.state.due)) === tomorrowKey
  ).length;
}

export function estimateReviewSeconds(cardCount, secondsPerCard = 15) {
  return Math.max(0, cardCount) * secondsPerCard;
}

export function formatEstimatedDuration(seconds) {
  const wholeSeconds = Math.max(0, Math.round(seconds));
  if (wholeSeconds < 60) return `${wholeSeconds} 秒`;
  const minutes = Math.floor(wholeSeconds / 60);
  const remainder = wholeSeconds % 60;
  if (minutes < 60) return remainder ? `${minutes} 分钟 ${remainder} 秒` : `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes ? `${hours} 小时 ${remainingMinutes} 分钟` : `${hours} 小时`;
}

export function todayLearningCount(reviews, now = new Date()) {
  const year = now.getFullYear();
  const month = now.getMonth();
  const day = now.getDate();
  return new Set(
    reviews
      .filter((review) => {
        const date = new Date(review.timestamp);
        return date.getFullYear() === year && date.getMonth() === month && date.getDate() === day;
      })
      .map((review) => review.cardId)
  ).size;
}

export function dailyProgress(completed, remaining) {
  const total = Math.max(0, completed) + Math.max(0, remaining);
  return total ? Math.round((Math.max(0, completed) / total) * 100) : 0;
}

export function companionDay(startedAt, now = Date.now()) {
  const started = Number(startedAt);
  if (!Number.isFinite(started)) return 1;
  return Math.max(1, Math.floor((Number(now) - started) / DAY_MS) + 1);
}

export { DAY_MS };
