export function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateFromKey(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function monthStart(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function buildMonthCalendar(date) {
  const month = monthStart(date);
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const offset = (month.getDay() + 6) % 7;
  const cellCount = Math.ceil((offset + daysInMonth) / 7) * 7;
  const cells = Array.from({ length: cellCount }, (_, index) => {
    const day = index - offset + 1;
    return day >= 1 && day <= daysInMonth
      ? { day, key: dateKey(new Date(month.getFullYear(), month.getMonth(), day)) }
      : null;
  });

  return { month, offset, daysInMonth, cells };
}

export function selectMonthDate(month, reviewKeys) {
  const normalizedMonth = monthStart(month);
  const prefix = `${normalizedMonth.getFullYear()}-${String(normalizedMonth.getMonth() + 1).padStart(2, "0")}-`;
  const reviewedDays = reviewKeys.filter((key) => key.startsWith(prefix)).sort();
  return reviewedDays.at(-1) || `${prefix}01`;
}

export function weekKeysForDate(key) {
  const date = dateFromKey(key);
  const offset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - offset);
  return Array.from({ length: 7 }, (_, index) => {
    const item = new Date(date);
    item.setDate(date.getDate() + index);
    return dateKey(item);
  });
}
