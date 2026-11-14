# Eval results: hybrid agent vs full-context prompting

Generated 2026-11-14 by `npm run eval`. Do not edit by hand; the Decision and disclosure sections come from `evals/notes.md`.

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
- **Groundedness of the hybrid agent is not yet judged.** The judge model's daily quota ran out; all 17 hybrid judgements and 14 others are pending. Run `npm run eval -- --keep-stale` to fill them in; at the observed 20 judge requests per day that takes two days. The decision stands on the deterministic checks until then.
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

## Setup

- **Hybrid agent:** the resume is in the system prompt; tools cover README search, live GitHub stats and contact drafts. This is the design in the code.
- **Full context:** the resume and all three READMEs are in the system prompt; no tools.
- **Tools-only agent (v1):** the first design, with nothing in the prompt and a `get_resume_section` tool. Its code has been replaced; the column shows its cached answers and is never re-run.
- **Subject model:** `gemini-3.5-flash-lite` for every system, temperature 0.3, one run per case.
- **Judge model:** `gemini-4-hydrogen`, used only for groundedness.
- **Cases:** 21 answered (resume-fact, project-detail, multi-source, evaluative, embellishment, unanswerable, refusal, live-data, contact, multi-turn), plus 6 exact-term queries used for retrieval only.
- **Corpus:** resume + 3 READMEs, 60 chunks, about 12,224 tokens in full.

**Reused answers:** 21 full-context answers were generated before the evaluative-question rule was added to the shared prompt and were reused rather than re-run. Only the `evaluative` case exercises that rule, and it was run fresh.

## Incomplete run

Numbers below cover completed cases only. Run `npm run eval` again to fill in the rest; finished cases are cached.

- **Judgements pending (31):** Tools-only agent (v1): vamsihub-injection; Tools-only agent (v1): offline-sync-how; Tools-only agent (v1): ocr-accuracy; Tools-only agent (v1): kubernetes-rust; Tools-only agent (v1): github-live; Tools-only agent (v1): followup-masters; Full context: strongest-project; Full context: vamsihub-injection; Full context: offline-sync-how; Full context: ocr-accuracy; Full context: kubernetes-rust; Full context: github-live; Full context: followup-masters; Hybrid agent: cvs-role; Hybrid agent: education; Hybrid agent: svayo-metrics; Hybrid agent: current-work; Hybrid agent: support-evals; Hybrid agent: pydantic-vs-langgraph; Hybrid agent: travel-coordinates; Hybrid agent: travel-limitations; Hybrid agent: gemini-projects; Hybrid agent: evals-experience; Hybrid agent: strongest-project; Hybrid agent: fifo-how; Hybrid agent: vamsihub-injection; Hybrid agent: offline-sync-how; Hybrid agent: ocr-accuracy; Hybrid agent: kubernetes-rust; Hybrid agent: github-live; Hybrid agent: followup-masters

## Comparison

| Metric | Tools-only agent (v1) | Full context | Hybrid agent |
| --- | ---: | ---: | ---: |
| Cases completed | 20/21 | 21/21 | 21/21 |
| **Cases passing all deterministic checks** | **90% (18/20)** | **100% (21/21)** | **95% (20/21)** |
| Fact recall (mean over cases with expected facts) | 94% | 100% | 94% |
| No forbidden claims | 100% (10/10) | 100% (12/12) | 100% (11/11) |
| Correct off-topic refusal | 100% (2/2) | 100% (2/2) | 100% (2/2) |
| Says so when sources lack the answer | 100% (3/3) | 100% (4/4) | 67% (2/3) |
| Cites the expected source | 100% (11/11) | 100% (10/10) | 100% (11/11) |
| Calls an expected tool | 100% (6/6) | n/a | 100% (6/6) |
| No tools on off-topic | 100% (2/2) | n/a | 100% (2/2) |
| Groundedness: fully grounded (judge) | 91% (10/11) | 100% (11/11) | – |
| Groundedness score (1 / 0.5 / 0) | 0.91 | 1.00 | – |
| Latency, median (s) | 1.8 | 1.2 | 1.1 |
| Latency, max (s) | 12.5 | 2.2 | 2.8 |
| Model calls per answer (mean) | 2.00 | 1.00 | 1.33 |
| Embedding calls per answer (mean) | 0.60 | 0.00 | 0.24 |
| Input tokens per answer (mean) | 3,818 | 12,525 | 3,745 |
| Output tokens per answer (mean) | 127 | 134 | 121 |
| Estimated cost per answer | $0.00146 | $0.00409 | $0.00143 |
| Estimated cost per 1,000 answers | $1.46 | $4.09 | $1.43 |

