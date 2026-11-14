// The vamsi-bot agent loop. The resume sits in the system prompt; Gemini
// function calling covers README search, live GitHub stats and contact drafts.
// Shared by the chat route and the eval harness.

import { Content, Part, extractText, generateContent } from "../gemini";
import { buildSystemPrompt } from "./prompt";
import { Source, TOOL_DECLARATIONS, UiAction, executeTool } from "./tools";

export const MAX_ITERATIONS = 5;
const TEMPERATURE = 0.3;
const RESUME_SOURCE: Source = { name: "Resume" };
const FALLBACK_REPLY = "Sorry, I couldn't generate a response just now.";

export type Step = {
  tool: string;
  summary: string; // short, human-readable view of the arguments
  ok: boolean;
};

export type AgentResult = {
  reply: string;
  steps: Step[];
  sources: Source[]; // sources the reply cites (shown as tags)
  retrievedSources: Source[]; // everything the tools returned
  contactDraft?: UiAction;
  // Bookkeeping for the eval harness.
  iterations: number;
  usage: { apiCalls: number; promptTokens: number; outputTokens: number };
};

export type AgentInput = {
  message: string;
  history?: Content[]; // prior turns, text only
};

// Source tags show only what the answer draws on. The prompt requires a
// closing "(Source: ...)" line, so a retrieved source is kept only if that
// line names it. Deterministic, no extra model call; a reply with no source
// line gets no tags.
const CITE_KEYS: Record<string, string> = { "GitHub (live)": "github" };
const citeKey = (name: string) => CITE_KEYS[name] ?? name.split(" (")[0].toLowerCase();

export function citedSources(reply: string, retrieved: Source[]): Source[] {
  const cited = Array.from(reply.matchAll(/sources?\s*:\s*([^)\n]*)/gi))
    .map((m) => m[1].toLowerCase())
    .join(" | ");
  return retrieved.filter((s) => cited.includes(citeKey(s.name)));
}

function summarize(args: Record<string, unknown> = {}): string {
  const text = String(args.query ?? args.target ?? "");
  const scope = args.source ? ` in ${args.source}` : "";
  return (text + scope).slice(0, 120);
}

export async function runAgent(
  input: AgentInput,
  opts: { apiKey?: string; model?: string; maxIterations?: number } = {}
): Promise<AgentResult> {
  const maxIterations = opts.maxIterations ?? MAX_ITERATIONS;
  const systemInstruction = buildSystemPrompt();
  const contents: Content[] = [
    ...(input.history ?? []),
    { role: "user", parts: [{ text: input.message }] },
  ];

  const steps: Step[] = [];
  // The resume is always in the prompt, so it is always a citable source.
  const sources = new Map<string, Source>([[RESUME_SOURCE.name, RESUME_SOURCE]]);
  let contactDraft: UiAction | undefined;
  const usage = { apiCalls: 0, promptTokens: 0, outputTokens: 0 };
  let reply = "";
  let iterations = 0;

  for (let i = 0; i < maxIterations; i++) {
    iterations = i + 1;
    // On the final iteration the tools are withheld, so the model has to
    // answer from what it has already gathered.
    const lastChance = i === maxIterations - 1;
    const res = await generateContent(
      {
        systemInstruction,
        contents,
        tools: lastChance ? undefined : TOOL_DECLARATIONS,
        temperature: TEMPERATURE,
        model: opts.model,
      },
      opts.apiKey
    );
    usage.apiCalls++;
    usage.promptTokens += res.usageMetadata?.promptTokenCount ?? 0;
    usage.outputTokens +=
      (res.usageMetadata?.candidatesTokenCount ?? 0) + (res.usageMetadata?.thoughtsTokenCount ?? 0);

    const modelTurn = res.candidates?.[0]?.content;
    const calls = (modelTurn?.parts ?? []).filter((p) => p.functionCall);
    if (!modelTurn || calls.length === 0 || lastChance) {
      reply = extractText(res);
      break;
    }

    // Append the model turn exactly as received: the functionCall parts carry
    // thoughtSignature fields that Gemini validates on the next request.
    contents.push(modelTurn);

    const results = await Promise.all(
      calls.map((p) => executeTool(p.functionCall!.name, p.functionCall!.args))
    );

    // All responses go back in one user turn, in call order, each echoing
    // the id of the call it answers.
    const responseParts: Part[] = calls.map((p, j) => {
      const call = p.functionCall!;
      const result = results[j];
      steps.push({
        tool: call.name,
        summary: summarize(call.args),
        ok: !("error" in result.response),
      });
      for (const s of result.sources ?? []) if (!sources.has(s.name)) sources.set(s.name, s);
      if (result.action?.type === "contact_draft") contactDraft = result.action;
      return {
        functionResponse: {
          ...(call.id ? { id: call.id } : {}),
          name: call.name,
          response: result.response,
        },
      };
    });
    contents.push({ role: "user", parts: responseParts });
  }

  const retrievedSources = Array.from(sources.values());
  return {
    reply: reply || FALLBACK_REPLY,
    steps,
    sources: citedSources(reply, retrievedSources),
    retrievedSources,
    contactDraft,
    iterations,
    usage,
  };
}
