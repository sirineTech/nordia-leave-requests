"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  ChevronRight,
  CircleUserRound,
  Hash,
  Info,
  LoaderCircle,
  Search,
  ShieldCheck,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { api, errorMessage } from "@/lib/client-api";
import { searchProfiles } from "@/lib/employee-directory";
import type { DirectoryStatus, Employee } from "@/lib/types";
import { Avatar } from "./ui";
import { EntryHeader, EntryFooter } from "./entry-chrome";
import { DirectoryImport } from "./directory-import";

export default function Identification({
  portal,
  people,
  directory,
}: {
  portal: "employee" | "manager";
  people: Employee[];
  directory: DirectoryStatus;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const isManager = portal === "manager";
  const role = isManager ? "MANAGER" : "EMPLOYEE";
  const profiles = searchProfiles(people, query, role);
  const total = people.filter((person) => person.role === role).length;
  const selected = people.find((person) => person.id === selectedId && person.role === role);
  const assignedManager = selected?.managerId
    ? people.find((person) => person.id === selected.managerId)
    : undefined;
  function search(value: string) {
    setQuery(value);
    setSelectedId(null);
    setError("");
  }
  async function confirm() {
    if (!selected || busy) return;
    setBusy(true);
    setError("");
    try {
      await api.post("/identity", { employeeId: selected.id, portal });
      try {
        localStorage.removeItem("nordia-user");
        localStorage.setItem("nordia-profile-change", `select:${Date.now()}`);
      } catch {
        /* Preference storage is optional. */
      }
      router.replace("/dashboard");
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }
  const PortalIcon = isManager ? UsersRound : UserRound;
  return (
    <div className="entry-page identification-page">
      <EntryHeader />
      <main className="identification-layout">
        <div className="identification-navigation">
          <Link href="/" className="entry-back">
            <ArrowLeft size={15} />
            Back to welcome
          </Link>
          <div className="entry-steps">
            <span>
              <Check size={11} />
              Choose portal
            </span>
            <ChevronRight size={12} />
            <strong>Find your profile</strong>
            <ChevronRight size={12} />
            <span>Continue</span>
          </div>
        </div>
        <section className="identification-heading">
          <span className={`portal-heading-icon ${isManager ? "manager" : ""}`}>
            <PortalIcon size={24} strokeWidth={1.6} />
          </span>
          <div>
            <div className="welcome-eyebrow">
              {isManager ? "MANAGER PORTAL" : "EMPLOYEE PORTAL"}
            </div>
            <h1>Let’s find your workspace.</h1>
            <p>
              {isManager
                ? "Choose your manager profile. We’ll bring your team’s requests to you."
                : "Search your full name or employee ID, then confirm the profile that’s yours."}
            </p>
          </div>
        </section>
        <div className="identification-grid">
          <section className="identity-directory">
            <div className="identity-search-header">
              <label htmlFor="profile-search">FIND YOUR PROFILE</label>
              <span>
                {total} {isManager ? "manager" : "employee"} {total === 1 ? "profile" : "profiles"}
              </span>
            </div>
            <div className="identity-search">
              <Search size={19} strokeWidth={1.6} />
              <input
                id="profile-search"
                autoComplete="off"
                value={query}
                onChange={(event) => search(event.target.value)}
                placeholder={
                  isManager
                    ? "Search manager name or manager ID…"
                    : "Search full name or employee ID…"
                }
                maxLength={100}
              />
              {query && (
                <button aria-label="Clear profile search" onClick={() => search("")}>
                  <X size={16} />
                </button>
              )}
            </div>
            <div className="identity-results-heading">
              <span>
                {query
                  ? `${profiles.length} ${profiles.length === 1 ? "match" : "matches"} for “${query}”`
                  : isManager
                    ? "Your team managers"
                    : "Your colleagues, your workspace"}
              </span>
              <small>{query ? "Name or ID matches" : "Listed alphabetically"}</small>
            </div>
            {profiles.length > 0 ? (
              <fieldset className="identity-profile-grid">
                <legend className="sr-only">
                  {isManager ? "Matching manager profiles" : "Matching employee profiles"}
                </legend>
                {profiles.map((person) => (
                  <label
                    key={person.id}
                    className={`identity-profile-card ${selectedId === person.id ? "selected" : ""}`}
                  >
                    <input
                      className="sr-only"
                      type="radio"
                      name="selected-profile"
                      value={person.id}
                      checked={selectedId === person.id}
                      onChange={() => {
                        setSelectedId(person.id);
                        setError("");
                      }}
                      aria-label={`Select ${person.firstName} ${person.lastName}, ID ${person.id}, ${person.teamName}`}
                    />
                    <div className="identity-profile-card-top">
                      <Avatar person={person} size="lg" />
                      <span className="profile-radio">
                        {selectedId === person.id && <Check size={12} />}
                      </span>
                    </div>
                    <h3>
                      {person.firstName} {person.lastName}
                    </h3>
                    <span className="profile-card-id">
                      <Hash size={11} />
                      {isManager ? "Manager" : "Employee"} ID {person.id}
                    </span>
                    <div className="profile-card-team">
                      <Building2 size={13} />
                      {person.teamName}
                      {isManager && <span>Manager</span>}
                    </div>
                  </label>
                ))}
              </fieldset>
            ) : (
              <div className="identity-empty">
                <span>
                  <Search size={28} strokeWidth={1.4} />
                </span>
                <h3>{total ? "No profile found just yet." : "Your directory is the next step."}</h3>
                <p>
                  {total
                    ? "Try your full name, a different spelling, or your exact employee ID. We only show profiles from your company’s directory."
                    : "Profiles appear here once the actual employees.json file has been provided. We don’t generate sample names or IDs."}
                </p>
                {query && (
                  <button className="text-button" onClick={() => search("")}>
                    Show all profiles
                    <ArrowRight size={14} />
                  </button>
                )}
              </div>
            )}
            {directory.state !== "ready" && <DirectoryImport directory={directory} />}
            <div className="identity-directory-note">
              <Info size={14} />
              <p>
                Can’t find yourself? Check your employee ID with your People team. Profile details
                come directly from <strong>employees.json</strong>.
              </p>
            </div>
          </section>
          <aside className={`identity-confirmation ${selected ? "has-selection" : ""}`}>
            <div className="identity-confirmation-heading">
              <ShieldCheck size={17} />
              <h2>Confirm your profile</h2>
              <span>02 / 02</span>
            </div>
            {selected ? (
              <div className="selected-profile-details">
                <Avatar person={selected} size="lg" />
                <h3>
                  {selected.firstName} {selected.lastName}
                </h3>
                <span className="selected-role">{isManager ? "Manager" : "Employee"} Portal</span>
                <dl>
                  <div>
                    <dt>
                      <Hash size={13} />
                      {isManager ? "Manager" : "Employee"} ID
                    </dt>
                    <dd>{selected.id}</dd>
                  </div>
                  <div>
                    <dt>
                      <Building2 size={13} />
                      Team
                    </dt>
                    <dd>{selected.teamName}</dd>
                  </div>
                  {!isManager && (
                    <div>
                      <dt>
                        <UsersRound size={13} />
                        Assigned manager
                      </dt>
                      <dd>
                        {assignedManager
                          ? `${assignedManager.firstName} ${assignedManager.lastName}`
                          : "Not assigned in directory"}
                        {assignedManager && <small>ID {assignedManager.id}</small>}
                      </dd>
                    </div>
                  )}
                  {isManager && (
                    <div>
                      <dt>
                        <UserRound size={13} />
                        Direct reports
                      </dt>
                      <dd>
                        {
                          people.filter(
                            (person) =>
                              person.managerId === selected.id && person.id !== selected.id,
                          ).length
                        }{" "}
                        people
                      </dd>
                    </div>
                  )}
                </dl>
                <p className="confirm-person-note">
                  Is this you? Continue to your {isManager ? "manager" : "employee"} dashboard.
                </p>
              </div>
            ) : (
              <div className="identity-confirmation-empty">
                <span>
                  <CircleUserRound size={36} strokeWidth={1.15} />
                </span>
                <h3>A familiar face.</h3>
                <p>
                  Select your profile on the left. Your details will appear here before you
                  continue.
                </p>
                <div className="confirmation-placeholder">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            )}
            {error && (
              <div className="error-message" role="alert">
                {error}
              </div>
            )}
            <button
              className="primary-button identity-continue"
              onClick={confirm}
              disabled={!selected || busy}
            >
              {busy ? <LoaderCircle size={16} className="spin" /> : null}
              {busy ? "Opening your workspace…" : "Continue"}
              {!busy && <ArrowRight size={16} />}
            </button>
            <p className="identity-confirmation-footnote">
              This is a profile choice, not a secure sign-in.
              <br />
              Please select only your own profile.
            </p>
          </aside>
        </div>
        <Link
          href={isManager ? "/identify/employee" : "/identify/manager"}
          className="other-portal-link"
        >
          {isManager ? "Looking for your own time off?" : "Here to support your team?"}
          <span>
            {isManager ? "Go to Employee Portal" : "Go to Manager Portal"}
            <ArrowRight size={14} />
          </span>
        </Link>
      </main>
      <EntryFooter />
    </div>
  );
}
