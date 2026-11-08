/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { ArrowRight, CalendarDays, Check, UserRound, UsersRound } from "lucide-react";
import type { DirectoryStatus } from "@/lib/types";
import { DirectoryImport } from "./directory-import";
import { EntryHeader, EntryFooter } from "./entry-chrome";

export default function Welcome({ directory }: { directory: DirectoryStatus }) {
  return (
    <div className="entry-page">
      <EntryHeader />
      <main className="welcome-layout">
        <section className="welcome-introduction">
          <div className="welcome-eyebrow">
            <span />
            WELCOME TO YOUR PEOPLE WORKSPACE
          </div>
          <h1>
            A little time off.
            <br />A better everyday.
          </h1>
          <p className="welcome-description">
            Make room for what matters. Choose your workspace to plan a break, find your balance, or
            support your team.
          </p>
          <div className="portal-options">
            <Link href="/identify/employee" className="portal-option">
              <span className="portal-option-icon">
                <UserRound size={23} strokeWidth={1.5} />
              </span>
              <h2>Employee Portal</h2>
              <p>Request time off, check your balance, and keep every break in view.</p>
              <span className="portal-option-link">
                Find my workspace
                <ArrowRight size={16} />
              </span>
            </Link>
            <Link href="/identify/manager" className="portal-option manager-option">
              <span className="portal-option-icon">
                <UsersRound size={24} strokeWidth={1.5} />
              </span>
              <h2>Manager Portal</h2>
              <p>Review your team’s requests and help everyone find a little balance.</p>
              <span className="portal-option-link">
                Support my team
                <ArrowRight size={16} />
              </span>
            </Link>
          </div>
          <div className="welcome-reassurance">
            <Check size={14} />
            <span>Choose your role. Find your profile. You’re on your way.</span>
          </div>
          <DirectoryImport directory={directory} compact />
        </section>
        <aside className="welcome-story">
          <img
            src="/images/welcome-hammock.jpg"
            alt="A person resting in a hammock above a sunlit valley"
          />
          <div className="welcome-story-shade" />
          <span className="welcome-story-label">A LITTLE ROOM TO BREATHE</span>
          <div className="welcome-story-copy">
            <div className="welcome-story-line" />
            <h2>
              Good work starts
              <br />
              with a good break.
            </h2>
            <p>
              A moment to switch off.
              <br />A little space to come back refreshed.
            </p>
            <div className="welcome-story-footer">
              <span>
                <CalendarDays size={19} strokeWidth={1.5} />
              </span>
              <div>
                Time for what matters.<small>Your leave, kept simple.</small>
              </div>
            </div>
          </div>
        </aside>
      </main>
      <EntryFooter />
    </div>
  );
}
