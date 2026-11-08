import "dotenv/config";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, expect, type Page } from "@playwright/test";
import { eq, inArray } from "drizzle-orm";
import { db, pool } from "../src/db";
import { directoryImports, employees, leaveRequests, teams } from "../src/db/schema";
import { readDirectoryFile } from "../src/db/directory";
import type { Balance, DirectoryStatus, Employee, LeaveRequest } from "../src/lib/types";

const baseURL = process.env.SMOKE_BASE_URL || "http://localhost:3000";
const useExampleFixture = process.argv.includes("--example-fixture");
const token = `Browser verification ${Date.now()}`;
const createdRequestIds: string[] = [];
const browserErrors: string[] = [];
let fixtureAttempted = false;
let previousPeople: { id: string; isActive: boolean }[] = [];
let previousTeams: (typeof teams.$inferSelect)[] = [];

async function ready(page: Page) {
  await expect(page.locator(".workspace-loading")).toHaveCount(0);
  await expect(page.locator(".stats-grid")).toBeVisible();
  await expect(page.locator(".is-refreshing")).toHaveCount(0);
}
async function identify(page: Page, person: Employee) {
  await page.goto(baseURL, { waitUntil: "networkidle" });
  await page
    .getByRole("link", { name: person.role === "MANAGER" ? /Manager Portal/ : /Employee Portal/ })
    .click();
  await page.getByLabel("FIND YOUR PROFILE").fill(person.id);
  const radio = page.getByRole("radio", {
    name: `Select ${person.firstName} ${person.lastName}, ID ${person.id}, ${person.teamName}`,
    exact: true,
  });
  await page.locator("label.identity-profile-card").filter({ has: radio }).click();
  await expect(radio).toBeChecked();
  await page.screenshot({
    path: `artifacts/identify-${person.role.toLowerCase()}.png`,
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(
    page.getByRole("heading", { name: `Welcome back, ${person.firstName}` }),
  ).toBeVisible();
  await ready(page);
  const selectedCookie = (await page.context().cookies()).find(
    (cookie) => cookie.name === "nordia-profile",
  );
  assert.equal(decodeURIComponent(selectedCookie?.value ?? ""), person.id);
}
async function chooseYear(page: Page, year: number) {
  const updated = page.waitForResponse((response) =>
    response.url().includes(`/balance?year=${year}`),
  );
  await page.getByLabel("Leave allowance year").selectOption(String(year));
  await updated;
  await ready(page);
}
async function createRequest(page: Page, start: string, end: string, reason: string) {
  await page
    .locator(".page-actions")
    .getByRole("button", { name: "Request leave", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Request leave", exact: true });
  await dialog.getByLabel(/Start date/).fill(start);
  await dialog.getByLabel(/End date/).fill(end);
  await dialog.getByLabel(/Reason/).fill(reason);
  const submitted = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/leave-requests") && response.request().method() === "POST",
  );
  await dialog.getByRole("button", { name: "Send request" }).click();
  const response = await submitted;
  assert.equal(response.status(), 201);
  const request = (await response.json()).data as LeaveRequest;
  createdRequestIds.push(request.id);
  await expect(dialog).toHaveCount(0);
  await ready(page);
  return request;
}
async function logout(page: Page) {
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "Switch user / Log out", exact: true })
    .click();
  await expect(page).toHaveURL(`${baseURL}/`);
  await expect(page.getByRole("link", { name: /Employee Portal/ })).toBeVisible();
  assert.equal(
    (await page.context().cookies()).some(
      (cookie) => cookie.name === "nordia-profile" && cookie.value,
    ),
    false,
  );
}
async function installExampleFixture(page: Page) {
  // Opt-in browser TEST ONLY, never an application seed or fallback.
  // These are the two identities and IDs explicitly supplied in the user's example.
  assert.equal(
    await readDirectoryFile(),
    null,
    "Refusing test fixtures when an actual employees.json exists.",
  );
  const active = await db.select().from(employees).where(eq(employees.isActive, true));
  const existing = await db
    .select()
    .from(employees)
    .where(inArray(employees.id, ["1", "2"]));
  const imported = await db
    .select()
    .from(directoryImports)
    .where(eq(directoryImports.id, "primary"));
  assert.equal(
    active.length + existing.length + imported.length,
    0,
    "Example fixtures require an empty active directory. Use a dedicated test database.",
  );
  previousPeople = await db
    .select({ id: employees.id, isActive: employees.isActive })
    .from(employees);
  previousTeams = await db.select().from(teams);
  fixtureAttempted = true;
  const payload = [
    {
      id: 2,
      firstName: "Bilel",
      lastName: "Khemiri",
      role: "EMPLOYEE",
      team: "Platform",
      managerId: 1,
    },
    {
      id: 1,
      firstName: "Amel",
      lastName: "Ben Youssef",
      role: "MANAGER",
      team: "Platform",
      managerId: null,
    },
  ];
  const uploaded = page.waitForResponse((response) =>
    response.url().endsWith("/api/directory/import"),
  );
  await page
    .getByLabel("Upload employees.json")
    .setInputFiles({
      name: "employees.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(payload)),
    });
  assert.equal((await uploaded).status(), 201);
  await expect(page.getByText("Company directory connected", { exact: false })).toBeVisible();
}
async function cleanupFixture() {
  if (createdRequestIds.length)
    await db.delete(leaveRequests).where(inArray(leaveRequests.id, createdRequestIds));
  if (!fixtureAttempted) return;
  await db.delete(leaveRequests).where(inArray(leaveRequests.employeeId, ["1", "2"]));
  await db.update(teams).set({ managerId: null }).where(eq(teams.id, "Platform"));
  await db
    .update(employees)
    .set({ managerId: null })
    .where(inArray(employees.id, ["1", "2"]));
  await db.delete(employees).where(inArray(employees.id, ["1", "2"]));
  await db.delete(directoryImports).where(eq(directoryImports.id, "primary"));
  if (!previousTeams.some((team) => team.id === "Platform"))
    await db.delete(teams).where(eq(teams.id, "Platform"));
  for (const person of previousPeople)
    await db
      .update(employees)
      .set({ isActive: person.isActive })
      .where(eq(employees.id, person.id));
  for (const team of previousTeams)
    await db
      .update(teams)
      .set({ name: team.name, managerId: team.managerId })
      .where(eq(teams.id, team.id));
}
async function main() {
  await mkdir("artifacts", { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const employeeContext = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      deviceScaleFactor: 1,
    });
    const page = await employeeContext.newPage();
    page.on("pageerror", (error) => browserErrors.push(error.message));
    await page.goto(baseURL, { waitUntil: "networkidle" });
    await expect(page.getByRole("link", { name: /Employee Portal/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Manager Portal/ })).toBeVisible();
    await page.screenshot({
      path: "artifacts/welcome.png",
      fullPage: true,
      animations: "disabled",
    });
    await page.goto(`${baseURL}/dashboard`, { waitUntil: "networkidle" });
    await expect(page).toHaveURL(`${baseURL}/`);
    const mobileContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const mobile = await mobileContext.newPage();
    mobile.on("pageerror", (error) => browserErrors.push(error.message));
    await mobile.goto(baseURL, { waitUntil: "networkidle" });
    assert.equal(
      await mobile.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    await mobile.screenshot({
      path: "artifacts/welcome-mobile.png",
      fullPage: true,
      animations: "disabled",
    });
    await mobile.getByRole("link", { name: /Employee Portal/ }).click();
    await expect(mobile.getByLabel("FIND YOUR PROFILE")).toBeVisible();
    assert.equal(
      await mobile.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    await mobile.screenshot({
      path: "artifacts/identify-mobile.png",
      fullPage: true,
      animations: "disabled",
    });
    let status = (await (await page.request.get(`${baseURL}/api/directory`)).json())
      .data as DirectoryStatus;
    if (status.state !== "ready" && useExampleFixture) {
      await installExampleFixture(page);
      status = (await (await page.request.get(`${baseURL}/api/directory`)).json()).data;
    }
    if (status.state !== "ready") {
      await page.goto(`${baseURL}/identify/manager`, { waitUntil: "networkidle" });
      await expect(page.getByRole("button", { name: "Continue", exact: true })).toBeDisabled();
      assert.equal(await page.getByRole("radio").count(), 0);
      assert.deepEqual(browserErrors, []);
      console.log(
        "PASS: welcome portals, unidentified-dashboard redirect, honest missing-directory state, and mobile layout. Profile workflow not run because the actual employees.json is absent.",
      );
      return;
    }
    const people = (await (await page.request.get(`${baseURL}/api/employees`)).json())
      .data as Employee[];
    const employee = people.find(
      (person) =>
        person.role === "EMPLOYEE" &&
        person.managerId &&
        people.some((manager) => manager.id === person.managerId && manager.role === "MANAGER"),
    );
    assert.ok(employee, "The supplied test directory needs an employee with an assigned manager.");
    const manager = people.find((person) => person.id === employee.managerId)!;
    assert.equal(manager.teamId, employee.teamId);
    await identify(page, employee);
    await page.getByRole("button", { name: "My profile", exact: true }).click();
    await expect(page.locator(".personal-profile")).toContainText(
      `${manager.firstName} ${manager.lastName}`,
    );
    await expect(page.locator(".personal-profile")).toContainText(`Manager ID ${manager.id}`);
    await page.screenshot({
      path: "artifacts/employee-profile.png",
      fullPage: true,
      animations: "disabled",
    });
    await page.getByRole("button", { name: "Overview", exact: true }).click();
    await ready(page);
    await page.screenshot({
      path: "artifacts/employee-dashboard.png",
      fullPage: true,
      animations: "disabled",
    });
    const year = new Date().getUTCFullYear() + 1;
    const originalBalance = (
      await (
        await page.request.get(`${baseURL}/api/employees/${employee.id}/balance?year=${year}`)
      ).json()
    ).data as Balance;
    assert.ok(
      originalBalance.available >= 5,
      "Run the mutation checks against a test profile with at least five days available next year.",
    );
    const originalHistory = (
      await (
        await page.request.get(`${baseURL}/api/employees/${employee.id}/leave-requests`)
      ).json()
    ).data as LeaveRequest[];
    const start = new Date(Date.UTC(year, 0, 8));
    while (start.getUTCDay() !== 1) start.setUTCDate(start.getUTCDate() + 1);
    const iso = (offset: number) => {
      const value = new Date(start);
      value.setUTCDate(value.getUTCDate() + offset);
      return value.toISOString().slice(0, 10);
    };
    for (let tries = 0; tries < 40; tries++) {
      if (
        !originalHistory.some(
          (request) =>
            request.status !== "REJECTED" &&
            request.startDate <= iso(8) &&
            request.endDate >= iso(0),
        )
      )
        break;
      start.setUTCDate(start.getUTCDate() + 7);
    }
    const managerContext = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      deviceScaleFactor: 1,
    });
    const managerPage = await managerContext.newPage();
    managerPage.on("pageerror", (error) => browserErrors.push(error.message));
    await identify(managerPage, manager);
    const pendingBefore = (
      await (await managerPage.request.get(`${baseURL}/api/manager/leave-requests/pending`)).json()
    ).summary.pendingCount as number;
    await chooseYear(page, year);
    const first = await createRequest(page, iso(0), iso(2), `${token} approved`);
    assert.equal(first.employeeId, employee.id);
    assert.equal(first.managerId, manager.id);
    assert.equal(first.teamId, employee.teamId);
    await expect(
      managerPage
        .locator(".stat-card")
        .filter({ hasText: "Awaiting your review" })
        .locator(".stat-value"),
    ).toHaveText(new RegExp(`^${pendingBefore + 1}\\s*requests$`), { timeout: 22000 });
    const approvedRow = managerPage.locator("tbody tr").filter({ hasText: `${token} approved` });
    await expect(approvedRow).toBeVisible();
    await managerPage.screenshot({
      path: "artifacts/manager-dashboard.png",
      fullPage: true,
      animations: "disabled",
    });
    await approvedRow.getByRole("button", { name: /^Approve / }).click();
    await managerPage.getByLabel("Your comment").fill("Enjoy your browser-verified break!");
    const approval = managerPage.waitForResponse((response) =>
      response.url().includes(`/${first.id}/approve`),
    );
    await managerPage.getByRole("button", { name: "Approve request", exact: true }).click();
    assert.equal((await approval).status(), 200);
    await page.reload({ waitUntil: "networkidle" });
    await ready(page);
    await chooseYear(page, year);
    await expect(
      page.locator(".stat-card").filter({ hasText: "Used leave" }).locator(".stat-value"),
    ).toContainText(String(originalBalance.used + 3));
    const second = await createRequest(page, iso(7), iso(8), `${token} rejected`);
    await managerPage.evaluate(() => window.dispatchEvent(new Event("focus")));
    const rejectedRow = managerPage.locator("tbody tr").filter({ hasText: `${token} rejected` });
    await expect(rejectedRow).toBeVisible({ timeout: 22000 });
    await rejectedRow.getByRole("button", { name: /^Reject / }).click();
    const rejectionDialog = managerPage.getByRole("dialog", { name: "Reject leave request" });
    await rejectionDialog.getByRole("button", { name: "Reject request", exact: true }).click();
    await expect(rejectionDialog.getByRole("alert")).toContainText("Please add a comment");
    await managerPage
      .getByLabel("Your comment")
      .fill("Please choose another week for team coverage.");
    const rejection = managerPage.waitForResponse((response) =>
      response.url().includes(`/${second.id}/reject`),
    );
    await rejectionDialog.getByRole("button", { name: "Reject request", exact: true }).click();
    assert.equal((await rejection).status(), 200);
    const finalBalance = (
      await (
        await page.request.get(`${baseURL}/api/employees/${employee.id}/balance?year=${year}`)
      ).json()
    ).data as Balance;
    assert.equal(finalBalance.used, originalBalance.used + 3);
    assert.equal(finalBalance.pending, originalBalance.pending);
    assert.equal(finalBalance.available, originalBalance.available - 3);
    await page.reload({ waitUntil: "networkidle" });
    await ready(page);
    await chooseYear(page, year);
    await page.getByRole("button", { name: /^My requests/ }).click();
    await page.getByLabel("Search requests").fill(`${token} rejected`);
    await page
      .locator("tbody tr")
      .getByRole("button", { name: /View request for/ })
      .click();
    await expect(page.locator(".manager-comment")).toContainText(
      "Please choose another week for team coverage.",
    );
    await page.getByRole("button", { name: "Close dialog" }).click();
    await logout(page);
    await logout(managerPage);
    await page.goto(`${baseURL}/dashboard`, { waitUntil: "networkidle" });
    await expect(page).toHaveURL(`${baseURL}/`);
    assert.deepEqual(browserErrors, []);
    console.log(
      `PASS: welcome → role → name/ID selection → confirmation → correct dashboard. Verified ${employee.id} → manager ${manager.id}, live pending counter, profile details, approval/rejection, balances, comments, logout, dashboard guard, and mobile overflow.`,
    );
    console.log(
      fixtureAttempted
        ? "The two explicitly supplied example identities were used as temporary test fixtures, not installed company data."
        : "All tested profiles and assignments came from the supplied employee directory.",
    );
  } finally {
    await browser.close();
    await cleanupFixture();
    console.log(
      `Removed ${createdRequestIds.length} browser-test requests${fixtureAttempted ? " and restored the original empty active directory" : ""}. No permanent test profiles remain.`,
    );
  }
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
