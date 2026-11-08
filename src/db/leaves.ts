import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { employees, leaveRequests } from "./schema";
import { MAX_DIRECTORY_BYTES } from "./directory";
import { parseExistingLeaves } from "@/lib/existing-leaves";
import { AppError } from "@/lib/leave-rules";

async function readLeavesFile(): Promise<unknown | null> {
  const candidates = process.env.LEAVES_DATASET_PATH
    ? [path.resolve(/* turbopackIgnore: true */ process.cwd(), process.env.LEAVES_DATASET_PATH)]
    : [
        path.join(process.cwd(), "leaves-existing.json"),
        path.join(process.cwd(), "data", "leaves-existing.json"),
        path.join(process.cwd(), "src", "data", "leaves-existing.json"),
      ];
  for (const file of candidates) {
    try {
      const info = await stat(file);
      if (!info.isFile() || info.size > MAX_DIRECTORY_BYTES)
        throw new AppError(
          "leaves-existing.json must be a file smaller than 1 MB.",
          400,
          "INVALID_LEAVES",
        );
      try {
        return JSON.parse((await readFile(file, "utf8")).replace(/^﻿/, ""));
      } catch (error) {
        if (error instanceof AppError) throw error;
        throw new AppError("leaves-existing.json contains invalid JSON.", 400, "INVALID_LEAVES");
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
  }
  return null;
}

/**
 * Loads the supplied existing leaves once the directory is in place.
 * Idempotent: rows already present (possibly reviewed since) are never overwritten.
 */
export async function importExistingLeaves(): Promise<number> {
  const payload = await readLeavesFile();
  if (payload === null) return 0;
  const people = await db
    .select({ id: employees.id, teamId: employees.teamId, managerId: employees.managerId })
    .from(employees)
    .where(eq(employees.isActive, true));
  const leaves = parseExistingLeaves(payload, people);
  if (leaves.length === 0) return 0;
  const inserted = await db
    .insert(leaveRequests)
    .values(leaves)
    .onConflictDoNothing({ target: leaveRequests.id })
    .returning({ id: leaveRequests.id });
  return inserted.length;
}
