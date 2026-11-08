import Welcome from "@/components/welcome";
import { getDirectoryStatus } from "@/db/directory";

export const dynamic = "force-dynamic";
export default async function HomePage() {
  return <Welcome directory={await getDirectoryStatus()} />;
}
