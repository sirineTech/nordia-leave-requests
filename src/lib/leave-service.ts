import { db } from "@/db";
import { employees, teams, leaveRequests } from "@/db/schema";
import { and, asc, desc, eq, isNotNull, type SQL } from "drizzle-orm";
import {
  AppError,
  calculateBalance,
  calculateTeamWarning,
  validateLeaveRequest,
  countWorkingDays,
} from "./leave-rules";
import type { Employee, LeaveRequest, WarningDay, CreateLeaveInput } from "./types";

export async function listEmployees(): Promise<Employee[]> {
  return db
    .select({
      id: employees.id,
      firstName: employees.firstName,
      lastName: employees.lastName,
      email: employees.email,
      role: employees.role,
      teamId: employees.teamId,
      teamName: teams.name,
      managerId: employees.managerId,
    })
    .from(employees)
    .innerJoin(teams, eq(employees.teamId, teams.id))
    .where(eq(employees.isActive, true))
    .orderBy(asc(employees.firstName));
}
export async function getEmployee(id: string): Promise<Employee> {
  const [row] = await db
    .select({ person: employees, teamName: teams.name })
    .from(employees)
    .innerJoin(teams, eq(employees.teamId, teams.id))
    .where(and(eq(employees.id, id), eq(employees.isActive, true)))
    .limit(1);
  if (!row)
    throw new AppError(
      "This profile is not in the active employee directory. Please identify yourself again.",
      404,
      "NOT_FOUND",
    );
  return { ...row.person, teamName: row.teamName };
}
export function authorizeEmployee(actor: Employee, target: Employee): void {
  const assigned =
    actor.role === "MANAGER" && target.managerId === actor.id && target.teamId === actor.teamId;
  if (actor.id !== target.id && !assigned)
    throw new AppError(
      "You can only access your own records or employees directly assigned to you in your team.",
      403,
      "FORBIDDEN",
    );
}
async function requireManager(actor: Employee): Promise<Employee> {
  const current = await getEmployee(actor.id);
  if (current.role !== "MANAGER")
    throw new AppError("A manager profile is required for this action.", 403, "FORBIDDEN");
  return current;
}
const directoryRequestScope = and(
  isNotNull(leaveRequests.managerId),
  isNotNull(leaveRequests.teamId),
);
async function requestRows(condition?: SQL) {
  return db
    .select({ request: leaveRequests, person: employees, teamName: teams.name })
    .from(leaveRequests)
    .innerJoin(employees, eq(leaveRequests.employeeId, employees.id))
    .innerJoin(teams, eq(employees.teamId, teams.id))
    .where(and(eq(employees.isActive, true), directoryRequestScope, condition))
    .orderBy(desc(leaveRequests.createdAt));
}
type RequestRow = Awaited<ReturnType<typeof requestRows>>[number];
function serialize(row: RequestRow, warningDays: WarningDay[] = []): LeaveRequest {
  return {
    ...row.request,
    createdAt: row.request.createdAt.toISOString(),
    updatedAt: row.request.updatedAt.toISOString(),
    employee: { ...row.person, teamName: row.teamName },
    warningDays,
    teamWarning:
      row.request.status === "PENDING" ? warningDays.length > 0 : row.request.teamWarning,
  };
}
async function teamContext(reader: Pick<typeof db, "select">, teamId: string) {
  const members = await reader
    .select()
    .from(employees)
    .where(and(eq(employees.teamId, teamId), eq(employees.isActive, true)));
  const rows = await reader
    .select({ request: leaveRequests })
    .from(leaveRequests)
    .innerJoin(employees, eq(leaveRequests.employeeId, employees.id))
    .where(
      and(
        eq(employees.teamId, teamId),
        eq(employees.isActive, true),
        eq(leaveRequests.teamId, teamId),
        eq(leaveRequests.status, "APPROVED"),
      ),
    );
  return { members, approved: rows.map((row) => row.request) };
}
export async function employeeRequests(
  actor: Employee,
  employeeId: string,
): Promise<LeaveRequest[]> {
  const employee = await getEmployee(employeeId);
  authorizeEmployee(actor, employee);
  const scope =
    actor.id === employeeId
      ? eq(leaveRequests.employeeId, employeeId)
      : and(
          eq(leaveRequests.employeeId, employeeId),
          eq(leaveRequests.managerId, actor.id),
          eq(leaveRequests.teamId, actor.teamId),
        );
  const rows = await requestRows(scope);
  const { members, approved } = await teamContext(db, employee.teamId);
  return rows.map((row) =>
    serialize(
      row,
      row.request.status === "PENDING"
        ? calculateTeamWarning(
            row.request.startDate,
            row.request.endDate,
            members.length,
            approved,
            employeeId,
          )
        : [],
    ),
  );
}
export async function employeeBalance(actor: Employee, employeeId: string, year: number) {
  authorizeEmployee(actor, await getEmployee(employeeId));
  const rows = await db
    .select()
    .from(leaveRequests)
    .where(and(eq(leaveRequests.employeeId, employeeId), directoryRequestScope));
  return calculateBalance(rows, year);
}
export async function createLeave(actor: Employee, input: CreateLeaveInput): Promise<LeaveRequest> {
  const id = await db.transaction(async (tx) => {
    // Re-read the authoritative reporting relationship while holding the same balance lock.
    const [employee] = await tx
      .select()
      .from(employees)
      .where(and(eq(employees.id, actor.id), eq(employees.isActive, true)))
      .for("update");
    if (!employee)
      throw new AppError(
        "Your profile is no longer active. Please identify yourself again.",
        403,
        "INACTIVE_PROFILE",
      );
    if (!employee.managerId || employee.managerId === employee.id)
      throw new AppError(
        "Your profile has no eligible assigned manager. Ask your People team to check managerId in employees.json.",
        422,
        "MANAGER_NOT_ASSIGNED",
      );
    const [manager] = await tx
      .select()
      .from(employees)
      .where(
        and(
          eq(employees.id, employee.managerId),
          eq(employees.isActive, true),
          eq(employees.role, "MANAGER"),
          eq(employees.teamId, employee.teamId),
        ),
      );
    if (!manager)
      throw new AppError(
        "Your assigned manager is missing or belongs to another team. Please correct the employee directory.",
        422,
        "INVALID_MANAGER_ASSIGNMENT",
      );
    const existing = await tx
      .select()
      .from(leaveRequests)
      .where(and(eq(leaveRequests.employeeId, employee.id), directoryRequestScope));
    const workingDays = validateLeaveRequest(input, existing);
    const { members, approved } = await teamContext(tx, employee.teamId);
    const warnings = calculateTeamWarning(
      input.startDate,
      input.endDate,
      members.length,
      approved,
      employee.id,
    );
    const [created] = await tx
      .insert(leaveRequests)
      .values({
        employeeId: employee.id,
        managerId: manager.id,
        teamId: employee.teamId,
        startDate: input.startDate,
        endDate: input.endDate,
        reason: input.reason || null,
        workingDays,
        teamWarning: warnings.length > 0,
      })
      .returning({ id: leaveRequests.id });
    return created.id;
  });
  return (await employeeRequests(actor, actor.id)).find((request) => request.id === id)!;
}
export async function managerRequests(actor: Employee, pendingOnly: boolean) {
  const manager = await requireManager(actor);
  const assignedScope = and(
    eq(employees.managerId, manager.id),
    eq(employees.teamId, manager.teamId),
    eq(leaveRequests.managerId, manager.id),
    eq(leaveRequests.teamId, manager.teamId),
  );
  const rows = await requestRows(
    and(assignedScope, pendingOnly ? eq(leaveRequests.status, "PENDING") : undefined),
  );
  const { members, approved } = await teamContext(db, manager.teamId);
  const reports = new Set(
    members.filter((member) => member.managerId === manager.id).map((member) => member.id),
  );
  const ownApproved = approved.filter(
    (request) => request.managerId === manager.id && reports.has(request.employeeId),
  );
  const today = new Date().toISOString().slice(0, 10);
  const first = `${today.slice(0, 7)}-01`;
  const last = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0))
    .toISOString()
    .slice(0, 10);
  const pending = rows.filter((row) => row.request.status === "PENDING");
  return {
    data: rows.map((row) =>
      serialize(
        row,
        row.request.status === "PENDING"
          ? calculateTeamWarning(
              row.request.startDate,
              row.request.endDate,
              members.length,
              approved,
              row.person.id,
            )
          : [],
      ),
    ),
    summary: {
      teamSize: reports.size + (reports.has(manager.id) ? 0 : 1),
      pendingCount: pending.length,
      pendingDays: pending.reduce((sum, row) => sum + row.request.workingDays, 0),
      approvedThisMonth: ownApproved.filter(
        (request) => request.startDate <= last && request.endDate >= first,
      ).length,
      awayToday:
        countWorkingDays(today, today) === 0
          ? 0
          : new Set(
              ownApproved
                .filter((request) => request.startDate <= today && request.endDate >= today)
                .map((request) => request.employeeId),
            ).size,
    },
  };
}
export async function reviewLeave(
  actor: Employee,
  id: string,
  decision: "APPROVED" | "REJECTED",
  comment?: string,
): Promise<LeaveRequest> {
  const manager = await requireManager(actor);
  if (decision === "REJECTED" && !comment?.trim())
    throw new AppError("A comment is required when rejecting a request.");
  const initial = (await requestRows(eq(leaveRequests.id, id)))[0];
  if (!initial) throw new AppError("This request could not be found.", 404, "NOT_FOUND");
  await db.transaction(async (tx) => {
    const [employee] = await tx
      .select()
      .from(employees)
      .where(eq(employees.id, initial.person.id))
      .for("update");
    const [current] = await tx
      .select()
      .from(leaveRequests)
      .where(eq(leaveRequests.id, id))
      .for("update");
    if (
      !employee?.isActive ||
      employee.managerId !== manager.id ||
      employee.teamId !== manager.teamId ||
      current.managerId !== manager.id ||
      current.teamId !== manager.teamId
    )
      throw new AppError(
        "This request is not assigned to you. You can only review your own direct reports in your team.",
        403,
        "FORBIDDEN",
      );
    if (current.status !== "PENDING")
      throw new AppError(
        "This request has already been reviewed. Refresh to see its current status.",
        409,
        "ALREADY_REVIEWED",
      );
    if (decision === "APPROVED") {
      const all = await tx
        .select()
        .from(leaveRequests)
        .where(and(eq(leaveRequests.employeeId, current.employeeId), directoryRequestScope));
      validateLeaveRequest(
        current,
        all.filter((request) => request.id !== id),
      );
    }
    const { members, approved } = await teamContext(tx, employee.teamId);
    const warnings = calculateTeamWarning(
      current.startDate,
      current.endDate,
      members.length,
      approved,
      current.employeeId,
    );
    await tx
      .update(leaveRequests)
      .set({
        status: decision,
        managerComment: comment?.trim() || null,
        teamWarning: warnings.length > 0,
        updatedAt: new Date(),
      })
      .where(eq(leaveRequests.id, id));
  });
  return serialize((await requestRows(eq(leaveRequests.id, id)))[0]);
}
export async function teamAvailability(actor: Employee) {
  const { members, approved } = await teamContext(db, actor.teamId);
  return {
    name: actor.teamName,
    members: members.map((person) => ({ ...person, teamName: actor.teamName })),
    events: approved.map((request) => {
      const person = members.find((member) => member.id === request.employeeId)!;
      return {
        id: request.id,
        employeeId: person.id,
        firstName: person.firstName,
        lastName: person.lastName,
        startDate: request.startDate,
        endDate: request.endDate,
      };
    }),
  };
}
