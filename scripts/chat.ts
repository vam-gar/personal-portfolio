// Talk to the agent from the command line, without the web UI:
//   npm run chat -- "What did he do at CVS?" "And before that?"
// Each argument is one visitor turn in the same conversation.
// Set MAX_ITERATIONS=2 to exercise the forced final answer.

import type { Content } from "../lib/gemini";
import { loadEnvLocal } from "./env";

async function main() {
  loadEnvLocal();
  const turns = process.argv.slice(2);
  if (!turns.length) {
    console.error('Usage: npm run chat -- "first message" ["follow-up" ...]');
    process.exit(1);
  }
  const { runAgent } = await import("../lib/agent/loop");
  const maxIterations = process.env.MAX_ITERATIONS ? Number(process.env.MAX_ITERATIONS) : undefined;
  const history: Content[] = [];

  for (const message of turns) {
    const started = Date.now();
    const r = await runAgent({ message, history }, { maxIterations });
    console.log(`\n> ${message}\n`);
    console.log(r.reply);
    console.log(
      `\n  steps:   ${r.steps.map((s) => `${s.tool}(${s.summary})${s.ok ? "" : " ERROR"}`).join(" → ") || "(none)"}`
    );
    console.log(`  sources: ${r.sources.map((s) => s.name).join(", ") || "(none)"}`);
    if (r.contactDraft) console.log(`  contactDraft: ${JSON.stringify(r.contactDraft)}`);
    console.log(
      `  ${r.usage.apiCalls} API calls, ${r.usage.promptTokens} in / ${r.usage.outputTokens} out tokens, ${((Date.now() - started) / 1000).toFixed(1)}s`
    );
    history.push({ role: "user", parts: [{ text: message }] }, { role: "model", parts: [{ text: r.reply }] });
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  if (err?.detail) console.error(err.detail);
  process.exit(1);
});
