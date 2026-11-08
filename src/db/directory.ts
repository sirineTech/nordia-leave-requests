import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { and, eq, sql, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { directoryImports, employees, leaveRequests, teams } from "./schema";
import { parseEmployeeDirectory } from "@/lib/employee-directory";
import { AppError } from "@/lib/leave-rules";
import type { DirectoryStatus } from "@/lib/types";

export const MAX_DIRECTORY_BYTES = 1_048_576;
export async function readDirectoryFile(): Promise<{ payload: unknown; source: string } | null> {
  // An explicitly configured external file is mounted at runtime, not bundled with source code.
  const candidates = process.env.EMPLOYEES_DATASET_PATH
    ? [path.resolve(/* turbopackIgnore: true */ process.cwd(), process.env.EMPLOYEES_DATASET_PATH)]
    : [
        path.join(process.cwd(), "employees.json"),
        path.join(process.cwd(), "data", "employees.json"),
        path.join(process.cwd(), "src", "data", "employees.json"),
        path.join(process.cwd(), "public", "data", "employees.json"),
      ];
  for (const file of candidates) {
    try {
      const info = await stat(file);
      if (!info.isFile() || info.size > MAX_DIRECTORY_BYTES)
        throw new AppError(
          "employees.json must be a JSON file smaller than 1 MB.",
          400,
          "INVALID_DIRECTORY",
        );
      const content = await readFile(file, "utf8");
      try {
        return { payload: JSON.parse(content.replace(/^\uFEFF/, "")), source: "file" };
      } catch {
        throw new AppError(
          "employees.json contains invalid JSON. Correct the supplied file and refresh.",
          400,
          "INVALID_DIRECTORY",
        );
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
  }
  return null;
}

export async function importEmployeeDirectory(
  payload: unknown,
  source: "file" | "upload" = "upload",
) {
  const directory = parseEmployeeDirectory(payload);
  const content = JSON.stringify(payload);
  if (Buffer.byteLength(content) > MAX_DIRECTORY_BYTES)
    throw new AppError("employees.json must be smaller than 1 MB.", 413, "PAYLOAD_TOO_LARGE");
  const checksum = createHash("sha256").update(content).digest("hex");
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(7281941)`);
    const [previous] = await tx
      .select()
      .from(directoryImports)
      .where(eq(directoryImports.id, "primary"));
    if (previous?.checksum === checksum) return;
    // Replacing a directory never deletes leave history or fabricates replacement people.
    await tx.update(employees).set({ isActive: false });
    await tx.update(teams).set({ managerId: null });
    for (const team of directory.teams) {
      await tx
        .insert(teams)
        .values({ id: team.id, name: team.name })
        .onConflictDoUpdate({ target: teams.id, set: { name: team.name } });
    }
    // Two passes allow references to managers later in the original file.
    for (const person of directory.people) {
      const values = {
        firstName: person.firstName,
        lastName: person.lastName,
        email: person.email,
        role: person.role,
        teamId: person.teamId,
        managerId: null,
        isActive: true,
      };
      await tx
        .insert(employees)
        .values({ id: person.id, ...values })
        .onConflictDoUpdate({ target: employees.id, set: values });
    }
    for (const person of directory.people) {
      await tx
        .update(employees)
        .set({ managerId: person.managerId })
        .where(eq(employees.id, person.id));
      // A directory correction routes outstanding requests to the newly supplied reporting relationship.
      if (person.managerId)
        await tx
          .update(leaveRequests)
          .set({ managerId: person.managerId, teamId: person.teamId, updatedAt: new Date() })
          .where(
            and(
              eq(leaveRequests.employeeId, person.id),
              eq(leaveRequests.status, "PENDING"),
              isNotNull(leaveRequests.managerId),
              isNotNull(leaveRequests.teamId),
            ),
          );
    }
    for (const team of directory.teams)
      await tx.update(teams).set({ managerId: team.managerId }).where(eq(teams.id, team.id));
    const metadata = {
      fileName: "employees.json",
      source,
      checksum,
      payload,
      importedAt: new Date(),
    };
    await tx
      .insert(directoryImports)
      .values({ id: "primary", ...metadata })
      .onConflictDoUpdate({ target: directoryImports.id, set: metadata });
  });
  return {
    profileCount: directory.people.length,
    employeeCount: directory.people.filter((person) => person.role === "EMPLOYEE").length,
    managerCount: directory.people.filter((person) => person.role === "MANAGER").length,
    teamCount: directory.teams.length,
  };
}

let synchronization: Promise<void> | undefined;
export async function ensureDirectory(): Promise<void> {
  if (!synchronization)
    synchronization = (async () => {
      const file = await readDirectoryFile();
      if (file) await importEmployeeDirectory(file.payload, "file");
      // Supplied existing leaves depend on the directory, so they load right after it.
      const { importExistingLeaves } = await import("./leaves");
      await importExistingLeaves();
    })().finally(() => {
      synchronization = undefined;
    });
  await synchronization;
}

export async function getDirectoryStatus(): Promise<DirectoryStatus> {
  const empty: DirectoryStatus = {
    state: "missing",
    fileName: null,
    source: null,
    profileCount: 0,
    employeeCount: 0,
    managerCount: 0,
    teamCount: 0,
    importedAt: null,
    message:
      "employees.json has not been supplied. Import the actual company directory to select a profile.",
  };
  try {
    await ensureDirectory();
  } catch (error) {
    return {
      ...empty,
      state: "invalid",
      fileName: "employees.json",
      message:
        error instanceof AppError
          ? error.message
          : "The employee directory could not be read. Check the supplied file and try again.",
    };
  }
  const [metadata] = await db
    .select()
    .from(directoryImports)
    .where(eq(directoryImports.id, "primary"));
  if (!metadata) return empty;
  const people = await db
    .select({ role: employees.role, teamId: employees.teamId })
    .from(employees)
    .where(eq(employees.isActive, true));
  return {
    state: "ready",
    fileName: metadata.fileName,
    source: metadata.source,
    profileCount: people.length,
    employeeCount: people.filter((person) => person.role === "EMPLOYEE").length,
    managerCount: people.filter((person) => person.role === "MANAGER").length,
    teamCount: new Set(people.map((person) => person.teamId)).size,
    importedAt: metadata.importedAt.toISOString(),
    message: null,
  };
}
