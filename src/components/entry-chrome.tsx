"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { NordiaLogo } from "./ui";
import { PolicyDialog } from "./leave-dialogs";
import { ThemeSwitcher } from "./theme-switcher";

export function EntryHeader() {
  const [policyOpen, setPolicyOpen] = useState(false);
  return (
    <>
      <header className="entry-header">
        <Link href="/" aria-label="Nordia welcome page">
          <NordiaLogo />
        </Link>
        <div className="entry-header-right">
          <span>People first. Always.</span>
          <ThemeSwitcher />
          <button onClick={() => setPolicyOpen(true)}>
            Leave policy
            <ArrowUpRight size={14} />
          </button>
        </div>
      </header>
      {policyOpen && <PolicyDialog onClose={() => setPolicyOpen(false)} />}
    </>
  );
}
export function EntryFooter() {
  return (
    <footer className="entry-footer">
      <span>© {new Date().getUTCFullYear()} Nordia. Made for balance.</span>
      <span>A little balance, every day.</span>
    </footer>
  );
}
