import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "node:http";
import supertest from "supertest";
import { and, eq, inArray } from "drizzle-orm";
import { db, pool } from "@/db";
import { employees, leaveRequests, teams, directoryImports } from "@/db/schema";
import { handleRequest } from "@/lib/api-handler";
import { ensureDirectory, importEmployeeDirectory } from "@/db/directory";

const prefix = `test-${crypto.randomUUID().slice(0, 8)}`;
const ids = {
  employee: `${prefix}-employee`,
  colleague: `${prefix}-colleague`,
  third: `${prefix}-third`,
  manager: `${prefix}-manager`,
  outsider: `${prefix}-outsider`,
  otherManager: `${prefix}-other-manager`,
};
const teamIds = [`${prefix}-team-a`, `${prefix}-team-b`];
const server = createServer(async (incoming, outgoing) => {
  try {
    const parts: Buffer[] = [];
    for await (const part of incoming) parts.push(Buffer.from(part));
    const headers = new Headers();
    for (const [name, value] of Object.entries(incoming.headers))
      if (value) headers.set(name, Array.isArray(value) ? value.join(", ") : value);
    const response = await handleRequest(
      new Request(`http://localhost${incoming.url}`, {
        method: incoming.method,
        headers,
        ...(parts.length ? { body: Buffer.concat(parts).toString() } : {}),
      }),
    );
    outgoing.statusCode = response.status;
    response.headers.forEach((value, key) => outgoing.setHeader(key, value));
    outgoing.end(await response.text());
  } catch (error) {
    outgoing.statusCode = 500;
    outgoing.end(String(error));
  }
});
const client = supertest(server);
const create = (startDate = "2030-01-07", endDate = "2030-01-11", user = ids.employee) =>
  client
    .post("/api/leave-requests")
    .set("x-user-id", user)
    .send({ startDate, endDate, reason: "Test leave" });
const balance = (user = ids.employee, year = 2030) =>
  client.get(`/api/employees/${user}/balance?year=${year}`).set("x-user-id", user);

beforeAll(async () => {
  await ensureDirectory();
  await db.insert(teams).values([
    { id: teamIds[0], name: `${prefix} Engineering` },
    { id: teamIds[1], name: `${prefix} Product` },
  ]);
  await db.insert(employees).values(
    Object.entries(ids).map(([name, id]) => ({
      id,
      firstName: name,
      lastName: "Test",
      email: `${id}@test.example`,
      isActive: true,
      role:
        name === "manager" || name === "otherManager"
          ? ("MANAGER" as const)
          : ("EMPLOYEE" as const),
      teamId: name === "outsider" || name === "otherManager" ? teamIds[1] : teamIds[0],
    })),
  );
  await db
    .update(employees)
    .set({ managerId: ids.manager })
    .where(inArray(employees.id, [ids.employee, ids.colleague, ids.third]));
  await db
    .update(employees)
    .set({ managerId: ids.otherManager })
    .where(eq(employees.id, ids.outsider));
  await db.update(teams).set({ managerId: ids.manager }).where(eq(teams.id, teamIds[0]));
  await db.update(teams).set({ managerId: ids.otherManager }).where(eq(teams.id, teamIds[1]));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
});
beforeEach(async () => {
  await db.delete(leaveRequests).where(inArray(leaveRequests.employeeId, Object.values(ids)));
});
afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await db.delete(leaveRequests).where(inArray(leaveRequests.employeeId, Object.values(ids)));
  await db.update(teams).set({ managerId: null }).where(inArray(teams.id, teamIds));
  await db
    .update(employees)
    .set({ managerId: null })
    .where(inArray(employees.id, Object.values(ids)));
  await db.delete(employees).where(inArray(employees.id, Object.values(ids)));
  await db.delete(teams).where(inArray(teams.id, teamIds));
  await pool.end();
});

