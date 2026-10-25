// `npm run db:migrate` — opening the client applies migrations and themes.
import { config } from '../lib/config';
import { getSqlite } from './client';

getSqlite();
console.log(`migrated ${config.databasePath}`);
