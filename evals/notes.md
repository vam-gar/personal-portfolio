## Decision

**The hybrid agent ships:** the resume lives in the system prompt, and tools cover README search, live GitHub stats and contact drafts.

| | Tools-only agent (v1) | Full context | Hybrid agent |
| --- | ---: | ---: | ---: |
| Cases passing deterministic checks | 18/20 | 21/21 | 21/21 |
| Model calls per answer | 2.00 | 1.00 | 1.43 |
| Input tokens per answer | 3,818 | 12,525 | 4,121 |
| Estimated cost per 1,000 answers | $1.46 | $4.09 | $1.53 |
| Median latency | 1.8 s | 1.2 s | 1.1 s |

Why:

- **It fixes what the first agent got wrong.** v1 failed both multi-source cases (0/2) because it answered from one search and never saw the rest of the resume. With the resume always in context the hybrid passes both (2/2), and 12 of its 21 answers need no tool call at all.
- **It matches full context on these checks at a third of the input tokens** (4,121 vs 12,525 per answer; $1.53 vs $4.09 per 1,000 answers at list prices).
- **It does things full context cannot.** Live GitHub stats and contact drafts need tools. The full-context column "passes" those two cases only by correctly declining.

What this does not show:

- **Full context is not worse on accuracy.** At this corpus size (about 11,000 tokens) it passed every case with one model call. On the free tier, where the cap is requests per day rather than tokens, its 1.00 calls per answer serves about 40% more visitors than the hybrid's 1.43. If the tools were not wanted, full context would be the simpler choice until the READMEs outgrow the prompt.
- **Groundedness of the hybrid agent is not yet judged.** The judge model's daily quota ran out; all 17 hybrid judgements and 14 others are pending. Run `npm run eval -- --keep-stale` to fill them in. The decision stands on the deterministic checks until then.
- **The hybrid's first run was 19/21.** It answered "Why PydanticAI over LangGraph?" from the resume without searching and said the docs did not cover it. The prompt now requires a search for any how/why question about a project, and the re-run found the answer. A model that skips the search is the failure mode to watch in this design.

**Retrieval: hybrid search stays.** On six exact-term queries (FIFO, Tesseract, PydanticAI, Zod, TestModel, Null Island) vector search alone put a relevant chunk first for 2 of 6 and missed 2 entirely at k=5; BM25 and the hybrid ranker got 6 of 6 at rank 1. On 14 natural-language questions the hybrid costs one case: vector finds a relevant chunk in the top 3 for 14 of 14, the hybrid for 13 of 14 ("What is he working on right now?"). That miss is a resume question, which the shipped agent no longer retrieves for; on the README-only pool it actually searches, the hybrid is 4/4 on both query types. These are small samples.

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
8. The hybrid agent's prompt was tightened once after its first run (see above) and all 21 of its cases were re-run.
