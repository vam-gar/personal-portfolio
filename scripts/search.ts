// Debug retrieval from the command line:
//   npm run search -- "PydanticAI vs LangGraph"
// Prints the vector-only, keyword-only and fused rankings side by side.

import { loadEnvLocal } from "./env";

async function main() {
  loadEnvLocal();
  const query = process.argv.slice(2).join(" ").trim();
  if (!query) {
    console.error('Usage: npm run search -- "your query"');
    process.exit(1);
  }
  // Imported after env is loaded; the search module reads the index on import.
  const { embedQuery } = await import("../lib/gemini");
  const { fuse, keywordSearch, vectorSearch } = await import("../lib/rag/search");

  const vector = vectorSearch(await embedQuery(query), 20);
  const keyword = keywordSearch(query, 20);
  const show = (title: string, rows: string[]) =>
    console.log(`\n${title}\n${rows.map((r, i) => `  ${i + 1}. ${r}`).join("\n") || "  (none)"}`);

  show("Vector (cosine)", vector.slice(0, 5).map((r) => `${r.score.toFixed(3)}  ${r.chunk.id}`));
  show("Keyword (BM25)", keyword.slice(0, 5).map((r) => `${r.score.toFixed(2)}  ${r.chunk.id}`));
  show(
    "Hybrid (RRF)",
    fuse(vector, keyword, 5).map(
      (h) => `${h.score.toFixed(4)}  ${h.chunk.id}  [vec #${h.vectorRank ?? "-"}, kw #${h.keywordRank ?? "-"}]`
    )
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
