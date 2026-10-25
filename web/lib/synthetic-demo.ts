/** Provenance for this specific imported transcript corpus, shared by importer and UI. */
export const SYNTHETIC_TRANSCRIPT_NOTICE = 'Synthetic transcript demo. Call timing is authored, not measured from audio. Call cards show transcript excerpts; summaries and repeat analysis have not been run.';

export function isSyntheticTranscriptDemo(
  profile: { about?: string } | null | undefined,
  calls: readonly { isSimulated: boolean }[],
): boolean {
  return !!profile?.about?.startsWith(`${SYNTHETIC_TRANSCRIPT_NOTICE}\n\n`) &&
    calls.length > 0 && calls.every(call => call.isSimulated);
}
