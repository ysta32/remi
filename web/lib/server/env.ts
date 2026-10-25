// CLI scripts (tsx) don't get Next's automatic .env loading. Load web/.env.local (then .env) so
// `npm run db:migrate` / `npm run seed` use the same DATABASE_PATH as `next dev`.
// Values already in process.env win; nothing is printed.
import fs from 'node:fs';
import path from 'node:path';

export function loadLocalEnv(): void {
  for (const name of ['.env.local', '.env']) {
    const file = path.join(process.cwd(), name);
    if (fs.existsSync(file)) process.loadEnvFile(file);
  }
}
