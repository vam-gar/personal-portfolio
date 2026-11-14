// Eval v1 (FROZEN): hybrid agent vs full-context prompting vs the first
// tools-only agent. Cases, checks and answers are fixed; this script never
// generates an answer. It only fills in missing groundedness judgements
// and rebuilds the report from evals/v1/.
//
//   npm run eval:v1                 fill pending judgements, rewrite the report
//   npm run eval:v1 -- --report     no API calls; rebuild the report from the cache
//   npm run eval:v1 -- --no-judge   skip the groundedness judge
//
// New cases, checks or prompt changes are measured by eval v2 (run-v2.ts).
//
// Env: JUDGE_MODEL (default gemini-4-hydrogen; must differ from the subject
// model so they do not share a free-tier quota).
//
// evals/v1/notes.md (hand-written: the decision and disclosures) is copied
// to the top of the report. The retrieval section and corpus size were
// snapshotted when v1 was frozen (retrieval.md, meta.json) so later index
// changes do not alter v1's numbers.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadEnvLocal } from "../scripts/env";
import { composeResults } from "./compose";

loadEnvLocal();

const DIR = path.join(__dirname, "v1");
const RUNS = path.join(DIR, "runs");
const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const option = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const SUBJECT_MODEL = process.env.EVAL_MODEL || "gemini-3.5-flash-lite";
const JUDGE_MODEL = process.env.JUDGE_MODEL || "gemini-4-hydrogen";
const PAUSE_MS = 6000; // between subject runs, to stay under per-minute limits
const K_VALUES = [1, 3, 5];

const readIfExists = (file: string) => (existsSync(file) ? readFileSync(file, "utf8") : null);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const readJson = <T>(file: string): T | null =>
  existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as T) : null;
const writeJson = (file: string, data: unknown) => {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
};
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const median = (xs: number[]) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const pct = (x: number) => (Number.isNaN(x) ? "–" : `${(x * 100).toFixed(0)}%`);

