// `npm run db:migrate` — opening the client applies migrations and themes.
// No top-level await: tsx compiles this package as CommonJS.
import { loadLocalEnv } from '../lib/server/env';

loadLocalEnv();
(async () => {
  const { config } = await import('../lib/config');
  const { getSqlite } = await import('./client');
  getSqlite();
  console.log(`migrated ${config.databasePath}`);
})();
