// Eval v2: the hybrid agent only, every case run several times.
//
//   npm run eval                 run missing trials, grade, write the report
//   npm run eval -- --only a,b   limit to some case ids
//   npm run eval -- --report     no API calls; rebuild the report from the cache
//
// v2 exists because v1 is frozen. It has its own cases (evals/v2/cases.json)
// and its own cached runs (evals/v2/runs/). A single run per case hid
// intermittent failures in v1, so v2 runs each case TRIALS times and reports
// pass^k (every trial passed) next to the plain pass rate.
//
// Grading reuses the frozen check functions in grade.ts unchanged; what
// differs is expressed in the v2 case file (per-case patterns). The
// groundedness judge is not run in v2.
//
// Env: EVAL_MODEL (default gemini-3.5-flash-lite), EVAL_TRIALS (default 3).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadEnvLocal } from "../scripts/env";
import { composeResults } from "./compose";

loadEnvLocal();

const DIR = path.join(__dirname, "v2");
const args = process.argv.slice(2);
const MODEL = process.env.EVAL_MODEL || "gemini-3.5-flash-lite";
const TRIALS = Number(process.env.EVAL_TRIALS || 3);
const PAUSE_MS = 4000;

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
const pct = (n: number, d: number) => (d ? `${((n / d) * 100).toFixed(0)}% (${n}/${d})` : "–");

