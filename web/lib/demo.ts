// Keep the judges' existing seeded elder by default; optionally point home/nav at a separate demo.
// Do not import scripts/seed.ts here: it pulls the database into client components.
export const DEMO_ELDER_ID = process.env.NEXT_PUBLIC_DEMO_ELDER_ID || 'elder-hal-demo';
export const DEMO_ELDER_PATH = `/elders/${encodeURIComponent(DEMO_ELDER_ID)}`;
