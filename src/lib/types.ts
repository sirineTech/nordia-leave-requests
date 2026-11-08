export type WorkspaceView = "overview" | "requests" | "calendar" | "profile";
export type Role = "EMPLOYEE" | "MANAGER";
export type LeaveStatus = "PENDING" | "APPROVED" | "REJECTED";
export interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  role: Role;
  teamId: string;
  teamName: string;
  managerId: string | null;
}
export interface DirectoryStatus {
  state: "ready" | "missing" | "invalid";
  fileName: string | null;
  source: string | null;
  profileCount: number;
  employeeCount: number;
  managerCount: number;
  teamCount: number;
  importedAt: string | null;
  message: string | null;
}
export interface WarningDay {
  date: string;
  away: number;
  total: number;
  percentage: number;
}
export interface LeaveRequest {
  id: string;
  employeeId: string;
  managerId: string | null;
  teamId: string | null;
  startDate: string;
  endDate: string;
  workingDays: number;
  reason: string | null;
  status: LeaveStatus;
  managerComment: string | null;
  teamWarning: boolean;
  createdAt: string;
  updatedAt: string;
  employee: Employee;
  warningDays: WarningDay[];
}
export interface Balance {
  year: number;
  annualAllowance: number;
  used: number;
  remaining: number;
  pending: number;
  available: number;
}
export interface CalendarEvent {
  id: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  startDate: string;
  endDate: string;
}
export interface TeamAvailability {
  name: string;
  members: Employee[];
  events: CalendarEvent[];
}
export interface CreateLeaveInput {
  startDate: string;
  endDate: string;
  reason?: string;
}
export interface ManagerSummary {
  teamSize: number;
  pendingDays: number;
  pendingCount: number;
  approvedThisMonth: number;
  awayToday: number;
}
