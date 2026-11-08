import { sql } from "drizzle-orm";
import {
  pgTable,
  pgEnum,
  text,
  integer,
  boolean,
  date,
  timestamp,
  index,
  check,
  jsonb,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

export const employeeRole = pgEnum("employee_role", ["EMPLOYEE", "MANAGER"]);
export const leaveStatus = pgEnum("leave_status", ["PENDING", "APPROVED", "REJECTED"]);

export const teams = pgTable("teams", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  // Informational only. Employee.managerId is the authoritative reporting relationship.
  managerId: text("manager_id")
    .unique()
    .references((): AnyPgColumn => employees.id, { onDelete: "set null" }),
});

export const employees = pgTable(
  "employees",
  {
    id: text("id").primaryKey(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    email: text("email").unique(),
    role: employeeRole("role").notNull().default("EMPLOYEE"),
    teamId: text("team_id")
      .notNull()
      .references((): AnyPgColumn => teams.id),
    managerId: text("manager_id").references((): AnyPgColumn => employees.id),
    // Existing fictional seed records become inactive when this migration is applied.
    isActive: boolean("is_active").notNull().default(false),
  },
  (table) => [
    index("employee_team_idx").on(table.teamId),
    index("employee_manager_idx").on(table.managerId),
    index("employee_active_role_idx").on(table.isActive, table.role),
  ],
);

export const leaveRequests = pgTable(
  "leave_requests",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    employeeId: text("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    // Nullable only for archived pre-directory history. New requests always receive both fields server-side.
    managerId: text("manager_id").references(() => employees.id),
    teamId: text("team_id").references(() => teams.id),
    startDate: date("start_date", { mode: "string" }).notNull(),
    endDate: date("end_date", { mode: "string" }).notNull(),
    workingDays: integer("working_days").notNull(),
    reason: text("reason"),
    status: leaveStatus("status").notNull().default("PENDING"),
    managerComment: text("manager_comment"),
    teamWarning: boolean("team_warning").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("leave_employee_status_idx").on(table.employeeId, table.status),
    index("leave_manager_status_idx").on(table.managerId, table.status),
    index("leave_dates_idx").on(table.startDate, table.endDate),
    check("leave_date_order", sql`${table.endDate} >= ${table.startDate}`),
    check("leave_positive_days", sql`${table.workingDays} > 0`),
    check(
      "rejection_comment_required",
      sql`${table.status} != 'REJECTED' OR length(trim(${table.managerComment})) > 0 AND ${table.managerComment} IS NOT NULL`,
    ),
  ],
);

export const directoryImports = pgTable("directory_imports", {
  id: text("id").primaryKey(),
  fileName: text("file_name").notNull(),
  source: text("source").notNull(),
  checksum: text("checksum").notNull(),
  payload: jsonb("payload").$type<unknown>().notNull(),
  importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
});
