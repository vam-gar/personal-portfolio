// Central content/config for the portfolio. Edit here to update channels & data.

export type Channel = {
  id: string; // used as activeChannel key
  emoji: string;
  label: string; // shown after the # in the sidebar/header/input
};

export type Category = {
  name: string;
  channels: Channel[];
};

export const CATEGORIES: Category[] = [
  {
    name: "INFORMATION",
    channels: [
      { id: "welcome", emoji: "👋", label: "welcome-read-me" },
      { id: "education", emoji: "🎓", label: "education" },
      { id: "experience", emoji: "💼", label: "experience" },
      { id: "skills", emoji: "🛠", label: "skills" },
    ],
  },
  {
    name: "SHOWCASE",
    channels: [
      { id: "support-agent", emoji: "🚀", label: "support-agent" },
      { id: "ai-travel-planner", emoji: "🚀", label: "ai-travel-planner" },
    ],
  },
  {
    name: "INTERACT",
    channels: [{ id: "contact-form", emoji: "📨", label: "contact-form" }],
  },
];

// Flat lookup so the header/input can resolve a channel by id.
export const CHANNEL_BY_ID: Record<string, Channel> = Object.fromEntries(
  CATEGORIES.flatMap((c) => c.channels).map((ch) => [ch.id, ch])
);

export const DEFAULT_CHANNEL = "welcome";

// ---- Skills printout ----
export const SKILLS: { group: string; items: string[] }[] = [
  {
    group: "Languages",
    items: [
      "Python",
      "TypeScript",
      "JavaScript",
      "SQL",
      "Go",
      "Java",
      "C++",
      "C",
      "HTML/CSS",
    ],
  },
  {
    group: "AI / LLM",
    items: [
      "AI Agents",
      "Tool Calling",
      "Evals",
      "Prompt Engineering",
      "Structured Outputs",
      "Guardrails",
      "LLM Observability",
      "RAG",
      "PydanticAI",
      "LangChain",
      "OpenAI/Gemini/Claude APIs",
    ],
  },
  {
    group: "Frameworks",
    items: [
      "Next.js",
      "React",
      "Node.js",
      "Flask",
      "Streamlit",
      "Tailwind CSS",
      "PyTorch",
      "TensorFlow",
      "Pytest",
    ],
  },
  {
    group: "Data and Infra",
    items: [
      "PostgreSQL",
      "Supabase",
      "MongoDB",
      "Pinecone",
      "Pandas",
      "NumPy",
      "Docker",
      "Azure",
      "Vercel",
      "Git",
      "Linux",
    ],
  },
];

// ---- Project rich embeds ----
export type Project = {
  id: string;
  // Optional display name shown in the header / channel-start, while routing
  // still keys off `id`. Falls back to the channel label when omitted.
  displayName?: string;
  subtitle?: string;
  title: string;
  description: string;
  fields: { name: string; value: string }[];
  tags: string[];
  github?: string; // omit/empty to hide the GitHub button
  accent?: string; // left-border accent color (defaults to Discord blurple)
};

export const PROJECTS: Record<string, Project> = {
  "support-agent": {
    id: "support-agent",
    subtitle:
      "A customer-facing support agent with code-enforced policy guardrails and a multi-turn eval suite.",
    title: "🎧 Retail Support AI Agent",
    description:
      "A customer-facing support AI agent with schema-validated tool calling for orders, returns, and retention offers. Policy guardrails and a human-handoff circuit breaker are enforced in code and covered by 51 Pytest tests. A tau-bench-style eval framework of 12 multi-turn scenarios, graded on final database state, raised task success from 75% to 100% and escalation accuracy from 83% to 100%.",
    fields: [
      { name: "Focus", value: "AI Agents, Tool Calling, Guardrails & Evals" },
    ],
    tags: ["Python", "PydanticAI", "Gemini API", "Claude API", "Streamlit", "Pytest"],
    github: "https://github.com/vam-gar/support-agent",
  },
  "ai-travel-planner": {
    id: "ai-travel-planner",
    subtitle:
      "A trip planner that validates Gemini itineraries and maps every day's route.",
    title: "✈️ AI Travel Planner",
    description:
      "A trip planner that validates Gemini itineraries with Zod schemas, retrying or flagging invalid responses. Each itinerary location is geocoded and every day's route is plotted on an interactive Leaflet map.",
    fields: [
      {
        name: "Focus",
        value: "Gemini API Integration & Full-Stack Application Architecture",
      },
    ],
    tags: ["Next.js", "React", "Gemini API", "Tailwind CSS", "Zod", "React-Leaflet"],
    github: "https://github.com/vam-gar/ai-travel-planner",
    accent: "#2ecc71",
  },
};

// ---- Education / Experience simple feeds ----
export const EDUCATION = [
  {
    school: "The University of Texas at Austin",
    detail: "Master of Science in Artificial Intelligence (Online/Part Time)",
    period: "Expected May 2027",
  },
  {
    school: "University of California, Santa Cruz",
    detail: "Bachelor of Science in Computer Science",
    period: "March 2024",
  },
];

export type Experience = {
  org: string;
  role: string;
  period: string;
  bullets: string[];
};

export const EXPERIENCE: Experience[] = [
  {
    org: "Moksha Jewels",
    role: "Freelance Software Developer",
    period: "Sep. 2026 — Present",
    bullets: [
      "Shipped a full-stack vendor payables web app (React, Supabase PostgreSQL, Vercel) used daily by a diamond jewelry retailer to track supplier invoices, payments, landed costs, and vendor balances.",
      "Worked directly with the store owner to gather requirements, then designed a 10-table relational schema with row-level security, role-based access control, and offline-first sync.",
      "Built an OCR invoice-parsing pipeline (pdf.js, Tesseract) and a FIFO payment engine that settles the oldest invoices first through one transactional Postgres function with idempotent upserts.",
    ],
  },
  {
    org: "CVS Health",
    role: "Software Developer",
    period: "Jul. 2024 — Jul. 2025",
    bullets: [
      "Built production Python REST APIs on Azure Functions for GAILE, CVS's internal conversational AI platform used by hundreds of employees, adding GPT-4 multimodal image analysis and summarization.",
      "Worked directly with business stakeholders to gather requirements, demo releases, and fix user-reported issues.",
      "Wrote telemetry endpoints storing user ratings, comments, and prompt metadata in Cosmos DB as a human-in-the-loop eval loop; the data drove prompt fixes, surfaced bugs, and prioritized new features.",
      "Wrote Python pipelines parsing multiple types of unstructured healthcare and enterprise forms (RFPs, medical records) into structured JSON for downstream LLM workflows, reducing manual data entry.",
      "Automated the monthly healthcare data load, validating and backfilling 53,000+ records with unit tests.",
    ],
  },
  {
    org: "SVAYO",
    role: "Artificial Intelligence & Machine Learning Intern",
    period: "Jul. 2023 — Sep. 2023",
    bullets: [
      "Trained custom CNN and YOLO models in PyTorch and TensorFlow for facial skin feature detection and acne classification, reaching 92% detection accuracy.",
      "Cut false positives by 15% through hyperparameter tuning and iterative model evaluations, and benchmarked R-CNN, Faster R-CNN, and YOLO on latency vs. accuracy for real-time inference.",
    ],
  },
];
