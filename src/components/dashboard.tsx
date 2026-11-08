"use client";
/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ArrowUpRight,
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Home,
  Leaf,
  LogOut,
  LoaderCircle,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Sparkles,
  Sun,
  TriangleAlert,
  Users,
  X,
} from "lucide-react";
import { api, errorMessage, identity } from "@/lib/client-api";
import { useWorkspace } from "@/lib/use-workspace";
import { dateRange, daysUntil, todayISO } from "@/lib/format";
import type {
  Balance,
  Employee,
  LeaveRequest,
  ManagerSummary,
  TeamAvailability,
} from "@/lib/types";
import { Sidebar, type View } from "./sidebar";
import { BalanceCards, ManagerCards } from "./balance-cards";
import { RequestHistory, type RequestFilter } from "./request-history";
import { Avatar, StatusBadge } from "./ui";
import { AvatarMenu } from "./avatar-menu";
import { ThemeSwitcher } from "./theme-switcher";
import {
  RequestDialog,
  RequestDetailDialog,
  ReviewDialog,
  PolicyDialog,
  HelpDialog,
} from "./leave-dialogs";
import { TeamCalendar } from "./team-calendar";
import { EmployeeProfile } from "./employee-profile";

export interface DashboardData {
  employeeId: string;
  balance: Balance;
  requests: LeaveRequest[];
  team: TeamAvailability;
  summary: ManagerSummary | null;
}
function UpcomingBreak({
  requests,
  manager,
  onSelect,
  onRequest,
}: {
  requests: LeaveRequest[];
  manager: boolean;
  onSelect: (request: LeaveRequest) => void;
  onRequest: () => void;
}) {
  const next = requests
    .filter((request) => request.status === "APPROVED" && request.endDate >= todayISO())
    .sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
  const until = next ? daysUntil(next.startDate) : 0;
  return (
    <section className="panel upcoming-card">
      <div className="upcoming-image">
        <img src="/images/dashboard-cafe.jpg" alt="A wooden table in a warm, softly lit café" />
        <div className="image-shade" />
        <div className="image-eyebrow">
          <Sparkles size={12} />A LITTLE ROOM TO BREATHE
        </div>
        <h3>
          A little pause.
          <br />A fresh perspective.
        </h3>
      </div>
      <div className="upcoming-content">
        <div className="upcoming-title">
          <h2>{manager ? "Next team break" : "Your next break"}</h2>
          {next && (
            <span className="countdown">
              {until <= 0 ? "Happening now" : until === 1 ? "Tomorrow" : `In ${until} days`}
            </span>
          )}
        </div>
        {next ? (
          <>
            <div className="upcoming-dates">
              <CalendarDays size={17} />
              <strong>{dateRange(next.startDate, next.endDate)}</strong>
              <span>{next.startDate.slice(0, 4)}</span>
            </div>
            <p className="upcoming-description">
              {manager ? `${next.employee.firstName} ${next.employee.lastName} · ` : ""}
              {next.workingDays} working days to recharge
            </p>
            <div className="upcoming-bottom">
              <StatusBadge status="APPROVED" />
              <button className="text-button" onClick={() => onSelect(next)}>
                View details
                <ArrowUpRight size={14} />
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="no-upcoming">
              {manager
                ? "Your team’s next approved break will appear here."
                : "Your next adventure is still unwritten. Make a little room for yourself."}
            </p>
            <button className="text-button" onClick={onRequest}>
              {manager ? "Review team requests" : "Plan some time off"}
              <ArrowRight size={15} />
            </button>
          </>
        )}
      </div>
    </section>
  );
}
function TeamPeek({ team, onCalendar }: { team: TeamAvailability; onCalendar: () => void }) {
  const today = todayISO();
  const day = new Date(`${today}T00:00:00Z`).getUTCDay();
  const away =
    day === 0 || day === 6
      ? 0
      : new Set(
          team.events
            .filter((event) => event.startDate <= today && event.endDate >= today)
            .map((event) => event.employeeId),
        ).size;
  return (
    <section className="panel team-peek">
      <div className="team-peek-heading">
        <h2>Your team, at a glance</h2>
        <Users size={17} />
      </div>
      <p>
        {team.name} · {team.members.length} people
      </p>
      <div className="team-peek-people">
        <div className="avatar-stack">
          {team.members.slice(0, 4).map((person) => (
            <Avatar person={person} key={person.id} size="sm" />
          ))}
        </div>
        <span className={`team-availability-label ${away ? "away" : ""}`}>
          <span className={`tiny-dot ${away ? "amber" : "green"}`} />
          {day === 0 || day === 6 ? "Weekend mode" : away ? `${away} away today` : "Everyone is in"}
        </span>
      </div>
      <button className="team-calendar-link" onClick={onCalendar}>
        See team calendar
        <ArrowRight size={15} />
      </button>
    </section>
  );
}
const SIDEBAR_EVENT = "nordia-sidebar-change";
let sidebarClosed: boolean | null = null;
function readSidebarClosed(): boolean {
  if (sidebarClosed === null) {
    try {
      sidebarClosed = localStorage.getItem("nordia-sidebar") === "closed";
    } catch {
      sidebarClosed = false;
    }
  }
  return sidebarClosed;
}
function subscribeSidebar(notify: () => void) {
  window.addEventListener(SIDEBAR_EVENT, notify);
  return () => window.removeEventListener(SIDEBAR_EVENT, notify);
}
export default function Dashboard({
  people,
  initialData,
}: {
  people: Employee[];
  initialData: DashboardData;
}) {
  const router = useRouter();
  const currentYear = new Date().getUTCFullYear();
  const { userId, view, setView } = useWorkspace(initialData.employeeId);
  const [year, setYear] = useState(currentYear);
  const [data, setData] = useState(initialData);
  const [filterOverride, setFilter] = useState<RequestFilter | null>(null);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const collapsed = useSyncExternalStore(subscribeSidebar, readSidebarClosed, () => false);
  function toggleSidebar() {
    sidebarClosed = !readSidebarClosed();
    try {
      localStorage.setItem("nordia-sidebar", sidebarClosed ? "closed" : "open");
    } catch {
      /* the preference just isn't remembered after a reload */
    }
    window.dispatchEvent(new Event(SIDEBAR_EVENT));
  }
  const [loggingOut, setLoggingOut] = useState(false);
  const [dialog, setDialog] = useState<"request" | "policy" | "help" | null>(null);
  const [detail, setDetail] = useState<LeaveRequest | null>(null);
  const [review, setReview] = useState<{
    request: LeaveRequest;
    decision: "APPROVED" | "REJECTED";
  } | null>(null);
  const [toast, setToast] = useState("");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const notificationPanel = useRef<HTMLDivElement>(null);
  const user = people.find((person) => person.id === userId)!;
  const manager = user.role === "MANAGER";
  const assignedManager = people.find((person) => person.id === user.managerId);
  const filter = filterOverride ?? (manager ? "PENDING" : "ALL");
  const ready = data.employeeId === user.id;
  const yearRequests = ready
    ? data.requests.filter(
        (request) =>
          manager || (request.startDate <= `${year}-12-31` && request.endDate >= `${year}-01-01`),
      )
    : [];
  const pendingCount = yearRequests.filter((request) => request.status === "PENDING").length;

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError("");
      const config = { ...identity(user.id), signal: controller.signal };
      try {
        const [balanceResponse, requestsResponse, teamResponse] = await Promise.all([
          api.get<{ data: Balance }>(
            `/employees/${encodeURIComponent(user.id)}/balance?year=${year}`,
            config,
          ),
          api.get<{ data: LeaveRequest[]; summary?: ManagerSummary }>(
            user.role === "MANAGER"
              ? "/manager/leave-requests"
              : `/employees/${encodeURIComponent(user.id)}/leave-requests`,
            config,
          ),
          api.get<{ data: TeamAvailability }>("/team/availability", config),
        ]);
        if (!controller.signal.aborted)
          setData({
            employeeId: user.id,
            balance: balanceResponse.data.data,
            requests: requestsResponse.data.data,
            team: teamResponse.data.data,
            summary: requestsResponse.data.summary ?? null,
          });
      } catch (err) {
        if (!controller.signal.aborted) setError(errorMessage(err));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [user.id, user.role, year, revision]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 6000);
    return () => window.clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    function close(event: MouseEvent) {
      if (!notificationPanel.current?.contains(event.target as Node)) setNotificationsOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  useEffect(() => {
    function refresh() {
      if (document.visibilityState === "visible") setRevision((value) => value + 1);
    }
    function identityChanged(event: StorageEvent) {
      if (event.key === "nordia-profile-change") {
        router.replace(event.newValue?.startsWith("logout:") ? "/" : "/dashboard");
        router.refresh();
      }
    }
    const timer = window.setInterval(refresh, 15_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("storage", identityChanged);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("storage", identityChanged);
    };
  }, [user.id, router]);
  function navigate(next: View) {
    setView(next);
    setNotificationsOpen(false);
  }
  async function logout() {
    setLoggingOut(true);
    try {
      await api.delete("/identity");
      try {
        localStorage.removeItem("nordia-user");
        localStorage.setItem("nordia-profile-change", `logout:${Date.now()}`);
      } catch {
        /* Optional cross-tab synchronization. */
      }
      router.replace("/");
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
      setLoggingOut(false);
    }
  }
  function reviewRequest(request: LeaveRequest, decision: "APPROVED" | "REJECTED") {
    setDetail(null);
    setReview({ request, decision });
  }
  function showPending() {
    setFilter("PENDING");
    navigate("requests");
  }
  const yearOptions = [
    ...new Set([
      currentYear - 1,
      currentYear,
      currentYear + 1,
      ...data.requests.flatMap((request) => [
        Number(request.startDate.slice(0, 4)),
        Number(request.endDate.slice(0, 4)),
      ]),
    ]),
  ].sort((a, b) => b - a);
  const history = (
    <RequestHistory
      requests={yearRequests}
      manager={manager}
      expanded={view === "requests"}
      filter={filter}
      onFilter={setFilter}
      onSelect={setDetail}
      onReview={reviewRequest}
      onViewAll={() => navigate("requests")}
      onNewRequest={() => setDialog("request")}
    />
  );
  return (
    <div className={`app-shell ${collapsed ? "sidebar-collapsed" : ""}`}>
      <Sidebar
        user={user}
        view={view}
        pendingCount={pendingCount}
        onNavigate={(next) => {
          setFilter(manager ? "PENDING" : "ALL");
          navigate(next);
        }}
        onLogout={logout}
        loggingOut={loggingOut}
        onProfile={() => navigate("profile")}
        onPolicy={() => setDialog("policy")}
        onHelp={() => setDialog("help")}
        onRequest={manager ? showPending : () => setDialog("request")}
        mobileOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
      />
      <div className="main-shell">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-button sidebar-toggle"
              onClick={toggleSidebar}
              aria-label={collapsed ? "Open menu" : "Close menu"}
              aria-expanded={!collapsed}
              title={collapsed ? "Open menu" : "Close menu"}
            >
              {collapsed ? <PanelLeftOpen size={21} /> : <PanelLeftClose size={21} />}
            </button>
            <button
              className="icon-button mobile-menu"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation"
            >
              <Menu size={22} />
            </button>
            <div className="breadcrumbs">
              <Home size={15} />
              <span className="breadcrumb-slash">/</span>
              <span>Workspace</span>
              <ChevronRight size={12} />
              <strong>
                {view === "profile"
                  ? "My profile"
                  : view === "overview"
                    ? "Overview"
                    : view === "calendar"
                      ? "Team calendar"
                      : manager
                        ? "Team requests"
                        : "My requests"}
              </strong>
            </div>
          </div>
          <div className="topbar-right">
            <span className="workspace-role">
              <span className="tiny-dot green" />
              {manager ? "Manager workspace" : "Employee workspace"}
            </span>
            <span className="topbar-divider" />
            <ThemeSwitcher />
            <button
              className="icon-button"
              onClick={logout}
              disabled={loggingOut}
              aria-label="Log out"
              title="Log out"
            >
              {loggingOut ? (
                <LoaderCircle size={19} className="spin" />
              ) : (
                <LogOut size={19} strokeWidth={1.7} />
              )}
            </button>
            <button
              className="icon-button"
              onClick={() => setDialog("help")}
              aria-label="Help and support"
            >
              <CircleHelp size={19} />
            </button>
            <div className="notification-wrapper" ref={notificationPanel}>
              <button
                className={`icon-button notification-button ${notificationsOpen ? "active" : ""}`}
                onClick={() => setNotificationsOpen(!notificationsOpen)}
                aria-label="View request notifications"
                aria-expanded={notificationsOpen}
              >
                <Bell size={19} />
                {yearRequests.length > 0 && <span className="notification-dot" />}
              </button>
              {notificationsOpen && (
                <div className="notification-panel">
                  <div className="notification-heading">
                    <h3>Your updates</h3>
                    <span>Latest request activity</span>
                  </div>
                  {yearRequests.length ? (
                    [...yearRequests]
                      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
                      .slice(0, 5)
                      .map((request) => (
                        <button
                          className="notification-item"
                          key={request.id}
                          onClick={() => {
                            setDetail(request);
                            setNotificationsOpen(false);
                          }}
                        >
                          <span className={`notification-status ${request.status.toLowerCase()}`}>
                            {request.status === "APPROVED" ? (
                              <Check size={16} />
                            ) : request.status === "REJECTED" ? (
                              <X size={16} />
                            ) : (
                              <CalendarDays size={16} />
                            )}
                          </span>
                          <span>
                            <strong>
                              {manager
                                ? `${request.employee.firstName}’s request`
                                : "Your leave request"}
                            </strong>
                            <small>
                              {dateRange(request.startDate, request.endDate)} ·{" "}
                              {request.status.toLowerCase()}
                            </small>
                          </span>
                          <ChevronRight size={14} />
                        </button>
                      ))
                  ) : (
                    <p className="notification-empty">A quiet moment. No request activity yet.</p>
                  )}
                </div>
              )}
            </div>
            <AvatarMenu
              person={user}
              size="sm"
              className="topbar-avatar"
              onViewProfile={() => navigate("profile")}
              onLogout={logout}
            />
          </div>
        </header>
        <main className={`workspace ${loading && ready ? "is-refreshing" : ""}`}>
          <section className="page-heading">
            <div>
              <div className="eyebrow">
                {view === "profile"
                  ? "YOUR PEOPLE PROFILE"
                  : view === "calendar"
                    ? "A SHARED VIEW. A LITTLE MORE HARMONY."
                    : view === "requests"
                      ? "YOUR TIME OFF, ALL TOGETHER"
                      : manager
                        ? "GREAT TEAMS MAKE ROOM FOR REST"
                        : "A LITTLE BALANCE GOES A LONG WAY"}
              </div>
              <h1>
                {view === "profile" ? (
                  "Your profile, your place."
                ) : view === "overview" ? (
                  <>
                    Welcome back, {user.firstName}
                    <Sun className="greeting-sun" size={29} strokeWidth={1.6} />
                  </>
                ) : view === "calendar" ? (
                  "Your team, in sync."
                ) : manager ? (
                  "Your team’s leave requests"
                ) : (
                  "Your leave requests"
                )}
              </h1>
              <p>
                {view === "profile"
                  ? "The details that keep your workspace connected."
                  : view === "calendar"
                    ? "Plan ahead, look out for each other, and make room for a break."
                    : view === "requests"
                      ? "Every request, every update. Nothing gets lost in the inbox."
                      : manager
                        ? "A clear view of your team’s time off. Keep everyone in balance."
                        : "Here’s your time off at a glance. Make room for what matters."}
              </p>
            </div>
            <div className="page-actions">
              {view !== "calendar" && !manager && (
                <label className="year-select">
                  <CalendarDays size={15} />
                  <select
                    value={year}
                    onChange={(event) => setYear(Number(event.target.value))}
                    aria-label="Leave allowance year"
                  >
                    {yearOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={13} />
                </label>
              )}
              <button
                className="primary-button"
                onClick={manager ? showPending : () => setDialog("request")}
                disabled={!ready}
              >
                {manager ? <Check size={17} /> : <Plus size={17} />}
                {manager ? "Review requests" : "Request leave"}
              </button>
            </div>
          </section>
          {error && (
            <div className="load-error" role="alert">
              <TriangleAlert size={18} />
              <span>{error}</span>
              <button className="text-button" onClick={() => setRevision((value) => value + 1)}>
                Try again
                <ArrowRight size={15} />
              </button>
            </div>
          )}
          {!ready ? (
            <div className="workspace-loading" role="status">
              <LoaderCircle size={28} className="spin" />
              <h2>Finding your balance…</h2>
              <p>Loading {user.firstName}’s workspace.</p>
            </div>
          ) : (
            <>
              {view !== "calendar" && view !== "profile" && (
                <>
                  <div className="section-title">
                    <h2>{manager ? "Your team at a glance" : "Your leave balance"}</h2>
                    <span>
                      {loading && <LoaderCircle size={12} className="spin" />}
                      {manager ? `${user.teamName} · updates every 15s` : `Jan 1 – Dec 31, ${year}`}
                    </span>
                  </div>
                  {manager && data.summary ? (
                    <ManagerCards
                      summary={data.summary}
                      pendingCount={pendingCount}
                      onPending={showPending}
                    />
                  ) : (
                    <BalanceCards
                      balance={data.balance}
                      pendingCount={pendingCount}
                      onPending={showPending}
                    />
                  )}
                </>
              )}
              {view === "profile" ? (
                <EmployeeProfile
                  user={user}
                  manager={assignedManager}
                  balance={data.balance}
                  onRequest={() => setDialog("request")}
                  onLogout={logout}
                />
              ) : view === "overview" ? (
                <div className="overview-grid">
                  <div className="overview-primary">
                    {history}
                    <div className="wellbeing-note">
                      <span className="wellbeing-icon">
                        <Sun size={23} strokeWidth={1.4} />
                      </span>
                      <div>
                        <h3>Good work starts with a good break.</h3>
                        <p>Your days off are there to be used. Make a little time for you.</p>
                      </div>
                      <button
                        aria-label="Read the leave policy"
                        onClick={() => setDialog("policy")}
                      >
                        <ArrowUpRight size={20} />
                      </button>
                    </div>
                  </div>
                  <div className="overview-secondary">
                    <UpcomingBreak
                      requests={data.requests}
                      manager={manager}
                      onSelect={setDetail}
                      onRequest={manager ? showPending : () => setDialog("request")}
                    />
                    <TeamPeek team={data.team} onCalendar={() => navigate("calendar")} />
                  </div>
                </div>
              ) : view === "requests" ? (
                <div className="full-history">{history}</div>
              ) : (
                <TeamCalendar team={data.team} />
              )}
              <footer className="workspace-footer">
                <span>
                  <Leaf size={13} />
                  People first. Always.
                </span>
                <div>
                  <span>Your leave, kept simple.</span>
                  <button onClick={() => setDialog("policy")}>Leave policy</button>
                  <span>·</span>
                  <button onClick={() => setDialog("help")}>
                    Get a little help
                    <ArrowUpRight size={12} />
                  </button>
                </div>
              </footer>
            </>
          )}
        </main>
      </div>
      {dialog === "request" && ready && (
        <RequestDialog
          key={user.id}
          user={user}
          manager={assignedManager}
          balance={data.balance}
          onClose={() => setDialog(null)}
          onSuccess={() => {
            setDialog(null);
            setFilter("ALL");
            setRevision((value) => value + 1);
            setToast(
              "Your request is on its way to your assigned manager. Here’s to a little time for you!",
            );
          }}
        />
      )}
      {dialog === "policy" && <PolicyDialog onClose={() => setDialog(null)} />}
      {dialog === "help" && (
        <HelpDialog onClose={() => setDialog(null)} onPolicy={() => setDialog("policy")} />
      )}
      {detail && (
        <RequestDetailDialog
          request={detail}
          manager={manager}
          onClose={() => setDetail(null)}
          onReview={reviewRequest}
        />
      )}
      {review && (
        <ReviewDialog
          key={`${review.request.id}-${review.decision}`}
          request={review.request}
          decision={review.decision}
          user={user}
          onClose={() => setReview(null)}
          onSuccess={() => {
            setToast(
              review.decision === "APPROVED"
                ? `Request approved. ${review.request.employee.firstName}’s balance is up to date.`
                : "Request declined. Your comment has been shared with your teammate.",
            );
            setReview(null);
            setRevision((value) => value + 1);
          }}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          <span>
            <Check size={18} />
          </span>
          <div>
            <strong>All taken care of.</strong>
            <p>{toast}</p>
          </div>
          <button
            className="icon-button"
            onClick={() => setToast("")}
            aria-label="Dismiss notification"
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