async function main() {
  const { GeminiError } = await import("../lib/gemini");
  const { getRepoStats } = await import("../lib/github");
  const systems = await import("./systems");
  const grading = await import("./grade");
  type RunRecord = import("./systems").RunRecord;
  type EvalCase = import("./grade").EvalCase;
  type Grade = import("./grade").Grade;

  const onlyAt = args.indexOf("--only");
  const only = onlyAt >= 0 ? args[onlyAt + 1]?.split(",") : undefined;
  const reportOnly = args.includes("--report");
  const cases = (JSON.parse(readFileSync(path.join(DIR, "cases.json"), "utf8")) as EvalCase[]).filter(
    (c) => !only || only.includes(c.id)
  );

  // ---- runs (cached per case and trial) ----
  let quotaGone = false;
  const problems: string[] = [];
  const records = new Map<string, RunRecord>(); // `${id}/${trial}`
  const runFile = (id: string, t: number) => path.join(DIR, "runs", `agent__${MODEL}`, `${id}__t${t}.json`);

  async function runOnce(c: EvalCase, t: number): Promise<RunRecord | null> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await systems.runSystem("agent", MODEL, c.id, c.question, c.history ?? []);
      } catch (err) {
        if (err instanceof GeminiError && err.status === 429) {
          const secs = err.retryAfterSecs;
          if (secs !== null && secs <= 90) {
            console.log(`  per-minute limit; waiting ${secs + 2}s`);
            await sleep((secs + 2) * 1000);
            continue;
          }
          quotaGone = true;
          problems.push(`${MODEL}: daily quota exhausted${secs ? ` (resets in ~${Math.ceil(secs / 3600)}h)` : ""}.`);
          console.log(`  ${MODEL}: daily quota exhausted — stopping; run again later to resume`);
          return null;
        }
        const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
        if (attempt < 1) {
          await sleep(3000);
          continue;
        }
        problems.push(`${c.id} trial ${t}: ${message}`);
        return null;
      }
    }
    return null;
  }

  for (let t = 1; t <= TRIALS; t++) {
    for (const c of cases) {
      const want = systems.fingerprint("agent", MODEL, c.question, c.history ?? []);
      const cached = readJson<RunRecord>(runFile(c.id, t));
      if (cached && cached.fingerprint === want) {
        records.set(`${c.id}/${t}`, cached);
        continue;
      }
      if (reportOnly || quotaGone) continue;
      console.log(`run   trial ${t}  ${c.id}`);
      const rec = await runOnce(c, t);
      if (rec) {
        writeJson(runFile(c.id, t), rec);
        records.set(`${c.id}/${t}`, rec);
        await sleep(PAUSE_MS);
      }
    }
  }

  // ---- live values for the GitHub case ----
  let liveVars: Record<string, string> | null = null;
  if (cases.some((c) => c.category === "live-data")) {
    try {
      const s = await getRepoStats("vam-gar/support-agent");
      const d = new Date(s.lastPushedAt);
      const month = d.toLocaleString("en-US", { month: "long", timeZone: "UTC" });
      const day = d.getUTCDate();
      liveVars = {
        stars: String(s.stars),
        pushedDate: `${month.slice(0, 3)}[a-z]*\\.? ${day}\\b|${s.lastPushedAt.slice(0, 10)}|\\b${day}(st|nd|rd|th)? ${month.slice(0, 3)}`,
      };
    } catch (err) {
      problems.push(`GitHub lookup for the live-data case failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  // ---- grade ----
  const grades = new Map<string, Grade>();
  for (const c of cases) {
    for (let t = 1; t <= TRIALS; t++) {
      const rec = records.get(`${c.id}/${t}`);
      if (!rec) continue;
      let expect = c.expect;
      if (c.category === "live-data") {
        if (!liveVars) continue;
        expect = grading.fillPlaceholders(expect, liveVars);
      }
      grades.set(`${c.id}/${t}`, grading.grade(rec, expect));
    }
  }

  // ---- report ----
  const trialsOf = (c: EvalCase) =>
    Array.from({ length: TRIALS }, (_, i) => grades.get(`${c.id}/${i + 1}`)).filter((g): g is Grade => Boolean(g));
  const complete = cases.filter((c) => trialsOf(c).length === TRIALS);
  const passCount = (c: EvalCase) => trialsOf(c).filter((g) => g.pass).length;
  const allTrials = cases.flatMap(trialsOf);
  const allRecords = Array.from(records.values());
  const pendingTrials = cases.length * TRIALS - allTrials.length;
  const REFUSAL = /only configured to answer/i;
  const inScope = cases.filter((c) => c.category !== "refusal");
  const wrongRefusals = inScope.flatMap((c) =>
    Array.from({ length: TRIALS }, (_, i) => records.get(`${c.id}/${i + 1}`)).filter(
      (r): r is RunRecord => Boolean(r) && REFUSAL.test(r!.reply)
    )
  );
  const inScopeTrials = inScope.flatMap((c) =>
    Array.from({ length: TRIALS }, (_, i) => records.get(`${c.id}/${i + 1}`)).filter(Boolean)
  ).length;
  const costs = allRecords.map((r) => systems.estimateCostUsd(r)).filter((x): x is number => x !== null);

  const out: string[] = [];
  out.push(`# Eval v2: hybrid agent, ${TRIALS} trials per case`, "");
  out.push(`Generated ${new Date().toISOString().slice(0, 10)} by \`npm run eval\`. Do not edit by hand; the notes below come from \`evals/v2/notes.md\`.`, "");
  const notes = path.join(DIR, "notes.md");
  if (existsSync(notes)) out.push(readFileSync(notes, "utf8").trim(), "");

  if (pendingTrials || problems.length) {
    out.push("## Incomplete run", "");
    out.push(`${pendingTrials} of ${cases.length * TRIALS} trials are pending. Run \`npm run eval\` again to fill them in; finished trials are cached. pass^${TRIALS} counts only cases with all ${TRIALS} trials done.`, "");
    for (const p of Array.from(new Set(problems))) out.push(`- ${p}`);
    out.push("");
  }

  out.push("## Summary", "");
  out.push("| Metric | Hybrid agent |", "| --- | ---: |");
  out.push(`| Cases | ${cases.length} |`);
  out.push(`| Trials completed | ${allTrials.length}/${cases.length * TRIALS} |`);
  out.push(`| **Pass rate (trials passing all checks)** | **${pct(allTrials.filter((g) => g.pass).length, allTrials.length)}** |`);
  out.push(`| **pass^${TRIALS} (cases where every trial passed)** | **${pct(complete.filter((c) => passCount(c) === TRIALS).length, complete.length)}** |`);
  out.push(`| Cases passing some but not all trials | ${complete.filter((c) => passCount(c) > 0 && passCount(c) < TRIALS).length} |`);
  out.push(`| Cases failing every trial | ${complete.filter((c) => passCount(c) === 0).length} |`);
  out.push(`| Off-topic refusals given to in-scope questions | ${wrongRefusals.length} of ${inScopeTrials} trials |`);
  out.push(`| Fact recall (mean) | ${(mean(allTrials.map((g) => g.factRecall).filter((x): x is number => x !== null)) * 100).toFixed(0)}% |`);
  out.push(`| Model calls per answer (mean) | ${mean(allRecords.map((r) => r.modelCalls)).toFixed(2)} |`);
  out.push(`| Input tokens per answer (mean) | ${Math.round(mean(allRecords.map((r) => r.promptTokens))).toLocaleString("en-US")} |`);
  out.push(`| Latency, median / max (s) | ${(median(allRecords.map((r) => r.latencyMs)) / 1000).toFixed(1)} / ${(Math.max(0, ...allRecords.map((r) => r.latencyMs)) / 1000).toFixed(1)} |`);
  out.push(`| Estimated cost per 1,000 answers | ${costs.length ? `$${(mean(costs) * 1000).toFixed(2)}` : "–"} |`);
  out.push("");

  const categories = Array.from(new Set(cases.map((c) => c.category)));
  out.push("## By category", "");
  out.push(`| Category | Cases | Trials passed | pass^${TRIALS} |`, "| --- | ---: | ---: | ---: |");
  for (const cat of categories) {
    const inCat = cases.filter((c) => c.category === cat);
    const tr = inCat.flatMap(trialsOf);
    const full = inCat.filter((c) => trialsOf(c).length === TRIALS);
    out.push(
      `| ${cat} | ${inCat.length} | ${tr.filter((g) => g.pass).length}/${tr.length} | ${full.filter((c) => passCount(c) === TRIALS).length}/${full.length} |`
    );
  }
  out.push("");

  out.push("## Per case", "");
  out.push(
    `| Case | Category | ${Array.from({ length: TRIALS }, (_, i) => `Trial ${i + 1}`).join(" | ")} | Passed |`,
    `| --- | --- | ${Array.from({ length: TRIALS }, () => ":---:").join(" | ")} | ---: |`
  );
  for (const c of cases) {
    const marks = Array.from({ length: TRIALS }, (_, i) => {
      const g = grades.get(`${c.id}/${i + 1}`);
      return g ? (g.pass ? "✅" : `❌ ${g.checks.filter((k) => !k.pass).map((k) => k.name).join(", ")}`) : "pending";
    });
    out.push(`| ${c.id} | ${c.category} | ${marks.join(" | ")} | ${passCount(c)}/${trialsOf(c).length} |`);
  }
  out.push("");

  out.push("## Failing trials", "");
  let any = false;
  for (const c of cases) {
    const failing = Array.from({ length: TRIALS }, (_, i) => i + 1).filter((t) => {
      const g = grades.get(`${c.id}/${t}`);
      return g && !g.pass;
    });
    if (!failing.length) continue;
    any = true;
    out.push(`### ${c.id} — failed ${failing.length} of ${trialsOf(c).length} trials`, "");
    out.push(`**Question:** ${c.question}`, "");
    for (const t of failing) {
      const g = grades.get(`${c.id}/${t}`)!;
      const rec = records.get(`${c.id}/${t}`)!;
      out.push(`**Trial ${t}**`, "");
      for (const k of g.checks.filter((x) => !x.pass)) out.push(`- ❌ \`${k.name}\`${k.detail ? `: ${k.detail}` : ""}`);
      out.push(`- Steps: ${rec.steps.map((s) => `\`${s.tool}(${s.summary})\``).join(" → ") || "none"}`);
      out.push("", ...rec.reply.trim().split("\n").map((l) => `> ${l}`), "");
    }
  }
  if (!any) out.push("None.", "");

  writeFileSync(path.join(DIR, "results.md"), out.join("\n"));
  writeJson(path.join(DIR, "results.json"), {
    model: MODEL,
    trials: TRIALS,
    cases: cases.map((c) => ({
      id: c.id,
      category: c.category,
      trials: Array.from({ length: TRIALS }, (_, i) => grades.get(`${c.id}/${i + 1}`) ?? null),
    })),
  });
  composeResults();
  console.log(
    `\nwrote evals/v2/results.md and evals/results.md — ${allTrials.filter((g) => g.pass).length}/${allTrials.length} trials passing, pass^${TRIALS} ${complete.filter((c) => passCount(c) === TRIALS).length}/${complete.length}` +
      (pendingTrials ? `, ${pendingTrials} trials pending` : "")
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
