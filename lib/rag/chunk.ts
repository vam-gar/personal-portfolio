// Heading-aware Markdown chunker for repo READMEs. Build-time only.
//
// 1. Split on headings (ignoring "#" lines inside code fences).
// 2. Merge small sub-sections (### and deeper) into their parent or siblings.
//    Top-level (##) sections always stay separate.
// 3. Split oversized sections on blank lines, never inside a code fence.
// Every chunk starts with its breadcrumb so both keyword and vector search
// see which project and section the text belongs to.

import { Chunk, slugify } from "./types";

export const MIN_CHARS = 400; // below this, try to merge with a neighbour
export const MAX_CHARS = 1800; // above this, split (~450 tokens)

type Section = { path: string[]; body: string };

const FENCE = /^\s*(```|~~~)/;

function cleanMarkdown(md: string): string {
  return md
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/^\s*(\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)\s*)+$/gm, "") // badge rows
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "") // images
    .replace(/<\/?(p|div|img|br|a|picture|source|h\d|details|summary)\b[^>]*>/gi, "")
    .replace(/^\s*---+\s*$/gm, "") // horizontal rules
    .replace(/\n{3,}/g, "\n\n");
}

function splitSections(md: string): Section[] {
  const sections: Section[] = [];
  const path: string[] = [];
  let body: string[] = [];
  let inFence = false;
  const flush = () => {
    const text = body.join("\n").trim();
    if (text) sections.push({ path: [...path], body: text });
    body = [];
  };
  for (const line of md.split("\n")) {
    if (FENCE.test(line)) inFence = !inFence;
    const h = inFence ? null : /^(#{1,6})\s+(.+?)\s*#*$/.exec(line);
    if (!h) {
      body.push(line);
      continue;
    }
    flush();
    path.length = h[1].length - 1; // truncate to the parent depth
    for (let i = 0; i < path.length; i++) path[i] ??= "";
    path.push(h[2].replace(/[*_`]/g, "").trim());
  }
  flush();
  return sections;
}

const key = (p: string[]) => p.join("\u0000");

// Folds small sections into the previous one when they are its children or
// its siblings, so a chunk is never just a heading and a two-line snippet.
function mergeSmall(sections: Section[]): Section[] {
  const out: Section[] = [];
  for (const s of sections) {
    const prev = out[out.length - 1];
    const parent = key(s.path.slice(0, -1));
    const heading = s.path[s.path.length - 1];
    const fits =
      prev &&
      (s.body.length < MIN_CHARS || prev.body.length < MIN_CHARS) &&
      prev.body.length + s.body.length <= MAX_CHARS;
    if (fits && prev.path.length > 1 && key(prev.path) === parent) {
      // Child of prev (or sibling of sections already folded into prev).
      prev.body += `\n\n${heading}:\n${s.body}`;
    } else if (fits && s.path.length > 2 && key(prev.path.slice(0, -1)) === parent) {
      // Sibling: relabel the merged chunk with the shared parent heading.
      const first = prev.path[prev.path.length - 1];
      prev.body = `${first}:\n${prev.body}\n\n${heading}:\n${s.body}`;
      prev.path = prev.path.slice(0, -1);
    } else {
      out.push({ path: [...s.path], body: s.body });
    }
  }
  return out;
}

// Blank-line separated blocks; a fenced code block is always one block.
function splitBlocks(body: string): string[] {
  const blocks: string[] = [];
  let cur: string[] = [];
  let inFence = false;
  for (const line of body.split("\n")) {
    if (FENCE.test(line)) inFence = !inFence;
    if (!inFence && line.trim() === "") {
      if (cur.length) blocks.push(cur.join("\n"));
      cur = [];
    } else cur.push(line);
  }
  if (cur.length) blocks.push(cur.join("\n"));
  return blocks;
}

function splitLarge(body: string): string[] {
  if (body.length <= MAX_CHARS) return [body];
  const parts: string[] = [];
  let cur = "";
  for (const block of splitBlocks(body)) {
    // A short lead-in ("The table below shows...") stays with what follows,
    // even if that pushes the chunk a little over the limit.
    if (cur.length >= 300 && cur.length + block.length + 2 > MAX_CHARS) {
      parts.push(cur);
      cur = "";
    }
    cur = cur ? `${cur}\n\n${block}` : block;
  }
  if (cur) parts.push(cur);
  return parts;
}

export function chunkMarkdown(
  md: string,
  doc: { idPrefix: string; source: string; title: string; url?: string }
): Chunk[] {
  const chunks: Chunk[] = [];
  const seen = new Map<string, number>();
  for (const s of mergeSmall(splitSections(cleanMarkdown(md)))) {
    // Drop the H1 from the breadcrumb: the document title already names it.
    const crumbs = s.path.slice(1).filter(Boolean);
    const section = crumbs.join(" › ") || "Overview";
    const parts = splitLarge(s.body);
    parts.forEach((part, i) => {
      const base = `${doc.idPrefix}/${crumbs.map(slugify).join("/") || "overview"}`;
      const n = (seen.get(base) ?? 0) + 1;
      seen.set(base, n);
      const label = parts.length > 1 ? `${section} (part ${i + 1}/${parts.length})` : section;
      chunks.push({
        id: n > 1 ? `${base}-${n}` : base,
        source: doc.source,
        title: doc.title,
        section: label,
        url: doc.url,
        text: `${doc.title} › ${label}\n${part}`,
      });
    });
  }
  return chunks;
}
