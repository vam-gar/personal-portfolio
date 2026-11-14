// Grading. Deterministic checks decide pass/fail; the LLM judge is used
// only for groundedness, on a different model from the subject.

import { createHash } from "node:crypto";
import { extractText, generateContent } from "../lib/gemini";
import { CORPUS, RunRecord, SystemName } from "./systems";

export type Expect = {
  facts?: string[]; // regexes that must all appear in the reply
  forbid?: string[]; // regexes that must not appear
  refusal?: boolean; // must give the off-topic guardrail reply
  declines?: boolean; // must say the sources do not cover it
  tools?: string[]; // agent: at least one of these was called
  noTools?: boolean; // agent: no tool was called
  cites?: string[]; // source line must mention each of these
  contactDraft?: { name?: string; email?: string }; // agent: draft returned
};

export type EvalCase = {
  id: string;
  category: string;
  question: string;
  history?: { role: "user" | "bot"; text: string }[];
  expect: Expect;
  expectBaseline?: Expect; // replaces `expect` for the baseline where the two differ
  relevant?: string[]; // chunk ids that answer the question (retrieval hit@k)
};

export type Check = { name: string; pass: boolean; detail?: string };

export type Grade = {
  checks: Check[];
  pass: boolean; // every deterministic check passed
  factRecall: number | null; // matched facts / expected facts
};

const REFUSAL = /only configured to answer/i;
// "isn't listed", "does not mention", "no information", "level of detail available"...
const DECLINES =
  /\b(isn't|is not|aren't|are not|not|no|doesn't|does not|don't|do not|neither|nor|cannot|can't|unable)\b[^.\n]{0,90}\b(list|mention|cover|document|includ|specif|stat|provid|availab|detail|inform|describ|indicat|found|give|access|live|real-time|look)|level of detail/i;

const rx = (pattern: string) => new RegExp(pattern, "i");

export function expectationFor(c: EvalCase, system: SystemName): Expect {
  return system === "baseline" && c.expectBaseline ? c.expectBaseline : c.expect;
}

// Fills {{name}} placeholders (live GitHub values) into fact patterns.
export function fillPlaceholders(e: Expect, vars: Record<string, string>): Expect {
  const fill = (s: string) => s.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);
  return { ...e, facts: e.facts?.map(fill), forbid: e.forbid?.map(fill) };
}

export function grade(r: RunRecord, e: Expect): Grade {
  const checks: Check[] = [];
  let factRecall: number | null = null;

  if (e.facts?.length) {
    const missing = e.facts.filter((f) => !rx(f).test(r.reply));
    factRecall = (e.facts.length - missing.length) / e.facts.length;
    checks.push({
      name: "facts",
      pass: missing.length === 0,
      detail: missing.length ? `missing: ${missing.join(" ; ")}` : undefined,
    });
  }
  if (e.forbid?.length) {
    const found = e.forbid
      .map((f) => rx(f).exec(r.reply)?.[0])
      .filter((m): m is string => Boolean(m));
    checks.push({
      name: "forbidden",
      pass: found.length === 0,
      detail: found.length ? `found: ${found.map((f) => `"${f}"`).join(", ")}` : undefined,
    });
  }
  if (e.refusal) checks.push({ name: "refusal", pass: REFUSAL.test(r.reply) });
  if (e.declines) checks.push({ name: "declines", pass: DECLINES.test(r.reply) });
  if (e.cites?.length) {
    const cited = Array.from(r.reply.matchAll(/sources?\s*:\s*([^)\n]*)/gi))
      .map((m) => m[1].toLowerCase())
      .join(" | ");
    const missing = e.cites.filter((c) => !cited.includes(c.toLowerCase()));
    checks.push({
      name: "cites",
      pass: missing.length === 0,
      detail: missing.length ? `source line lacks: ${missing.join(", ")}` : undefined,
    });
  }

  // Tool expectations only exist for the agent.
  if (r.system === "agent") {
    const used = r.steps.map((s) => s.tool);
    if (e.tools?.length) {
      checks.push({
        name: "tool",
        pass: e.tools.some((t) => used.includes(t)),
        detail: `called: ${used.join(", ") || "none"}`,
      });
    }
    if (e.noTools) {
      checks.push({ name: "no-tools", pass: used.length === 0, detail: `called: ${used.join(", ") || "none"}` });
    }
    if (e.contactDraft) {
      const d = r.contactDraft;
      const ok =
        !!d &&
        (!e.contactDraft.name || d.name === e.contactDraft.name) &&
        (!e.contactDraft.email || d.email === e.contactDraft.email) &&
        d.message.length > 0;
      checks.push({ name: "contact-draft", pass: ok, detail: d ? JSON.stringify(d) : "no draft returned" });
    }
  }

  return { checks, pass: checks.every((c) => c.pass), factRecall };
}

// ---- LLM judge: groundedness only ----
export type Verdict = "grounded" | "minor_embellishment" | "ungrounded";

export type Judgement = {
  judgeModel: string;
  replyHash: string;
  verdict: Verdict;
  unsupported: string[];
};

export const replyHash = (reply: string, extraEvidence: string) =>
  createHash("sha1").update(reply + "\u0000" + extraEvidence).digest("hex").slice(0, 12);

export const VERDICT_SCORE: Record<Verdict, number> = {
  grounded: 1,
  minor_embellishment: 0.5,
  ungrounded: 0,
};

const JUDGE_PROMPT = `You are auditing a chatbot that answers questions about a person named Vamsi using only the SOURCES below. Decide whether the ANSWER is grounded in the SOURCES.

Check every factual claim the answer makes about Vamsi, his work or his projects.
- A claim is supported if the SOURCES state it. Paraphrase, summarising and reordering are fine.
- A claim is unsupported if it adds a fact, number, technology, mechanism, benefit, property or motivation that the SOURCES do not state, even if it is plausible or generally true.
- Statements that something is not covered, refusals, offers to help and source citations are not claims.
- Subjective framing that asserts no new fact ("a notable project") is not a claim.

Verdicts:
- "grounded": no unsupported claims.
- "minor_embellishment": one or more unsupported elaborations (inferred mechanisms, benefits, properties), but nothing that contradicts the SOURCES and no invented hard facts.
- "ungrounded": at least one invented or contradicted hard fact (a number, date, employer, title, technology, result).

Reply with JSON only:
{"unsupported": ["<each unsupported claim, quoted or closely paraphrased>"], "verdict": "grounded" | "minor_embellishment" | "ungrounded"}`;

export async function judge(
  judgeModel: string,
  question: string,
  reply: string,
  extraEvidence: string
): Promise<Judgement> {
  const res = await generateContent({
    systemInstruction: JUDGE_PROMPT,
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `<SOURCES>\n${CORPUS}${extraEvidence ? `\n\n# Live tool results available to the chatbot\n${extraEvidence}` : ""}\n</SOURCES>\n\n<QUESTION>\n${question}\n</QUESTION>\n\n<ANSWER>\n${reply}\n</ANSWER>`,
          },
        ],
      },
    ],
    temperature: 0,
    maxOutputTokens: 4096,
    json: true,
    model: judgeModel,
  });
  const text = extractText(res);
  const parsed = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
  if (!(parsed.verdict in VERDICT_SCORE)) throw new Error(`Judge returned an unknown verdict: ${text.slice(0, 200)}`);
  return {
    judgeModel,
    replyHash: replyHash(reply, extraEvidence),
    verdict: parsed.verdict,
    unsupported: Array.isArray(parsed.unsupported) ? parsed.unsupported.map(String) : [],
  };
}
