"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Check, Palette } from "lucide-react";

export const THEMES = [
  { id: "forest", label: "Forest", swatch: "#285b49" },
  { id: "ocean", label: "Ocean", swatch: "#2b6a8f" },
  { id: "lavender", label: "Lavender", swatch: "#6b4f9a" },
  { id: "night", label: "Night", swatch: "#1b2420" },
] as const;
export type ThemeId = (typeof THEMES)[number]["id"];
export const THEME_STORAGE_KEY = "nordia-theme";

function currentTheme(): ThemeId {
  const value = document.documentElement.dataset.theme;
  return THEMES.some((theme) => theme.id === value) ? (value as ThemeId) : "forest";
}

const THEME_EVENT = "nordia-theme-change";
function subscribeTheme(notify: () => void) {
  window.addEventListener(THEME_EVENT, notify);
  return () => window.removeEventListener(THEME_EVENT, notify);
}

export function ThemeSwitcher() {
  const [open, setOpen] = useState(false);
  // The theme is applied before first paint by the inline script in layout.tsx; the DOM attribute is the source of truth.
  const theme = useSyncExternalStore(subscribeTheme, currentTheme, () => "forest" as ThemeId);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (
        event instanceof KeyboardEvent
          ? event.key === "Escape"
          : !root.current?.contains(event.target as Node)
      )
        setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  function choose(next: ThemeId) {
    document.documentElement.setAttribute("data-theme", next);
    window.dispatchEvent(new Event(THEME_EVENT));
    setOpen(false);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      /* storage can be blocked; the theme still applies for this visit */
    }
  }
  return (
    <div className="theme-switcher" ref={root}>
      <button
        className={`icon-button ${open ? "active" : ""}`}
        onClick={() => setOpen((value) => !value)}
        aria-label="Change theme"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Change theme"
      >
        <Palette size={19} strokeWidth={1.7} />
      </button>
      {open && (
        <div className="theme-menu" role="menu" aria-label="Theme">
          <p>Theme</p>
          {THEMES.map(({ id, label, swatch }) => (
            <button
              key={id}
              role="menuitemradio"
              aria-checked={theme === id}
              className={theme === id ? "selected" : undefined}
              onClick={() => choose(id)}
            >
              <span className="theme-swatch" style={{ background: swatch }} />
              {label}
              {theme === id && <Check size={14} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
