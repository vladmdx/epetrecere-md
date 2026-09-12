import { spawn } from "node:child_process";
import {
  assertE2EClerkEnvironment,
  e2eDatabaseConfig,
  localE2EBaseUrl,
  verifyE2EDatabase,
} from "../e2e/helpers/safety";

async function main() {
  const baseUrl = new URL(localE2EBaseUrl());
  assertE2EClerkEnvironment();
  const config = e2eDatabaseConfig();
  await verifyE2EDatabase(config);

  const child = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "dev",
      "--turbopack",
      "--hostname",
      baseUrl.hostname,
      "--port",
      baseUrl.port || "3000",
    ],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        DATABASE_URL: config.url,
        E2E_DATABASE_URL: config.url,
        E2E_RUNTIME: "1",
        FEATURE_MULTI_HALL: "1",
      },
    },
  );

  let stopping = false;
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      if (stopping) return;
      stopping = true;
      child.kill(signal);
    });
  }

  child.on("exit", (code, signal) => {
    process.exit(code ?? (signal ? 1 : 0));
  });
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
