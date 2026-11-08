import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Dashboard from "@/components/dashboard";
import { ensureDirectory } from "@/db/directory";
import { IDENTITY_COOKIE } from "@/lib/identity";
import {
  employeeBalance,
  employeeRequests,
  getEmployee,
  listEmployees,
  managerRequests,
  teamAvailability,
} from "@/lib/leave-service";

export const dynamic = "force-dynamic";
export default async function DashboardPage() {
  const id = (await cookies()).get(IDENTITY_COOKIE)?.value;
  if (!id) redirect("/");
  try {
    await ensureDirectory();
  } catch {
    redirect("/");
  }
  const user = await getEmployee(id).catch(() => null);
  if (!user) redirect("/");
  const [people, balance, team, requests] = await Promise.all([
    listEmployees(),
    employeeBalance(user, user.id, new Date().getUTCFullYear()),
    teamAvailability(user),
    user.role === "MANAGER"
      ? managerRequests(user, false)
      : employeeRequests(user, user.id).then((data) => ({ data, summary: null })),
  ]);
  return (
    <Dashboard
      key={user.id}
      people={people}
      initialData={{
        employeeId: user.id,
        balance,
        team,
        requests: requests.data,
        summary: requests.summary,
      }}
    />
  );
}
