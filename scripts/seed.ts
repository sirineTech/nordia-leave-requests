import "dotenv/config";
import { ensureDirectory, getDirectoryStatus } from "../src/db/directory";
import { pool } from "../src/db";

async function seed() {
  await ensureDirectory();
  const status = await getDirectoryStatus();
  if (status.state !== "ready")
    throw new Error(status.message ?? "Provide the actual employees.json file first.");
  console.log(
    `Imported employees.json: ${status.profileCount} profiles, ${status.managerCount} managers, ${status.teamCount} teams. Source IDs and managerId relationships preserved.`,
  );
}
seed()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
