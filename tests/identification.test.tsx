// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import Identification from "@/components/identification";
import Welcome from "@/components/welcome";
import { EmployeeProfile } from "@/components/employee-profile";
import { parseEmployeeDirectory } from "@/lib/employee-directory";
import { api } from "@/lib/client-api";
import type { DirectoryStatus } from "@/lib/types";

const navigation = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));
// Only the two example identities supplied in the brief; these never seed production.
const people = parseEmployeeDirectory([
  { id: 2, name: "Bilel Khemiri", role: "EMPLOYEE", team: "Platform", managerId: 1 },
  { id: 1, name: "Amel Ben Youssef", role: "MANAGER", team: "Platform", managerId: null },
]).people;
const directory: DirectoryStatus = {
  state: "ready",
  fileName: "employees.json",
  source: "test fixture",
  profileCount: 2,
  employeeCount: 1,
  managerCount: 1,
  teamCount: 1,
  importedAt: "2026-01-01T00:00:00Z",
  message: null,
};
const missing: DirectoryStatus = {
  ...directory,
  state: "missing",
  fileName: null,
  profileCount: 0,
  employeeCount: 0,
  managerCount: 0,
  teamCount: 0,
  importedAt: null,
};
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  localStorage.clear();
});

describe("welcome and explicit profile identification", () => {
  it("provides separate employee and manager portal links", () => {
    render(<Welcome directory={directory} />);
    expect(screen.getByRole("link", { name: /Employee Portal/ })).toHaveAttribute(
      "href",
      "/identify/employee",
    );
    expect(screen.getByRole("link", { name: /Manager Portal/ })).toHaveAttribute(
      "href",
      "/identify/manager",
    );
  });
  it("shows a clear missing-file state instead of fictitious profiles", () => {
    render(<Identification portal="employee" people={[]} directory={missing} />);
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Import employees.json" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  });
  it("does not automatically select or confirm an employee", () => {
    const post = vi.spyOn(api, "post");
    render(<Identification portal="employee" people={people} directory={directory} />);
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: /Bilel Khemiri/ })).not.toBeChecked();
    expect(post).not.toHaveBeenCalled();
  });
  it("searches an employee by the preserved source ID", () => {
    render(<Identification portal="employee" people={people} directory={directory} />);
    fireEvent.change(screen.getByLabelText("FIND YOUR PROFILE"), { target: { value: "2" } });
    expect(
      screen.getByRole("radio", { name: /Bilel Khemiri, ID 2, Platform/ }),
    ).toBeInTheDocument();
  });
  it("supports a full-name search and an honest no-results state", () => {
    render(<Identification portal="employee" people={people} directory={directory} />);
    fireEvent.change(screen.getByLabelText("FIND YOUR PROFILE"), {
      target: { value: "Khemiri Bilel" },
    });
    expect(screen.getAllByRole("radio")).toHaveLength(1);
    fireEvent.change(screen.getByLabelText("FIND YOUR PROFILE"), {
      target: { value: "not in this directory" },
    });
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
    expect(screen.getByText("No profile found just yet.")).toBeInTheDocument();
  });
  it("shows the employee ID, team and actual assigned manager before confirmation", () => {
    const { container } = render(
      <Identification portal="employee" people={people} directory={directory} />,
    );
    fireEvent.click(screen.getByRole("radio", { name: /Bilel Khemiri/ }));
    const confirmation = within(container.querySelector(".identity-confirmation") as HTMLElement);
    expect(confirmation.getByText("Bilel Khemiri")).toBeInTheDocument();
    expect(confirmation.getByText("Platform")).toBeInTheDocument();
    expect(confirmation.getByText("2")).toBeInTheDocument();
    expect(confirmation.getByText("Amel Ben Youssef")).toBeInTheDocument();
    expect(confirmation.getByText("ID 1")).toBeInTheDocument();
    expect(confirmation.getByRole("button", { name: "Continue" })).toBeEnabled();
  });
  it("requires Continue before saving identity and navigating to the dashboard", async () => {
    const post = vi
      .spyOn(api, "post")
      .mockResolvedValue({ data: { data: { redirectTo: "/dashboard" } } });
    render(<Identification portal="employee" people={people} directory={directory} />);
    fireEvent.click(screen.getByRole("radio", { name: /Bilel Khemiri/ }));
    expect(post).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/dashboard"));
    expect(post).toHaveBeenCalledWith("/identity", { employeeId: "2", portal: "employee" });
  });
  it("lists only actual managers in the manager portal", () => {
    render(<Identification portal="manager" people={people} directory={directory} />);
    expect(screen.getAllByRole("radio")).toHaveLength(1);
    expect(
      screen.getByRole("radio", { name: /Amel Ben Youssef, ID 1, Platform/ }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: /Bilel/ })).not.toBeInTheDocument();
  });
  it("supports manager-ID search", () => {
    render(<Identification portal="manager" people={people} directory={directory} />);
    fireEvent.change(screen.getByLabelText("FIND YOUR PROFILE"), { target: { value: "1" } });
    expect(screen.getAllByRole("radio")).toHaveLength(1);
    fireEvent.change(screen.getByLabelText("FIND YOUR PROFILE"), { target: { value: "2" } });
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
  });
  it("clears a selected profile when the search changes", () => {
    render(<Identification portal="employee" people={people} directory={directory} />);
    fireEvent.click(screen.getByRole("radio", { name: /Bilel/ }));
    fireEvent.change(screen.getByLabelText("FIND YOUR PROFILE"), { target: { value: "other" } });
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  });
  it("keeps the user on identification if confirmation fails", async () => {
    vi.spyOn(api, "post").mockRejectedValue(new Error("This profile is no longer active."));
    render(<Identification portal="employee" people={people} directory={directory} />);
    fireEvent.click(screen.getByRole("radio", { name: /Bilel/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("no longer active"));
    expect(navigation.replace).not.toHaveBeenCalled();
  });
  it("renders the employee's source profile, assigned manager and leave balance", () => {
    render(
      <EmployeeProfile
        user={people[0]}
        manager={people[1]}
        balance={{
          year: 2030,
          annualAllowance: 25,
          used: 8,
          remaining: 17,
          pending: 3,
          available: 14,
        }}
        onRequest={vi.fn()}
        onLogout={vi.fn()}
      />,
    );
    expect(screen.getByText("Amel Ben Youssef")).toBeInTheDocument();
    expect(screen.getByText("Manager ID 1")).toBeInTheDocument();
    expect(screen.getByText("25 working days")).toBeInTheDocument();
    expect(screen.getByText("17")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Switch user/ })).toBeInTheDocument();
  });
});