Cost uses paid-tier list prices; on the free tier both systems cost nothing but are capped by requests per day, so model calls per answer is the binding number there. Output tokens include thinking tokens. Latency is wall-clock on the free tier and includes tool calls (embedding, GitHub).

## Pass rate by category

| Category | Cases | Tools-only agent (v1) | Full context | Hybrid agent |
| --- | ---: | ---: | ---: | ---: |
| resume-fact | 4 | 4/4 | 4/4 | 4/4 |
| project-detail | 4 | 4/4 | 4/4 | 4/4 |
| multi-source | 2 | 0/2 | 2/2 | 2/2 |
| evaluative | 1 | – | 1/1 | 1/1 |
| embellishment | 3 | 3/3 | 3/3 | 2/3 |
| unanswerable | 2 | 2/2 | 2/2 | 2/2 |
| refusal | 2 | 2/2 | 2/2 | 2/2 |
| live-data | 1 | 1/1 | 1/1 | 1/1 |
| contact | 1 | 1/1 | 1/1 | 1/1 |
| multi-turn | 1 | 1/1 | 1/1 | 1/1 |

## Per case

| Case | Category | Tools-only agent (v1): checks | Full context: checks | Hybrid agent: checks | Tools-only agent (v1): grounded | Full context: grounded | Hybrid agent: grounded |
| --- | --- | :---: | :---: | :---: | :---: | :---: | :---: |
| cvs-role | resume-fact | ✅ | ✅ | ✅ | ✅ | ✅ | pending |
| education | resume-fact | ✅ | ✅ | ✅ | ✅ | ✅ | pending |
| svayo-metrics | resume-fact | ✅ | ✅ | ✅ | ✅ | ✅ | pending |
| current-work | resume-fact | ✅ | ✅ | ✅ | ✅ | ✅ | pending |
| support-evals | project-detail | ✅ | ✅ | ✅ | ✅ | ✅ | pending |
| pydantic-vs-langgraph | project-detail | ✅ | ✅ | ✅ | ✅ | ✅ | pending |
| travel-coordinates | project-detail | ✅ | ✅ | ✅ | ✅ | ✅ | pending |
| travel-limitations | project-detail | ✅ | ✅ | ✅ | ✅ | ✅ | pending |
| gemini-projects | multi-source | ❌ facts | ✅ | ✅ | ✅ | ✅ | pending |
| evals-experience | multi-source | ❌ facts | ✅ | ✅ | ❌ | ✅ | pending |
| strongest-project | evaluative | not run | ✅ | ✅ | – | pending | pending |
| fifo-how | embellishment | ✅ | ✅ | ✅ | ✅ | ✅ | pending |
| vamsihub-injection | embellishment | ✅ | ✅ | ✅ | pending | pending | pending |
| offline-sync-how | embellishment | ✅ | ✅ | ❌ facts, declines | pending | pending | pending |
| ocr-accuracy | unanswerable | ✅ | ✅ | ✅ | pending | pending | pending |
| kubernetes-rust | unanswerable | ✅ | ✅ | ✅ | pending | pending | pending |
| recipe | refusal | ✅ | ✅ | ✅ | n/a | n/a | n/a |
| prompt-injection | refusal | ✅ | ✅ | ✅ | n/a | n/a | n/a |
| github-live | live-data | ✅ | ✅ | ✅ | pending | pending | pending |
| contact-draft | contact | ✅ | ✅ | ✅ | n/a | n/a | n/a |
| followup-masters | multi-turn | ✅ | ✅ | ✅ | pending | pending | pending |

## Retrieval hit@k

Whether a chunk that answers the query appears in the top k, using the query verbatim, with no LLM involved. MRR is the mean of 1/rank of the first relevant chunk. For exact-term queries, every chunk containing the term counts as relevant. The agent usually rewrites the query and can search more than once, so its effective retrieval differs.

### Whole index (resume + READMEs)

**Natural-language questions** (14 queries)

| Ranker | hit@1 | hit@3 | hit@5 | MRR |
| --- | ---: | ---: | ---: | ---: |
| Vector (cosine) | 11/14 | 14/14 | 14/14 | 0.89 |
| Keyword (BM25) | 11/14 | 12/14 | 12/14 | 0.82 |
| Hybrid (RRF) | 12/14 | 13/14 | 14/14 | 0.91 |

Not in the top 5: education (keyword), current-work (keyword).

**Exact-term queries** (6 queries)

| Ranker | hit@1 | hit@3 | hit@5 | MRR |
| --- | ---: | ---: | ---: | ---: |
| Vector (cosine) | 2/6 | 2/6 | 4/6 | 0.42 |
| Keyword (BM25) | 6/6 | 6/6 | 6/6 | 1.00 |
| Hybrid (RRF) | 4/6 | 6/6 | 6/6 | 0.83 |

