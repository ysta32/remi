// `npm run db:migrate` — opening the client applies migrations and themes.
import { loadLocalEnv } from '../lib/server/env';

loadLocalEnv();
const { config } = await import('../lib/config');
const { getSqlite } = await import('./client');
getSqlite();
console.log(`migrated ${config.databasePath}`);
