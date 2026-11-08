// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { BalanceCards } from "@/components/balance-cards";
import { RequestHistory } from "@/components/request-history";
import { RequestDialog, ReviewDialog } from "@/components/leave-dialogs";
import { api } from "@/lib/client-api";
import type { Balance, Employee, LeaveRequest } from "@/lib/types";

const employee: Employee = {
  id: "test-person",
  firstName: "sirine",
  lastName: "bensalah",
  email: "sirine@test.example",
  role: "EMPLOYEE",
  teamId: "engineering",
  teamName: "Engineering",
  managerId: "test-manager",
};
const balance: Balance = {
  year: 2030,
  annualAllowance: 25,
  used: 8,
  remaining: 17,
  pending: 3,
  available: 14,
};
const leave: LeaveRequest = {
  id: "request-a",
  employeeId: employee.id,
  managerId: employee.managerId,
  teamId: employee.teamId,
  startDate: "2030-01-07",
  endDate: "2030-01-11",
  workingDays: 5,
  reason: "Mountain getaway",
  status: "APPROVED",
  managerComment: "Enjoy!",
  teamWarning: false,
  createdAt: "2029-12-20T00:00:00Z",
  updatedAt: "2029-12-21T00:00:00Z",
  employee,
  warningDays: [],
};
const historyProps = {
  requests: [leave],
  filter: "ALL" as const,
  onFilter: vi.fn(),
  onSelect: vi.fn(),
  onReview: vi.fn(),
  onViewAll: vi.fn(),
  onNewRequest: vi.fn(),
};
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("employee dashboard components", () => {
  it("shows the correct annual, used, remaining and pending balances", () => {
    render(<BalanceCards balance={balance} pendingCount={1} />);
    expect(screen.getByText("25")).toBeInTheDocument();
    expect(screen.getByText("17")).toBeInTheDocument();
    expect(screen.getByText("8")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText(/14 available · 3 reserved/)).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "17");
  });
  it("lets employees jump to their pending requests", () => {
    const onPending = vi.fn();
    render(<BalanceCards balance={balance} pendingCount={1} onPending={onPending} />);
    fireEvent.click(screen.getByRole("button", { name: /1 request awaiting review/ }));
    expect(onPending).toHaveBeenCalledOnce();
  });
  it("shows request dates, duration, reason and status", () => {
    render(<RequestHistory {...historyProps} />);
    expect(screen.getByText("Jan 7 – 11")).toBeInTheDocument();
    expect(screen.getByText("Mountain getaway")).toBeInTheDocument();
    expect(screen.getAllByText("Approved").length).toBeGreaterThan(0);
    expect(screen.getByText(/Showing 1 of 1 requests/)).toBeInTheDocument();
  });
  it("passes the selected status to the request filter", () => {
    render(<RequestHistory {...historyProps} />);
    fireEvent.click(screen.getByRole("tab", { name: /Pending/ }));
    expect(historyProps.onFilter).toHaveBeenCalledWith("PENDING");
  });
  it("opens full request details from the history", () => {
    render(<RequestHistory {...historyProps} />);
    fireEvent.click(screen.getByRole("button", { name: /View request for Jan 7/ }));
    expect(historyProps.onSelect).toHaveBeenCalledWith(leave);
  });
  it("shows a useful empty state", () => {
    render(<RequestHistory {...historyProps} requests={[]} />);
    expect(screen.getByText("Your next break starts here.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Request leave" })).toBeInTheDocument();
  });
  it("submits a valid leave form and invokes the success callback", async () => {
    const post = vi.spyOn(api, "post").mockResolvedValue({ data: { data: leave } });
    const onSuccess = vi.fn();
    render(
      <RequestDialog user={employee} balance={balance} onClose={vi.fn()} onSuccess={onSuccess} />,
    );
    fireEvent.change(screen.getByLabelText(/Start date/), { target: { value: "2030-01-07" } });
    fireEvent.change(screen.getByLabelText(/End date/), { target: { value: "2030-01-11" } });
    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: "A little pause" } });
    expect(screen.getByText("5 working days")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Send request/ }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());
    expect(post).toHaveBeenCalledWith(
      "/leave-requests",
      { startDate: "2030-01-07", endDate: "2030-01-11", reason: "A little pause" },
      { headers: { "x-user-id": employee.id } },
    );
  });
  it("shows required-date validation without making an API call", async () => {
    const post = vi.spyOn(api, "post");
    render(
      <RequestDialog user={employee} balance={balance} onClose={vi.fn()} onSuccess={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Send request/ }));
    expect(screen.getAllByText(/Enter a valid date/)).toHaveLength(2);
    expect(post).not.toHaveBeenCalled();
  });
  it("requires a comment before rejecting a request", () => {
    render(
      <ReviewDialog
        request={{ ...leave, status: "PENDING" }}
        decision="REJECTED"
        user={{ ...employee, role: "MANAGER" }}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Reject request" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Please add a comment");
  });
});
