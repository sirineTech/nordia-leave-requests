"use client";
import {
  LayoutGrid,
  CalendarRange,
  CalendarDays,
  BookOpen,
  CircleHelp,
  ArrowUpRight,
  ChevronRight,
  LogOut,
  UserRound,
  X,
  LoaderCircle,
} from "lucide-react";
import { Avatar, NordiaLogo } from "./ui";
import type { Employee, WorkspaceView } from "@/lib/types";

export type View = WorkspaceView;
export function Sidebar({
  user,
  view,
  pendingCount,
  onNavigate,
  onLogout,
  loggingOut,
  onPolicy,
  onHelp,
  onRequest,
  onProfile,
  mobileOpen,
  onClose,
}: {
  user: Employee;
  view: View;
  pendingCount: number;
  onNavigate: (view: View) => void;
  onLogout: () => void;
  loggingOut: boolean;
  onPolicy: () => void;
  onHelp: () => void;
  onRequest: () => void;
  onProfile: () => void;
  mobileOpen: boolean;
  onClose: () => void;
}) {
  const navigation = [
    { id: "overview" as const, label: "Overview", icon: LayoutGrid },
    {
      id: "requests" as const,
      label: user.role === "MANAGER" ? "Team requests" : "My requests",
      icon: CalendarRange,
    },
    { id: "calendar" as const, label: "Team calendar", icon: CalendarDays },
    { id: "profile" as const, label: "My profile", icon: UserRound },
  ];
  return (
    <>
      {mobileOpen && (
        <button className="sidebar-scrim" aria-label="Close navigation" onClick={onClose} />
      )}
      <aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`}>
        <div className="sidebar-brand">
          <NordiaLogo />
          <button
            className="icon-button mobile-sidebar-close"
            onClick={onClose}
            aria-label="Close navigation"
          >
            <X size={20} />
          </button>
          <p>A little balance, every day.</p>
        </div>
        <div className="nav-section-label">WORKSPACE</div>
        <nav className="main-nav" aria-label="Main navigation">
          {navigation.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => {
                onNavigate(id);
                onClose();
              }}
              className={view === id ? "nav-item active" : "nav-item"}
              aria-current={view === id ? "page" : undefined}
            >
              <Icon size={19} strokeWidth={1.7} />
              <span>{label}</span>
              {id === "requests" && pendingCount > 0 && (
                <span className="nav-count" aria-label={`${pendingCount} pending requests`}>
                  {pendingCount}
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-divider" />
        <div className="nav-section-label">GOOD TO KNOW</div>
        <nav className="main-nav secondary-nav" aria-label="Resources">
          <button
            className="nav-item"
            onClick={() => {
              onPolicy();
              onClose();
            }}
          >
            <BookOpen size={19} strokeWidth={1.7} />
            <span>Leave policy</span>
            <ArrowUpRight className="nav-external" size={14} />
          </button>
          <button
            className="nav-item"
            onClick={() => {
              onHelp();
              onClose();
            }}
          >
            <CircleHelp size={19} strokeWidth={1.7} />
            <span>Help & support</span>
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <div className="note-decoration" />
            <h3>
              Rest is part
              <br />
              of the work.
            </h3>
            <p>Make space for what matters.</p>
            <button onClick={onRequest}>
              {user.role === "MANAGER" ? "Support your team" : "Plan your next break"}
              <ArrowUpRight size={14} />
            </button>
          </div>
          <div className="user-switcher">
            <div className="switcher-label">
              YOUR PROFILE <span>{user.role === "MANAGER" ? "MANAGER" : "EMPLOYEE"}</span>
            </div>
            <button
              className="current-user"
              onClick={() => {
                onProfile();
                onClose();
              }}
              aria-label="View your profile"
            >
              <Avatar person={user} />
              <span>
                <strong>
                  {user.firstName} {user.lastName}
                </strong>
                <small>
                  ID {user.id} · {user.teamName}
                </small>
              </span>
              <ChevronRight size={15} />
            </button>
            <button className="switch-profile-action" onClick={onLogout} disabled={loggingOut}>
              {loggingOut ? <LoaderCircle size={14} className="spin" /> : <LogOut size={14} />}
              {loggingOut ? "Returning to welcome…" : "Switch user / Log out"}
              <ArrowUpRight size={13} />
            </button>
          </div>
          <div className="sidebar-copyright">
            © {new Date().getUTCFullYear()} Nordia. Made for balance.
          </div>
        </div>
      </aside>
    </>
  );
}
