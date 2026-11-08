import { z } from "zod";
import { directoryIdSchema } from "./employee-directory";
import { AppError } from "./leave-rules";

// A remembered profile choice, deliberately NOT an authentication credential.
export const IDENTITY_COOKIE = "nordia-profile";
export const identitySelectionSchema = z
  .object({ employeeId: directoryIdSchema, portal: z.enum(["employee", "manager"]) })
  .strict();
export function requestIdentity(request: Request): string | null {
  const explicit = request.headers.get("x-user-id");
  const cookie = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${IDENTITY_COOKIE}=`));
  if (!cookie) return explicit;
  let selected: string;
  try {
    selected = decodeURIComponent(cookie.slice(IDENTITY_COOKIE.length + 1));
  } catch {
    return null;
  }
  if (explicit && selected !== explicit)
    throw new AppError(
      "Your selected profile changed in another tab. Return to welcome and confirm your profile again.",
      409,
      "IDENTITY_CHANGED",
    );
  return selected || null;
}
