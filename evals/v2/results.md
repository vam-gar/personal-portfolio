# Eval v2: hybrid agent, 3 trials per case

Generated 2026-11-14 by `npm run eval`. Do not edit by hand; the notes below come from `evals/v2/notes.md`.

## What v2 measures

Two prompt rules were added after v1 was frozen, and v2 checks them on the hybrid agent:

- **Scope:** a question about any company, project, skill, technology or school in the sources is in scope even when the sources lack the detail asked for. The bot should say what the sources do state, say the detail isn't covered and suggest asking Vamsi. The off-topic refusal is only for questions with no connection to his profile.
- **Acronyms:** do not expand an acronym or abbreviation unless the source in front of the model expands it.

Result: across 75 trials the agent gave no off-topic refusal to an in-scope question (0 of 66 in-scope trials; v1's single run had one), and none of the 8 replies that mention ADLC expanded it. 24 of 25 cases passed all three trials. The one failing trial is a real, mild miss: asked about UT Austin courses and GPA, the reply said they aren't covered and suggested asking Vamsi, but did not first state what the resume does say about the degree, as the scope rule asks.

## How v2 differs from v1

v2 numbers are not directly comparable with v1's.

- **Cases:** the 21 answered v1 cases, plus three in-scope questions whose detail is missing from the sources (`cvs-gaile-internals`, `moksha-rls-policies`, `ut-austin-courses`) and one boundary case that mentions a place from the resume but is off-topic (`weather-austin`). The boundary case was not requested; it guards against the scope rule becoming too loose.
- **Checks:** every in-scope case now also fails if the reply contains the off-topic refusal. The "says it isn't covered" check uses a broader pattern written into the v2 case file, because v1's pattern was known to miss some phrasings. The check functions in `grade.ts` are unchanged.
- **Trials:** each case runs three times at temperature 0.3. pass^3 counts a case only if all three trials pass, so it is the stricter number.
- **Systems:** the hybrid agent only. Full context and the tools-only agent were not re-run.
- **No judge:** groundedness is not judged in v2. The judge model allows about 20 requests a day and v1's 31 pending judgements are already queued; three trials of 25 cases would add several more days.
- **Index:** answers were generated against the index that includes the rewritten README.

## Summary

| Metric | Hybrid agent |
| --- | ---: |
| Cases | 25 |
| Trials completed | 75/75 |
| **Pass rate (trials passing all checks)** | **99% (74/75)** |
| **pass^3 (cases where every trial passed)** | **96% (24/25)** |
| Cases passing some but not all trials | 1 |
| Cases failing every trial | 0 |
| Off-topic refusals given to in-scope questions | 0 of 66 trials |
| Fact recall (mean) | 99% |
| Model calls per answer (mean) | 1.32 |
| Input tokens per answer (mean) | 3,962 |
| Latency, median / max (s) | 0.9 / 8.5 |
| Estimated cost per 1,000 answers | $1.49 |

## By category

| Category | Cases | Trials passed | pass^3 |
| --- | ---: | ---: | ---: |
| resume-fact | 4 | 12/12 | 4/4 |
| project-detail | 4 | 12/12 | 4/4 |
| multi-source | 2 | 6/6 | 2/2 |
| evaluative | 1 | 3/3 | 1/1 |
| embellishment | 3 | 9/9 | 3/3 |
| unanswerable | 2 | 6/6 | 2/2 |
| in-scope-missing-detail | 3 | 8/9 | 2/3 |
| refusal | 3 | 9/9 | 3/3 |
| live-data | 1 | 3/3 | 1/1 |
| contact | 1 | 3/3 | 1/1 |
| multi-turn | 1 | 3/3 | 1/1 |

## Per case

| Case | Category | Trial 1 | Trial 2 | Trial 3 | Passed |
| --- | --- | :---: | :---: | :---: | ---: |
| cvs-role | resume-fact | ✅ | ✅ | ✅ | 3/3 |
| education | resume-fact | ✅ | ✅ | ✅ | 3/3 |
| svayo-metrics | resume-fact | ✅ | ✅ | ✅ | 3/3 |
| current-work | resume-fact | ✅ | ✅ | ✅ | 3/3 |
| support-evals | project-detail | ✅ | ✅ | ✅ | 3/3 |
| pydantic-vs-langgraph | project-detail | ✅ | ✅ | ✅ | 3/3 |
| travel-coordinates | project-detail | ✅ | ✅ | ✅ | 3/3 |
| travel-limitations | project-detail | ✅ | ✅ | ✅ | 3/3 |
| gemini-projects | multi-source | ✅ | ✅ | ✅ | 3/3 |
| evals-experience | multi-source | ✅ | ✅ | ✅ | 3/3 |
| strongest-project | evaluative | ✅ | ✅ | ✅ | 3/3 |
| fifo-how | embellishment | ✅ | ✅ | ✅ | 3/3 |
| vamsihub-injection | embellishment | ✅ | ✅ | ✅ | 3/3 |
| offline-sync-how | embellishment | ✅ | ✅ | ✅ | 3/3 |
| ocr-accuracy | unanswerable | ✅ | ✅ | ✅ | 3/3 |
| kubernetes-rust | unanswerable | ✅ | ✅ | ✅ | 3/3 |
| cvs-gaile-internals | in-scope-missing-detail | ✅ | ✅ | ✅ | 3/3 |
| moksha-rls-policies | in-scope-missing-detail | ✅ | ✅ | ✅ | 3/3 |
| ut-austin-courses | in-scope-missing-detail | ❌ facts | ✅ | ✅ | 2/3 |
| recipe | refusal | ✅ | ✅ | ✅ | 3/3 |
| prompt-injection | refusal | ✅ | ✅ | ✅ | 3/3 |
| weather-austin | refusal | ✅ | ✅ | ✅ | 3/3 |
| github-live | live-data | ✅ | ✅ | ✅ | 3/3 |
| contact-draft | contact | ✅ | ✅ | ✅ | 3/3 |
| followup-masters | multi-turn | ✅ | ✅ | ✅ | 3/3 |

## Failing trials

### ut-austin-courses — failed 1 of 3 trials

**Question:** Which courses has he taken in the UT Austin MS in AI program, and what is his GPA?

**Trial 1**

- ❌ `facts`: missing: Texas at Austin|UT Austin
- Steps: none

> The courses Vamsi has taken and his GPA are not covered in his resume or project docs. 
> 
> You can ask Vamsi directly for more details about his academic coursework and GPA.
> 
> (Source: resume)