describe("REST API with real PostgreSQL persistence", () => {
  it("requires a selected identity for private records", async () => {
    expect((await client.get(`/api/employees/${ids.employee}/balance`)).status).toBe(401);
  });
  it("creates a valid five-day request", async () => {
    const response = await create();
    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      employeeId: ids.employee,
      managerId: ids.manager,
      teamId: teamIds[0],
      workingDays: 5,
      status: "PENDING",
      reason: "Test leave",
    });
    expect((await balance()).body.data).toMatchObject({ used: 0, pending: 5, available: 20 });
  });
  it("rejects requests exceeding the balance including pending leave", async () => {
    expect((await create("2030-01-07", "2030-02-01")).status).toBe(201);
    const response = await create("2030-02-04", "2030-02-11");
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe("INSUFFICIENT_BALANCE");
  });
  it("rejects overlapping requests", async () => {
    await create();
    const response = await create("2030-01-10", "2030-01-14");
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("OVERLAPPING_REQUEST");
  });
  it("allows a valid non-overlapping request", async () => {
    await create();
    expect((await create("2030-01-14", "2030-01-16")).status).toBe(201);
    const history = await client
      .get(`/api/employees/${ids.employee}/leave-requests`)
      .set("x-user-id", ids.employee);
    expect(history.body.data).toHaveLength(2);
  });
  it("allows the assigned manager to approve and updates the balance", async () => {
    const created = await create();
    const reviewed = await client
      .patch(`/api/leave-requests/${created.body.data.id}/approve`)
      .set("x-user-id", ids.manager)
      .send({ comment: "Enjoy your break!" });
    expect(reviewed.status).toBe(200);
    expect(reviewed.body.data.status).toBe("APPROVED");
    expect((await balance()).body.data).toMatchObject({
      used: 5,
      pending: 0,
      remaining: 20,
      available: 20,
    });
  });
  it("requires a rejection comment and releases reserved days after rejection", async () => {
    const created = await create();
    const endpoint = `/api/leave-requests/${created.body.data.id}/reject`;
    expect(
      (await client.patch(endpoint).set("x-user-id", ids.manager).send({ comment: "  " })).status,
    ).toBe(400);
    const response = await client
      .patch(endpoint)
      .set("x-user-id", ids.manager)
      .send({ comment: "Please choose another week." });
    expect(response.status).toBe(200);
    expect(response.body.data.managerComment).toBe("Please choose another week.");
    expect((await balance()).body.data).toMatchObject({ used: 0, pending: 0, available: 25 });
  });
  it("prevents another team's manager from viewing or reviewing records", async () => {
    const created = await create();
    expect(
      (
        await client
          .get(`/api/employees/${ids.employee}/leave-requests`)
          .set("x-user-id", ids.otherManager)
      ).status,
    ).toBe(403);
    expect(
      (
        await client
          .patch(`/api/leave-requests/${created.body.data.id}/approve`)
          .set("x-user-id", ids.otherManager)
          .send({})
      ).status,
    ).toBe(403);
    const ownTeam = await client
      .get("/api/manager/leave-requests/pending")
      .set("x-user-id", ids.otherManager);
    expect(ownTeam.status).toBe(200);
    expect(ownTeam.body.data).toHaveLength(0);
  });
  it("prevents employees from accessing coworkers' history or manager endpoints", async () => {
    expect(
      (
        await client
          .get(`/api/employees/${ids.colleague}/leave-requests`)
          .set("x-user-id", ids.employee)
      ).status,
    ).toBe(403);
    expect(
      (await client.get("/api/manager/leave-requests/pending").set("x-user-id", ids.employee))
        .status,
    ).toBe(403);
  });
  it("validates dates and malformed request bodies on the server", async () => {
    expect((await create("2030-02-30", "2030-03-04")).status).toBe(400);
    expect((await create("1999-06-07", "1999-06-08")).status).toBe(400);
    expect((await create("2101-06-07", "2101-06-08")).status).toBe(400);
    expect((await create("2030-01-11", "2030-01-07")).status).toBe(400);
    expect((await create("2030-01-12", "2030-01-13")).status).toBe(400);
    expect(
      (
        await client
          .post("/api/leave-requests")
          .set("x-user-id", ids.employee)
          .set("Content-Type", "application/json")
          .send("not-json")
      ).status,
    ).toBe(400);
  });
  it("splits cross-year requests into each annual allowance", async () => {
    expect((await create("2029-12-31", "2030-01-04")).status).toBe(201);
    expect((await balance(ids.employee, 2029)).body.data.pending).toBe(1);
    expect((await balance(ids.employee, 2030)).body.data.pending).toBe(4);
  });
  it("warns about team availability without automatically rejecting the request", async () => {
    for (const person of [ids.colleague, ids.third]) {
      const request = await create("2030-01-07", "2030-01-11", person);
      await client
        .patch(`/api/leave-requests/${request.body.data.id}/approve`)
        .set("x-user-id", ids.manager)
        .send({});
    }
    const created = await create();
    expect(created.status).toBe(201);
    expect(created.body.data.teamWarning).toBe(true);
    expect(created.body.data.warningDays[0].percentage).toBe(50);
    const reviewed = await client
      .patch(`/api/leave-requests/${created.body.data.id}/approve`)
      .set("x-user-id", ids.manager)
      .send({});
    expect(reviewed.status).toBe(200);
    expect(reviewed.body.data.status).toBe("APPROVED");
  });
  it("serializes concurrent creates so the allowance cannot be overspent", async () => {
    const results = await Promise.all([
      create("2030-01-07", "2030-01-25"),
      create("2030-02-04", "2030-02-22"),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([201, 422]);
    expect((await balance()).body.data.pending).toBe(15);
  });
  it("prevents a request from being reviewed twice", async () => {
    const created = await create();
    const endpoint = `/api/leave-requests/${created.body.data.id}/approve`;
    expect((await client.patch(endpoint).set("x-user-id", ids.manager).send({})).status).toBe(200);
    expect((await client.patch(endpoint).set("x-user-id", ids.manager).send({})).status).toBe(409);
  });
  it("keeps private reasons and comments off the shared calendar", async () => {
    const created = await create();
    await client
      .patch(`/api/leave-requests/${created.body.data.id}/approve`)
      .set("x-user-id", ids.manager)
      .send({ comment: "Private note" });
    const calendar = await client.get("/api/team/availability").set("x-user-id", ids.colleague);
    expect(calendar.status).toBe(200);
    expect(calendar.body.data.events).toHaveLength(1);
    expect(calendar.body.data.events[0]).not.toHaveProperty("reason");
    expect(calendar.body.data.events[0]).not.toHaveProperty("managerComment");
    const persisted = await db
      .select()
      .from(leaveRequests)
      .where(
        and(eq(leaveRequests.id, created.body.data.id), eq(leaveRequests.employeeId, ids.employee)),
      );
    expect(persisted[0].managerComment).toBe("Private note");
  });
});

