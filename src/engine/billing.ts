/**
 * Bill-day date maths for payment reminders. Pure TypeScript (no React Native), so it is unit-tested in Node.
 * All dates are local calendar dates: the phone shows reminders in the user's own time zone.
 */

/** Reminders go out this many days before each due date. */
export const REMINDER_DAYS_BEFORE = [3, 1] as const;
/** Local hour (24h clock) at which reminders are shown. */
export const REMINDER_HOUR = 9;
/** Due dates scheduled ahead. Two months keeps every card well under iOS's 64 pending notifications. */
export const REMINDER_MONTHS_AHEAD = 2;

/** True for a whole number from 1 to 31. */
export function isValidBillDay(day: unknown): day is number {
  return typeof day === 'number' && Number.isInteger(day) && day >= 1 && day <= 31;
}

/** Parses a typed day of the month. Empty or invalid text gives undefined. */
export function parseBillDay(text: string): number | undefined {
  const n = Number(text.replace(/\D/g, ''));
  return text.trim() !== '' && isValidBillDay(n) ? n : undefined;
}

/** Days in a month (monthIndex 0 = January). */
export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/**
 * The bill day in a given month. A day the month does not have (for example 31 in April, or 30 in February)
 * becomes the month's last day, which is when banks usually set the due date in short months.
 */
export function billDateInMonth(year: number, monthIndex: number, day: number): Date {
  // Normalise the month first so monthIndex 12 means January of the next year.
  const first = new Date(year, monthIndex, 1);
  const y = first.getFullYear();
  const m = first.getMonth();
  return new Date(y, m, Math.min(day, daysInMonth(y, m)));
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** The next due dates on or after today, nearest first. */
export function upcomingDueDates(dueDay: number, from: Date, count = REMINDER_MONTHS_AHEAD): Date[] {
  if (!isValidBillDay(dueDay) || count <= 0) return [];
  const today = startOfDay(from);
  const dates: Date[] = [];
  for (let offset = 0; dates.length < count && offset < count + 2; offset++) {
    const due = billDateInMonth(today.getFullYear(), today.getMonth() + offset, dueDay);
    if (due >= today) dates.push(due);
  }
  return dates;
}

/** Whole days from `from` to the next due date (0 when the bill is due today). */
export function daysUntilDue(dueDay: number, from: Date): number | null {
  const [next] = upcomingDueDates(dueDay, from, 1);
  if (!next) return null;
  return Math.round((next.getTime() - startOfDay(from).getTime()) / 86_400_000);
}

export type BillReminder = {
  /** When the phone should show the reminder. */
  fireAt: Date;
  /** The bill's due date. */
  dueDate: Date;
  daysBefore: number;
};

/**
 * Reminders for the next due dates: 3 days and 1 day before each one, at 9 AM local time.
 * Reminders whose time has already passed are left out.
 */
export function billReminders(dueDay: number, from: Date, monthsAhead = REMINDER_MONTHS_AHEAD): BillReminder[] {
  const reminders: BillReminder[] = [];
  // Look one extra month ahead so a due date tomorrow still leaves `monthsAhead` months with reminders.
  for (const dueDate of upcomingDueDates(dueDay, from, monthsAhead + 1)) {
    for (const daysBefore of REMINDER_DAYS_BEFORE) {
      const fireAt = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate() - daysBefore, REMINDER_HOUR);
      if (fireAt > from) reminders.push({ fireAt, dueDate, daysBefore });
    }
  }
  return reminders
    .sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime())
    .slice(0, monthsAhead * REMINDER_DAYS_BEFORE.length);
}

/** Formats a date for bill display, e.g. "12 Nov" or "5 Jan 2027". */
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
export function formatDueDate(d: Date, from: Date = new Date()): string {
  const dayNum = d.getDate();
  const month = SHORT_MONTHS[d.getMonth()] ?? '';
  return d.getFullYear() !== from.getFullYear() ? `${dayNum} ${month} ${d.getFullYear()}` : `${dayNum} ${month}`;
}

/** Local date as YYYY-MM-DD (used in notification ids). */
export function localIsoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "5th", "21st", "31st": a day of the month in plain English. */
export function ordinalDay(day: number): string {
  const tens = day % 100;
  const suffix = tens >= 11 && tens <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[day % 10] ?? 'th';
  return `${day}${suffix}`;
}

/**
 * Calculates remaining whole days until an ISO date (YYYY-MM-DD).
 * Returns null if no valid date string, or whole days from `from` to the target date.
 * If the target date has passed, returns 0.
 */
export function daysUntilExpiry(expiryDate: string | undefined | null, from: Date = new Date()): number | null {
  if (!expiryDate || typeof expiryDate !== 'string') return null;
  const parts = expiryDate.split('-').map(Number);
  if (parts.length !== 3 || parts.some((p) => isNaN(p) || p <= 0)) return null;
  const [year, month, dayNum] = parts;
  const target = new Date(year, month - 1, dayNum);
  if (isNaN(target.getTime())) return null;
  const today = startOfDay(from);
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  return Math.max(0, diffDays);
}

/**
 * Returns an ISO date string (YYYY-MM-DD) that is `days` days in the future from `from`.
 */
export function dateInDays(days: number, from: Date = new Date()): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + days);
  return localIsoDate(d);
}

/**
 * Computes the points expiry date for a card given its policy and the date points were earned.
 * Returns null when the policy says points never expire.
 *
 * @param policy  - The card's `pointsExpiry` block from the catalog.
 * @param earnedAt - ISO date (YYYY-MM-DD) when the balance was last recorded (approximated as today for existing points).
 */
export function computePointsExpiryDate(
  policy: { neverExpires: boolean; validityMonths: number | null; alignToMonthEnd: boolean } | undefined | null,
  earnedAt: Date = new Date(),
): string | null {
  if (!policy || policy.neverExpires || policy.validityMonths == null) return null;
  // Add validityMonths to the earnedAt date
  const expiry = new Date(earnedAt.getFullYear(), earnedAt.getMonth() + policy.validityMonths, earnedAt.getDate());
  if (policy.alignToMonthEnd) {
    // Last day of the target month
    const lastDay = new Date(expiry.getFullYear(), expiry.getMonth() + 1, 0);
    return localIsoDate(lastDay);
  }
  return localIsoDate(expiry);
}

