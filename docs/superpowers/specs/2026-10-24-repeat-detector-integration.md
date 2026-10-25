# Integration notes for Siyuan (no existing schema changed)

The detector is a standalone module under detector/. It receives the documented caller/agent Utterance[] structure. The approved definition supersedes the old marker notes for this module only: all earlier calls, stories AND questions, and separate elicitation labels.

Before calling it, enforce the elder's processing consent and load only authorized historical data. Pass processingAllowed:true only after this check. The module does not grant family access; existing backend sharing gates still apply. No raw audio is required. An empty/no-history call is distinct from status:unavailable.

Suggested transaction after status:ok:
1. Recheck current consent, call ownership/existence and input revision so a delayed result cannot restore revoked or deleted data.
2. Replace this call's detector-owned items/results using persistenceKey and returned stable item IDs; never append duplicate rows on retries. Do not delete other analyses owned by Siyuan.
3. Upsert historyUpdates only for existing authorized historical items; preserve the source call IDs and original extraction provenance.
4. Save total/story/question and unprompted/prompted/uncertain repeat counts alongside full match links and detector provenance. Family-facing filtering remains in Siyuan's backend.

Existing docs/contracts.md topics columns can represent id, elder_id, call_id, kind, summary, embedding_json, repeat_of_topic_id, is_simulated. They do NOT currently express uncertain elicitation, model/dimensions, source evidence, or detector version. The old summary<=140 convention differs from the detector's <=280 limit; do not silently truncate descriptions already embedded. Agree an additive storage mapping before wiring into production. This change intentionally does not rewrite those tables or the teammate's interfaces.

Do not silently put the all-label total into the old caller-initiated `repeat_stories` marker. Keep labels and kinds distinguishable. No diagnostic inference follows from these counts; a prompted retelling can be a successful companion interaction.

Tests use fictional input and controlled model-response fixtures. They test integration and calculations, not whether a live language model detects the same incident reliably. Task 2 will generate labeled fake calls; task 3 will tune a threshold on one split and report held-out precision/recall, false positives/negatives and dataset size. Golden labels must never enter the extraction input or embedding descriptions.

Remote checked during implementation: `ws/bc-backend` at b26a1c27bb517c53e19a39903600d43e04cb9edf now contains `extractCall`, `embed`, `findRepeats` and a stub `processCall` which only marks calls done. Its default extractor is `gpt-6.1-sol`, configured by `OPENAI_EXTRACT_MODEL`; embedding config is `OPENAI_EMBED_MODEL`. Our extractor remains explicitly configured, and the CLI supports those existing names. Existing extractor summaries/fun facts are a separate concern; our narrower extraction adds source evidence and uncertain elicitation. Replacing/merging those adapters is a teammate integration step, not performed here. No LLM match fallback is used by this detector.

Bootstrapping history: legacy topics without quote/sourceTurnIndex/model metadata cannot safely be treated as fully provenanced detector records. Reprocess their authorized full transcripts chronologically with the same extraction/embedding settings, or agree a deliberate adapter/enrichment step with Siyuan. Do not invent source quotes or assume a vector's model from its dimensions. Uncached detector-format historical items can be embedded lazily by the module. When changing models, explicitly rebuild the authorized history; the detector refuses mixed embeddings.

Historical re-extraction can change source quotes and therefore item IDs. When replacing an old call's detector rows, handle downstream repeat links referencing the old IDs: reconcile/recompute affected later calls in the same integration workflow. A stable call-level persistence key alone cannot preserve those references. This remains the storage owner's responsibility; no database implementation was changed here.
