import {
  ArrowRight,
  Building2,
  CalendarDays,
  Hash,
  Leaf,
  LogOut,
  Mail,
  ShieldCheck,
  UserRound,
  UsersRound,
} from "lucide-react";
import type { Balance, Employee } from "@/lib/types";
import { AvatarMenu } from "./avatar-menu";

export function EmployeeProfile({
  user,
  manager,
  balance,
  onRequest,
  onLogout,
}: {
  user: Employee;
  manager?: Employee;
  balance: Balance;
  onRequest: () => void;
  onLogout: () => void;
}) {
  return (
    <div className="employee-profile-layout">
      <section className="panel personal-profile">
        <div className="personal-profile-cover">
          <span>
            <Leaf size={16} />
            YOUR PLACE AT NORDIA
          </span>
          <div className="profile-cover-decoration" />
        </div>
        <div className="personal-profile-heading">
          <AvatarMenu
            person={user}
            size="lg"
            align="left"
            onLogout={onLogout}
            badge
            className="profile-avatar-trigger"
          />
          <div>
            <h2>
              {user.firstName} {user.lastName}
            </h2>
            <p>
              {user.role === "MANAGER" ? "Team manager" : "Employee"} · {user.teamName}
            </p>
          </div>
          <span className="profile-source-badge">
            <ShieldCheck size={12} />
            Company directory
          </span>
        </div>
        <dl className="personal-profile-fields">
          <div>
            <dt>
              <UserRound size={16} />
              Full name
            </dt>
            <dd>
              {user.firstName} {user.lastName}
            </dd>
          </div>
          <div>
            <dt>
              <Hash size={16} />
              Employee ID
            </dt>
            <dd>{user.id}</dd>
          </div>
          <div>
            <dt>
              <Building2 size={16} />
              Team
            </dt>
            <dd>{user.teamName}</dd>
          </div>
          <div>
            <dt>
              <UsersRound size={16} />
              Assigned manager
            </dt>
            <dd>
              {manager ? (
                <>
                  <strong>
                    {manager.firstName} {manager.lastName}
                  </strong>
                  <small>Manager ID {manager.id}</small>
                </>
              ) : (
                "No manager assigned in employees.json"
              )}
            </dd>
          </div>
          {user.email && (
            <div>
              <dt>
                <Mail size={16} />
                Work email
              </dt>
              <dd>{user.email}</dd>
            </div>
          )}
        </dl>
        <div className="profile-source-note">
          <ShieldCheck size={16} />
          <p>
            Your name, employee ID, team, and manager come from <strong>employees.json</strong>.{" "}
            {manager
              ? "Your leave requests are automatically routed to your assigned manager."
              : "As a manager, you receive requests only from employees assigned to you."}
          </p>
        </div>
      </section>
      <div className="profile-balance-column">
        <section className="panel personal-balance">
          <div className="personal-balance-heading">
            <span>
              <Leaf size={20} />
            </span>
            <div>
              <h2>A little room for you.</h2>
              <p>Your {balance.year} leave allowance</p>
            </div>
          </div>
          <div className="profile-balance-large">
            <strong>{balance.remaining}</strong>
            <span>days remaining</span>
          </div>
          <div className="balance-progress">
            <span
              style={{
                width: `${Math.max(0, (balance.remaining / balance.annualAllowance) * 100)}%`,
              }}
            />
          </div>
          <dl>
            <div>
              <dt>Annual allowance</dt>
              <dd>{balance.annualAllowance} working days</dd>
            </div>
            <div>
              <dt>Approved leave</dt>
              <dd>{balance.used} days</dd>
            </div>
            <div>
              <dt>Pending / reserved</dt>
              <dd>{balance.pending} days</dd>
            </div>
            <div>
              <dt>Available to request</dt>
              <dd>{balance.available} days</dd>
            </div>
          </dl>
          {user.role === "EMPLOYEE" && (
            <button className="primary-button" onClick={onRequest}>
              <CalendarDays size={16} />
              Request leave
              <ArrowRight size={15} />
            </button>
          )}
          <small>Monday–Friday only. Your allowance resets each January.</small>
        </section>
        <section className="profile-session-card">
          <LogOut size={19} />
          <div>
            <h3>A different workspace?</h3>
            <p>Return to welcome to choose and confirm another profile.</p>
            <button className="text-button" onClick={onLogout}>
              Switch user / Log out
              <ArrowRight size={14} />
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
