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
      { id: "ucsc-chess-engine", emoji: "🚀", label: "ucsc-chess-engine" },
      { id: "ai-travel-planner", emoji: "🚀", label: "ai-travel-planner" },
      { id: "wordle-solver", emoji: "🚀", label: "wordle-solver" },
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
      "C++",
      "C",
      "Java",
      "SQL",
      "HTML/CSS",
    ],
  },
  {
    group: "Frameworks & Web",
    items: ["React", "Next.js", "Node.js", "Flask", "FastAPI", "RESTful APIs"],
  },
  {
    group: "AI & Data Libraries",
    items: [
      "PyTorch",
      "TensorFlow",
      "Keras",
      "YOLO",
      "CNNs",
      "OpenAI GPT-4 API",
      "Gemini API",
      "Claude API",
      "NumPy",
      "Pandas",
    ],
  },
  {
    group: "Developer Tools & Data",
    items: [
      "Web Scraping (Playwright)",
      "Data Pipelines",
      "PostgreSQL",
      "Docker",
      "Git",
      "Linux",
      "Azure",
      "Postman",
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
  "ucsc-chess-engine": {
    id: "ucsc-chess-engine",
    subtitle:
      "A full-stack chess platform with competitive ranked matches and a minimax AI opponent.",
    title: "♟️ UCSC Chess Engine",
    description:
      "A full-stack chess platform that lets UCSC students compete in ranked matches and play against an AI opponent powered by the minimax algorithm with adjustable difficulty levels.",
    fields: [
      { name: "Focus", value: "Full Stack Web Architecture & Game AI" },
    ],
    tags: ["Python", "Flask", "React.js", "Node.js", "Express.js", "MongoDB"],
  },
  "ai-travel-planner": {
    id: "ai-travel-planner",
    subtitle:
      "An automated full-stack itinerary generator powered by the Gemini API.",
    title: "✈️ AI Travel Planner",
    description:
      "A dynamic, full-stack web application that integrates the Gemini API to generate highly customized, multi-day travel itineraries based on user destinations, budgets, and leisure preferences.",
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
  "wordle-solver": {
    id: "wordle-solver",
    subtitle:
      "An optimized algorithmic solver designed to evaluate state spaces and solve Wordle puzzles.",
    title: "📝 Wordle Solver",
    description:
      "An intelligent puzzle-solving engine engineered to calculate optimal letter guesses. The system parses structural constraints and character frequencies to minimize the average guess count across large dictionary sets.",
    fields: [
      {
        name: "Focus",
        value: "Algorithmic Problem Solving & State Space Pruning",
      },
    ],
    tags: ["Python", "Data Structures", "Algorithms", "Git"],
    github: "https://github.com/vam-gar/wordle-guesser",
    accent: "#f1c40f",
  },
};

// ---- Education / Experience simple feeds ----
export const EDUCATION = [
  {
    school: "The University of Texas at Austin",
    detail: "Master of Science in Artificial Intelligence",
    period: "2024 — Present",
  },
  {
    school: "University of California, Santa Cruz",
    detail: "Bachelor of Science in Computer Science",
    period: "2020 — 2024",
  },
];

export type Experience = {
  org: string;
  role: string;
  bullets: string[];
};

export const EXPERIENCE: Experience[] = [
  {
    org: "CVS Health",
    role: "Software Developer",
    bullets: [
      "Developed Python RESTful APIs to integrate the OpenAI GPT-4 multimodal API into GAILE, CVS Health's internal AI assistant, and implemented feedback tracking endpoints for ratings and comments.",
      "Engineered automated Python data processing pipelines to transform and validate 53,000+ monthly healthcare records, maximizing reporting accuracy and data integrity.",
    ],
  },
  {
    org: "SVAYO",
    role: "Artificial Intelligence / Machine Learning Intern",
    bullets: [
      "Built and fine-tuned YOLO and CNN-based deep learning models using PyTorch and TensorFlow to automate object detection with 92% accuracy.",
      "Led iterative model evaluations and hyperparameter optimization, successfully reducing false positive detections by 15%.",
    ],
  },
];
