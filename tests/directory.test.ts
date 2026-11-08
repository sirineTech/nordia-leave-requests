import { describe, expect, it } from "vitest";
import { parseEmployeeDirectory, searchProfiles } from "@/lib/employee-directory";


const source = [
  { id: 2, name: "Bilel Khemiri", role: "EMPLOYEE", team: "Platform", managerId: 1 },
  { id: 1, name: "Amel Ben Youssef", role: "MANAGER", team: "Platform", managerId: null },
];
describe("employees.json validation and reporting relationships", () => {
  it("preserves source IDs and resolves Bilel's managerId to Amel", () => {
    const parsed = parseEmployeeDirectory(source);
    expect(parsed.people[0]).toMatchObject({
      id: "2",
      firstName: "Bilel",
      lastName: "Khemiri",
      managerId: "1",
      teamName: "Platform",
    });
    expect(parsed.people.find((person) => person.id === parsed.people[0].managerId)).toMatchObject({
      id: "1",
      firstName: "Amel",
      lastName: "Ben Youssef",
      role: "MANAGER",
    });
  });
  it("does not generate missing email addresses", () => {
    expect(parseEmployeeDirectory(source).people.every((person) => person.email === null)).toBe(
      true,
    );
  });
  it("preserves leading zeros in explicitly supplied string IDs", () => {
    const parsed = parseEmployeeDirectory([
      { ...source[0], id: "002", managerId: "001" },
      { ...source[1], id: "001" },
    ]);
    expect(parsed.people[0].id).toBe("002");
    expect(parsed.people[0].managerId).toBe("001");
  });
  it("supports a wrapped dataset and supplied team references", () => {
    const parsed = parseEmployeeDirectory({
      teams: [{ id: "platform", name: "Platform" }],
      employees: source.map((person) => ({ ...person, team: undefined, teamId: "platform" })),
    });
    expect(parsed.people[0].teamId).toBe("platform");
    expect(parsed.teams[0].managerId).toBe("1");
  });
  it("infers a missing role only from the actual managerId references", () => {
    const parsed = parseEmployeeDirectory(source.map((person) => ({ ...person, role: undefined })));
    expect(parsed.people[0].role).toBe("EMPLOYEE");
    expect(parsed.people[1].role).toBe("MANAGER");
  });
  it("rejects duplicate employee IDs", () => {
    expect(() => parseEmployeeDirectory([...source, source[0]])).toThrow("Duplicate employee ID");
  });
  it("rejects employees with missing manager assignments", () => {
    expect(() => parseEmployeeDirectory([{ ...source[0], managerId: null }, source[1]])).toThrow(
      "has no managerId",
    );
  });
  it("rejects a manager reference that is not in the actual file", () => {
    expect(() => parseEmployeeDirectory([source[0]])).toThrow("missing or is not a manager");
  });
  it("rejects a non-manager as an approver", () => {
    expect(() => parseEmployeeDirectory([source[0], { ...source[1], role: "EMPLOYEE" }])).toThrow(
      "not a manager",
    );
  });
  it("rejects cross-team manager assignment", () => {
    expect(() => parseEmployeeDirectory([source[0], { ...source[1], team: "Product" }])).toThrow(
      "same team",
    );
  });
  it("rejects nameless records instead of inventing a name", () => {
    expect(() => parseEmployeeDirectory([{ ...source[0], name: undefined }, source[1]])).toThrow(
      "Names are never generated",
    );
  });
  it("rejects an empty or malformed dataset", () => {
    expect(() => parseEmployeeDirectory([])).toThrow("Invalid employees.json");
    expect(() => parseEmployeeDirectory({ anything: true })).toThrow("Invalid employees.json");
  });
});
describe("name and employee-ID search", () => {
  const people = parseEmployeeDirectory(source).people;
  it("finds an employee by exact source ID", () => {
    expect(searchProfiles(people, "2", "EMPLOYEE").map((person) => person.id)).toEqual(["2"]);
  });
  it("finds full-name tokens regardless of case or order", () => {
    expect(searchProfiles(people, "KHEMIRI Bilel", "EMPLOYEE")).toHaveLength(1);
  });
  it("shows only managers in the manager portal", () => {
    expect(searchProfiles(people, "", "MANAGER").map((person) => person.id)).toEqual(["1"]);
    expect(searchProfiles(people, "2", "MANAGER")).toHaveLength(0);
  });
  it("matches compound manager names", () => {
    expect(searchProfiles(people, "Ben Youssef", "MANAGER")[0].id).toBe("1");
  });
  it("does not invent a matching profile", () => {
    expect(searchProfiles(people, "unknown employee")).toEqual([]);
  });
});
