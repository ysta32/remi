// Dev-only helpers behind DEV_TOOLS=1 (contracts §6).
import { getSqlite } from '@/db/client';
import { seedThemes } from '@/db/migrate';
import { emptyUploadDir } from './uploads';

// Children before parents so this works with foreign_keys=ON.
const TABLES = [
  'safety_events',
  'call_events',
  'call_markers',
  'fun_facts',
  'topics',
  'nudges',
  'baselines',
  'calls',
  'photos',
  'family_questions',
  'family_members',
  'consents',
  'elders',
  'themes',
];

export function resetAll(): void {
  const db = getSqlite();
  db.transaction(() => {
    for (const t of TABLES) db.prepare(`DELETE FROM ${t}`).run();
  })();
  emptyUploadDir();
  seedThemes(db);
}
