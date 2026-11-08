import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseEmployeeDirectory } from "@/lib/employee-directory";
import { calculateTeamWarning } from "@/lib/leave-rules";
import { parseExistingLeaves } from "@/lib/existing-leaves";

const read = (file: string) => JSON.parse(readFileSync(`data/${file}`, "utf8"));
const people = parseEmployeeDirectory(read("employees.json")).people;

describe("supplied employees.json + leaves-existing.json", () => {
  it("loads the 12 employees in 3 teams", () => {
    expect(people).toHaveLength(12);
    expect(new Set(people.map((p) => p.teamId)).size).toBe(3);
  });
  it("accepts the 5 existing approved leaves and computes working days", () => {
    const leaves = parseExistingLeaves(read("leaves-existing.json"), people);
    expect(leaves).toHaveLength(5);
    expect(leaves.every((l) => l.status === "APPROVED")).toBe(true);
    expect(leaves.find((l) => l.id === "existing-1")?.workingDays).toBe(5);
    expect(leaves.find((l) => l.id === "existing-2")?.workingDays).toBe(2);
  });
  it("routes each leave to the employee's manager and team", () => {
    const leaves = parseExistingLeaves(read("leaves-existing.json"), people);
    expect(leaves.find((l) => l.employeeId === "10")).toMatchObject({ managerId: "9" });
  });
  it("makes a new Support request on 13 Jan 2027 flaggable (2 of 4 away = 50 % > 40 %)", () => {
    const leaves = parseExistingLeaves(read("leaves-existing.json"), people);
    const support = leaves.filter(
      (l) => l.teamId === leaves.find((x) => x.employeeId === "10")!.teamId,
    );
    const warnings = calculateTeamWarning("2027-01-13", "2027-01-13", 4, support, "12");
    expect(warnings).toEqual([{ date: "2027-01-13", away: 2, total: 4, percentage: 50 }]);
  });
  it("rejects an unknown employee and overlapping leaves", () => {
    expect(() =>
      parseExistingLeaves(
        [{ id: 1, employeeId: 99, start: "2027-01-04", end: "2027-01-05", status: "approved" }],
        people,
      ),
    ).toThrow("not in employees.json");
    const a = { employeeId: 2, status: "approved" };
    expect(() =>
      parseExistingLeaves(
        [
          { ...a, id: 1, start: "2027-01-04", end: "2027-01-08" },
          { ...a, id: 2, start: "2027-01-08", end: "2027-01-12" },
        ],
        people,
      ),
    ).toThrow("overlap");
  });
});
