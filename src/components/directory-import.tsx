"use client";
import { useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { Check, FileJson, Upload, LoaderCircle, TriangleAlert, RefreshCw } from "lucide-react";
import { api, errorMessage } from "@/lib/client-api";
import type { DirectoryStatus } from "@/lib/types";

export function DirectoryImport({
  directory,
  compact = false,
}: {
  directory: DirectoryStatus;
  compact?: boolean;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError("");
    if (file.name.toLowerCase() !== "employees.json") {
      setError(
        "Choose the actual file named employees.json. No sample employees will be generated.",
      );
      event.target.value = "";
      return;
    }
    if (file.size > 1_048_576) {
      setError("The directory file must be smaller than 1 MB.");
      event.target.value = "";
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.set("file", file);
      await api.post("/directory/import", form);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }
  if (directory.state === "ready")
    return (
      <div className="directory-connected">
        <span>
          <Check size={12} />
        </span>
        Company directory connected<span className="directory-separator">·</span>
        {directory.profileCount} profiles across {directory.teamCount}{" "}
        {directory.teamCount === 1 ? "team" : "teams"}
      </div>
    );
  return (
    <div className={`directory-setup ${compact ? "compact" : ""}`}>
      <div className="directory-setup-main">
        <span className="directory-file-icon">
          <FileJson size={23} strokeWidth={1.5} />
        </span>
        <div>
          <h3>
            {directory.state === "invalid"
              ? "Let’s check your directory."
              : "Your company directory comes first."}
          </h3>
          <p>
            {directory.state === "invalid"
              ? directory.message
              : "employees.json hasn’t been supplied yet. Import the provided file to find your real profile."}
          </p>
        </div>
      </div>
      {directory.state === "missing" ? (
        <>
          <input
            ref={input}
            type="file"
            accept=".json,application/json"
            aria-label="Upload employees.json"
            className="sr-only"
            onChange={upload}
            disabled={busy}
          />
          <button
            className="secondary-button directory-upload"
            onClick={() => input.current?.click()}
            disabled={busy}
          >
            {busy ? <LoaderCircle size={15} className="spin" /> : <Upload size={15} />}
            {busy ? "Checking directory…" : "Import employees.json"}
          </button>
        </>
      ) : (
        <button className="secondary-button directory-upload" onClick={() => router.refresh()}>
          <RefreshCw size={14} />
          Refresh directory
        </button>
      )}
      {error && (
        <div className="error-message" role="alert">
          <TriangleAlert size={15} />
          <span>{error}</span>
        </div>
      )}
      <small>
        Source IDs and manager assignments are kept exactly as supplied. No profiles are invented.
      </small>
    </div>
  );
}
