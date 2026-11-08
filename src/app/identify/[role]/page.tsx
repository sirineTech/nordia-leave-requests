import { notFound } from "next/navigation";
import Identification from "@/components/identification";
import { getDirectoryStatus } from "@/db/directory";
import { listEmployees } from "@/lib/leave-service";

export const dynamic = "force-dynamic";
export default async function IdentificationPage({
  params,
}: {
  params: Promise<{ role: string }>;
}) {
  const { role } = await params;
  if (role !== "employee" && role !== "manager") notFound();
  const directory = await getDirectoryStatus();
  const people = directory.state === "ready" ? await listEmployees() : [];
  return <Identification portal={role} people={people} directory={directory} />;
}
