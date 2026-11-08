import { z, ZodError } from "zod";
import { NextResponse } from "next/server";
import {
  ensureDirectory,
  getDirectoryStatus,
  importEmployeeDirectory,
  MAX_DIRECTORY_BYTES,
  readDirectoryFile,
} from "@/db/directory";
import { AppError } from "@/lib/leave-rules";
import { createLeaveSchema, approvalSchema, rejectionSchema, yearSchema } from "@/lib/validation";
import { IDENTITY_COOKIE, identitySelectionSchema, requestIdentity } from "@/lib/identity";
import { searchProfiles } from "@/lib/employee-directory";
import * as service from "@/lib/leave-service";

async function readBody(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text.length > 16_000)
    throw new AppError("This request is too large.", 413, "PAYLOAD_TOO_LARGE");
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new AppError("Please send a valid JSON body.", 400, "INVALID_JSON");
  }
}
async function dispatch(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname
    .replace(/^\/api\//, "")
    .split("/")
    .filter(Boolean)
    .map(decodeURIComponent);
  const endpoint = path.join("/");
  const method = request.method;
  if (method === "GET" && endpoint === "directory")
    return Response.json({ data: await getDirectoryStatus() });
  if (method === "DELETE" && endpoint === "identity") {
    const response = NextResponse.json({ data: { redirectTo: "/" } });
    response.cookies.set(IDENTITY_COOKIE, "", {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    return response;
  }
  if (method === "POST" && endpoint === "directory/import") {
    if (Number(request.headers.get("content-length") ?? 0) > MAX_DIRECTORY_BYTES + 10_000)
      throw new AppError("employees.json must be smaller than 1 MB.", 413, "PAYLOAD_TOO_LARGE");
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new AppError("Choose the actual employees.json file to import.");
    }
    const file = form.get("file");
    if (!(file instanceof File) || file.name.toLowerCase() !== "employees.json")
      throw new AppError(
        "The directory must be the provided employees.json file.",
        400,
        "INVALID_DIRECTORY_FILE",
      );
    if (file.size > MAX_DIRECTORY_BYTES)
      throw new AppError("employees.json must be smaller than 1 MB.", 413, "PAYLOAD_TOO_LARGE");
    if (await readDirectoryFile())
      throw new AppError(
        "A project employees.json file is already configured. Update that source file instead of importing a second directory.",
        409,
        "DIRECTORY_SOURCE_EXISTS",
      );
    let payload: unknown;
    try {
      payload = JSON.parse((await file.text()).replace(/^\uFEFF/, ""));
    } catch {
      throw new AppError(
        "employees.json is not valid JSON. No profiles have been changed.",
        400,
        "INVALID_DIRECTORY",
      );
    }
    await importEmployeeDirectory(payload, "upload");
    return Response.json({ data: await getDirectoryStatus() }, { status: 201 });
  }
  await ensureDirectory();
  if (method === "GET" && endpoint === "employees") {
    const role = url.searchParams.has("role")
      ? z.enum(["EMPLOYEE", "MANAGER"]).parse(url.searchParams.get("role"))
      : undefined;
    const search = z
      .string()
      .max(100)
      .parse(url.searchParams.get("search") ?? "");
    return Response.json({ data: searchProfiles(await service.listEmployees(), search, role) });
  }
  if (method === "POST" && endpoint === "identity") {
    const selection = identitySelectionSchema.parse(await readBody(request));
    const person = await service.getEmployee(selection.employeeId);
    if ((selection.portal === "manager" ? "MANAGER" : "EMPLOYEE") !== person.role)
      throw new AppError(
        "This profile belongs to the other portal. Please choose the matching role.",
        403,
        "PORTAL_ROLE_MISMATCH",
      );
    const response = NextResponse.json({ data: { employee: person, redirectTo: "/dashboard" } });
    response.cookies.set(IDENTITY_COOKIE, person.id, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 12,
    });
    return response;
  }
  const userId = requestIdentity(request);
  if (!userId)
    throw new AppError("Choose and confirm your profile to continue.", 401, "IDENTITY_REQUIRED");
  const actor = await service.getEmployee(userId);
  if (method === "GET" && endpoint === "identity") return Response.json({ data: actor });
  if (method === "GET" && path[0] === "employees" && path.length === 2) {
    const target = await service.getEmployee(path[1]);
    service.authorizeEmployee(actor, target);
    return Response.json({ data: target });
  }
  if (method === "GET" && path[0] === "employees" && path.length === 3) {
    if (path[2] === "leave-requests")
      return Response.json({ data: await service.employeeRequests(actor, path[1]) });
    if (path[2] === "balance")
      return Response.json({
        data: await service.employeeBalance(
          actor,
          path[1],
          yearSchema.parse(url.searchParams.get("year") ?? new Date().getUTCFullYear()),
        ),
      });
  }
  if (method === "POST" && endpoint === "leave-requests")
    return Response.json(
      { data: await service.createLeave(actor, createLeaveSchema.parse(await readBody(request))) },
      { status: 201 },
    );
  if (
    method === "GET" &&
    ["manager/leave-requests", "manager/leave-requests/pending"].includes(endpoint)
  )
    return Response.json(await service.managerRequests(actor, path[2] === "pending"));
  if (
    method === "PATCH" &&
    path[0] === "leave-requests" &&
    path.length === 3 &&
    ["approve", "reject"].includes(path[2])
  ) {
    const input = (path[2] === "approve" ? approvalSchema : rejectionSchema).parse(
      await readBody(request),
    );
    return Response.json({
      data: await service.reviewLeave(
        actor,
        path[1],
        path[2] === "approve" ? "APPROVED" : "REJECTED",
        input.comment,
      ),
    });
  }
  if (method === "GET" && endpoint === "team/availability")
    return Response.json({ data: await service.teamAvailability(actor) });
  throw new AppError("This API endpoint could not be found.", 404, "NOT_FOUND");
}
export async function handleRequest(request: Request): Promise<Response> {
  try {
    const response = await dispatch(request);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    if (error instanceof ZodError)
      return Response.json(
        {
          error: {
            message: error.issues[0]?.message ?? "Please check your input.",
            code: "VALIDATION_ERROR",
            fields: Object.fromEntries(
              error.issues.map((issue) => [issue.path.join("."), issue.message]),
            ),
          },
        },
        { status: 400 },
      );
    if (error instanceof AppError)
      return Response.json(
        { error: { message: error.message, code: error.code, fields: error.fields } },
        { status: error.status },
      );
    console.error("Nordia API error:", error);
    return Response.json(
      { error: { message: "Something went wrong. Please try again.", code: "INTERNAL_ERROR" } },
      { status: 500 },
    );
  }
}
