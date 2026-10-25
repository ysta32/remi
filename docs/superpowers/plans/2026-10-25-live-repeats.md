# Live repeat integration implementation

Spec: docs/superpowers/specs/2026-10-25-live-repeats.md

## Task 1: Integrate and verify

Add the live cache migration/Drizzle mirror and contract in a dedicated contract commit. Write regression tests with HTTP-only mocks covering chronological matching, cache append/retries, stale/corrupt evidence, consent changes and safety. Implement cache validation, reuse the existing allowlisted DTO, and wire post-call analysis, seven-day markers and read-only DI. Preserve standalone detector/synthetic files. Update handoff and run instructions.

Test command: cd web && npm test
Expected: all tests pass, live evidence visible, provider failure unavailable, existing synthetic scores and tests unchanged. Also run web typecheck/lint/build, detector/synthetic tests and isolated-server contract smoke.

## Review Focus

Check privacy across async provider awaits, deletion/backdating and late safety flags, unrelated in-progress calls, cached empty results, marker semantics versus all-history matching, legacy demo compatibility, and whether any read path can expose stale/real-vs-simulated mixed evidence. Real FaceTime/provider behavior is not exercised by automated HTTP mocks.

## Validation and final review

Completed after fresh review of 0c869a5..2782432. Fixed the important seven-day candidate selection defect with a three-call regression (old similarity 1.0, recent 0.95). Also addressed the review's two pre-existing boundary concerns: isolate real Drift Index baselines from simulated calls, and hide legacy story summaries without summary sharing. Each regression failed first and passed after its fix; no minor findings deferred.

Final verification: 325 web tests pass, 1 skipped; 245 detector tests and 150 synthetic tests pass. Typecheck and lint pass. Production build passes with four pre-existing filesystem tracing warnings. Final isolated production API smoke passes all 78 checks. Frozen detector, synthetic source and evaluation checkpoint are unchanged.

Ruling: actual provider/FaceTime behavior requires a human test under project rules. Automated integration replaces provider HTTP only; real response quality, latency and phone delivery remain unverified until the two-call smoke in web/README.md. No new live accuracy claim.
