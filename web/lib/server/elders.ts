// Family-facing elder profile serializers and zod schemas (contracts §5).
import { z } from 'zod';
import { getSqlite } from '@/db/client';
import { consentView } from './consent';
import { getConsentRow } from './context';

export const memberSchema = z.object({
  name: z.string().trim().min(1).max(100),
  relation: z.string().trim().min(1).max(100),
});

export const elderCreateSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
  preferredName: z.string().trim().min(1).max(60),
  language: z.enum(['en', 'zh']),
  timezone: z.string().trim().min(1).max(64).optional(),
  about: z.string().max(600).optional(),
  primaryContactName: z.string().trim().min(1).max(100),
  members: z.array(memberSchema).max(30).optional(),
});

export const elderPatchSchema = elderCreateSchema.partial();

export const questionCreateSchema = z.object({
  text: z.string().trim().min(1).max(500),
  askedBy: z.string().trim().min(1).max(100),
});

export const consentPutSchema = z.object({
  summaries: z.boolean(),
  funFacts: z.boolean(),
  speechTrends: z.boolean(),
  mood: z.boolean(),
});

export interface PhotoRow {
  id: string;
  elder_id: string;
  file_path: string;
  mime: string;
  caption: string;
  people: string;
  last_shown_at: string | null;
  is_simulated: number;
  created_at: string;
}

export interface QuestionRow {
  id: string;
  elder_id: string;
  text: string;
  asked_by: string;
  status: 'pending' | 'asked' | 'answered';
  asked_call_id: string | null;
  is_simulated: number;
  created_at: string;
}

export function photoView(p: PhotoRow) {
  return {
    id: p.id,
    elderId: p.elder_id,
    caption: p.caption,
    people: p.people,
    mime: p.mime,
    imageUrl: `/api/photos/${p.id}/file`,
    lastShownAt: p.last_shown_at,
    isSimulated: p.is_simulated === 1,
    createdAt: p.created_at,
  };
}

export function questionView(q: QuestionRow) {
  return {
    id: q.id,
    elderId: q.elder_id,
    text: q.text,
    askedBy: q.asked_by,
    status: q.status,
    askedCallId: q.asked_call_id,
    isSimulated: q.is_simulated === 1,
    createdAt: q.created_at,
  };
}

export function elderProfile(elderId: string) {
  const db = getSqlite();
  const e = db.prepare('SELECT * FROM elders WHERE id = ?').get(elderId) as
    | {
        id: string;
        display_name: string;
        preferred_name: string;
        language: 'en' | 'zh';
        timezone: string;
        about: string;
        primary_contact_name: string;
        is_simulated: number;
        created_at: string;
      }
    | undefined;
  if (!e) return null;
  const members = db
    .prepare('SELECT id, name, relation FROM family_members WHERE elder_id = ? ORDER BY rowid')
    .all(elderId) as { id: string; name: string; relation: string }[];
  const photos = (
    db.prepare('SELECT * FROM photos WHERE elder_id = ? ORDER BY created_at DESC').all(elderId) as PhotoRow[]
  ).map(photoView);
  const questions = (
    db.prepare('SELECT * FROM family_questions WHERE elder_id = ? ORDER BY created_at DESC').all(elderId) as QuestionRow[]
  ).map(questionView);
  return {
    id: e.id,
    displayName: e.display_name,
    preferredName: e.preferred_name,
    language: e.language,
    timezone: e.timezone,
    about: e.about,
    primaryContactName: e.primary_contact_name,
    isSimulated: e.is_simulated === 1,
    createdAt: e.created_at,
    members,
    photos,
    questions,
    consent: consentView(getConsentRow(elderId)),
  };
}
