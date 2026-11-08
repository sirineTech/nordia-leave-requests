import { z } from "zod";
import { isValidDate } from "./leave-rules";

const dateString = z
  .string()
  .refine(isValidDate, "Enter a valid date in YYYY-MM-DD format.")
  .refine(
    (value) =>
      !isValidDate(value) ||
      (Number(value.slice(0, 4)) >= 2000 && Number(value.slice(0, 4)) <= 2100),
    "Choose a date between the years 2000 and 2100.",
  );
export const createLeaveSchema = z
  .object({
    startDate: dateString,
    endDate: dateString,
    reason: z.string().trim().max(500, "Please keep the reason under 500 characters.").optional(),
  })
  .strict();
export const approvalSchema = z
  .object({ comment: z.string().trim().max(1000).optional() })
  .strict();
export const rejectionSchema = z
  .object({
    comment: z.string().trim().min(1, "A comment is required when rejecting a request.").max(1000),
  })
  .strict();
export const yearSchema = z.coerce.number().int().min(2000).max(2100);
