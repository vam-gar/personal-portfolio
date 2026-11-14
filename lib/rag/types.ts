// Shapes shared by the index script, the in-memory search and the evals.

export type Chunk = {
  id: string; // stable, human-readable: "resume/experience/cvs-health"
  source: string; // "resume" or "repo:vam-gar/<name>"
  title: string; // document title, e.g. "Resume" or "AI Travel Planner"
  section: string; // breadcrumb inside the document
  url?: string;
  text: string; // what is embedded, keyword-indexed and shown to the model
};

export type IndexedChunk = Chunk & { embedding: number[] };

export type ResumeSection = { name: string; text: string };

export type RagIndex = {
  version: 1;
  embedModel: string;
  dims: number;
  builtAt: string;
  resumeSections: ResumeSection[];
  chunks: IndexedChunk[];
};

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
