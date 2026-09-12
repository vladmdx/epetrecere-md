import { pathToFileURL } from "node:url";
import { isAbsolute, relative, resolve } from "node:path";
import {
  e2eDatabaseConfig,
  verifyE2EDatabase,
} from "../e2e/helpers/safety";

async function main() {
  const requested = process.argv[2];
  if (!requested) throw new Error("A test module path is required.");

  const root = process.cwd();
  const target = resolve(root, requested);
  const relativeTarget = relative(root, target);
  if (
    isAbsolute(relativeTarget) ||
    relativeTarget.startsWith("..") ||
    !relativeTarget.startsWith("scripts/")
  ) {
    throw new Error("The guarded runner accepts only test modules under scripts/.");
  }

  const config = e2eDatabaseConfig();
  await verifyE2EDatabase(config);
  process.env.DATABASE_URL = config.url;
  process.env.E2E_DATABASE_URL = config.url;
  process.env.E2E_RUNTIME = "1";

  // Import only after the marker check and exact runtime URL binding. This is
  // important because src/lib/db creates its client at module evaluation.
  await import(pathToFileURL(target).href);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
