"use client";
import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, LogOut, Trash2, UserRound } from "lucide-react";
import {
  Avatar,
  removeAvatarPhoto,
  saveAvatarPhoto,
  useAvatarPhoto,
  type AvatarPerson,
} from "./ui";

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const OUTPUT_SIZE = 256;

/** Crops to a centred square and downsizes, so the stored photo stays small. */
async function toAvatarDataUrl(file: File): Promise<string> {
  if (!/^image\/(png|jpe?g|webp|gif)$/.test(file.type))
    throw new Error("Please choose a PNG, JPG, WebP or GIF image.");
  if (file.size > MAX_FILE_BYTES) throw new Error("This image is larger than 8 MB.");
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("This image could not be read."));
      element.src = url;
    });
    const side = Math.min(image.naturalWidth, image.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = OUTPUT_SIZE;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Your browser cannot process images.");
    context.drawImage(
      image,
      (image.naturalWidth - side) / 2,
      (image.naturalHeight - side) / 2,
      side,
      side,
      0,
      0,
      OUTPUT_SIZE,
      OUTPUT_SIZE,
    );
    return canvas.toDataURL("image/jpeg", 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function AvatarMenu({
  person,
  size = "sm",
  align = "right",
  badge = false,
  className,
  onViewProfile,
  onLogout,
}: {
  person: AvatarPerson;
  size?: "sm" | "md" | "lg";
  align?: "left" | "right";
  badge?: boolean;
  className?: string;
  onViewProfile?: () => void;
  onLogout?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const photo = useAvatarPhoto(person.id);
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
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
  async function upload(file: File | undefined) {
    if (!file) return;
    try {
      const saved = saveAvatarPhoto(person.id, await toAvatarDataUrl(file));
      if (!saved)
        throw new Error("Your browser could not store the photo (storage is full or blocked).");
      setError("");
      setOpen(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The photo could not be saved.");
    }
  }
  return (
    <div className={`avatar-menu avatar-menu-${align}`} ref={root}>
      <button
        className={`avatar-trigger ${className ?? ""}`}
        onClick={() => setOpen((value) => !value)}
        aria-label="Profile photo options"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Avatar person={person} size={size} />
        {badge && (
          <span className="avatar-badge" aria-hidden="true">
            <Camera size={13} />
          </span>
        )}
      </button>
      {open && (
        <div className="avatar-popover" role="menu">
          <button role="menuitem" onClick={() => input.current?.click()}>
            <ImagePlus size={15} />
            {photo ? "Change photo" : "Upload photo"}
          </button>
          {photo && (
            <button
              role="menuitem"
              className="danger"
              onClick={() => {
                removeAvatarPhoto(person.id);
                setError("");
                setOpen(false);
              }}
            >
              <Trash2 size={15} />
              Remove photo
            </button>
          )}
          {onViewProfile && (
            <button
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onViewProfile();
              }}
            >
              <UserRound size={15} />
              View profile
            </button>
          )}
          {onLogout && (
            <button
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onLogout();
              }}
            >
              <LogOut size={15} />
              Log out
            </button>
          )}
          {error && (
            <p className="avatar-error" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        hidden
        onChange={(event) => {
          void upload(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
    </div>
  );
}
