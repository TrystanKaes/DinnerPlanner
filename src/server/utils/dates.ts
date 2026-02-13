/**
 * Shared server-side date utilities.
 * Uses local-safe date formatting to avoid UTC timezone shifts.
 */

/**
 * Format a Date object as YYYY-MM-DD string without UTC conversion.
 */
export function formatDateStr(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Get a date range (Sunday–Saturday) for a given week start date string.
 */
export function getWeekRange(weekStartDate: string) {
  const start = new Date(weekStartDate + "T00:00:00");
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return {
    start: formatDateStr(start),
    end: formatDateStr(end),
  };
}
