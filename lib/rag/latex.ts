// Parses the resume (Jake Gutierrez's LaTeX template) into plain-text
// sections and one chunk per job / project. Build-time only.

import { Chunk, ResumeSection, slugify } from "./types";

// Reads a balanced {...} group starting at or after `from`.
function readGroup(s: string, from: number): { value: string; end: number } | null {
  let i = from;
  while (i < s.length && /\s/.test(s[i])) i++;
  if (s[i] !== "{") return null;
  let depth = 0;
  for (let j = i; j < s.length; j++) {
    if (s[j] === "\\") {
      j++; // skip escaped char (\{, \}, \%, ...)
      continue;
    }
    if (s[j] === "{") depth++;
    else if (s[j] === "}" && --depth === 0) {
      return { value: s.slice(i + 1, j), end: j + 1 };
    }
  }
  return null;
}

function readGroups(s: string, from: number, n: number) {
  const values: string[] = [];
  let end = from;
  for (let k = 0; k < n; k++) {
    const g = readGroup(s, end);
    if (!g) throw new Error(`resume.tex: expected ${n} arguments near "${s.slice(from, from + 40)}"`);
    values.push(g.value);
    end = g.end;
  }
  return { values, end };
}

// LaTeX markup -> plain text.
export function detex(input: string): string {
  let s = input;
  // \href{url}{text} -> text
  for (let m = /\\href\s*\{/.exec(s); m; m = /\\href\s*\{/.exec(s)) {
    const { values, end } = readGroups(s, m.index + 5, 2);
    s = s.slice(0, m.index) + values[1] + s.slice(end);
  }
  // Unwrap single-argument formatting commands, innermost first.
  const wrap = /\\(?:textbf|textit|emph|underline|mbox|small|large|Large|Huge)\s*\{([^{}]*)\}/;
  while (wrap.test(s)) s = s.replace(wrap, "$1");
  return s
    .replace(/\\vspace\s*\{[^{}]*\}/g, "")
    .replace(/\$\|\$/g, "|")
    .replace(/\\\\/g, "\n")
    .replace(/\\([&%$#_{}])/g, "$1")
    .replace(/---/g, "—")
    .replace(/--/g, "–")
    .replace(/\\[a-zA-Z]+\*?/g, "")
    .replace(/[{}]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();
}

type Entry = { heading: string; meta: string; stack?: string; bullets: string[] };

function parseEntries(body: string): Entry[] {
  const entries: Entry[] = [];
  const cmd = /\\(resumeSubheading|resumeProjectHeading|resumeItem)\s*\{/g;
  for (let m = cmd.exec(body); m; m = cmd.exec(body)) {
    const argStart = m.index + m[0].length - 1;
    if (m[1] === "resumeSubheading") {
      // {left-top}{right-top}{left-bottom}{right-bottom}
      const { values, end } = readGroups(body, argStart, 4);
      const [a, b, c, d] = values.map(detex);
      entries.push({ heading: `${a} — ${c}`, meta: `${b}, ${d}`, bullets: [] });
      cmd.lastIndex = end;
    } else if (m[1] === "resumeProjectHeading") {
      // {\textbf{Name} $|$ \emph{stack}}{date}
      const { values, end } = readGroups(body, argStart, 2);
      const [name, stack] = detex(values[0]).split("|").map((x) => x.trim());
      entries.push({ heading: name, meta: detex(values[1]), stack, bullets: [] });
      cmd.lastIndex = end;
    } else {
      const g = readGroup(body, argStart);
      if (!g) throw new Error("resume.tex: unbalanced \\resumeItem");
      entries[entries.length - 1]?.bullets.push(detex(g.value));
      cmd.lastIndex = g.end;
    }
  }
  return entries;
}

function renderEntry(e: Entry): string {
  return [
    `${e.heading} (${e.meta})`,
    e.stack ? `Tech stack: ${e.stack}` : "",
    ...e.bullets.map((b) => `- ${b}`),
  ]
    .filter(Boolean)
    .join("\n");
}

export type ParsedResume = {
  name: string;
  sections: ResumeSection[];
  chunks: Chunk[];
};

export function parseResume(tex: string): ParsedResume {
  // Drop comments, then the preamble (it defines the macros we search for).
  const src = tex.replace(/(?<!\\)%.*$/gm, "");
  const start = src.indexOf("\\begin{document}");
  if (start < 0) throw new Error("resume.tex: no \\begin{document}");
  const doc = src.slice(start);

  const sections: ResumeSection[] = [];
  const chunks: Chunk[] = [];
  const push = (section: string, slug: string, text: string) =>
    chunks.push({
      id: `resume/${slug}`,
      source: "resume",
      title: "Resume",
      section,
      text: `Vamsi Garlapati's resume › ${section}\n${text}`,
    });

  // Header: name + links. The phone number is deliberately left out of the
  // index so the bot cannot recite it; visitors use the contact form.
  const header = doc.slice(0, doc.search(/\\section\s*\{/));
  const name = detex(/\\scshape\s+([^\\}]+)/.exec(header)?.[1] ?? "").trim();
  const links: string[] = [];
  const href = /\\href\s*\{/g;
  for (let m = href.exec(header); m; m = href.exec(header)) {
    const { values } = readGroups(header, m.index + 5, 2);
    const url = values[0].replace(/^mailto:/, "");
    const label = detex(values[1]);
    links.push(values[0].startsWith("mailto:") ? `Email: ${url}` : `${label}: ${url}`);
  }
  const contact = [name, ...links].join("\n");
  sections.push({ name: "Contact", text: contact });
  push("Contact", "contact", contact);

  const parts = doc.split(/\\section\s*\{([^}]*)\}/).slice(1);
  for (let i = 0; i < parts.length; i += 2) {
    const title = detex(parts[i]);
    const body = parts[i + 1].replace(/\\end\{document\}[\s\S]*$/, "");
    const entries = parseEntries(body);

    if (entries.length === 0) {
      // Skills block: \textbf{Label}{: a, b, c}
      const lines: string[] = [];
      const row = /\\textbf\{([^}]*)\}\s*\{:\s*([^}]*)\}/g;
      for (let m = row.exec(body); m; m = row.exec(body)) {
        lines.push(`${detex(m[1])}: ${detex(m[2])}`);
      }
      const text = lines.length ? lines.join("\n") : detex(body);
      sections.push({ name: title, text });
      push(title, slugify(title), text);
      continue;
    }

    sections.push({ name: title, text: entries.map(renderEntry).join("\n\n") });
    if (entries.every((e) => e.bullets.length === 0)) {
      // Bullet-less entries (education) are tiny: keep them together.
      push(title, slugify(title), entries.map(renderEntry).join("\n"));
    } else {
      for (const e of entries) {
        const label = e.heading.split(" — ").pop() ?? e.heading;
        push(`${title} › ${e.heading}`, `${slugify(title)}/${slugify(label)}`, renderEntry(e));
      }
    }
  }

  return { name, sections, chunks };
}
