import postgres from "postgres";
import { e2eDatabaseConfig } from "../e2e/helpers/safety";

if (process.env.E2E_CONFIRM_CREATE_GUARD !== "CREATE_DISPOSABLE_E2E_GUARD") {
  throw new Error(
    "Set E2E_CONFIRM_CREATE_GUARD=CREATE_DISPOSABLE_E2E_GUARD to initialize the local disposable DB marker.",
  );
}

async function main() {
  const config = e2eDatabaseConfig();
  const client = postgres(config.url, { max: 1, prepare: false, connect_timeout: 5 });
  try {
    await client`
      CREATE TABLE IF NOT EXISTS public.epetrecere_e2e_guard (
        singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
        marker text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `;
    await client`
      INSERT INTO public.epetrecere_e2e_guard (singleton, marker)
      VALUES (true, ${config.marker})
      ON CONFLICT (singleton) DO UPDATE SET marker = EXCLUDED.marker
    `;
    console.log("Disposable local E2E database marker initialized.");
  } finally {
    await client.end({ timeout: 1 });
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
