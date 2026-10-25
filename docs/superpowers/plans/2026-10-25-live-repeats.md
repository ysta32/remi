# Live repeat integration implementation

Spec: docs/superpowers/specs/2026-10-25-live-repeats.md

## Task 1: Integrate and verify

Add the live cache migration/Drizzle mirror and contract in a dedicated contract commit. Write regression tests with HTTP-only mocks covering chronological matching, cache append/retries, stale/corrupt evidence, consent changes and safety. Implement cache validation, reuse the existing allowlisted DTO, and wire post-call analysis, seven-day markers and read-only DI. Preserve standalone detector/synthetic files. Update handoff and run instructions.

Test command: cd web && npm test
Expected: all tests pass, live evidence visible, provider failure unavailable, existing synthetic scores and tests unchanged. Also run web typecheck/lint/build, detector/synthetic tests and isolated-server contract smoke.

## Review Focus

Check privacy across async provider awaits, deletion/backdating and late safety flags, unrelated in-progress calls, cached empty results, marker semantics versus all-history matching, legacy demo compatibility, and whether any read path can expose stale/real-vs-simulated mixed evidence. Real FaceTime/provider behavior is not exercised by automated HTTP mocks.