describe("explicit profile identification and automatic manager assignment", () => {
  it("searches the active directory by exact ID and role", async () => {
    const result = await client.get(`/api/employees?role=MANAGER&search=${ids.manager}`);
    expect(result.status).toBe(200);
    expect(result.body.data.map((person: { id: string }) => person.id)).toEqual([ids.manager]);
    const wrongRole = await client.get(`/api/employees?role=MANAGER&search=${ids.employee}`);
    expect(wrongRole.body.data).toEqual([]);
  });
  it("confirms a profile, remembers its exact ID, and supports cookie-based requests", async () => {
    const selected = await client
      .post("/api/identity")
      .send({ employeeId: ids.employee, portal: "employee" });
    expect(selected.status).toBe(200);
    expect(selected.body.data.employee.id).toBe(ids.employee);
    expect(selected.body.data.redirectTo).toBe("/dashboard");
    const cookie = selected.headers["set-cookie"][0].split(";")[0];
    expect(cookie).toContain(`nordia-profile=${ids.employee}`);
    const response = await client
      .get(`/api/employees/${ids.employee}/balance?year=2030`)
      .set("Cookie", cookie);
    expect(response.status).toBe(200);
    expect(response.body.data.available).toBe(25);
  });
  it("does not allow an employee profile to enter the manager portal", async () => {
    const response = await client
      .post("/api/identity")
      .send({ employeeId: ids.employee, portal: "manager" });
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("PORTAL_ROLE_MISMATCH");
  });
  it("does not confirm an ID absent from the active directory", async () => {
    expect(
      (
        await client
          .post("/api/identity")
          .send({ employeeId: `${prefix}-missing`, portal: "employee" })
      ).status,
    ).toBe(404);
  });
  it("clears the remembered identity on Switch User / Logout", async () => {
    const response = await client.delete("/api/identity");
    expect(response.status).toBe(200);
    expect(response.body.data.redirectTo).toBe("/");
    expect(response.headers["set-cookie"][0]).toContain("Max-Age=0");
  });
  it("does not let a stale tab override the selected profile cookie", async () => {
    const response = await client
      .get("/api/manager/leave-requests/pending")
      .set("Cookie", `nordia-profile=${ids.employee}`)
      .set("x-user-id", ids.manager);
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("IDENTITY_CHANGED");
  });
  it("routes a new request and pending counter only to the employee's managerId", async () => {
    const created = await create();
    expect(created.body.data.managerId).toBe(ids.manager);
    expect(created.body.data.teamId).toBe(teamIds[0]);
    const assigned = await client
      .get("/api/manager/leave-requests/pending")
      .set("x-user-id", ids.manager);
    expect(assigned.body.data.map((item: { id: string }) => item.id)).toEqual([
      created.body.data.id,
    ]);
    expect(assigned.body.summary.pendingCount).toBe(1);
    const other = await client
      .get("/api/manager/leave-requests/pending")
      .set("x-user-id", ids.otherManager);
    expect(other.body.data).toHaveLength(0);
    expect(other.body.summary.pendingCount).toBe(0);
  });
  it("denies another manager in the same team if the employee is not assigned to them", async () => {
    const unassigned = `${prefix}-unassigned-manager`;
    await db
      .insert(employees)
      .values({
        id: unassigned,
        firstName: "Unassigned",
        lastName: "Test Manager",
        role: "MANAGER",
        teamId: teamIds[0],
        isActive: true,
      });
    try {
      const created = await create();
      const pending = await client
        .get("/api/manager/leave-requests/pending")
        .set("x-user-id", unassigned);
      expect(pending.status).toBe(200);
      expect(pending.body.data).toEqual([]);
      expect(
        (
          await client
            .get(`/api/employees/${ids.employee}/leave-requests`)
            .set("x-user-id", unassigned)
        ).status,
      ).toBe(403);
      expect(
        (
          await client
            .patch(`/api/leave-requests/${created.body.data.id}/approve`)
            .set("x-user-id", unassigned)
            .send({})
        ).status,
      ).toBe(403);
      expect(
        (
          await client
            .patch(`/api/leave-requests/${created.body.data.id}/reject`)
            .set("x-user-id", unassigned)
            .send({ comment: "Not my report" })
        ).status,
      ).toBe(403);
    } finally {
      await db.delete(employees).where(eq(employees.id, unassigned));
    }
  });
  it("does not let the client override the automatically assigned manager or team", async () => {
    const response = await client
      .post("/api/leave-requests")
      .set("x-user-id", ids.employee)
      .send({
        startDate: "2030-01-07",
        endDate: "2030-01-11",
        managerId: ids.otherManager,
        teamId: teamIds[1],
      });
    expect(response.status).toBe(400);
  });
  it("rejects request creation if managerId is missing", async () => {
    await db.update(employees).set({ managerId: null }).where(eq(employees.id, ids.employee));
    try {
      const response = await create();
      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe("MANAGER_NOT_ASSIGNED");
    } finally {
      await db
        .update(employees)
        .set({ managerId: ids.manager })
        .where(eq(employees.id, ids.employee));
    }
  });
  it("rejects an invalid cross-team reporting relationship even if inserted outside the importer", async () => {
    await db
      .update(employees)
      .set({ managerId: ids.otherManager })
      .where(eq(employees.id, ids.employee));
    try {
      const response = await create();
      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe("INVALID_MANAGER_ASSIGNMENT");
    } finally {
      await db
        .update(employees)
        .set({ managerId: ids.manager })
        .where(eq(employees.id, ids.employee));
    }
  });
  it("does not identify archived profiles", async () => {
    await db.update(employees).set({ isActive: false }).where(eq(employees.id, ids.employee));
    try {
      expect(
        (await client.post("/api/identity").send({ employeeId: ids.employee, portal: "employee" }))
          .status,
      ).toBe(404);
    } finally {
      await db.update(employees).set({ isActive: true }).where(eq(employees.id, ids.employee));
    }
  });
  it("requires a real employees.json upload rather than an arbitrary named file", async () => {
    const response = await client
      .post("/api/directory/import")
      .attach("file", Buffer.from("[]"), "made-up-profiles.json");
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_DIRECTORY_FILE");
  });
  it("persists source managerId relationships transactionally without generating profiles", async () => {
    const priorPeople = await db
      .select({ id: employees.id, isActive: employees.isActive })
      .from(employees);
    const priorTeams = await db.select({ id: teams.id, managerId: teams.managerId }).from(teams);
    const [priorImport] = await db
      .select()
      .from(directoryImports)
      .where(eq(directoryImports.id, "primary"));
    try {
      await importEmployeeDirectory([
        {
          id: ids.employee,
          name: "Bilel Khemiri",
          role: "EMPLOYEE",
          team: { id: teamIds[0], name: `${prefix} Engineering` },
          managerId: ids.manager,
        },
        {
          id: ids.manager,
          name: "Amel Ben Youssef",
          role: "MANAGER",
          team: { id: teamIds[0], name: `${prefix} Engineering` },
          managerId: null,
        },
      ]);
      const [employee] = await db.select().from(employees).where(eq(employees.id, ids.employee));
      expect(employee.managerId).toBe(ids.manager);
      expect(employee.isActive).toBe(true);
      expect(employee.email).toBeNull();
      const active = await db
        .select({ id: employees.id })
        .from(employees)
        .where(eq(employees.isActive, true));
      expect(active.map((person) => person.id).sort()).toEqual([ids.employee, ids.manager].sort());
    } finally {
      for (const person of priorPeople)
        await db
          .update(employees)
          .set({ isActive: person.isActive })
          .where(eq(employees.id, person.id));
      for (const team of priorTeams)
        await db.update(teams).set({ managerId: team.managerId }).where(eq(teams.id, team.id));
      if (priorImport)
        await db
          .insert(directoryImports)
          .values(priorImport)
          .onConflictDoUpdate({ target: directoryImports.id, set: priorImport });
      else await db.delete(directoryImports).where(eq(directoryImports.id, "primary"));
    }
  });
});
