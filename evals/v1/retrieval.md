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
