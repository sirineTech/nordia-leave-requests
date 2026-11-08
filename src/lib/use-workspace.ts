"use client";
import { useSyncExternalStore } from "react";
import type { WorkspaceView } from "./types";

const CHANGE_EVENT = "nordia:workspace-view";
function subscribe(listener: () => void) {
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener("popstate", listener);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener("popstate", listener);
  };
}
function currentView(): WorkspaceView {
  const value = new URLSearchParams(window.location.search).get("view");
  return value === "requests" || value === "calendar" || value === "profile" ? value : "overview";
}
export function useWorkspace(confirmedUserId: string) {
  const view = useSyncExternalStore(subscribe, currentView, (): WorkspaceView => "overview");
  function setView(next: WorkspaceView) {
    window.history.replaceState(
      null,
      "",
      next === "overview" ? "/dashboard" : `/dashboard?view=${next}`,
    );
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }
  // Identity is supplied by the server after explicit confirmation. No local fallback or silent user switching.
  return { userId: confirmedUserId, view, setView };
}
