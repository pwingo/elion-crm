/**
 * Adds N business days (Mon–Fri) to a given date.
 * Does not mutate the input date.
 */
export function addBusinessDays(date: Date, days: number): Date {
  const result = new Date(date);
  let remaining = days;

  while (remaining > 0) {
    result.setDate(result.getDate() + 1);
    const day = result.getDay();
    // 0 = Sunday, 6 = Saturday
    if (day !== 0 && day !== 6) {
      remaining--;
    }
  }

  return result;
}

/**
 * Given a touch number and a JSON-encoded cadence days array (e.g. "[5, 7, 10, 14]"),
 * returns the scheduled date as a YYYY-MM-DD string.
 *
 * The interval is looked up by index = touchNumber - 1, clamped to the last
 * element if the touch number exceeds the array length.
 */
export function getNextTouchDate(
  touchNumber: number,
  cadenceDaysJson: string,
): string {
  const cadenceDays: number[] = JSON.parse(cadenceDaysJson);

  const index = Math.min(touchNumber - 1, cadenceDays.length - 1);
  const intervalDays = cadenceDays[Math.max(0, index)];

  const today = new Date();
  const nextDate = addBusinessDays(today, intervalDays);

  const yyyy = nextDate.getFullYear();
  const mm = String(nextDate.getMonth() + 1).padStart(2, "0");
  const dd = String(nextDate.getDate()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd}`;
}
