# Vamsi's Hub — A Discord-Styled Portfolio

A personal portfolio for **Vamsi Garlapati** reimagined as a Discord server. Instead of a traditional scrolling page, recruiters and visitors navigate channels in a sidebar to explore education, experience, skills, and projects — and can chat with an AI assistant (**vamsi-bot**) grounded on Vamsi's real résumé.


---

## ✨ Features

- **Authentic Discord UI** — a pinned, full-screen four-column layout (server rail, channel sidebar, chat canvas, members list) styled with Discord's exact color palette.
- **Channel-based navigation** — clicking a channel instantly swaps the main feed via a local `activeChannel` state (no page reloads).
- **AI assistant — `vamsi-bot`** — a Google Gemini-powered chatbot wired into the bottom message box. It's grounded on an exact résumé context and **guardrailed** to only answer questions about Vamsi's professional background.
- **Rich content per channel** — chat-style intros, a terminal-style skills printout, Discord "rich embed" project cards (with colored accent borders), and an interactive contact form.
- **Working contact form** — submissions are delivered straight to Vamsi's inbox via Formspree, with loading/success/error states.
- **Markdown rendering** — bot responses render real formatting (bold, headings, bullet lists, links) via `react-markdown` + Tailwind Typography.
- **Dynamic timestamps** — every message shows the live local time ("Today at H:MM AM/PM"), hydration-safe.
- **Responsive** — desktop shows the full multi-column layout; on mobile the sidebars collapse into a slide-out drawer toggled from the chat header.

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | [Next.js 14](https://nextjs.org/) (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS + `@tailwindcss/typography` |
| Markdown | `react-markdown` |
| AI | Google Gemini API (`gemini-2.5-flash`) via a Next.js API route |
| Contact | Formspree |
| Hosting | Vercel (recommended) |

---

## 📁 Project Structure

```
.
├── app/
│   ├── api/
│   │   └── chat/route.ts      # Backend: Gemini API route for vamsi-bot
│   ├── globals.css            # Tailwind directives + Discord scrollbar
│   ├── layout.tsx             # Root layout & metadata
│   └── page.tsx               # Shell: holds activeChannel state + mobile drawer
├── components/
│   ├── ServerSidebar.tsx      # Column 1 — 72px server rail (avatar pill)
│   ├── ChannelSidebar.tsx     # Column 2 — channel navigation
│   ├── ChatCanvas.tsx         # Column 3 — header, feed, bot chat, input box
│   └── MembersSidebar.tsx     # Column 4 — online members + bot
├── lib/
│   └── data.ts                # SINGLE SOURCE OF TRUTH for all content
├── .env.local.example         # Template for required env vars
├── tailwind.config.ts         # Custom Discord color tokens + typography plugin
└── README.md
```

> **Want to edit content?** Almost everything — channels, skills, projects, education, experience — lives in [`lib/data.ts`](lib/data.ts). Change it there and the UI updates everywhere.

---

## 🧭 The Channels

**INFORMATION**
- `#👋-welcome-read-me` — intro message, server guide, and quick links
- `#🎓-education` — academic history (UT Austin MS AI, UC Santa Cruz BS CS)
- `#💼-experience` — work history cards (CVS Health, SVAYO)
- `#🛠-skills` — a 4-column terminal-style printout of the technical toolkit

**SHOWCASE** (each rendered as a Discord rich-embed card with a colored accent border)
- `#🚀-ucsc-chess-engine` — full-stack chess platform with a minimax AI (blurple)
- `#🚀-ai-travel-planner` — LLM-orchestrated itinerary generator (emerald)
- `#🚀-wordle-solver` — algorithmic Wordle solving engine (gold)

**INTERACT**
- `#📨-contact-form` — interactive contact form (delivers via Formspree)

---

## 🤖 vamsi-bot (AI Assistant)

The bottom message box is wired to a Gemini-powered assistant.

- **Backend:** [`app/api/chat/route.ts`](app/api/chat/route.ts) reads `GEMINI_API_KEY` server-side (never exposed to the browser), injects a detailed **system instruction** containing Vamsi's exact résumé, and forwards the conversation to Gemini.
- **Guardrails:** the model is instructed to **only** answer questions about Vamsi's skills, experience, education, and projects. Off-topic queries (recipes, trivia, etc.) get a polite redirect.
- **Multi-turn:** prior messages are sent as context so follow-up questions work.
- **Resilience:** rate-limit (HTTP 429) responses surface a clear "try again in Xs" message instead of a generic error.

The frontend ([`ChatCanvas.tsx`](components/ChatCanvas.tsx)) appends your message to the feed, shows a "💬 vamsi-bot is typing..." placeholder while fetching, then replaces it with the markdown-rendered reply — styled with the bot's blue `[BOT]` tag, avatar, and timestamp.

---

## 🚀 Getting Started (Local Development)

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment variables
Copy the example file and fill in your values:
```bash
cp .env.local.example .env.local
```
Then edit `.env.local`:
```bash
# AI assistant (Google Gemini) — get a key at https://aistudio.google.com/app/apikey
GEMINI_API_KEY=your-gemini-api-key

# Contact form (Formspree) — create a form at https://formspree.io
NEXT_PUBLIC_FORMSPREE_ENDPOINT=https://formspree.io/f/your-form-id
```

### 3. Run the dev server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000).

---

## 🔑 Environment Variables

| Variable | Required | Exposure | Purpose |
|----------|----------|----------|---------|
| `GEMINI_API_KEY` | Yes (for the bot) | **Server-only** | Authenticates the Gemini API for vamsi-bot |
| `NEXT_PUBLIC_FORMSPREE_ENDPOINT` | Yes (for contact) | Public (browser) | Formspree endpoint that forwards contact submissions |

> `.env.local` is gitignored — your secrets are **never** committed. The `NEXT_PUBLIC_` prefix intentionally exposes the Formspree URL to the browser (it's a public endpoint); the Gemini key has no such prefix and stays on the server.

---

## ☁️ Deployment (Vercel)

1. Push this repo to GitHub.
2. In [Vercel](https://vercel.com), **Add New → Project** and import the repo. Vercel auto-detects Next.js — no build config needed.
3. Before deploying, add the two environment variables (`GEMINI_API_KEY`, `NEXT_PUBLIC_FORMSPREE_ENDPOINT`) under **Settings → Environment Variables**.
4. Click **Deploy**. Every future `git push` triggers an automatic redeploy.

---

## 🎨 Color Palette

Registered as Tailwind tokens in [`tailwind.config.ts`](tailwind.config.ts):

| Token | Hex | Use |
|-------|-----|-----|
| `discord-server` | `#1e1f22` | Server rail |
| `discord-sidebar` | `#2b2d31` | Channel / members sidebar |
| `discord-chat` | `#313338` | Main chat feed |
| `discord-input` | `#383a40` | Input box / highlights |
| `discord-blurple` | `#5865f2` | Accent |
| `discord-green` | `#23a55a` | Online status |

---

## 📜 Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the local dev server |
| `npm run build` | Create an optimized production build |
| `npm run start` | Serve the production build |
| `npm run lint` | Run ESLint |

---

Built with ❤️ by Vamsi Garlapati.
