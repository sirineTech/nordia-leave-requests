import { z } from "zod";
import { AppError } from "./leave-rules";
import type { Employee, Role } from "./types";

export const directoryIdSchema = z.union([
  z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).transform(String),
  z
    .string()
    .trim()
    .regex(
      /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$/,
      "IDs must be non-empty numbers or strings without spaces or slashes.",
    ),
]);
const name = z.string().trim().min(1).max(150);
const teamSchema = z.object({ id: directoryIdSchema.optional(), name }).passthrough();
const rawPersonSchema = z
  .object({
    id: directoryIdSchema,
    firstName: name.optional(),
    lastName: z.string().trim().max(150).optional(),
    fullName: name.optional(),
    name: name.optional(),
    email: z.string().trim().email().nullable().optional(),
    role: z
      .string()
      .trim()
      .transform((value) => value.toUpperCase())
      .pipe(z.enum(["EMPLOYEE", "MANAGER"]))
      .optional(),
    isManager: z.boolean().optional(),
    managerId: directoryIdSchema.nullable().optional(),
    teamId: directoryIdSchema.optional(),
    teamName: name.optional(),
    team: z.union([name, teamSchema]).optional(),
  })
  .passthrough();
const peopleSchema = z
  .array(rawPersonSchema)
  .min(1, "employees.json must contain at least one profile.")
  .max(1000, "The directory supports up to 1,000 profiles.");
const datasetSchema = z.union([
  peopleSchema,
  z.object({ employees: peopleSchema, teams: z.array(teamSchema).optional() }).passthrough(),
]);
export interface DirectoryPerson {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  role: Role;
  managerId: string | null;
  teamId: string;
  teamName: string;
}
export interface ParsedDirectory {
  people: DirectoryPerson[];
  teams: { id: string; name: string; managerId: string | null }[];
}

export function parseEmployeeDirectory(input: unknown): ParsedDirectory {
  const result = datasetSchema.safeParse(input);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new AppError(
      `Invalid employees.json: ${issue?.message ?? "Expected an employee array, or an object containing an employees array."}`,
      400,
      "INVALID_DIRECTORY",
    );
  }
  const rows = Array.isArray(result.data) ? result.data : result.data.employees;
  const suppliedTeams = Array.isArray(result.data) ? [] : (result.data.teams ?? []);
  const referencedManagers = new Set(
    rows.flatMap((person) => (person.managerId ? [person.managerId] : [])),
  );
  const people: DirectoryPerson[] = rows.map((person) => {
    const fullName = person.fullName ?? person.name;
    const parts = fullName?.split(/\s+/) ?? [];
    const firstName = person.firstName ?? parts[0];
    const lastName = person.lastName ?? parts.slice(1).join(" ");
    if (!firstName)
      throw new AppError(
        `Profile ${person.id} must include a name. Names are never generated.`,
        400,
        "INVALID_DIRECTORY",
      );
    const nestedTeam = typeof person.team === "object" ? person.team : undefined;
    const declaredTeam = suppliedTeams.find((team) => team.id === person.teamId);
    const teamName =
      nestedTeam?.name ??
      person.teamName ??
      (typeof person.team === "string" ? person.team : undefined) ??
      declaredTeam?.name;
    if (!teamName)
      throw new AppError(
        `Profile ${person.id} must include a team name or reference a supplied team.`,
        400,
        "INVALID_DIRECTORY",
      );
    const teamId =
      person.teamId ??
      nestedTeam?.id ??
      suppliedTeams.find((team) => team.name === teamName)?.id ??
      teamName;
    const role: Role =
      person.role ??
      (person.isManager !== undefined
        ? person.isManager
          ? "MANAGER"
          : "EMPLOYEE"
        : referencedManagers.has(person.id)
          ? "MANAGER"
          : "EMPLOYEE");
    return {
      id: person.id,
      firstName,
      lastName,
      email: person.email ?? null,
      role,
      managerId: person.managerId ?? null,
      teamId,
      teamName,
    };
  });
  const byId = new Map<string, DirectoryPerson>();
  const emails = new Set<string>();
  const teamNames = new Map<string, string>();
  const teamIds = new Map<string, string>();
  for (const person of people) {
    if (byId.has(person.id))
      throw new AppError(
        `Duplicate employee ID ${person.id}. IDs must be unique.`,
        400,
        "INVALID_DIRECTORY",
      );
    byId.set(person.id, person);
    if (person.email) {
      const email = person.email.toLowerCase();
      if (emails.has(email))
        throw new AppError(`Duplicate email for profile ${person.id}.`, 400, "INVALID_DIRECTORY");
      emails.add(email);
    }
    if (
      (teamNames.has(person.teamId) && teamNames.get(person.teamId) !== person.teamName) ||
      (teamIds.has(person.teamName) && teamIds.get(person.teamName) !== person.teamId)
    )
      throw new AppError(
        `Conflicting team identifiers for ${person.teamName}.`,
        400,
        "INVALID_DIRECTORY",
      );
    teamNames.set(person.teamId, person.teamName);
    teamIds.set(person.teamName, person.teamId);
  }
  for (const person of people) {
    if (!person.managerId) {
      if (person.role === "EMPLOYEE")
        throw new AppError(
          `Employee ${person.id} has no managerId. Manager assignments must come from employees.json.`,
          400,
          "INVALID_DIRECTORY",
        );
      continue;
    }
    const manager = byId.get(person.managerId);
    if (!manager || manager.role !== "MANAGER")
      throw new AppError(
        `Profile ${person.id} references manager ${person.managerId}, who is missing or is not a manager.`,
        400,
        "INVALID_DIRECTORY",
      );
    if (manager.teamId !== person.teamId)
      throw new AppError(
        `Employee ${person.id} and manager ${manager.id} must belong to the same team.`,
        400,
        "INVALID_DIRECTORY",
      );
  }
  const teams = [...teamNames].map(([id, teamName]) => {
    const managers = people.filter((person) => person.teamId === id && person.role === "MANAGER");
    return { id, name: teamName, managerId: managers.length === 1 ? managers[0].id : null };
  });
  return { people, teams };
}

export function normalizedSearch(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}
export function searchProfiles(people: Employee[], query: string, role?: Role): Employee[] {
  const term = normalizedSearch(query);
  const words = term.split(/\s+/).filter(Boolean);
  return people
    .filter((person) => {
      if (role && person.role !== role) return false;
      const fullName = normalizedSearch(`${person.firstName} ${person.lastName}`);
      return (
        !term ||
        normalizedSearch(person.id).includes(term) ||
        words.every((word) => fullName.includes(word))
      );
    })
    .sort((a, b) => {
      const exactA = term && normalizedSearch(a.id) === term ? 0 : 1;
      const exactB = term && normalizedSearch(b.id) === term ? 0 : 1;
      return (
        exactA - exactB ||
        `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`)
      );
    });
}
