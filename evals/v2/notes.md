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
