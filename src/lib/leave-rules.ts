import type { Balance, WarningDay } from "./types";

export const ANNUAL_ALLOWANCE = 25;
const DAY_MS = 86_400_000;
export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code = "VALIDATION_ERROR",
    public fields?: Record<string, string>,
  ) {
    super(message);
    this.name = "AppError";
  }
}
export interface LeaveRecord {
  employeeId?: string;
  startDate: string;
  endDate: string;
  status: string;
}
export function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
export function workingDates(startDate: string, endDate: string): string[] {
  if (!isValidDate(startDate) || !isValidDate(endDate))
    throw new AppError("Please enter valid start and end dates.");
  const start = new Date(`${startDate}T00:00:00Z`).getTime();
  const end = new Date(`${endDate}T00:00:00Z`).getTime();
  if (end < start)
    throw new AppError("End date must be on or after the start date.", 400, "INVALID_DATES", {
      endDate: "End date must be on or after the start date.",
    });
  if (end - start > 366 * DAY_MS)
    throw new AppError("A single request cannot span more than 366 days.");
  const dates: string[] = [];
  for (let time = start; time <= end; time += DAY_MS) {
    const date = new Date(time);
    if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6)
      dates.push(date.toISOString().slice(0, 10));
  }
  return dates;
}
export function countWorkingDays(start: string, end: string): number {
  return workingDates(start, end).length;
}
export function calculateBalance(requests: LeaveRecord[], year: number): Balance {
  let used = 0;
  let pending = 0;
  for (const request of requests) {
    if (request.status === "REJECTED") continue;
    const days = workingDates(request.startDate, request.endDate).filter((day) =>
      day.startsWith(`${year}-`),
    ).length;
    if (request.status === "APPROVED") used += days;
    if (request.status === "PENDING") pending += days;
  }
  return {
    year,
    annualAllowance: ANNUAL_ALLOWANCE,
    used,
    pending,
    remaining: ANNUAL_ALLOWANCE - used,
    available: ANNUAL_ALLOWANCE - used - pending,
  };
}
export function validateLeaveRequest(
  input: { startDate: string; endDate: string },
  existing: LeaveRecord[],
): number {
  const dates = workingDates(input.startDate, input.endDate);
  if (dates.length === 0)
    throw new AppError(
      "Your request must include at least one working day (Monday–Friday).",
      400,
      "NO_WORKING_DAYS",
    );
  const overlap = existing.some(
    (request) =>
      request.status !== "REJECTED" &&
      request.startDate <= input.endDate &&
      request.endDate >= input.startDate,
  );
  if (overlap)
    throw new AppError(
      "These dates overlap an existing pending or approved request. Please choose different dates.",
      409,
      "OVERLAPPING_REQUEST",
    );
  const years = [...new Set(dates.map((day) => Number(day.slice(0, 4))))];
  for (const year of years) {
    const requested = dates.filter((day) => day.startsWith(`${year}-`)).length;
    const balance = calculateBalance(existing, year);
    if (requested > balance.available)
      throw new AppError(
        `You have ${balance.available} days available in ${year}, but this request needs ${requested}. Pending requests also reserve your balance.`,
        422,
        "INSUFFICIENT_BALANCE",
      );
  }
  return dates.length;
}
export function calculateTeamWarning(
  startDate: string,
  endDate: string,
  teamSize: number,
  requests: LeaveRecord[],
  excludeEmployeeId?: string,
): WarningDay[] {
  if (teamSize === 0) return [];
  return workingDates(startDate, endDate).flatMap((date) => {
    const away = new Set(
      requests
        .filter(
          (request) =>
            request.status === "APPROVED" &&
            request.employeeId !== excludeEmployeeId &&
            request.startDate <= date &&
            request.endDate >= date,
        )
        .map((request) => request.employeeId),
    ).size;
    const percentage = Math.round((away / teamSize) * 100);
    return away / teamSize > 0.4 ? [{ date, away, total: teamSize, percentage }] : [];
  });
}