async function main() {
  // Imported after .env.local is loaded.
  const { GeminiError, embedQuery } = await import("../lib/gemini");
  const { getRepoStats } = await import("../lib/github");
  const search = await import("../lib/rag/search");
  const systems = await import("./systems");
  const grading = await import("./grade");
  type RunRecord = import("./systems").RunRecord;
  type SystemName = import("./systems").SystemName;
  type EvalCase = import("./grade").EvalCase;
  type Judgement = import("./grade").Judgement;
  type Grade = import("./grade").Grade;

  if (JUDGE_MODEL === SUBJECT_MODEL) {
    throw new Error("JUDGE_MODEL must differ from EVAL_MODEL (shared quota, and a model should not grade itself).");
  }

  const only = option("--only")?.split(",");
  const allCases = (JSON.parse(readFileSync(path.join(DIR, "cases.json"), "utf8")) as EvalCase[]).filter(
    (c) => !only || only.includes(c.id)
  );
  // Exact-term cases measure the retriever only; no answers are generated.
  const cases = allCases.filter((c) => !c.retrievalOnly);
  const reportOnly = flag("--report");
  const useJudge = !flag("--no-judge");

  // `frozen` columns are never run: they show cached answers from a design
  // whose code no longer exists.
  type Column = { key: string; label: string; system: SystemName; model: string; frozen?: boolean };
  const columns: Column[] = [
    { key: `agent-v1__${SUBJECT_MODEL}`, label: "Tools-only agent (v1)", system: "agent-v1", model: SUBJECT_MODEL, frozen: true },
    { key: `baseline__${SUBJECT_MODEL}`, label: "Full context", system: "baseline", model: SUBJECT_MODEL },
    { key: `agent__${SUBJECT_MODEL}`, label: "Hybrid agent", system: "agent", model: SUBJECT_MODEL },
  ];

  // ---- quota-aware call wrapper ----
  const exhausted = new Set<string>(); // models whose daily quota is gone
  const problems: string[] = [];
  async function guarded<T>(model: string, what: string, fn: () => Promise<T>): Promise<T | null> {
    if (exhausted.has(model)) return null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await fn();
      } catch (err) {
        if (err instanceof GeminiError && err.status === 429) {
          const secs = err.retryAfterSecs;
          if (secs !== null && secs <= 90) {
            console.log(`  per-minute limit on ${model}; waiting ${secs + 2}s`);
            await sleep((secs + 2) * 1000);
            continue;
          }
          exhausted.add(model);
          problems.push(`${model}: daily quota exhausted${secs ? ` (resets in ~${Math.ceil(secs / 3600)}h)` : ""}.`);
          console.log(`  ${model}: daily quota exhausted — skipping its remaining calls`);
          return null;
        }
        const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
        if (attempt < 1) {
          console.log(`  ${what} failed (${message}); retrying once`);
          await sleep(3000);
          continue;
        }
        problems.push(`${what}: ${message}`);
        console.log(`  ${what} failed (${message}); left pending`);
        return null;
      }
    }
    return null;
  }

  // ---- 1. subject runs (cached per case) ----
  const runFile = (key: string, id: string) => path.join(RUNS, key, `${id}.json`);
  const records = new Map<string, RunRecord>(); // `${key}/${id}`
  for (const c of cases) {
    for (const col of columns) {
      const file = runFile(col.key, c.id);
      const cached = readJson<RunRecord>(file);
      // v1 is frozen: cached answers are used as they are and never re-run,
      // even though the prompts have changed since.
      if (cached) records.set(`${col.key}/${c.id}`, cached);
    }
  }

  // ---- 2. live values for the GitHub case ----
  let live: { vars: Record<string, string>; evidence: string } | null = null;
  if (cases.some((c) => c.category === "live-data")) {
    try {
      const s = await getRepoStats("vam-gar/support-agent");
      const d = new Date(s.lastPushedAt);
      const month = d.toLocaleString("en-US", { month: "long", timeZone: "UTC" });
      const day = d.getUTCDate();
      live = {
        vars: {
          stars: String(s.stars),
          // "October 20", "Oct 20", "Oct. 20th", "2026-10-20", "20 October"
          pushedDate: `${month.slice(0, 3)}[a-z]*\\.? ${day}\\b|${s.lastPushedAt.slice(0, 10)}|\\b${day}(st|nd|rd|th)? ${month.slice(0, 3)}`,
        },
        evidence: JSON.stringify(s),
      };
    } catch (err) {
      problems.push(`GitHub lookup for the live-data case failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  // ---- 3. grade (deterministic, recomputed every time) + judge (cached) ----
  const grades = new Map<string, Grade>();
  const judgements = new Map<string, Judgement>();
  for (const c of cases) {
    for (const col of columns) {
      const rec = records.get(`${col.key}/${c.id}`);
      if (!rec) continue;
      let expect = grading.expectationFor(c, col.system);
      if (c.category === "live-data") {
        if (!live) continue;
        expect = grading.fillPlaceholders(expect, live.vars);
      }
      grades.set(`${col.key}/${c.id}`, grading.grade(rec, expect));

      // Refusals and contact drafts make no claims about Vamsi to ground.
      if (!useJudge || c.category === "refusal" || c.category === "contact") continue;
      const evidence = c.category === "live-data" && col.system !== "baseline" ? live!.evidence : "";
      const file = path.join(RUNS, `judge__${JUDGE_MODEL}`, `${col.key}__${c.id}.json`);
      const cached = readJson<Judgement>(file);
      if (cached && cached.replyHash === grading.replyHash(rec.reply, evidence)) {
        judgements.set(`${col.key}/${c.id}`, cached);
        continue;
      }
      if (reportOnly) continue;
      console.log(`judge ${col.label.padEnd(22)} ${c.id}`);
      const j = await guarded(JUDGE_MODEL, `judge ${col.key}/${c.id}`, () =>
        grading.judge(JUDGE_MODEL, c.question, rec.reply, evidence)
      );
      if (j) {
        writeJson(file, j);
        judgements.set(`${col.key}/${c.id}`, j);
        await sleep(2500);
      }
    }
  }

  // ---- 4. retrieval hit@k on the raw question (no LLM involved) ----
  const embFile = path.join(RUNS, "query-embeddings.json");
  const embeddings = readJson<Record<string, number[]>>(embFile) ?? {};
  type Ranker = "vector" | "keyword" | "hybrid";
  const RANKERS: Ranker[] = ["vector", "keyword", "hybrid"];
  const isReadme = (ch: { source: string }) => ch.source !== "resume";

  // Relevant chunks: hand-labelled ids, or for exact-term cases every chunk
  // whose text contains the term.
  const relevantIds = (c: EvalCase): string[] =>
    c.term
      ? search.index.chunks.filter((ch) => new RegExp(c.term!, "i").test(ch.text)).map((ch) => ch.id)
      : c.relevant ?? [];

  const retrievalSnapshot = readIfExists(path.join(DIR, "retrieval.md"));
  const retrievalCases = allCases.filter((c) => relevantIds(c).length);
  for (const c of retrievalCases) {
    if (embeddings[c.question] || reportOnly || retrievalSnapshot) continue;
    try {
      embeddings[c.question] = await embedQuery(c.question);
      writeJson(embFile, embeddings);
    } catch (err) {
      problems.push(`query embedding for ${c.id} failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  type RetrievalStats = { n: number; hits: Record<Ranker, Record<number, number>>; mrr: Record<Ranker, number>; misses: string[] };
  // readmeOnly mirrors what the shipped agent searches: resume chunks are
  // removed from the pool and from the relevant set.
  function retrievalStats(subset: EvalCase[], readmeOnly: boolean): RetrievalStats {
    const stats: RetrievalStats = {
      n: 0,
      hits: { vector: {}, keyword: {}, hybrid: {} },
      mrr: { vector: 0, keyword: 0, hybrid: 0 },
      misses: [],
    };
    for (const c of subset) {
      const emb = embeddings[c.question];
      const byId = new Map(search.index.chunks.map((ch) => [ch.id, ch]));
      const relevant = relevantIds(c).filter((id) => byId.has(id) && (!readmeOnly || isReadme(byId.get(id)!)));
      if (!emb || !relevant.length) continue;
      stats.n++;
      const filter = readmeOnly ? isReadme : undefined;
      const vector = search.vectorSearch(emb, 20, filter);
      const keyword = search.keywordSearch(c.question, 20, filter);
      const lists: Record<Ranker, string[]> = {
        vector: vector.map((r) => r.chunk.id),
        keyword: keyword.map((r) => r.chunk.id),
        hybrid: search.fuse(vector, keyword, 20).map((h) => h.chunk.id),
      };
      for (const ranker of RANKERS) {
        const rank = lists[ranker].findIndex((id) => relevant.includes(id)) + 1; // 0 = not found
        stats.mrr[ranker] += rank ? 1 / rank : 0;
        for (const k of K_VALUES) {
          stats.hits[ranker][k] = (stats.hits[ranker][k] ?? 0) + (rank && rank <= k ? 1 : 0);
        }
        if (!rank || rank > 5) stats.misses.push(`${c.id} (${ranker})`);
      }
    }
    return stats;
  }

  const top5BySource = new Map<string, number>();
  for (const c of retrievalCases.filter((x) => !x.term)) {
    const emb = embeddings[c.question];
    if (!emb) continue;
    const fused = search.fuse(search.vectorSearch(emb, 20), search.keywordSearch(c.question, 20), 5);
    for (const h of fused) top5BySource.set(h.chunk.title, (top5BySource.get(h.chunk.title) ?? 0) + 1);
  }

  // ---- 5. report ----
  const out: string[] = [];
  const done = (col: (typeof columns)[number]) => cases.filter((c) => grades.has(`${col.key}/${c.id}`));
  const pendingRuns = columns.filter((col) => !col.frozen).flatMap((col) =>
    cases.filter((c) => !records.has(`${col.key}/${c.id}`)).map((c) => `${col.label}: ${c.id}`)
  );
  const judgeable = (c: EvalCase) => c.category !== "refusal" && c.category !== "contact";
  const pendingJudge = useJudge
    ? columns.flatMap((col) =>
        cases
          .filter((c) => judgeable(c) && records.has(`${col.key}/${c.id}`) && !judgements.has(`${col.key}/${c.id}`))
          .map((c) => `${col.label}: ${c.id}`)
      )
    : [];

  out.push("# Eval v1 (frozen): hybrid agent vs full-context prompting", "");
  out.push(
    `Report rebuilt ${new Date().toISOString().slice(0, 10)} by \`npm run eval:v1\` from cached answers. Cases, checks and answers are frozen; only pending groundedness judgements can still change. The Decision and disclosure sections come from \`evals/v1/notes.md\`.`,
    ""
  );
  const notesFile = path.join(DIR, "notes.md");
  if (existsSync(notesFile)) out.push(readFileSync(notesFile, "utf8").trim(), "");
  out.push("## Setup", "");
  out.push(
    "- **Hybrid agent:** the resume is in the system prompt; tools cover README search, live GitHub stats and contact drafts. This is the design in the code.",
    "- **Full context:** the resume and all three READMEs are in the system prompt; no tools.",
    "- **Tools-only agent (v1):** the first design, with nothing in the prompt and a `get_resume_section` tool. Its code has been replaced; the column shows its cached answers and is never re-run.",
    `- **Subject model:** \`${SUBJECT_MODEL}\` for every system, temperature 0.3, one run per case.`,
    `- **Judge model:** \`${JUDGE_MODEL}\`, used only for groundedness.`,
    `- **Cases:** ${cases.length} answered (${Array.from(new Set(cases.map((c) => c.category))).join(", ")}), plus ${allCases.length - cases.length} exact-term queries used for retrieval only.`,
    readJson<{ corpusLine: string }>(path.join(DIR, "meta.json"))?.corpusLine ??
      `- **Corpus:** resume + 3 READMEs, ${search.index.chunks.length} chunks, about ${Math.round(systems.CORPUS.length / 4).toLocaleString("en-US")} tokens in full.`,
    ""
  );
  out.push(
    "**Reused answers:** 20 full-context answers were generated before the evaluative-question rule was added to the shared prompt and were reused rather than re-run. Only the `evaluative` case exercises that rule, and it was run fresh.",
    ""
  );
  if (pendingRuns.length || pendingJudge.length || problems.length) {
    out.push("## Incomplete run", "");
    out.push("Numbers below cover completed cases only. Run `npm run eval:v1` again to fill in the rest; finished cases are cached.", "");
    if (pendingRuns.length) out.push(`- **Answers pending (${pendingRuns.length}):** ${pendingRuns.join("; ")}`);
    if (pendingJudge.length) out.push(`- **Judgements pending (${pendingJudge.length}):** ${pendingJudge.join("; ")}`);
    for (const p of Array.from(new Set(problems))) out.push(`- ${p}`);
    out.push("");
  }

  // Headline table.
  const row = (label: string, cell: (col: (typeof columns)[number]) => string) =>
    `| ${label} | ${columns.map(cell).join(" | ")} |`;
  const where = (col: (typeof columns)[number], pred: (c: EvalCase, g: Grade) => boolean) =>
    done(col).filter((c) => pred(c, grades.get(`${col.key}/${c.id}`)!));
  const checkRate = (col: (typeof columns)[number], name: string) => {
    const withCheck = done(col)
      .map((c) => grades.get(`${col.key}/${c.id}`)!.checks.find((k) => k.name === name))
      .filter((k): k is NonNullable<typeof k> => Boolean(k));
    return withCheck.length
      ? `${pct(withCheck.filter((k) => k.pass).length / withCheck.length)} (${withCheck.filter((k) => k.pass).length}/${withCheck.length})`
      : "n/a";
  };
  const recs = (col: (typeof columns)[number]) => done(col).map((c) => records.get(`${col.key}/${c.id}`)!);
  const usd = (x: number) => (Number.isNaN(x) ? "–" : `$${x.toFixed(5)}`);

  out.push("## Comparison", "");
  out.push(`| Metric | ${columns.map((c) => c.label).join(" | ")} |`, `| --- | ${columns.map(() => "---:").join(" | ")} |`);
  out.push(row("Cases completed", (col) => `${done(col).length}/${cases.length}`));
  out.push(row("**Cases passing all deterministic checks**", (col) => {
    const d = done(col);
    const p = where(col, (_, g) => g.pass).length;
    return d.length ? `**${pct(p / d.length)} (${p}/${d.length})**` : "–";
  }));
  out.push(row("Fact recall (mean over cases with expected facts)", (col) =>
    pct(mean(done(col).map((c) => grades.get(`${col.key}/${c.id}`)!.factRecall).filter((x): x is number => x !== null)))
  ));
  out.push(row("No forbidden claims", (col) => checkRate(col, "forbidden")));
  out.push(row("Correct off-topic refusal", (col) => checkRate(col, "refusal")));
  out.push(row("Says so when sources lack the answer", (col) => checkRate(col, "declines")));
  out.push(row("Cites the expected source", (col) => checkRate(col, "cites")));
  out.push(row("Calls an expected tool", (col) => (col.system !== "baseline" ? checkRate(col, "tool") : "n/a")));
  out.push(row("No tools on off-topic", (col) => (col.system !== "baseline" ? checkRate(col, "no-tools") : "n/a")));
  out.push(row(`Groundedness: fully grounded (judge)`, (col) => {
    const js = done(col).map((c) => judgements.get(`${col.key}/${c.id}`)).filter((j): j is Judgement => Boolean(j));
    const g = js.filter((j) => j.verdict === "grounded").length;
    return js.length ? `${pct(g / js.length)} (${g}/${js.length})` : "–";
  }));
  out.push(row("Groundedness score (1 / 0.5 / 0)", (col) => {
    const js = done(col).map((c) => judgements.get(`${col.key}/${c.id}`)).filter((j): j is Judgement => Boolean(j));
    return js.length ? mean(js.map((j) => grading.VERDICT_SCORE[j.verdict])).toFixed(2) : "–";
  }));
  out.push(row("Latency, median (s)", (col) => (median(recs(col).map((r) => r.latencyMs)) / 1000).toFixed(1)));
  out.push(row("Latency, max (s)", (col) => (Math.max(...recs(col).map((r) => r.latencyMs), 0) / 1000).toFixed(1)));
  out.push(row("Model calls per answer (mean)", (col) => mean(recs(col).map((r) => r.modelCalls)).toFixed(2)));
  out.push(row("Embedding calls per answer (mean)", (col) => mean(recs(col).map((r) => r.embedCalls)).toFixed(2)));
  out.push(row("Input tokens per answer (mean)", (col) => Math.round(mean(recs(col).map((r) => r.promptTokens))).toLocaleString("en-US")));
  out.push(row("Output tokens per answer (mean)", (col) => Math.round(mean(recs(col).map((r) => r.outputTokens))).toLocaleString("en-US")));
  out.push(row("Estimated cost per answer", (col) =>
    usd(mean(recs(col).map((r) => systems.estimateCostUsd(r)).filter((x): x is number => x !== null)))
  ));
  out.push(row("Estimated cost per 1,000 answers", (col) => {
    const m = mean(recs(col).map((r) => systems.estimateCostUsd(r)).filter((x): x is number => x !== null));
    return Number.isNaN(m) ? "–" : `$${(m * 1000).toFixed(2)}`;
  }));
  out.push(
    "",
    "Cost uses paid-tier list prices; on the free tier both systems cost nothing but are capped by requests per day, so model calls per answer is the binding number there. Output tokens include thinking tokens. Latency is wall-clock on the free tier and includes tool calls (embedding, GitHub).",
    ""
  );

  // By category.
  const categories = Array.from(new Set(cases.map((c) => c.category)));
  out.push("## Pass rate by category", "");
  out.push(`| Category | Cases | ${columns.map((c) => c.label).join(" | ")} |`, `| --- | ---: | ${columns.map(() => "---:").join(" | ")} |`);
  for (const cat of categories) {
    const inCat = cases.filter((c) => c.category === cat);
    out.push(
      `| ${cat} | ${inCat.length} | ${columns
        .map((col) => {
          const d = inCat.filter((c) => grades.has(`${col.key}/${c.id}`));
          const p = d.filter((c) => grades.get(`${col.key}/${c.id}`)!.pass).length;
          return d.length ? `${p}/${d.length}` : "–";
        })
        .join(" | ")} |`
    );
  }
  out.push("");

  // Per case.
  out.push("## Per case", "");
  out.push(
    `| Case | Category | ${columns.map((c) => `${c.label}: checks`).join(" | ")} | ${columns.map((c) => `${c.label}: grounded`).join(" | ")} |`,
    `| --- | --- | ${columns.map(() => ":---:").join(" | ")} | ${columns.map(() => ":---:").join(" | ")} |`
  );
  const verdictMark: Record<string, string> = { grounded: "✅", minor_embellishment: "⚠️ minor", ungrounded: "❌" };
  for (const c of cases) {
    const g = columns.map((col) => {
      const gr = grades.get(`${col.key}/${c.id}`);
      return gr ? (gr.pass ? "✅" : `❌ ${gr.checks.filter((k) => !k.pass).map((k) => k.name).join(", ")}`) : col.frozen ? "not run" : "pending";
    });
    const j = columns.map((col) => {
      if (!judgeable(c)) return "n/a";
      const ju = judgements.get(`${col.key}/${c.id}`);
      return ju ? verdictMark[ju.verdict] : records.has(`${col.key}/${c.id}`) ? "pending" : "–";
    });
    out.push(`| ${c.id} | ${c.category} | ${g.join(" | ")} | ${j.join(" | ")} |`);
  }
  out.push("");

  // Retrieval.
  const natural = retrievalCases.filter((c) => !c.term);
  const exact = retrievalCases.filter((c) => c.term);
  const names: Record<Ranker, string> = { vector: "Vector (cosine)", keyword: "Keyword (BM25)", hybrid: "Hybrid (RRF)" };
  const retrievalTable = (title: string, st: RetrievalStats) => {
    out.push(`**${title}** (${st.n} queries)`, "");
    out.push(`| Ranker | ${K_VALUES.map((k) => `hit@${k}`).join(" | ")} | MRR |`, `| --- | ${K_VALUES.map(() => "---:").join(" | ")} | ---: |`);
    for (const ranker of RANKERS) {
      out.push(
        `| ${names[ranker]} | ${K_VALUES.map((k) => (st.n ? `${st.hits[ranker][k] ?? 0}/${st.n}` : "–")).join(" | ")} | ${st.n ? (st.mrr[ranker] / st.n).toFixed(2) : "–"} |`
      );
    }
    out.push("", st.misses.length ? `Not in the top 5: ${st.misses.join(", ")}.` : "No misses at k=5.", "");
  };
  if (retrievalSnapshot) out.push(retrievalSnapshot.trim(), "");
  else out.push("## Retrieval hit@k", "");
  if (!retrievalSnapshot) out.push(
    "Whether a chunk that answers the query appears in the top k, using the query verbatim, with no LLM involved. MRR is the mean of 1/rank of the first relevant chunk. For exact-term queries, every chunk containing the term counts as relevant. The agent usually rewrites the query and can search more than once, so its effective retrieval differs.",
    ""
  );
  if (!retrievalSnapshot) {
    out.push("### Whole index (resume + READMEs)", "");
    retrievalTable("Natural-language questions", retrievalStats(natural, false));
    retrievalTable("Exact-term queries", retrievalStats(exact, false));
    out.push("### README chunks only (what the hybrid agent's search_knowledge covers)", "");
    retrievalTable("Natural-language questions", retrievalStats(natural, true));
    retrievalTable("Exact-term queries", retrievalStats(exact, true));
  }
  if (!retrievalSnapshot && top5BySource.size) {
    const total = Array.from(top5BySource.values()).reduce((a, b) => a + b, 0);
    const share = Array.from(top5BySource.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([s, n]) => {
        const chunks = search.index.chunks.filter((c) => c.title === s).length;
        return `${s} ${pct(n / total)} of top-5 slots (${pct(chunks / search.index.chunks.length)} of the index)`;
      });
    out.push(`Share of hybrid top-5 slots by source, whole index, natural-language questions: ${share.join("; ")}.`, "");
  }

  // Failures.
  out.push("## Failing cases", "");
  let anyFailure = false;
  for (const c of cases) {
    for (const col of columns) {
      const gr = grades.get(`${col.key}/${c.id}`);
      const rec = records.get(`${col.key}/${c.id}`);
      const ju = judgements.get(`${col.key}/${c.id}`);
      if (!gr || !rec) continue;
      const failed = gr.checks.filter((k) => !k.pass);
      const flagged = ju && ju.verdict !== "grounded";
      if (!failed.length && !flagged) continue;
      anyFailure = true;
      out.push(`### ${c.id} — ${col.label}`, "");
      out.push(`**Question:** ${c.question}`, "");
      for (const k of failed) out.push(`- ❌ \`${k.name}\`${k.detail ? `: ${k.detail}` : ""}`);
      if (flagged) {
        out.push(`- Judge: **${ju!.verdict}**`);
        for (const u of ju!.unsupported) out.push(`  - ${u}`);
      }
      if (rec.steps.length) {
        out.push(`- Steps: ${rec.steps.map((s) => `\`${s.tool}(${s.summary})\`${s.ok ? "" : " (error)"}`).join(" → ")}`);
      }
      out.push("", "**Reply:**", "", ...rec.reply.trim().split("\n").map((l) => `> ${l}`), "");
    }
  }
  if (!anyFailure) out.push("None.", "");

  out.push("## How to read this", "");
  out.push(
    `- ${cases.length} cases and a single run per case: differences of one or two cases are within noise. Treat this as a regression check, not a benchmark.`,
    "- Pass/fail comes from regex checks written before the run (expected facts, forbidden claims, refusal and \"not covered\" wording, tool and source use). They can miss a correct answer phrased unusually; failing replies are printed above so each can be read.",
    "- The judge sees the full corpus as the reference for both systems, so groundedness is scored against the same evidence.",
    "- The live-data and contact cases need tools, which the full-context baseline does not have. Its expected behaviour there is to say it has no live data and to point to #contact-form, so a pass in those rows means a correct decline, not an equivalent answer.",
    ""
  );

  writeFileSync(path.join(DIR, "results.md"), out.join("\n"));
  composeResults();
  writeJson(path.join(DIR, "results.json"), {
    subjectModel: SUBJECT_MODEL,
    judgeModel: JUDGE_MODEL,
    cases: cases.map((c) => ({
      id: c.id,
      category: c.category,
      results: Object.fromEntries(
        columns.map((col) => [
          col.key,
          {
            grade: grades.get(`${col.key}/${c.id}`) ?? null,
            judgement: judgements.get(`${col.key}/${c.id}`) ?? null,
          },
        ])
      ),
    })),
  });
  console.log(
    `\nwrote evals/v1/results.md and evals/results.md — ${columns.map((col) => `${col.label}: ${where(col, (_, g) => g.pass).length}/${done(col).length} passing`).join(", ")}` +
      (pendingRuns.length || pendingJudge.length ? ` — ${pendingRuns.length} answers and ${pendingJudge.length} judgements pending` : "")
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
