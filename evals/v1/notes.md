## Decision

**The hybrid agent ships:** the resume lives in the system prompt, and tools cover README search, live GitHub stats and contact drafts.

| | Tools-only agent (v1) | Full context | Hybrid agent |
| --- | ---: | ---: | ---: |
| Cases passing deterministic checks | 18/20 | 21/21 | 20/21 |
| Model calls per answer | 2.00 | 1.00 | 1.33 |
| Input tokens per answer | 3,818 | 12,525 | 3,745 |
| Estimated cost per 1,000 answers | $1.46 | $4.09 | $1.43 |
| Median latency | 1.8 s | 1.2 s | 1.1 s |

Why:

- **It fixes what the first agent got wrong.** v1 failed both multi-source cases (0/2) because it answered from one search and never saw the rest of the resume. With the resume always in context the hybrid passes both (2/2), and 14 of its 21 answers need no tool call at all.
- **It comes within one case of full context at under a third of the input tokens** (3,745 vs 12,525 per answer; $1.43 vs $4.09 per 1,000 answers at list prices).
- **It does things full context cannot.** Live GitHub stats and contact drafts need tools. The full-context column "passes" those two cases only by correctly declining.

What this does not show:

- **Full context is at least as accurate.** At this corpus size (about 12,000 tokens) it passed every case with one model call, one more than the hybrid. On the free tier, where the cap is requests per day rather than tokens, its 1.00 calls per answer serves about a third more visitors than the hybrid's 1.33. If the tools were not wanted, full context would be the simpler choice until the READMEs outgrow the prompt.
- **Groundedness of the hybrid agent is not yet judged.** The judge model's daily quota ran out; all 17 hybrid judgements and 14 others are pending. Run `npm run eval:v1` to fill them in; at the observed 20 judge requests per day that takes two days. The decision stands on the deterministic checks until then.
- **The hybrid's one failure in the final run is a wrong refusal.** On "How is the offline-first sync implemented in the Moksha Jewels app?" it gave the off-topic guardrail reply. Asked three more times, it refused once and answered correctly twice, so this is an intermittent defect in the shipped prompt, not a grading artefact. It is left failing; a fix belongs in v2.
- **The hybrid's first run was 19/21.** It answered "Why PydanticAI over LangGraph?" from the resume without searching and said the docs did not cover it. The prompt now requires a search for any how/why question about a project, and the re-run found the answer. A model that skips the search is the failure mode to watch in this design.

**Retrieval: hybrid search stays.** On six exact-term queries (FIFO, Tesseract, PydanticAI, Zod, TestModel, Null Island) vector search alone put a relevant chunk first for 2 of 6 and missed 2 entirely at k=5. BM25 got 6 of 6 at rank 1; the hybrid ranker got 4 of 6 at rank 1 and 6 of 6 in the top 3. On 14 natural-language questions the two are close: vector has a relevant chunk in the top 3 for 14 of 14, the hybrid for 13 of 14, and both reach 14 of 14 in the top 5. On the README-only pool the shipped agent actually searches, the hybrid is 4/4 in the top 3 on both query types. These are small samples, and the numbers moved when the rewritten README joined the index (the hybrid's exact-term hit@1 was 6 of 6 before), so treat single-case differences as noise.

## Changes made after seeing results

Disclosed so the numbers can be read with them in mind.

Checks that were wrong (the replies were correct):

1. `kubernetes-rust`: the forbidden-claim regex matched "does **not** have experience with Kubernetes". Fixed to ignore negated phrases. Moved full context from fail to pass.
2. `current-work`: required "Supabase" in an answer to "What is he working on right now?". Dropped; the answer was correct without it. Moved full context from fail to pass.
3. `vamsihub-injection`: the forbidden-claim regex matched "do not state that it is fully resistant". Fixed to ignore negated phrases. Moved the hybrid agent from fail to pass.
4. `ocr-accuracy`: the "says it isn't covered" regex did not recognise "do not contain accuracy metrics". Added "contain". Moved the hybrid agent from fail to pass.

Changes to the systems and cases:

5. Tool expectations were removed from the 12 cases answerable from the resume alone, because the hybrid agent correctly answers those without a tool.
6. One `evaluative` case and six exact-term retrieval queries were added. The v1 column has no answer for the evaluative case.
7. A keyword-search bug was fixed: the tokenizer kept backticks attached, so terms written as `code` in a README (for example `TestModel`) could not be found by BM25. The v1 answers were generated before this fix.
8. The hybrid agent's prompt was tightened once after its first run (see above) and all 21 of its cases were re-run. That second run passed 21/21.
9. A citation rule was added to the hybrid agent's prompt (cite only the resume or a source a tool returned), the portfolio README was rewritten and the index rebuilt. All 21 hybrid cases were then re-run a third time, so the hybrid column reflects the shipped prompt. That run passed 20/21 and is the one reported; no check was changed for it and it was not repeated.

## Eval v1 is frozen

As of 2026-11-14, `evals/cases.json` and the checks in `evals/grade.ts` are frozen as eval v1. They will not be edited again, including to fix a check that turns out to be wrong; a wrong check is reported as a known issue instead. Any new case, changed expectation or changed grading rule goes into a v2 with its own cases file, its own cached runs and its own results, so v1 numbers stay comparable over time.

Two things about the v1 numbers to keep in mind:

- The full-context answers were generated before the portfolio README was rewritten, so that column saw the old README in its prompt. They were reused as agreed rather than re-run.
- The pending groundedness judgements are scored against the current corpus, which includes the rewritten README.
