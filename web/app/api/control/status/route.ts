import { json } from '@/lib/server/http';
import { listContacts, listJobs, systemStatus } from '@/lib/server/control';
import { config } from '@/lib/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const system = await systemStatus();
  return json({ system, jobs: listJobs(), contacts: listContacts(config.controlElderId), elderId: config.controlElderId });
}
