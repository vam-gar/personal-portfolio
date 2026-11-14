// vamsi-bot's tools: Gemini function declarations plus their handlers.
// Handlers never throw; a failure is returned to the model as { error } so
// it can recover or tell the visitor. Model-supplied arguments are treated
// as untrusted input and validated here.

import sources from "../../content/sources.json";
import { FunctionDeclaration } from "../gemini";
import { getProfileStats, getRepoStats } from "../github";
import { hybridSearch, index } from "../rag/search";

// ---- allowlists derived from content/ ----
const REPOS = new Map(sources.repos.map((r) => [r.repo.split("/")[1], r.repo]));
const GITHUB_USER = sources.repos[0].repo.split("/")[0];
const SOURCE_FILTERS = new Map<string, string>([
  ["resume", "resume"],
  ...sources.repos.map((r) => [r.repo.split("/")[1], `repo:${r.repo}`] as [string, string]),
]);
const SECTION_ALIASES: Record<string, string> = {
  contact: "Contact",
  experience: "Experience",
  projects: "Projects",
  skills: "Technical Skills",
  education: "Education",
};

// Something the UI should render alongside the reply. The model can only
// draft a contact message; sending happens client-side after the visitor
// reviews it and presses send.
export type UiAction = {
  type: "contact_draft";
  name: string;
  email: string;
  message: string;
};

export type ToolResult = {
  response: Record<string, unknown>;
  action?: UiAction;
};

export const TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: "search_knowledge",
    description:
      "Hybrid semantic + keyword search over Vamsi's resume and the READMEs of his indexed projects. Use for any question about what he built, how a project works, design decisions, results or technologies. Returns the most relevant passages with their source.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "A focused search query. Include exact names when known (e.g. 'PydanticAI', 'FIFO payment engine').",
        },
        source: {
          type: "string",
          enum: Array.from(SOURCE_FILTERS.keys()),
          description: "Optional: restrict the search to the resume or one project's README.",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "get_resume_section",
    description:
      "Returns one complete section of Vamsi's resume verbatim. Prefer this over search for overview questions such as 'what is his work history', 'list his skills', 'where did he study' or 'how can I reach him'.",
    parameters: {
      type: "object",
      properties: {
        section: {
          type: "string",
          enum: [...Object.keys(SECTION_ALIASES), "all"],
          description: "Which section to return; 'all' returns the whole resume.",
        },
      },
      required: ["section"],
    },
  },
  {
    name: "get_github_stats",
    description:
      "Fetches live data from GitHub: stars, forks, open issues, language breakdown and the latest commits for one of Vamsi's indexed repositories, or his profile totals. Use for anything that changes over time; never answer these from memory.",
    parameters: {
      type: "object",
      properties: {
        target: {
          type: "string",
          enum: [...Array.from(REPOS.keys()), "profile"],
          description: "A repository name, or 'profile' for account-level stats.",
        },
      },
      required: ["target"],
    },
  },
  {
    name: "draft_contact_message",
    description:
      "Drafts a message from the visitor to Vamsi and shows it to the visitor as a card they can edit and send. This does NOT send anything. Use only when the visitor clearly wants to contact Vamsi. Leave name or email empty if the visitor has not given them; never invent them.",
    parameters: {
      type: "object",
      properties: {
        message: {
          type: "string",
          description: "The message body, written in the visitor's voice.",
        },
        name: { type: "string", description: "The visitor's name, if they gave it." },
        email: { type: "string", description: "The visitor's email, if they gave it." },
      },
      required: ["message"],
    },
  },
];

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

async function searchKnowledge(args: Record<string, unknown>): Promise<ToolResult> {
  const query = str(args.query, 300);
  if (!query) return { response: { error: "query is required." } };
  const sourceKey = str(args.source, 60);
  if (sourceKey && !SOURCE_FILTERS.has(sourceKey)) {
    return { response: { error: `Unknown source "${sourceKey}".` } };
  }
  const { hits, usedVectors } = await hybridSearch(query, {
    k: 5,
    source: SOURCE_FILTERS.get(sourceKey),
  });
  return {
    response: {
      results: hits.map((h) => ({
        id: h.chunk.id,
        source: h.chunk.title,
        section: h.chunk.section,
        ...(h.chunk.url ? { url: h.chunk.url } : {}),
        text: h.chunk.text,
      })),
      ...(hits.length === 0 ? { note: "No matching passages. The information may not be indexed." } : {}),
      ...(usedVectors ? {} : { note: "Semantic search was unavailable; keyword results only." }),
    },
  };
}

function getResumeSection(args: Record<string, unknown>): ToolResult {
  const key = str(args.section, 30).toLowerCase();
  if (key === "all") {
    return {
      response: {
        resume: index.resumeSections.map((s) => `${s.name}\n${s.text}`).join("\n\n"),
      },
    };
  }
  const section = index.resumeSections.find((s) => s.name === SECTION_ALIASES[key]);
  if (!section) {
    return {
      response: { error: `Unknown section "${key}". Use one of: ${Object.keys(SECTION_ALIASES).join(", ")}, all.` },
    };
  }
  return { response: { section: section.name, text: section.text } };
}

async function getGithubStats(args: Record<string, unknown>): Promise<ToolResult> {
  const target = str(args.target, 60);
  try {
    if (target === "profile") return { response: await getProfileStats(GITHUB_USER) };
    const repo = REPOS.get(target);
    if (!repo) {
      return {
        response: { error: `"${target}" is not an indexed repository. Available: ${Array.from(REPOS.keys()).join(", ")}, profile.` },
      };
    }
    return { response: await getRepoStats(repo) };
  } catch (err) {
    return { response: { error: err instanceof Error ? err.message : "GitHub request failed." } };
  }
}

function draftContactMessage(args: Record<string, unknown>): ToolResult {
  const message = str(args.message, 2000);
  if (!message) return { response: { error: "message is required." } };
  const name = str(args.name, 100);
  let email = str(args.email, 200);
  let note = "";
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    email = "";
    note = " The email given was not valid, so that field was left blank.";
  }
  const missing = [!name && "name", !email && "email"].filter(Boolean);
  return {
    response: {
      status: "draft_shown_to_visitor",
      sent: false,
      note:
        `The draft is displayed as an editable card. Nothing has been sent; the visitor must review it and press Send.${note}` +
        (missing.length ? ` They still need to fill in: ${missing.join(", ")}.` : ""),
    },
    action: { type: "contact_draft", name, email, message },
  };
}

export async function executeTool(name: string, args: Record<string, unknown> = {}): Promise<ToolResult> {
  switch (name) {
    case "search_knowledge":
      return searchKnowledge(args);
    case "get_resume_section":
      return getResumeSection(args);
    case "get_github_stats":
      return getGithubStats(args);
    case "draft_contact_message":
      return draftContactMessage(args);
    default:
      return { response: { error: `Unknown tool "${name}".` } };
  }
}
