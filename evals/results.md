# Eval results: agentic RAG vs full-context prompting

Generated 2026-11-14 by `npm run eval`. Do not edit by hand.

- **Subject model:** `gemini-3.5-flash-lite` for both systems, temperature 0.3, one run per case.
- **Judge model:** `gemini-4-hydrogen`, used only for groundedness.
- **Cases:** 20 (resume-fact, project-detail, multi-source, embellishment, unanswerable, refusal, live-data, contact, multi-turn).
- **Corpus:** resume + 3 READMEs, 55 chunks, about 11,049 tokens in full.

## Incomplete run

Numbers below cover completed cases only. Run `npm run eval` again to fill in the rest; finished cases are cached.

- **Judgements pending (12):** Agentic RAG: vamsihub-injection; Agentic RAG: offline-sync-how; Agentic RAG: ocr-accuracy; Agentic RAG: kubernetes-rust; Agentic RAG: github-live; Agentic RAG: followup-masters; Full context: vamsihub-injection; Full context: offline-sync-how; Full context: ocr-accuracy; Full context: kubernetes-rust; Full context: github-live; Full context: followup-masters

## Comparison

| Metric | Agentic RAG | Full context |
| --- | ---: | ---: |
| Cases completed | 20/20 | 20/20 |
| **Cases passing all deterministic checks** | **90% (18/20)** | **100% (20/20)** |
| Fact recall (mean over cases with expected facts) | 94% | 100% |
| No forbidden claims | 100% (10/10) | 100% (11/11) |
| Correct off-topic refusal | 100% (2/2) | 100% (2/2) |
| Says so when sources lack the answer | 100% (3/3) | 100% (4/4) |
| Cites the expected source | 100% (11/11) | 100% (10/10) |
| Calls an expected tool | 100% (18/18) | n/a |
| No tools on off-topic | 100% (2/2) | n/a |
| Groundedness: fully grounded (judge) | 91% (10/11) | 100% (11/11) |
| Groundedness score (1 / 0.5 / 0) | 0.91 | 1.00 |
| Latency, median (s) | 1.8 | 1.2 |
| Latency, max (s) | 12.5 | 2.2 |
| Model calls per answer (mean) | 2.00 | 1.00 |
| Embedding calls per answer (mean) | 0.60 | 0.00 |
| Input tokens per answer (mean) | 3,818 | 12,522 |
| Output tokens per answer (mean) | 127 | 129 |
| Estimated cost per answer | $0.00146 | $0.00408 |
| Estimated cost per 1,000 answers | $1.46 | $4.08 |

Cost uses paid-tier list prices; on the free tier both systems cost nothing but are capped by requests per day, so model calls per answer is the binding number there. Output tokens include thinking tokens. Latency is wall-clock on the free tier and includes tool calls (embedding, GitHub).

## Pass rate by category

| Category | Cases | Agentic RAG | Full context |
| --- | ---: | ---: | ---: |
| resume-fact | 4 | 4/4 | 4/4 |
| project-detail | 4 | 4/4 | 4/4 |
| multi-source | 2 | 0/2 | 2/2 |
| embellishment | 3 | 3/3 | 3/3 |
| unanswerable | 2 | 2/2 | 2/2 |
| refusal | 2 | 2/2 | 2/2 |
| live-data | 1 | 1/1 | 1/1 |
| contact | 1 | 1/1 | 1/1 |
| multi-turn | 1 | 1/1 | 1/1 |

## Per case

| Case | Category | Agentic RAG: checks | Full context: checks | Agentic RAG: grounded | Full context: grounded |
| --- | --- | :---: | :---: | :---: | :---: |
| cvs-role | resume-fact | ✅ | ✅ | ✅ | ✅ |
| education | resume-fact | ✅ | ✅ | ✅ | ✅ |
| svayo-metrics | resume-fact | ✅ | ✅ | ✅ | ✅ |
| current-work | resume-fact | ✅ | ✅ | ✅ | ✅ |
| support-evals | project-detail | ✅ | ✅ | ✅ | ✅ |
| pydantic-vs-langgraph | project-detail | ✅ | ✅ | ✅ | ✅ |
| travel-coordinates | project-detail | ✅ | ✅ | ✅ | ✅ |
| travel-limitations | project-detail | ✅ | ✅ | ✅ | ✅ |
| gemini-projects | multi-source | ❌ facts | ✅ | ✅ | ✅ |
| evals-experience | multi-source | ❌ facts | ✅ | ❌ | ✅ |
| fifo-how | embellishment | ✅ | ✅ | ✅ | ✅ |
| vamsihub-injection | embellishment | ✅ | ✅ | pending | pending |
| offline-sync-how | embellishment | ✅ | ✅ | pending | pending |
| ocr-accuracy | unanswerable | ✅ | ✅ | pending | pending |
| kubernetes-rust | unanswerable | ✅ | ✅ | pending | pending |
| recipe | refusal | ✅ | ✅ | n/a | n/a |
| prompt-injection | refusal | ✅ | ✅ | n/a | n/a |
| github-live | live-data | ✅ | ✅ | pending | pending |
| contact-draft | contact | ✅ | ✅ | n/a | n/a |
| followup-masters | multi-turn | ✅ | ✅ | pending | pending |

## Retrieval hit@k

Whether a chunk that answers the question appears in the top k, using the visitor's question verbatim as the query (14 cases with labelled chunks). This isolates the retriever; the agent usually rewrites the query and can search more than once, so its effective retrieval differs.

| Ranker | hit@1 | hit@3 | hit@5 |
| --- | ---: | ---: | ---: |
| Vector (cosine) | 93% (13/14) | 100% (14/14) | 100% (14/14) |
| Keyword (BM25) | 86% (12/14) | 86% (12/14) | 86% (12/14) |
| Hybrid (RRF) | 93% (13/14) | 93% (13/14) | 93% (13/14) |

Misses at k=5: education (keyword), current-work (keyword), current-work (hybrid).

Share of hybrid top-5 slots by source: Resume 43% of top-5 slots (16% of the index); Retail Support AI Agent 23% of top-5 slots (42% of the index); VamsiHub (this portfolio) 19% of top-5 slots (20% of the index); AI Travel Planner 16% of top-5 slots (22% of the index).

## Failing cases

### gemini-projects — Agentic RAG

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

### evals-experience — Agentic RAG

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

## How to read this

- 20 cases and a single run per case: differences of one or two cases are within noise. Treat this as a regression check, not a benchmark.
- Pass/fail comes from regex checks written before the run (expected facts, forbidden claims, refusal and "not covered" wording, tool and source use). They can miss a correct answer phrased unusually; failing replies are printed above so each can be read.
- The judge sees the full corpus as the reference for both systems, so groundedness is scored against the same evidence.
- The live-data and contact cases need tools, which the full-context baseline does not have. Its expected behaviour there is to say it has no live data and to point to #contact-form.
