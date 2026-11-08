import { describe, expect, it } from "vitest";
import {
  countWorkingDays,
  calculateBalance,
  calculateTeamWarning,
  validateLeaveRequest,
  isValidDate,
} from "@/lib/leave-rules";

const request = (startDate: string, endDate: string, status = "PENDING") => ({
  startDate,
  endDate,
  status,
  employeeId: "person-a",
});
describe("working-day calculations", () => {
  it("counts Monday through Friday, not weekends", () => {
    expect(countWorkingDays("2030-01-07", "2030-01-20")).toBe(10);
  });
  it("counts a single weekday", () => {
    expect(countWorkingDays("2030-01-07", "2030-01-07")).toBe(1);
  });
  it("does not count a weekend-only range", () => {
    expect(countWorkingDays("2030-01-12", "2030-01-13")).toBe(0);
  });
  it("rejects reversed ranges", () => {
    expect(() => countWorkingDays("2030-01-10", "2030-01-07")).toThrow("End date");
  });
  it("rejects impossible calendar dates", () => {
    expect(isValidDate("2030-02-30")).toBe(false);
  });
});
describe("leave balance and overlap rules", () => {
  it("accepts a valid request", () => {
    expect(validateLeaveRequest(request("2030-01-07", "2030-01-11"), [])).toBe(5);
  });
  it("reserves pending leave and excludes rejected leave", () => {
    const balance = calculateBalance(
      [
        request("2030-01-07", "2030-01-11", "APPROVED"),
        request("2030-01-14", "2030-01-16"),
        request("2030-02-04", "2030-02-08", "REJECTED"),
      ],
      2030,
    );
    expect(balance).toEqual({
      year: 2030,
      annualAllowance: 25,
      used: 5,
      pending: 3,
      remaining: 20,
      available: 17,
    });
  });
  it("rejects requests over the available balance", () => {
    expect(() =>
      validateLeaveRequest(request("2030-02-04", "2030-02-11"), [
        request("2030-01-07", "2030-02-01"),
      ]),
    ).toThrow("5 days available");
  });
  it("rejects overlapping non-rejected requests", () => {
    expect(() =>
      validateLeaveRequest(request("2030-01-10", "2030-01-14"), [
        request("2030-01-07", "2030-01-11"),
      ]),
    ).toThrow("overlap");
  });
  it("allows a non-overlapping request", () => {
    expect(
      validateLeaveRequest(request("2030-01-14", "2030-01-16"), [
        request("2030-01-07", "2030-01-11"),
      ]),
    ).toBe(3);
  });
  it("allows dates from a rejected request", () => {
    expect(
      validateLeaveRequest(request("2030-01-07", "2030-01-11"), [
        request("2030-01-07", "2030-01-11", "REJECTED"),
      ]),
    ).toBe(5);
  });
  it("rejects requests containing no working days", () => {
    expect(() => validateLeaveRequest(request("2030-01-12", "2030-01-13"), [])).toThrow(
      "at least one working day",
    );
  });
  it("allocates cross-year working days to each calendar year", () => {
    const requests = [request("2029-12-31", "2030-01-04", "APPROVED")];
    expect(calculateBalance(requests, 2029).used).toBe(1);
    expect(calculateBalance(requests, 2030).used).toBe(4);
  });
});
describe("team availability warnings", () => {
  it("warns when over 40% of the team is already approved away", () => {
    const rows = [
      request("2030-01-07", "2030-01-11", "APPROVED"),
      { ...request("2030-01-07", "2030-01-11", "APPROVED"), employeeId: "person-b" },
    ];
    expect(calculateTeamWarning("2030-01-07", "2030-01-07", 4, rows)).toEqual([
      { date: "2030-01-07", away: 2, total: 4, percentage: 50 },
    ]);
  });
  it("does not include pending leave or warn at exactly 40%", () => {
    const rows = [
      request("2030-01-07", "2030-01-11", "APPROVED"),
      { ...request("2030-01-07", "2030-01-11", "APPROVED"), employeeId: "person-b" },
      { ...request("2030-01-07", "2030-01-11"), employeeId: "person-c" },
    ];
    expect(calculateTeamWarning("2030-01-07", "2030-01-07", 5, rows)).toEqual([]);
  });
});