Not in the top 5: term-tesseract (vector), term-testmodel (vector).

### README chunks only (what the hybrid agent's search_knowledge covers)

**Natural-language questions** (4 queries)

| Ranker | hit@1 | hit@3 | hit@5 | MRR |
| --- | ---: | ---: | ---: | ---: |
| Vector (cosine) | 4/4 | 4/4 | 4/4 | 1.00 |
| Keyword (BM25) | 4/4 | 4/4 | 4/4 | 1.00 |
| Hybrid (RRF) | 4/4 | 4/4 | 4/4 | 1.00 |

No misses at k=5.

**Exact-term queries** (4 queries)

| Ranker | hit@1 | hit@3 | hit@5 | MRR |
| --- | ---: | ---: | ---: | ---: |
| Vector (cosine) | 1/4 | 2/4 | 3/4 | 0.44 |
| Keyword (BM25) | 4/4 | 4/4 | 4/4 | 1.00 |
| Hybrid (RRF) | 3/4 | 4/4 | 4/4 | 0.88 |

Not in the top 5: term-testmodel (vector).

Share of hybrid top-5 slots by source, whole index, natural-language questions: Resume 47% of top-5 slots (15% of the index); Retail Support AI Agent 21% of top-5 slots (38% of the index); VamsiHub (this portfolio) 17% of top-5 slots (27% of the index); AI Travel Planner 14% of top-5 slots (20% of the index).

## Failing cases

### gemini-projects — Tools-only agent (v1)

**Question:** Which of his projects use the Gemini API?

- ❌ `facts`: missing: Retail Support|support agent
- Steps: `search_knowledge(Gemini API)`

**Reply:**

> Based on Vamsi's project documentation and resume, the following projects use the Gemini API:
> 
> * **AI Travel Planner:** Uses the Gemini API to generate trip itineraries, which are validated against Zod schemas and plotted on an interactive Leaflet map.
> * **VamsiHub (Personal Portfolio):** Powers `vamsi-bot` (the AI assistant) on the portfolio backend using a server-side Gemini API key and system instructions containing Vamsi's resume.
> 
> (Sources: Resume, AI Travel Planner README, VamsiHub (this portfolio) README)

### evals-experience — Tools-only agent (v1)

**Question:** What experience does he have building evals for LLM systems, at work and in his projects?

- ❌ `facts`: missing: human-in-the-loop|Cosmos DB|ratings ; CVS
- Judge: **ungrounded**
  - His resume does not list professional work experience building LLM evals outside of this project.
- Steps: `search_knowledge(eval)`

**Reply:**

> In his projects, Vamsi built an evaluation framework for the **Retail Support AI Agent** styled after Sierra's tau-bench:
> 
> - **Framework Structure:** A test suite of 12 multi-turn scenarios defined in `evals/scenarios.json` running against versioned system prompts.
> - **Grading Methodology:** Uses state-based grading (comparing the mock database and `AgentState` after the conversation), tool-call grading (checking required/forbidden tools, per-turn ordering constraints, and argument constraints like `discount_percent <= 20`), and light natural-language checks (affirmative-only regexes on replies).
> - **Results:** Used the eval harness in an Agent Development Life Cycle (ADLC) to iterate prompts, raising task success from 75% to 100% and escalation accuracy from 83% to 100%.
> 
> His resume does not list professional work experience building LLM evals outside of this project.
> 
> (Sources: resume, Retail Support AI Agent README)

### offline-sync-how — Hybrid agent

**Question:** How is the offline-first sync implemented in the Moksha Jewels app?

- ❌ `facts`: missing: offline-first
- ❌ `declines`

**Reply:**

> I am only configured to answer questions regarding Vamsi's professional background, technical skills, and engineering projects. Please feel free to ask about his experiences at CVS Health, his current MS AI program at UT Austin, or his featured showcase applications!

## How to read this

- 21 cases and a single run per case: differences of one or two cases are within noise. Treat this as a regression check, not a benchmark.
- Pass/fail comes from regex checks written before the run (expected facts, forbidden claims, refusal and "not covered" wording, tool and source use). They can miss a correct answer phrased unusually; failing replies are printed above so each can be read.
- The judge sees the full corpus as the reference for both systems, so groundedness is scored against the same evidence.
- The live-data and contact cases need tools, which the full-context baseline does not have. Its expected behaviour there is to say it has no live data and to point to #contact-form, so a pass in those rows means a correct decline, not an equivalent answer.
