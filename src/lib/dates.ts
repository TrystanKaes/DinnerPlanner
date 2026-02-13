/**
 * Get the Sunday (start of week) for a given date.
 */
export function getSunday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Format a Date object as YYYY-MM-DD string.
 * Uses local timezone to avoid UTC date shifts.
 */
export function formatDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Get array of 7 dates (Sun-Sat) for a week starting on the given Sunday.
 */
export function getWeekDates(weekStartDate: string): Date[] {
  const start = new Date(weekStartDate + "T00:00:00");
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });
}

/**
 * Format a date for display (e.g., "Sun Feb 9").
 */
export function formatDayShort(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/**
 * Format a date range for display (e.g., "Feb 9–15, 2026").
 */
export function formatWeekRange(weekStartDate: string): string {
  const start = new Date(weekStartDate + "T00:00:00");
  const end = new Date(start);
  end.setDate(end.getDate() + 6);

  const startMonth = start.toLocaleDateString("en-US", { month: "short" });
  const endMonth = end.toLocaleDateString("en-US", { month: "short" });
  const year = end.getFullYear();

  if (startMonth === endMonth) {
    return `${startMonth} ${start.getDate()}–${end.getDate()}, ${year}`;
  }
  return `${startMonth} ${start.getDate()} – ${endMonth} ${end.getDate()}, ${year}`;
}

/**
 * Check if a date string is today.
 */
export function isToday(dateStr: string): boolean {
  const today = new Date();
  return formatDateString(today) === dateStr;
}
