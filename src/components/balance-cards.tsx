import {
  CalendarDays,
  Leaf,
  CircleCheck,
  Clock3,
  ArrowUpRight,
  Info,
  Users,
  CalendarCheck,
} from "lucide-react";
import type { Balance, ManagerSummary } from "@/lib/types";

export function BalanceCards({
  balance,
  pendingCount,
  onPending,
}: {
  balance: Balance;
  pendingCount: number;
  onPending?: () => void;
}) {
  return (
    <section className="stats-grid" aria-label="Leave balance">
      <article className="stat-card">
        <div className="stat-top">
          <span>Annual allowance</span>
          <span className="stat-icon blue">
            <CalendarDays size={19} />
          </span>
        </div>
        <div className="stat-value">
          {balance.annualAllowance}
          <span>days / year</span>
        </div>
        <div className="stat-foot">
          <span className="tiny-dot neutral" />A fresh start, every January
        </div>
      </article>
      <article className="stat-card stat-featured">
        <div className="stat-top">
          <span>Remaining balance</span>
          <span className="stat-icon green">
            <Leaf size={19} />
          </span>
        </div>
        <div className="stat-value">
          {balance.remaining}
          <span>days left</span>
        </div>
        <div
          className="balance-progress"
          role="progressbar"
          aria-label="Remaining annual leave"
          aria-valuenow={balance.remaining}
          aria-valuemin={0}
          aria-valuemax={25}
        >
          <span style={{ width: `${Math.max(0, (balance.remaining / 25) * 100)}%` }} />
        </div>
        <div className="stat-foot compact">
          {balance.available} available · {balance.pending} reserved{" "}
          <span title="Pending requests reserve days. Remaining balance excludes approved leave only.">
            <Info size={12} />
          </span>
        </div>
      </article>
      <article className="stat-card">
        <div className="stat-top">
          <span>Used leave</span>
          <span className="stat-icon green">
            <CircleCheck size={19} />
          </span>
        </div>
        <div className="stat-value">
          {balance.used}
          <span>days approved</span>
        </div>
        <div className="stat-foot">
          <span className="tiny-dot green" />
          Includes upcoming time off
        </div>
      </article>
      <article className="stat-card">
        <div className="stat-top">
          <span>Pending requests</span>
          <span className="stat-icon amber">
            <Clock3 size={19} />
          </span>
        </div>
        <div className="stat-value">
          {balance.pending}
          <span>days requested</span>
        </div>
        <button className="stat-foot stat-link" onClick={onPending}>
          {pendingCount} {pendingCount === 1 ? "request" : "requests"} awaiting review
          <ArrowUpRight size={14} />
        </button>
      </article>
    </section>
  );
}
export function ManagerCards({
  summary,
  pendingCount,
  onPending,
}: {
  summary: ManagerSummary;
  pendingCount: number;
  onPending: () => void;
}) {
  return (
    <section className="stats-grid" aria-label="Team overview">
      <article className="stat-card stat-featured">
        <div className="stat-top">
          <span>Awaiting your review</span>
          <span className="stat-icon green">
            <Clock3 size={19} />
          </span>
        </div>
        <div className="stat-value">
          {pendingCount}
          <span>requests</span>
        </div>
        <button className="stat-foot stat-link" onClick={onPending}>
          {summary.pendingDays} working days in total
          <ArrowUpRight size={14} />
        </button>
      </article>
      <article className="stat-card">
        <div className="stat-top">
          <span>Your team</span>
          <span className="stat-icon blue">
            <Users size={19} />
          </span>
        </div>
        <div className="stat-value">
          {summary.teamSize}
          <span>people</span>
        </div>
        <div className="stat-foot">
          <span className="tiny-dot green" />
          Great work, better together
        </div>
      </article>
      <article className="stat-card">
        <div className="stat-top">
          <span>Away today</span>
          <span className="stat-icon amber">
            <Leaf size={19} />
          </span>
        </div>
        <div className="stat-value">
          {summary.awayToday}
          <span>{summary.awayToday === 1 ? "person" : "people"}</span>
        </div>
        <div className="stat-foot">{summary.teamSize - summary.awayToday} teammates available</div>
      </article>
      <article className="stat-card">
        <div className="stat-top">
          <span>Approved this month</span>
          <span className="stat-icon green">
            <CalendarCheck size={19} />
          </span>
        </div>
        <div className="stat-value">
          {summary.approvedThisMonth}
          <span>requests</span>
        </div>
        <div className="stat-foot">
          <span className="tiny-dot green" />
          Making room for a little rest
        </div>
      </article>
    </section>
  );
}
