// Builds the committed RAG artifacts from content/:
//   generated/index.json  chunks + embeddings
//   generated/resume.json the resume as plain-text sections (system prompt)
//   generated/corpus.md   the full source text (full-context eval baseline)
//
//   npm run index             parse, chunk, embed, write both files
//   npm run index -- --dry-run   parse and chunk only; print chunks, embed nothing
//
// Needs GEMINI_API_KEY (env or .env.local) unless --dry-run.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  EMBED_DIMS,
  EMBED_MODEL,
  embedDocuments,
  formatDocumentForEmbedding,
} from "../lib/gemini";
import { chunkMarkdown } from "../lib/rag/chunk";
import { parseResume } from "../lib/rag/latex";
import { Chunk, RagIndex, ResumeDoc } from "../lib/rag/types";
import { ROOT, loadEnvLocal } from "./env";

const OUT_DIR = path.join(ROOT, "generated");
const dryRun = process.argv.includes("--dry-run");

type Sources = {
  resume: string;
  repos: { repo: string; title: string; local?: string }[];
};

async function fetchReadme(repo: string): Promise<string> {
  const url = `https://raw.githubusercontent.com/${repo}/HEAD/README.md`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Could not fetch ${url}: HTTP ${r.status}`);
  return r.text();
}

async function main() {
  loadEnvLocal();
  const sources: Sources = JSON.parse(
    readFileSync(path.join(ROOT, "content/sources.json"), "utf8")
  );

  // ---- resume ----
  const resume = parseResume(readFileSync(path.join(ROOT, sources.resume), "utf8"));
  const chunks: Chunk[] = [...resume.chunks];
  const corpus: string[] = [
    `# Resume: ${resume.name}`,
    ...resume.sections.map((s) => `## ${s.name}\n\n${s.text}`),
  ];

  // ---- repo READMEs ----
  for (const src of sources.repos) {
    // This repo's own README is read from disk so the index matches the
    // branch being built, not whatever is on the default branch.
    const md = src.local
      ? readFileSync(path.join(ROOT, src.local), "utf8")
      : await fetchReadme(src.repo);
    const name = src.repo.split("/")[1];
    const url = `https://github.com/${src.repo}`;
    chunks.push(
      ...chunkMarkdown(md, {
        idPrefix: name,
        source: `repo:${src.repo}`,
        title: src.title,
        url,
      })
    );
    corpus.push(`# Project README: ${src.title} (${url})\n\n${md.trim()}`);
  }

  const ids = new Set<string>();
  for (const c of chunks) {
    if (ids.has(c.id)) throw new Error(`Duplicate chunk id: ${c.id}`);
    ids.add(c.id);
  }

  // ---- report ----
  const sizes = chunks.map((c) => c.text.length);
  const bySource = new Map<string, number>();
  for (const c of chunks) bySource.set(c.source, (bySource.get(c.source) ?? 0) + 1);
  console.log(`${chunks.length} chunks`);
  bySource.forEach((n, s) => console.log(`  ${s}: ${n}`));
  console.log(
    `  chars min/median/max: ${Math.min(...sizes)}/${
      [...sizes].sort((a, b) => a - b)[sizes.length >> 1]
    }/${Math.max(...sizes)}  (~${Math.round(sizes.reduce((a, b) => a + b, 0) / 4)} tokens total)`
  );

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(path.join(OUT_DIR, "corpus.md"), corpus.join("\n\n") + "\n");
  const resumeDoc: ResumeDoc = { name: resume.name, sections: resume.sections };
  writeFileSync(path.join(OUT_DIR, "resume.json"), JSON.stringify(resumeDoc, null, 2) + "\n");
  console.log(`wrote generated/corpus.md, generated/resume.json`);

  if (dryRun) {
    for (const c of chunks) {
      console.log(`\n===== ${c.id}  [${c.text.length} chars]\n${c.text}`);
    }
    console.log("\n--dry-run: no embeddings requested, index.json not written.");
    return;
  }

  // ---- embed ----
  const vectors = await embedDocuments(
    chunks.map((c) => formatDocumentForEmbedding(`${c.title} — ${c.section}`, c.text))
  );
  const index: RagIndex = {
    version: 1,
    embedModel: EMBED_MODEL,
    dims: EMBED_DIMS,
    builtAt: new Date().toISOString(),
    chunks: chunks.map((c, i) => ({
      ...c,
      // 5 decimals keeps the committed file small with no measurable
      // effect on cosine ranking.
      embedding: vectors[i].map((v) => Math.round(v * 1e5) / 1e5),
    })),
  };
  const file = path.join(OUT_DIR, "index.json");
  writeFileSync(file, JSON.stringify(index) + "\n");
  console.log(
    `wrote generated/index.json (${(readFileSync(file).length / 1024).toFixed(0)} KB, ${EMBED_MODEL} @ ${EMBED_DIMS}d)`
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  if (err?.detail) console.error(err.detail);
  process.exit(1);
});
