export function formatDate(
  value: string,
  options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" },
): string {
  return new Intl.DateTimeFormat("en-US", { ...options, timeZone: "UTC" }).format(
    new Date(`${value.slice(0, 10)}T00:00:00Z`),
  );
}
export function dateRange(start: string, end: string): string {
  if (start === end) return formatDate(start);
  if (start.slice(0, 7) === end.slice(0, 7))
    return `${formatDate(start)} – ${formatDate(end, { day: "numeric" })}`;
  return `${formatDate(start)} – ${formatDate(end)}`;
}
export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
export function daysUntil(date: string): number {
  return Math.ceil(
    (new Date(`${date}T00:00:00Z`).getTime() - new Date(`${todayISO()}T00:00:00Z`).getTime()) /
      86_400_000,
  );
}
