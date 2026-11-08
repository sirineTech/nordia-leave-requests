"use client";
import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { X, Check, Clock3, CalendarDays } from "lucide-react";
import type { Employee, LeaveStatus } from "@/lib/types";

export function NordiaLogo() {
  return (
    <div className="brand">
      <svg width="33" height="37" viewBox="0 0 34 38" fill="none" aria-hidden="true">
        <path d="M3 31V14C3 7.9 7.9 3 14 3H17V21C17 27.1 12.1 32 6 32H3Z" fill="currentColor" />
        <path
          d="M19 6H22C28.1 6 33 10.9 33 17V35H30C23.9 35 19 30.1 19 24V6Z"
          fill="currentColor"
          opacity=".65"
        />
      </svg>
      <span>
        nordia<span className="brand-period">.</span>
      </span>
    </div>
  );
}
const avatarColors = ["sage", "peach", "lavender", "blue"];
export type AvatarPerson = Pick<Employee, "id" | "firstName" | "lastName">;
// Profile photos are a per-browser convenience (the app has no accounts): they live in localStorage.
const AVATAR_EVENT = "nordia-avatar-change";
const avatarKey = (id: string) => `nordia-avatar-${id}`;
function readAvatarPhoto(id: string): string | null {
  try {
    return localStorage.getItem(avatarKey(id));
  } catch {
    return null;
  }
}
function subscribeAvatar(notify: () => void) {
  window.addEventListener("storage", notify);
  window.addEventListener(AVATAR_EVENT, notify);
  return () => {
    window.removeEventListener("storage", notify);
    window.removeEventListener(AVATAR_EVENT, notify);
  };
}
export function useAvatarPhoto(id: string): string | null {
  return useSyncExternalStore(
    subscribeAvatar,
    () => readAvatarPhoto(id),
    () => null,
  );
}
export function saveAvatarPhoto(id: string, dataUrl: string): boolean {
  try {
    localStorage.setItem(avatarKey(id), dataUrl);
    window.dispatchEvent(new Event(AVATAR_EVENT));
    return true;
  } catch {
    return false;
  }
}
export function removeAvatarPhoto(id: string) {
  try {
    localStorage.removeItem(avatarKey(id));
  } catch {
    /* nothing stored */
  }
  window.dispatchEvent(new Event(AVATAR_EVENT));
}
export function Avatar({
  person,
  size = "md",
}: {
  person: AvatarPerson;
  size?: "sm" | "md" | "lg";
}) {
  const color = avatarColors[person.firstName.charCodeAt(0) % 4];
  const photo = useAvatarPhoto(person.id);
  return (
    <span
      className={`avatar avatar-${size} avatar-${color}`}
      aria-label={`${person.firstName} ${person.lastName}`}
    >
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo} alt="" />
      ) : (
        <>
          {person.firstName[0]}
          {person.lastName[0]}
        </>
      )}
    </span>
  );
}
export function StatusBadge({ status }: { status: LeaveStatus }) {
  const Icon = status === "APPROVED" ? Check : status === "PENDING" ? Clock3 : X;
  return (
    <span className={`status-badge status-${status.toLowerCase()}`}>
      <Icon size={12} strokeWidth={2} />
      {status[0] + status.slice(1).toLowerCase()}
    </span>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.querySelector<HTMLElement>("button, input, textarea, select")?.focus();
    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape") closeRef.current();
      if (event.key === "Tab") {
        const items = panel.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex="0"]',
        );
        if (!items?.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        }
        if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", keydown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", keydown);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panel}
        className={`modal ${wide ? "modal-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <button className="icon-button modal-close" onClick={onClose} aria-label="Close dialog">
          <X size={19} />
        </button>
        {children}
      </div>
    </div>
  );
}
export function EmptyState({
  title = "A clean slate.",
  description = "Your leave requests will appear here. Ready to plan a little time for yourself?",
  action,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <CalendarDays size={27} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
