"use client";

// Column 3 — the main chat canvas. Header + scrollable feed (switch on
// activeChannel) + fixed bottom message box.

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import {
  CHANNEL_BY_ID,
  EDUCATION,
  EXPERIENCE,
  PROJECTS,
  SKILLS,
} from "@/lib/data";

// A single entry in the live vamsi-bot conversation.
type ChatEntry = {
  id: number;
  role: "user" | "bot";
  text: string;
  time: string;
  typing?: boolean;
};

// Format a Date as "Today at H:MM AM/PM" (e.g. "Today at 12:51 PM").
function formatChatTime(date: Date): string {
  let hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const period = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  if (hours === 0) hours = 12;
  return `Today at ${hours}:${minutes} ${period}`;
}

// Client-only current time. Returns null on the server / first render so the
// markup matches, then fills in after mount to avoid hydration mismatches.
function useNow(): string | null {
  const [now, setNow] = useState<string | null>(null);
  useEffect(() => {
    setNow(formatChatTime(new Date()));
  }, []);
  return now;
}

type Props = {
  activeChannel: string;
  onOpenNav?: () => void;
};

export default function ChatCanvas({ activeChannel, onOpenNav }: Props) {
  const channel = CHANNEL_BY_ID[activeChannel];
  // Project channels can override the displayed name while routing stays on id.
  const label =
    PROJECTS[activeChannel]?.displayName ?? channel?.label ?? activeChannel;

  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const idRef = useRef(0);
  const feedRef = useRef<HTMLDivElement>(null);

  // Keep the feed pinned to the newest message.
  useEffect(() => {
    const el = feedRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;

    const userId = ++idRef.current;
    const botId = ++idRef.current;
    const time = formatChatTime(new Date());

    // Snapshot prior turns (excluding the typing placeholder) for context.
    const history = messages
      .filter((m) => !m.typing)
      .map((m) => ({ role: m.role, text: m.text }));

    setMessages((prev) => [
      ...prev,
      { id: userId, role: "user", text, time },
      { id: botId, role: "bot", text: "", time, typing: true },
    ]);
    setInput("");
    setSending(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history }),
      });
      const data = await res.json().catch(() => ({}));
      const reply =
        res.ok && data.reply
          ? data.reply
          : data.error ||
            "Sorry, something went wrong. Please try again in a moment.";
      setMessages((prev) =>
        prev.map((m) =>
          m.id === botId ? { ...m, typing: false, text: reply } : m
        )
      );
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === botId
            ? {
                ...m,
                typing: false,
                text: "⚠️ I couldn't reach the server. Please try again.",
              }
            : m
        )
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <main className="flex h-full min-w-0 flex-1 flex-col bg-discord-chat">
      {/* Header status bar */}
      <header className="flex h-12 flex-shrink-0 items-center gap-2 px-4 shadow-[0_1px_0_rgba(0,0,0,0.3)]">
        {/* Mobile-only: open the channel navigation drawer */}
        <button
          onClick={onOpenNav}
          aria-label="Open channels"
          className="-ml-1 mr-1 flex h-8 w-8 items-center justify-center rounded text-discord-muted hover:bg-[#35373c] hover:text-white md:hidden"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <span className="text-2xl font-semibold leading-none text-discord-muted">
          #
        </span>
        <h2 className="font-semibold text-white">{label}</h2>
        <span className="mx-1 h-6 w-px bg-[#3f4147]" />
        <p className="truncate text-sm text-discord-muted">
          {headerSubtitle(activeChannel)}
        </p>
      </header>

      {/* Scrollable feed: channel content + live bot conversation */}
      <div
        ref={feedRef}
        className="discord-scroll flex-1 overflow-y-auto px-4 py-6"
      >
        {renderChannel(activeChannel)}
        {messages.length > 0 && (
          <div className="mt-2">
            {messages.map((m) =>
              m.role === "user" ? (
                <UserMessage key={m.id} text={m.text} time={m.time} />
              ) : (
                <BotMessage
                  key={m.id}
                  text={m.text}
                  time={m.time}
                  typing={m.typing}
                />
              )
            )}
          </div>
        )}
      </div>

      {/* Fixed bottom message box — wired to vamsi-bot */}
      <div className="flex-shrink-0 px-4 pb-6 pt-1">
        <form
          onSubmit={handleSubmit}
          className="flex items-center gap-3 rounded-lg bg-discord-input px-4 py-3"
        >
          <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-discord-muted text-lg font-bold leading-none text-discord-input">
            +
          </span>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={sending}
            placeholder={
              sending ? "vamsi-bot is replying…" : `Message #${label}`
            }
            className="w-full bg-transparent text-[15px] text-discord-text placeholder-discord-muted focus:outline-none disabled:opacity-60"
          />
        </form>
      </div>
    </main>
  );
}

