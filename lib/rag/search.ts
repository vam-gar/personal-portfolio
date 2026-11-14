// In-memory hybrid retrieval over the committed index: cosine similarity on
// Gemini embeddings + BM25 keyword search (MiniSearch), merged with
// reciprocal rank fusion. No database; the index is ~55 chunks.

import MiniSearch from "minisearch";
import rawIndex from "../../generated/index.json";
import { EMBED_DIMS, EMBED_MODEL, embedQuery } from "../gemini";
import { IndexedChunk, RagIndex } from "./types";

export const index = rawIndex as unknown as RagIndex;

if (index.embedModel !== EMBED_MODEL || index.dims !== EMBED_DIMS) {
  // Query and document vectors must come from the same model and size.
  throw new Error(
    `generated/index.json was built with ${index.embedModel}@${index.dims}d but the app uses ${EMBED_MODEL}@${EMBED_DIMS}d. Run "npm run index".`
  );
}

const RRF_K = 60; // standard constant; damps the gap between adjacent ranks
const CANDIDATES = 20; // how deep each ranker contributes to the fusion

export type Ranked = { chunk: IndexedChunk; score: number };

export type SearchHit = {
  chunk: IndexedChunk;
  score: number; // fused RRF score
  vectorRank: number | null; // 1-based rank in each list, null if absent
  keywordRank: number | null;
};

export type SearchOptions = {
  k?: number;
  filter?: ChunkFilter; // restrict the searchable chunks
  queryEmbedding?: number[]; // skip the embedding call (evals, tests)
};

export type ChunkFilter = (chunk: IndexedChunk) => boolean;

const pool = (filter?: ChunkFilter) => (filter ? index.chunks.filter(filter) : index.chunks);

// ---- vector ----
// Stored vectors and gemini-embedding-2 query vectors are unit length, so
// the dot product is the cosine similarity.
export function vectorSearch(queryEmbedding: number[], k: number, filter?: ChunkFilter): Ranked[] {
  return pool(filter)
    .map((chunk) => {
      let dot = 0;
      for (let i = 0; i < queryEmbedding.length; i++) dot += queryEmbedding[i] * chunk.embedding[i];
      return { chunk, score: dot };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

// ---- keyword (BM25) ----
// Function words plus the words every question about Vamsi contains.
const STOP_WORDS = new Set(
  (
    "a about after all also am an and any are as at be been before being both but by can could " +
    "did do does doing done for from get go got had has have having he her here him his how i if " +
    "in into is it its just me more most my no not of on one or other our out over own s she so " +
    "some such t than that the their them then there these they this those through to too under " +
    "up us use used using very was we were what when where which while who whom why will with " +
    "would you your tell know vamsi garlapati"
  ).split(" ")
);

let mini: MiniSearch<IndexedChunk> | null = null;
const byId = new Map(index.chunks.map((c) => [c.id, c]));

function keywordIndex(): MiniSearch<IndexedChunk> {
  if (!mini) {
    mini = new MiniSearch<IndexedChunk>({
      fields: ["text", "section", "title"],
      // Split on everything except (Latin) letters, digits, + and #. MiniSearch's
      // default keeps backticks attached, which made every `code` term in a
      // README unsearchable ("`TestModel`" never matched "TestModel").
      tokenize: (text) => text.split(/[^A-Za-z0-9\u00C0-\u024F+#]+/).filter(Boolean),
      // Applied to documents and queries alike. Without it, the filler in a
      // question ("where did he go to...") outvotes the vector ranking.
      processTerm: (term) => {
        const t = term.toLowerCase();
        return STOP_WORDS.has(t) ? null : t;
      },
      searchOptions: {
        boost: { section: 2, title: 1.5 },
        // "pydantic" finds "PydanticAI"; short terms must match exactly.
        prefix: (term) => term.length >= 4,
      },
    });
    mini.addAll(index.chunks);
  }
  return mini;
}

export function keywordSearch(query: string, k: number, filter?: ChunkFilter): Ranked[] {
  return keywordIndex()
    .search(query)
    .map((r) => ({ chunk: byId.get(r.id as string)!, score: r.score }))
    .filter((r) => !filter || filter(r.chunk))
    .slice(0, k);
}

// ---- fusion ----
// score(d) = sum over rankers of 1 / (RRF_K + rank). Uses ranks only, so
// the incomparable cosine and BM25 score scales never need normalising.
export function fuse(vector: Ranked[], keyword: Ranked[], k: number): SearchHit[] {
  const hits = new Map<string, SearchHit>();
  const add = (list: Ranked[], field: "vectorRank" | "keywordRank") =>
    list.forEach(({ chunk }, i) => {
      const hit =
        hits.get(chunk.id) ??
        ({ chunk, score: 0, vectorRank: null, keywordRank: null } as SearchHit);
      hit[field] = i + 1;
      hit.score += 1 / (RRF_K + i + 1);
      hits.set(chunk.id, hit);
    });
  add(vector, "vectorRank");
  add(keyword, "keywordRank");
  return Array.from(hits.values())
    .sort((a, b) => b.score - a.score || a.chunk.id.localeCompare(b.chunk.id))
    .slice(0, k);
}

export type SearchResult = {
  hits: SearchHit[];
  // False when the query embedding call failed and results are keyword-only.
  usedVectors: boolean;
};

export async function hybridSearch(query: string, opts: SearchOptions = {}): Promise<SearchResult> {
  const k = opts.k ?? 5;
  const keyword = keywordSearch(query, CANDIDATES, opts.filter);

  let embedding = opts.queryEmbedding;
  if (!embedding) {
    try {
      embedding = await embedQuery(query);
    } catch (err) {
      // Rate limit or outage on the embedding endpoint: degrade to keyword
      // search rather than failing the whole turn.
      console.error("Query embedding failed; using keyword search only:", err);
      return { hits: fuse([], keyword, k), usedVectors: false };
    }
  }
  const vector = vectorSearch(embedding, CANDIDATES, opts.filter);
  return { hits: fuse(vector, keyword, k), usedVectors: true };
}
