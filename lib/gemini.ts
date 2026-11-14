// Thin REST wrapper around the Gemini API (generateContent + embeddings).
// Everything that talks to generativelanguage.googleapis.com goes through
// here so the route, the index script and the eval harness share one client
// and the API surface can be swapped in one place.

const BASE = "https://generativelanguage.googleapis.com/v1beta";

// GEMINI_MODEL overrides the chat model (evals, or a fallback during an outage).
export const CHAT_MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
export const EMBED_MODEL = "gemini-embedding-2";
// gemini-embedding-2 auto-normalises truncated outputs at this size.
export const EMBED_DIMS = 768;

// ---- wire types (only the fields we use) ----
export type FunctionCall = {
  id?: string;
  name: string;
  args?: Record<string, unknown>;
};

export type Part = {
  text?: string;
  thought?: boolean;
  // Sits beside functionCall/text on the part. Must be sent back unchanged
  // or Gemini 3+/4 models reject the next request with a 400.
  thoughtSignature?: string;
  functionCall?: FunctionCall;
  functionResponse?: {
    id?: string;
    name: string;
    response: Record<string, unknown>;
  };
};

export type Content = { role: "user" | "model"; parts: Part[] };

export type FunctionDeclaration = {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
};

export type GenerateRequest = {
  systemInstruction?: string;
  contents: Content[];
  tools?: FunctionDeclaration[];
  temperature?: number;
  maxOutputTokens?: number;
  model?: string;
};

export type GenerateResponse = {
  candidates?: { content?: Content; finishReason?: string }[];
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    thoughtsTokenCount?: number;
    totalTokenCount?: number;
  };
};

export class GeminiError extends Error {
  constructor(
    public status: number,
    public detail: string
  ) {
    super(`Gemini API error ${status}`);
    this.name = "GeminiError";
  }

  // Suggested wait from a 429 body. Per-minute limits say "retry in 12.3s";
  // exhausted daily quotas say "retry in 9h26m54.07s".
  get retryAfterSecs(): number | null {
    const m = /retry in (?:(\d+)h)?(?:(\d+)m)?(?:([\d.]+)s)?/i.exec(this.detail);
    if (!m || (!m[1] && !m[2] && !m[3])) return null;
    return Math.ceil(Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0));
  }
}

function requireKey(apiKey?: string): string {
  const key = apiKey ?? process.env.GEMINI_API_KEY;
  if (!key) throw new Error("Missing GEMINI_API_KEY.");
  return key;
}

// 500/503 ("model is experiencing high demand") are usually momentary, so
// they get two quick retries. 429s are not retried: the caller surfaces the
// wait time instead.
const RETRY_STATUSES = new Set([500, 503]);
const RETRY_DELAYS_MS = [600, 1800];
// A stalled connection must not hold a serverless function open.
const REQUEST_TIMEOUT_MS = 30_000;

async function post<T>(path: string, body: unknown, apiKey?: string): Promise<T> {
  const key = requireKey(apiKey);
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(`${BASE}/${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Authenticate via the dedicated header so the AQ.-prefixed token is
        // parsed as an API key (avoids gateway multi-credential 400 errors).
        "x-goog-api-key": key,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (r.ok) return (await r.json()) as T;
    const detail = await r.text();
    if (!RETRY_STATUSES.has(r.status) || attempt >= RETRY_DELAYS_MS.length) {
      throw new GeminiError(r.status, detail);
    }
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
  }
}

export async function generateContent(
  req: GenerateRequest,
  apiKey?: string
): Promise<GenerateResponse> {
  const body: Record<string, unknown> = {
    contents: req.contents,
    generationConfig: {
      temperature: req.temperature ?? 1.0,
      max_output_tokens: req.maxOutputTokens ?? 2048,
    },
  };
  if (req.systemInstruction) {
    body.system_instruction = { parts: [{ text: req.systemInstruction }] };
  }
  if (req.tools?.length) {
    body.tools = [{ functionDeclarations: req.tools }];
  }
  return post<GenerateResponse>(
    `models/${req.model ?? CHAT_MODEL}:generateContent`,
    body,
    apiKey
  );
}

// Visible answer text of the first candidate (skips thought and tool parts).
export function extractText(res: GenerateResponse): string {
  return (
    res.candidates?.[0]?.content?.parts
      ?.filter((p) => !p.thought)
      .map((p) => p.text ?? "")
      .join("")
      .trim() ?? ""
  );
}

// ---- embeddings ----
// gemini-embedding-2 has no taskType; the task is expressed in the text.
export function formatDocumentForEmbedding(title: string, text: string): string {
  return `title: ${title || "none"} | text: ${text}`;
}

export function formatQueryForEmbedding(query: string): string {
  return `task: search result | query: ${query}`;
}

type EmbedResponse = { embedding?: { values: number[] } };
type BatchEmbedResponse = { embeddings?: { values: number[] }[] };

function embedRequest(text: string) {
  return {
    model: `models/${EMBED_MODEL}`,
    content: { parts: [{ text }] },
    output_dimensionality: EMBED_DIMS,
  };
}

export async function embedQuery(query: string, apiKey?: string): Promise<number[]> {
  const res = await post<EmbedResponse>(
    `models/${EMBED_MODEL}:embedContent`,
    embedRequest(formatQueryForEmbedding(query)),
    apiKey
  );
  if (!res.embedding?.values) throw new Error("Embedding response had no values.");
  return res.embedding.values;
}

// Embeds pre-formatted document strings, preserving order.
export async function embedDocuments(
  texts: string[],
  apiKey?: string,
  batchSize = 50
): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const res = await post<BatchEmbedResponse>(
      `models/${EMBED_MODEL}:batchEmbedContents`,
      { requests: batch.map(embedRequest) },
      apiKey
    );
    if (res.embeddings?.length !== batch.length) {
      throw new Error(
        `Expected ${batch.length} embeddings, got ${res.embeddings?.length ?? 0}.`
      );
    }
    for (const e of res.embeddings) {
      if (e.values.length !== EMBED_DIMS) {
        throw new Error(`Expected ${EMBED_DIMS} dims, got ${e.values.length}.`);
      }
      out.push(e.values);
    }
  }
  return out;
}