// ---------- live conversation message rows ----------
function UserMessage({ text, time }: { text: string; time: string }) {
  return (
    <div className="flex gap-4 px-1 py-2">
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-discord-green text-sm font-bold text-white">
        You
      </div>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2">
          <span className="font-semibold text-white">You</span>
          <span className="text-xs text-discord-muted">{time}</span>
        </p>
        <div className="mt-1 whitespace-pre-wrap break-words text-[15px] leading-relaxed text-discord-text">
          {text}
        </div>
      </div>
    </div>
  );
}

function BotMessage({
  text,
  time,
  typing,
}: {
  text: string;
  time: string;
  typing?: boolean;
}) {
  return (
    <div className="flex gap-4 px-1 py-2">
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-discord-blurple text-sm font-bold text-white">
        VB
      </div>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2">
          <span className="font-semibold text-white">vamsi-bot</span>
          <span className="rounded bg-discord-blurple px-1 py-[1px] text-[10px] font-bold uppercase leading-none text-white">
            Bot
          </span>
          <span className="text-xs text-discord-muted">{time}</span>
        </p>
        {typing ? (
          <div className="mt-1 text-[15px] leading-relaxed">
            <span className="italic text-discord-muted">
              💬 vamsi-bot is typing...
            </span>
          </div>
        ) : (
          <div className="prose prose-invert mt-1 max-w-none break-words text-sm leading-relaxed prose-headings:text-white prose-p:my-1 prose-strong:text-white prose-a:text-discord-blurple prose-ul:my-1 prose-li:my-0.5 marker:text-discord-muted">
            <ReactMarkdown>{text}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}

function headerSubtitle(id: string): string {
  switch (id) {
    case "welcome":
      return "Start here — get to know me.";
    case "education":
      return "My academic timeline and background.";
    case "experience":
      return "My professional software engineering timeline.";
    case "skills":
      return "My technical stack, core frameworks, and development libraries.";
    case "contact-form":
      return "Send me a message.";
    default:
      return PROJECTS[id]?.subtitle ?? "";
  }
}

// ---- The conditional switch that swaps the feed body ----
function renderChannel(id: string) {
  switch (id) {
    case "welcome":
      return <WelcomeMessage />;
    case "skills":
      return <SkillsPrintout />;
    case "education":
      return <EducationFeed />;
    case "experience":
      return <ExperienceFeed />;
    case "ucsc-chess-engine":
    case "ai-travel-planner":
    case "wordle-solver":
      return <ProjectEmbed id={id} />;
    case "contact-form":
      return <ContactForm />;
    default:
      return <WelcomeMessage />;
  }
}

// ---------- Reusable chat message shell ----------
function ChatMessage({
  children,
  time = "Today at 9:41 AM",
}: {
  children: React.ReactNode;
  time?: string | null;
}) {
  return (
    <div className="flex gap-4 px-1 py-2">
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-discord-blurple text-sm font-bold text-white">
        VG
      </div>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2">
          <span className="font-semibold text-white">Vamsi_Garlapati</span>
          <span
            className="text-xs text-discord-muted"
            suppressHydrationWarning
          >
            {time}
          </span>
        </p>
        <div className="mt-1 break-words text-[15px] leading-relaxed text-discord-text">
          {children}
        </div>
      </div>
    </div>
  );
}

// ---------- welcome ----------
function WelcomeMessage() {
  const now = useNow();

  return (
    <div>
      {/* Channel base start — top of the scroll */}
      <div className="px-1">
        <div className="flex h-[68px] w-[68px] items-center justify-center rounded-full bg-discord-input">
          <span className="text-5xl font-bold leading-none text-discord-muted">
            #
          </span>
        </div>
        <h1 className="mt-4 text-3xl font-bold text-white">
          Welcome to # welcome-read-me!
        </h1>
        <p className="mt-1 text-discord-muted">
          This is the start of the #welcome-read-me channel created by Vamsi
          Garlapati.
        </p>
      </div>

      {/* Full-width divider across the center pane */}
      <div className="my-6 border-t border-[#3f4147]" />

      {/* Main bio message block with dynamic timestamp */}
      <ChatMessage time={now}>
        <p>
          Hey, I&apos;m{" "}
          <span className="font-semibold text-white">Vamsi Garlapati</span>. I
          love building things on the internet, exploring new technologies, and
          shipping projects that people enjoy using.
        </p>

        <div className="mt-4">
          <p className="font-semibold text-white">🗺️ Server Guide:</p>
          <ul className="mt-2 list-disc space-y-1 pl-6 marker:text-discord-muted">
            <li>
              Click on{" "}
              <span className="text-discord-blurple">#🎓-education</span> and{" "}
              <span className="text-discord-blurple">#💼-experience</span> to
              view my credentials.
            </li>
            <li>
              Check out{" "}
              <span className="text-discord-blurple">#🛠-skills</span> to view
              my primary technical stack.
            </li>
            <li>
              Explore the{" "}
              <span className="font-semibold text-white">SHOWCASE</span> category
              channels to audit my top 3 core engineering projects.
            </li>
          </ul>
        </div>

        <div className="mt-4">
          <p className="font-semibold text-white">🔗 Quick Links:</p>
          <ul className="mt-2 list-disc space-y-1 pl-6 marker:text-discord-muted">
            <li>
              <span className="font-semibold text-white">LinkedIn:</span>{" "}
              <a
                href="https://www.linkedin.com/in/vamsi-garlapati/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-discord-blurple hover:underline"
              >
                https://www.linkedin.com/in/vamsi-garlapati/
              </a>
            </li>
            <li>
              <span className="font-semibold text-white">GitHub:</span>{" "}
              <a
                href="https://github.com/vam-gar"
                target="_blank"
                rel="noopener noreferrer"
                className="text-discord-blurple hover:underline"
              >
                https://github.com/vam-gar
              </a>
            </li>
          </ul>
        </div>

        <p className="mt-4 text-discord-muted">
          Got a question? Type it directly into the console message input box
          below to interact with my online vamsi-bot!
        </p>
      </ChatMessage>
    </div>
  );
}

// ---------- skills (text printout grid) ----------
function SkillsPrintout() {
  const now = useNow();

  return (
    <div>
      <ChannelStart name="skills" />
      <ChatMessage time={now}>
        <p className="mb-3">
          Here&apos;s my current toolkit — running diagnostics... ✅
        </p>
        <div className="overflow-hidden rounded-md border border-black/20 bg-[#2b2d31] font-mono text-sm">
          <div className="border-b border-black/30 bg-black/20 px-4 py-2 text-xs uppercase tracking-wider text-discord-muted">
            ~/VAMSI/SKILLS.TXT
          </div>
          <div className="grid grid-cols-2 gap-4 p-4 lg:grid-cols-4">
            {SKILLS.map((group) => (
              <div key={group.group} className="min-w-0">
                <p className="mb-2 font-semibold text-discord-blurple">
                  {group.group}/
                </p>
                <ul className="space-y-1">
                  {group.items.map((item) => (
                    <li
                      key={item}
                      className="flex gap-2 text-discord-text"
                    >
                      <span className="text-discord-green">&gt;</span>
                      <span className="break-words">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </ChatMessage>
    </div>
  );
}

// ---------- reusable channel base-start header ----------
function ChannelStart({ name }: { name: string }) {
  return (
    <>
      <div className="px-1">
        <div className="flex h-[68px] w-[68px] items-center justify-center rounded-full bg-discord-input">
          <span className="text-5xl font-bold leading-none text-discord-muted">
            #
          </span>
        </div>
        <h1 className="mt-4 text-3xl font-bold text-white">
          Welcome to # {name}!
        </h1>
        <p className="mt-1 text-discord-muted">
          This is the start of the #{name} channel.
        </p>
      </div>
      <div className="my-6 border-t border-[#3f4147]" />
    </>
  );
}

// ---------- education ----------
function EducationFeed() {
  const now = useNow();

  return (
    <div>
      <ChannelStart name="education" />
      <ChatMessage time={now}>
        <p className="mb-3">🎓 My academic background:</p>
        <div className="space-y-3">
          {EDUCATION.map((e) => (
            <div key={e.school} className="rounded-md bg-[#2b2d31] px-4 py-3">
              <p className="font-semibold text-white">{e.school}</p>
              <p className="text-discord-text">{e.detail}</p>
              <p className="text-xs text-discord-muted">{e.period}</p>
            </div>
          ))}
        </div>
      </ChatMessage>
    </div>
  );
}

// ---------- experience ----------
function ExperienceFeed() {
  const now = useNow();

  return (
    <div>
      <ChannelStart name="experience" />
      <ChatMessage time={now}>
        <p className="mb-3">💼 Where I&apos;ve been building:</p>
        <div className="space-y-3">
          {EXPERIENCE.map((x) => (
            <div key={x.org} className="rounded-md bg-[#2b2d31] px-4 py-3">
              <p className="font-semibold text-white">{x.org}</p>
              <p className="text-discord-text">{x.role}</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-discord-text marker:text-discord-muted">
                {x.bullets.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </ChatMessage>
    </div>
  );
}

// ---------- project rich embed ----------
function ProjectEmbed({ id }: { id: string }) {
  const now = useNow();
  const project = PROJECTS[id];
  if (!project) return <WelcomeMessage />;

  return (
    <div>
      <ChannelStart name={project.displayName ?? id} />
      <ChatMessage time={now}>
        <p className="mb-2">Check out this project 👇</p>
        {/* Rich embed card with thick left accent border */}
        <div
          className="max-w-lg overflow-hidden rounded-[4px] border-l-4 bg-[#2b2d31] p-4"
          style={{ borderLeftColor: project.accent ?? "#5865f2" }}
        >
          <p className="text-base font-semibold text-white">{project.title}</p>
          <p className="mt-2 text-sm leading-relaxed text-discord-text">
            {project.description}
          </p>

          <div className="mt-3 grid grid-cols-2 gap-3">
            {project.fields.map((f) => (
              <div key={f.name}>
                <p className="text-xs font-bold uppercase tracking-wide text-white">
                  {f.name}
                </p>
                <p className="text-sm text-discord-text">{f.value}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {project.tags.map((t) => (
              <span
                key={t}
                className="rounded bg-discord-input px-2 py-1 text-xs font-medium text-discord-text"
              >
                {t}
              </span>
            ))}
          </div>

          {project.github && (
            <a
              href={project.github}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-2 rounded bg-discord-blurple px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#4752c4]"
            >
              <span>🔗</span> View on GitHub
            </a>
          )}
        </div>
      </ChatMessage>
    </div>
  );
}

// ---------- contact form (Discord popup-style module) ----------

// Formspree endpoint that forwards submissions to vagarlapati@gmail.com.
// Set NEXT_PUBLIC_FORMSPREE_ENDPOINT in .env.local to your form's URL.
const FORMSPREE_ENDPOINT =
  process.env.NEXT_PUBLIC_FORMSPREE_ENDPOINT ??
  "https://formspree.io/f/your-form-id";

type SubmitStatus = "idle" | "sending" | "sent" | "error";

function ContactForm() {
  const now = useNow();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<SubmitStatus>("idle");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !message || status === "sending") return;

    setStatus("sending");
    try {
      const res = await fetch(FORMSPREE_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          name,
          email,
          message,
          _replyto: email,
          _subject: `Portfolio contact from ${name}`,
        }),
      });

      if (res.ok) {
        setName("");
        setEmail("");
        setMessage("");
        setStatus("sent");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  };

  const sending = status === "sending";

  return (
    <ChatMessage time={now}>
      <p className="mb-3">📨 Want to reach out? Fill out the form below:</p>

      <div className="max-w-md rounded-md bg-[#2b2d31] p-5">
        {status === "sent" ? (
          // Discord webhook-style success notification
          <div className="rounded-md border-l-4 border-discord-green bg-[#2b2d31] p-4">
            <p className="font-semibold text-white">
              ✅ Message received successfully!
            </p>
            <p className="mt-1 text-sm leading-relaxed text-discord-text">
              Thanks for reaching out—I&apos;ll get back to you via email
              shortly.
            </p>
            <button
              onClick={() => setStatus("idle")}
              className="mt-3 text-sm text-discord-blurple hover:underline"
            >
              Send another
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <FormField label="Name">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                required
                disabled={sending}
                className="discord-field"
              />
            </FormField>
            <FormField label="Email">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                disabled={sending}
                className="discord-field"
              />
            </FormField>
            <FormField label="Message">
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="What's on your mind?"
                rows={3}
                required
                disabled={sending}
                className="discord-field resize-none"
              />
            </FormField>

            {status === "error" && (
              <p className="mb-2 text-sm text-[#f23f43]">
                Something went wrong — please try again or email me directly.
              </p>
            )}

            <button
              type="submit"
              disabled={sending}
              className="mt-2 w-full rounded bg-discord-blurple px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#4752c4] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {sending ? "Sending..." : "Send Message"}
            </button>
          </form>
        )}
      </div>

      {/* local field styling */}
      <style jsx>{`
        :global(.discord-field) {
          width: 100%;
          border-radius: 4px;
          background-color: #1e1f22;
          padding: 0.6rem 0.75rem;
          font-size: 14px;
          color: #dbdee1;
          outline: none;
          border: 1px solid transparent;
        }
        :global(.discord-field:focus) {
          border-color: #5865f2;
        }
        :global(.discord-field::placeholder) {
          color: #6d7178;
        }
      `}</style>
    </ChatMessage>
  );
}

function FormField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-3">
      <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-discord-muted">
        {label}
      </label>
      {children}
    </div>
  );
}
