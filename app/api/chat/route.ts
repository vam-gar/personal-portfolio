import { NextRequest, NextResponse } from "next/server";

// Grounding instruction for vamsi-bot. Kept verbatim so the model is
// strictly scoped to Vamsi's professional profile.
const SYSTEM_INSTRUCTION = `You are vamsi-bot, a professional AI assistant built natively inside Vamsi Garlapati's Discord-styled portfolio website. Your purpose is to answer questions from recruiters and hiring managers about Vamsi's professional background.

CORE RESTRICTION: You are strictly allowed to answer questions regarding Vamsi's skills, experiences, academic history, and projects. If a user asks a question entirely unrelated to Vamsi's professional profile (e.g., general coding challenges, recipes, sports, or trivia), you must politely refuse to answer, guiding them back to his portfolio metrics.

EXACT PROFILE CONTEXT: Use these exact details to formulate your answers:

• EDUCATION:
  - The University of Texas at Austin: Master of Science in Artificial Intelligence (2024 — Present)
  - University of California, Santa Cruz: Bachelor of Science in Computer Science (2020 — 2024)

• WORK EXPERIENCE:
  - CVS Health (Software Developer): Developed Python RESTful APIs to integrate the OpenAI GPT-4 multimodal API into GAILE, CVS Health's internal AI assistant, and implemented feedback tracking endpoints for ratings and comments. Engineered automated Python data processing pipelines to transform and validate 53,000+ monthly healthcare records, maximizing reporting accuracy and data integrity.
  - SVAYO (Artificial Intelligence / Machine Learning Intern): Built and fine-tuned YOLO and CNN-based deep learning models using PyTorch and TensorFlow to automate object detection with 92% accuracy. Led iterative model evaluations and hyperparameter optimization, successfully reducing false positive detections by 15%.

• FEATURED SHOWCASE PROJECTS:
  - UCSC Chess Engine: A full-stack chess platform that lets UCSC students compete in ranked matches and play against an AI opponent powered by the minimax algorithm with adjustable difficulty levels. (Built with Python, Flask, React.js, Node.js, Express.js, MongoDB).
  - AI Travel Planner: A dynamic, full-stack web application that leverages LLM orchestration to generate highly customized, multi-day travel itineraries based on user destinations, budgets, and leisure preferences. (Built with Python, Flask, React.js, Node.js, OpenAI API, Tailwind CSS).
  - Wordle Algorithmic Solver: An intelligent puzzle-solving engine engineered to calculate optimal letter guesses. The system parses structural constraints and character frequencies to minimize the average guess count across large dictionary sets. (Built with Python, Data Structures, Algorithms, Git).

• TECHNICAL TOOLKIT:
  - Languages: Python, TypeScript, JavaScript, C++, C, Java, SQL, HTML/CSS
  - Frameworks & Web: React, Next.js, Node.js, Flask, FastAPI, RESTful APIs
  - AI & Data Libraries: PyTorch, TensorFlow, Keras, YOLO, CNNs, OpenAI GPT-4 API, Gemini API, Claude API, NumPy, Pandas
  - Developer Tools & Data: Web Scraping (Playwright), Data Pipelines, PostgreSQL, Docker, Git, Linux, Azure, Postman

GUARDRAIL POLICY: If a query is off-topic, respond with a variation of: 'I am only configured to answer questions regarding Vamsi's professional background, technical skills, and engineering projects. Please feel free to ask about his experiences at CVS Health, his current MS AI program at UT Austin, or his featured showcase applications!'`;

const MODEL = "gemini-2.5-flash";

type HistoryItem = { role: "user" | "bot"; text: string };

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Server is missing GEMINI_API_KEY. Add it to .env.local." },
      { status: 500 }
    );
  }

  let message: string;
  let history: HistoryItem[] = [];
  try {
    const body = await req.json();
    message = (body?.message ?? "").toString();
    if (Array.isArray(body?.history)) history = body.history;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!message.trim()) {
    return NextResponse.json({ error: "Empty message." }, { status: 400 });
  }

  // Build multi-turn context: prior history + the new user message.
  const contents = [
    ...history
      .filter((h) => h && h.text)
      .map((h) => ({
        role: h.role === "bot" ? "model" : "user",
        parts: [{ text: h.text }],
      })),
    { role: "user", parts: [{ text: message }] },
  ];

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

  try {
    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Authenticate via the dedicated header so the AQ.-prefixed token is
        // parsed as an API key (avoids gateway multi-credential 400 errors).
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
        contents,
        generationConfig: {
          temperature: 1.0,
          max_output_tokens: 2048,
        },
      }),
    });

    if (!r.ok) {
      const detail = await r.text();
      console.error("Gemini API error:", r.status, detail);

      // Surface rate-limit (429) clearly instead of a generic error, including
      // the suggested retry delay when Gemini provides one.
      if (r.status === 429) {
        const retry = detail.match(/retry in ([\d.]+)s/i)?.[1];
        const secs = retry ? Math.ceil(Number(retry)) : null;
        return NextResponse.json(
          {
            error: secs
              ? `⏳ vamsi-bot is rate-limited right now. Please try again in about ${secs}s.`
              : "⏳ vamsi-bot is rate-limited right now. Please try again in a moment.",
          },
          { status: 429 }
        );
      }

      return NextResponse.json(
        { error: "The model service returned an error. Please try again." },
        { status: 502 }
      );
    }

    const data = await r.json();
    const reply: string =
      data?.candidates?.[0]?.content?.parts
        ?.map((p: { text?: string }) => p.text ?? "")
        .join("")
        .trim() || "Sorry, I couldn't generate a response just now.";

    return NextResponse.json({ reply });
  } catch (err) {
    console.error("Gemini request failed:", err);
    return NextResponse.json(
      { error: "Could not reach the model service." },
      { status: 502 }
    );
  }
}
