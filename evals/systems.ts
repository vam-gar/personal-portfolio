// The systems under test. All run the same model with the same persona,
// grounding and guardrail rules; only how knowledge reaches the model differs.
//   agent     hybrid: resume in the system prompt, tools for README search,
//             live GitHub stats and contact drafts
//   baseline  full-context prompting: every document inlined, no tools
//   agent-v1  the first design: nothing in the prompt, four tools including
//             get_resume_section. Its code is gone; its cached answers are
//             kept as a frozen column for comparison.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { runAgent } from "../lib/agent/loop";
import { buildFullContextPrompt, buildSystemPrompt } from "../lib/agent/prompt";
import { TOOL_DECLARATIONS } from "../lib/agent/tools";
import { Content, extractText, generateContent } from "../lib/gemini";

export type SystemName = "agent" | "baseline" | "agent-v1";

export type HistoryTurn = { role: "user" | "bot"; text: string };

export type RunRecord = {
  caseId: string;
  system: SystemName;
  model: string;
  fingerprint: string;
  ranAt: string;
  reply: string;
  steps: { tool: string; summary: string; ok: boolean }[];
  sources: string[]; // cited
  retrievedSources: string[];
  contactDraft?: { name: string; email: string; message: string };
  latencyMs: number;
  modelCalls: number;
  embedCalls: number;
  promptTokens: number;
  outputTokens: number; // includes thinking tokens
  embedTokens: number; // estimated: characters / 4
};

const CORPUS = readFileSync(path.resolve(__dirname, "../generated/corpus.md"), "utf8");
// Fixed date so the fingerprint does not change from one day to the next.
const EPOCH = new Date(0);

const sha = (s: string) => createHash("sha1").update(s).digest("hex").slice(0, 12);

// Changes whenever anything that could change the answer changes, so stale
// cached runs are detected and redone.
export function fingerprint(
  system: Exclude<SystemName, "agent-v1">,
  model: string,
  question: string,
  history: HistoryTurn[]
): string {
  const setup =
    system === "agent"
      ? buildSystemPrompt(EPOCH) + JSON.stringify(TOOL_DECLARATIONS)
      : buildFullContextPrompt(CORPUS, EPOCH);
  return sha(JSON.stringify([system, model, question, history, sha(setup)]));
}

const toContents = (history: HistoryTurn[]): Content[] =>
  history.map((h) => ({ role: h.role === "bot" ? "model" : "user", parts: [{ text: h.text }] }));

export async function runSystem(
  system: Exclude<SystemName, "agent-v1">,
  model: string,
  caseId: string,
  question: string,
  history: HistoryTurn[] = []
): Promise<RunRecord> {
  const base = {
    caseId,
    system,
    model,
    fingerprint: fingerprint(system, model, question, history),
    ranAt: new Date().toISOString(),
  };
  const started = Date.now();

  if (system === "agent") {
    const r = await runAgent({ message: question, history: toContents(history) }, { model });
    const searches = r.steps.filter((s) => s.tool === "search_knowledge");
    return {
      ...base,
      reply: r.reply,
      steps: r.steps,
      sources: r.sources.map((s) => s.name),
      retrievedSources: r.retrievedSources.map((s) => s.name),
      contactDraft: r.contactDraft,
      latencyMs: Date.now() - started,
      modelCalls: r.usage.apiCalls,
      embedCalls: searches.length,
      promptTokens: r.usage.promptTokens,
      outputTokens: r.usage.outputTokens,
      embedTokens: Math.ceil(searches.reduce((n, s) => n + s.summary.length, 0) / 4),
    };
  }

  const res = await generateContent({
    systemInstruction: buildFullContextPrompt(CORPUS),
    contents: [...toContents(history), { role: "user", parts: [{ text: question }] }],
    temperature: 0.3,
    model,
  });
  return {
    ...base,
    reply: extractText(res),
    steps: [],
    sources: [],
    retrievedSources: [],
    latencyMs: Date.now() - started,
    modelCalls: 1,
    embedCalls: 0,
    promptTokens: res.usageMetadata?.promptTokenCount ?? 0,
    outputTokens:
      (res.usageMetadata?.candidatesTokenCount ?? 0) + (res.usageMetadata?.thoughtsTokenCount ?? 0),
    embedTokens: 0,
  };
}

// Paid-tier list prices in USD per 1M tokens (Google's pricing page,
// 2026-11-14). The free tier costs nothing; these estimate what each
// answer would cost on a billed key.
const PRICES: Record<string, { input: number; output: number }> = {
  "gemini-3.5-flash-lite": { input: 0.3, output: 2.5 },
  "gemini-3.1-flash-lite": { input: 0.25, output: 1.5 },
  "gemini-3.6-flash": { input: 0.75, output: 3.75 },
  "gemini-3.8-flash": { input: 0.75, output: 3.75 },
  "gemini-4-hydrogen": { input: 1.5, output: 7.5 },
};
const EMBED_PRICE = 0.2;

export function estimateCostUsd(r: RunRecord): number | null {
  const p = PRICES[r.model];
  if (!p) return null;
  return (
    (r.promptTokens * p.input + r.outputTokens * p.output + r.embedTokens * EMBED_PRICE) / 1e6
  );
}

export { CORPUS };
