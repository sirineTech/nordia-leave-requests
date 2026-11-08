import { z } from "zod";
import { AppError, calculateTeamWarning, isValidDate, validateLeaveRequest } from "./leave-rules";

const statusSchema = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .pipe(z.enum(["PENDING", "APPROVED", "REJECTED"]));

const rowSchema = z.object({
  id: z.union([z.number().int().nonnegative(), z.string().trim().min(1)]).transform(String),
  employeeId: z.union([z.number().int().nonnegative(), z.string().trim().min(1)]).transform(String),
  start: z.string().refine(isValidDate, "start must be a valid YYYY-MM-DD date"),
  end: z.string().refine(isValidDate, "end must be a valid YYYY-MM-DD date"),
  status: statusSchema,
  reason: z.string().trim().max(500).nullish(),
});

export interface DirectoryPerson {
  id: string;
  teamId: string;
  managerId: string | null;
}
export interface ExistingLeave {
  id: string;
  employeeId: string;
  managerId: string;
  teamId: string;
  startDate: string;
  endDate: string;
  workingDays: number;
  status: "PENDING" | "APPROVED" | "REJECTED";
  reason: string | null;
  teamWarning: boolean;
}

/** Stable ID so re-running the import never duplicates rows. */
export const existingLeaveId = (sourceId: string) => `existing-${sourceId}`;

/**
 * Validates leaves-existing.json against the real directory and the business rules.
 * Nothing is invented: an unknown employee, overlap or over-balance request is rejected.
 */
export function parseExistingLeaves(payload: unknown, people: DirectoryPerson[]): ExistingLeave[] {
  const source = Array.isArray(payload)
    ? payload
    : payload &&
        typeof payload === "object" &&
        Array.isArray((payload as { leaves?: unknown }).leaves)
      ? (payload as { leaves: unknown[] }).leaves
      : null;
  if (!source)
    throw new AppError(
      "leaves-existing.json must be a JSON array of leave records.",
      400,
      "INVALID_LEAVES",
    );
  const byId = new Map(people.map((person) => [person.id, person]));
  const seen = new Set<string>();
  const accepted: ExistingLeave[] = [];
  for (const [index, raw] of source.entries()) {
    const parsed = rowSchema.safeParse(raw);
    if (!parsed.success)
      throw new AppError(
        `leaves-existing.json record #${index + 1}: ${parsed.error.issues[0].message}`,
        400,
        "INVALID_LEAVES",
      );
    const row = parsed.data;
    if (seen.has(row.id))
      throw new AppError(
        `leaves-existing.json: duplicate leave ID ${row.id}.`,
        400,
        "INVALID_LEAVES",
      );
    seen.add(row.id);
    const person = byId.get(row.employeeId);
    if (!person)
      throw new AppError(
        `leaves-existing.json leave ${row.id}: employee ${row.employeeId} is not in employees.json.`,
        400,
        "INVALID_LEAVES",
      );
    if (!person.managerId)
      throw new AppError(
        `leaves-existing.json leave ${row.id}: employee ${row.employeeId} has no manager.`,
        400,
        "INVALID_LEAVES",
      );
    const previous = accepted
      .filter((leave) => leave.employeeId === row.employeeId)
      .map((leave) => ({ ...leave }));
    const workingDays = validateLeaveRequest({ startDate: row.start, endDate: row.end }, previous);
    accepted.push({
      id: existingLeaveId(row.id),
      employeeId: row.employeeId,
      managerId: person.managerId,
      teamId: person.teamId,
      startDate: row.start,
      endDate: row.end,
      workingDays,
      status: row.status,
      reason: row.reason?.trim() || null,
      teamWarning: false,
    });
  }
  // Same flagging rule as live approvals: >40 % of the team away, excluding the person themself.
  const teamSize = new Map<string, number>();
  for (const person of people) teamSize.set(person.teamId, (teamSize.get(person.teamId) ?? 0) + 1);
  for (const leave of accepted) {
    if (leave.status === "REJECTED") continue;
    leave.teamWarning =
      calculateTeamWarning(
        leave.startDate,
        leave.endDate,
        teamSize.get(leave.teamId) ?? 0,
        accepted.filter((other) => other.teamId === leave.teamId),
        leave.employeeId,
      ).length > 0;
  }
  return accepted;
}
