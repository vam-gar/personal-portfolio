// Eval runner: agentic RAG vs full-context prompting.
//
//   npm run eval                    run what is missing, grade, write results.md
//   npm run eval -- --only a,b      limit to some case ids
//   npm run eval -- --report        no API calls; rebuild results.md from the cache
//   npm run eval -- --no-judge      skip the groundedness judge
//
// Every answer and every judgement is cached under evals/runs/. A quota or
// timeout error stops the affected calls, the report is still written with
// the cases marked pending, and the next run picks up where this one stopped.
//
// Env: EVAL_MODEL (subject, default gemini-3.5-flash-lite), JUDGE_MODEL
// (default gemini-4-hydrogen; must differ from the subject so they do not
// share a free-tier quota), EVAL_EXTRA_MODEL (optional third column, agent only).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadEnvLocal } from "../scripts/env";

loadEnvLocal();

const DIR = __dirname;
const RUNS = path.join(DIR, "runs");
const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const option = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const SUBJECT_MODEL = process.env.EVAL_MODEL || "gemini-3.5-flash-lite";
const JUDGE_MODEL = process.env.JUDGE_MODEL || "gemini-4-hydrogen";
const EXTRA_MODEL = process.env.EVAL_EXTRA_MODEL || "";
const PAUSE_MS = 6000; // between subject runs, to stay under per-minute limits
const K_VALUES = [1, 3, 5];

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
  const cases = (JSON.parse(readFileSync(path.join(DIR, "cases.json"), "utf8")) as EvalCase[]).filter(
    (c) => !only || only.includes(c.id)
  );
  const reportOnly = flag("--report");
  const useJudge = !flag("--no-judge");

  // Columns: the two systems on the subject model, plus an optional third.
  const columns: { key: string; label: string; system: SystemName; model: string }[] = [
    { key: `agent__${SUBJECT_MODEL}`, label: "Agentic RAG", system: "agent", model: SUBJECT_MODEL },
    { key: `baseline__${SUBJECT_MODEL}`, label: "Full context", system: "baseline", model: SUBJECT_MODEL },
  ];
  if (EXTRA_MODEL) {
    columns.push({ key: `agent__${EXTRA_MODEL}`, label: `Agentic RAG (${EXTRA_MODEL})`, system: "agent", model: EXTRA_MODEL });
  }

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
      const want = systems.fingerprint(col.system, col.model, c.question, c.history ?? []);
      const cached = readJson<RunRecord>(file);
      if (cached && cached.fingerprint === want) {
        records.set(`${col.key}/${c.id}`, cached);
        continue;
      }
      if (reportOnly) continue;
      console.log(`run   ${col.label.padEnd(14)} ${c.id}`);
      const rec = await guarded(col.model, `${col.key}/${c.id}`, () =>
        systems.runSystem(col.system, col.model, c.id, c.question, c.history ?? [])
      );
      if (rec) {
        writeJson(file, rec);
        records.set(`${col.key}/${c.id}`, rec);
        await sleep(PAUSE_MS);
      }
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
      const evidence = c.category === "live-data" && col.system === "agent" ? live!.evidence : "";
      const file = path.join(RUNS, `judge__${JUDGE_MODEL}`, `${col.key}__${c.id}.json`);
      const cached = readJson<Judgement>(file);
      if (cached && cached.replyHash === grading.replyHash(rec.reply, evidence)) {
        judgements.set(`${col.key}/${c.id}`, cached);
        continue;
      }
      if (reportOnly) continue;
      console.log(`judge ${col.label.padEnd(14)} ${c.id}`);
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
  const retrievalCases = cases.filter((c) => c.relevant?.length);
  type Ranker = "vector" | "keyword" | "hybrid";
  const hits: Record<Ranker, Record<number, number>> = { vector: {}, keyword: {}, hybrid: {} };
  const top5BySource = new Map<string, number>();
  let retrievalN = 0;
  const retrievalMisses: string[] = [];
  for (const c of retrievalCases) {
    if (!embeddings[c.question] && !reportOnly) {
      try {
        embeddings[c.question] = await embedQuery(c.question);
        writeJson(embFile, embeddings);
      } catch (err) {
        problems.push(`query embedding for ${c.id} failed: ${err instanceof Error ? err.message : err}`);
      }
    }
    const emb = embeddings[c.question];
    if (!emb) continue;
    retrievalN++;
    const vector = search.vectorSearch(emb, 20);
    const keyword = search.keywordSearch(c.question, 20);
    const lists: Record<Ranker, string[]> = {
      vector: vector.map((r) => r.chunk.id),
      keyword: keyword.map((r) => r.chunk.id),
      hybrid: search.fuse(vector, keyword, 20).map((h) => h.chunk.id),
    };
    for (const ranker of Object.keys(lists) as Ranker[]) {
      for (const k of K_VALUES) {
        const hit = lists[ranker].slice(0, k).some((id) => c.relevant!.includes(id));
        hits[ranker][k] = (hits[ranker][k] ?? 0) + (hit ? 1 : 0);
        if (!hit && k === 5) retrievalMisses.push(`${c.id} (${ranker})`);
      }
    }
    for (const id of lists.hybrid.slice(0, 5)) {
      const source = search.index.chunks.find((ch) => ch.id === id)!.title;
      top5BySource.set(source, (top5BySource.get(source) ?? 0) + 1);
    }
  }

  // ---- 5. report ----
  const out: string[] = [];
  const done = (col: (typeof columns)[number]) => cases.filter((c) => grades.has(`${col.key}/${c.id}`));
  const pendingRuns = columns.flatMap((col) =>
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

  out.push("# Eval results: agentic RAG vs full-context prompting", "");
  out.push(`Generated ${new Date().toISOString().slice(0, 10)} by \`npm run eval\`. Do not edit by hand.`, "");
  out.push(
    `- **Subject model:** \`${SUBJECT_MODEL}\` for both systems, temperature 0.3, one run per case.`,
    `- **Judge model:** \`${JUDGE_MODEL}\`, used only for groundedness.`,
    `- **Cases:** ${cases.length} (${Array.from(new Set(cases.map((c) => c.category))).join(", ")}).`,
    `- **Corpus:** resume + 3 READMEs, ${search.index.chunks.length} chunks, about ${Math.round(systems.CORPUS.length / 4).toLocaleString("en-US")} tokens in full.`,
    ""
  );
  if (pendingRuns.length || pendingJudge.length || problems.length) {
    out.push("## Incomplete run", "");
    out.push("Numbers below cover completed cases only. Run `npm run eval` again to fill in the rest; finished cases are cached.", "");
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
  out.push(row("Calls an expected tool", (col) => (col.system === "agent" ? checkRate(col, "tool") : "n/a")));
  out.push(row("No tools on off-topic", (col) => (col.system === "agent" ? checkRate(col, "no-tools") : "n/a")));
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
      return gr ? (gr.pass ? "✅" : `❌ ${gr.checks.filter((k) => !k.pass).map((k) => k.name).join(", ")}`) : "pending";
    });
    const j = columns.map((col) => {
      if (!judgeable(c)) return "n/a";
      const ju = judgements.get(`${col.key}/${c.id}`);
      return ju ? verdictMark[ju.verdict] : "pending";
    });
    out.push(`| ${c.id} | ${c.category} | ${g.join(" | ")} | ${j.join(" | ")} |`);
  }
  out.push("");

  // Retrieval.
  out.push("## Retrieval hit@k", "");
  out.push(
    `Whether a chunk that answers the question appears in the top k, using the visitor's question verbatim as the query (${retrievalN} cases with labelled chunks). This isolates the retriever; the agent usually rewrites the query and can search more than once, so its effective retrieval differs.`,
    ""
  );
  out.push(`| Ranker | ${K_VALUES.map((k) => `hit@${k}`).join(" | ")} |`, `| --- | ${K_VALUES.map(() => "---:").join(" | ")} |`);
  const names: Record<Ranker, string> = { vector: "Vector (cosine)", keyword: "Keyword (BM25)", hybrid: "Hybrid (RRF)" };
  for (const ranker of ["vector", "keyword", "hybrid"] as Ranker[]) {
    out.push(
      `| ${names[ranker]} | ${K_VALUES.map((k) => (retrievalN ? `${pct((hits[ranker][k] ?? 0) / retrievalN)} (${hits[ranker][k] ?? 0}/${retrievalN})` : "–")).join(" | ")} |`
    );
  }
  out.push("");
  if (retrievalMisses.length) out.push(`Misses at k=5: ${retrievalMisses.join(", ")}.`, "");
  if (top5BySource.size) {
    const total = Array.from(top5BySource.values()).reduce((a, b) => a + b, 0);
    const share = Array.from(top5BySource.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([s, n]) => {
        const chunks = search.index.chunks.filter((c) => c.title === s).length;
        return `${s} ${pct(n / total)} of top-5 slots (${pct(chunks / search.index.chunks.length)} of the index)`;
      });
    out.push(`Share of hybrid top-5 slots by source: ${share.join("; ")}.`, "");
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
    "- The live-data and contact cases need tools, which the full-context baseline does not have. Its expected behaviour there is to say it has no live data and to point to #contact-form.",
    ""
  );

  writeFileSync(path.join(DIR, "results.md"), out.join("\n"));
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
    `\nwrote evals/results.md — ${columns.map((col) => `${col.label}: ${where(col, (_, g) => g.pass).length}/${done(col).length} passing`).join(", ")}` +
      (pendingRuns.length || pendingJudge.length ? ` — ${pendingRuns.length} answers and ${pendingJudge.length} judgements pending` : "")
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
