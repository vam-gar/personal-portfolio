import { NextRequest, NextResponse } from "next/server";
import { runAgent } from "@/lib/agent/loop";
import { Content, GeminiError } from "@/lib/gemini";
import { rateLimit } from "@/lib/rate-limit";

const MAX_MESSAGE_CHARS = 1000;
const MAX_HISTORY_TURNS = 10;
// Bot replies can be longer than visitor messages; still bounded.
const MAX_HISTORY_CHARS = 4000;

function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

// The client's transcript is untrusted. Only plain user/bot text survives:
// tool calls and tool results are never accepted from the browser, so a
// caller cannot inject fake tool output into the model's context.
function sanitizeHistory(raw: unknown): Content[] {
  if (!Array.isArray(raw)) return [];
  const turns: Content[] = [];
  for (const h of raw.slice(-MAX_HISTORY_TURNS)) {
    const role = h?.role === "bot" ? "model" : h?.role === "user" ? "user" : null;
    const text = typeof h?.text === "string" ? h.text.trim().slice(0, MAX_HISTORY_CHARS) : "";
    if (role && text) turns.push({ role, parts: [{ text }] });
  }
  // A conversation has to open with the visitor.
  while (turns.length && turns[0].role !== "user") turns.shift();
  return turns;
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Server is missing GEMINI_API_KEY. Add it to .env.local." },
      { status: 500 }
    );
  }

  const limit = rateLimit(clientIp(req));
  if (!limit.ok) {
    return NextResponse.json(
      {
        error: `⏳ You're sending messages quickly. Please try again in about ${limit.retryAfterSecs}s.`,
      },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSecs) } }
    );
  }

  let message: string;
  let history: Content[];
  try {
    const body = await req.json();
    message = typeof body?.message === "string" ? body.message.trim() : "";
    history = sanitizeHistory(body?.history);
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!message) {
    return NextResponse.json({ error: "Empty message." }, { status: 400 });
  }
  if (message.length > MAX_MESSAGE_CHARS) {
    return NextResponse.json(
      { error: `Please keep messages under ${MAX_MESSAGE_CHARS} characters.` },
      { status: 400 }
    );
  }

  try {
    const result = await runAgent({ message, history }, { apiKey });
    return NextResponse.json({
      reply: result.reply,
      steps: result.steps,
      sources: result.sources,
      ...(result.contactDraft ? { contactDraft: result.contactDraft } : {}),
    });
  } catch (err) {
    if (err instanceof GeminiError) {
      console.error("Gemini API error:", err.status, err.detail);

      // Surface rate-limit (429) clearly instead of a generic error, including
      // the suggested retry delay when Gemini provides one.
      if (err.status === 429) {
        const secs = err.retryAfterSecs;
        return NextResponse.json(
          {
            error:
              secs && secs > 600
                ? "⏳ vamsi-bot has used up its model quota for today. Please try again later, or reach Vamsi through #contact-form."
                : secs
                  ? `⏳ vamsi-bot is rate-limited right now. Please try again in about ${secs}s.`
                  : "⏳ vamsi-bot is rate-limited right now. Please try again in a moment.",
          },
          { status: 429 }
        );
      }

      return NextResponse.json(
        { error: "The model service returned an error. Please try again." },
        { status: 502 }
      );
    }

    console.error("Agent request failed:", err);
    if (err instanceof Error && err.name === "TimeoutError") {
      return NextResponse.json(
        { error: "⏳ The model is responding slowly right now. Please try again in a moment." },
        { status: 504 }
      );
    }
    return NextResponse.json(
      { error: "Could not reach the model service." },
      { status: 502 }
    );
  }
}
