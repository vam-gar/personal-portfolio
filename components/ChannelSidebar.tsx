"use client";

// Column 2 — 240px channel navigation. Clicking a channel updates activeChannel.

import { CATEGORIES } from "@/lib/data";

type Props = {
  activeChannel: string;
  onSelect: (id: string) => void;
};

export default function ChannelSidebar({ activeChannel, onSelect }: Props) {
  return (
    <div className="flex h-full w-60 flex-shrink-0 flex-col bg-discord-sidebar">
      {/* Banner header */}
      <header className="flex h-12 flex-shrink-0 items-center px-4 shadow-[0_1px_0_rgba(0,0,0,0.3)]">
        <h1 className="truncate font-semibold text-discord-bright">
          Vamsi&apos;s Hub
        </h1>
      </header>

      {/* Channel list */}
      <nav className="discord-scroll flex-1 overflow-y-auto px-2 py-3">
        {CATEGORIES.map((category) => (
          <div key={category.name} className="mb-4">
            <h2 className="px-1 pb-1 text-xs font-semibold uppercase tracking-wide text-discord-muted">
              {category.name}
            </h2>
            <ul className="space-y-[2px]">
              {category.channels.map((channel) => {
                const active = channel.id === activeChannel;
                return (
                  <li key={channel.id}>
                    <button
                      onClick={() => onSelect(channel.id)}
                      className={`group flex w-full items-center gap-2 rounded px-2 py-[6px] text-left text-[15px] transition-colors ${
                        active
                          ? "bg-discord-input text-white"
                          : "text-discord-muted hover:bg-[#35373c] hover:text-discord-text"
                      }`}
                    >
                      <span className="text-sm opacity-90">{channel.emoji}</span>
                      <span className="truncate">{channel.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* User panel footer */}
      <div className="flex h-[52px] flex-shrink-0 items-center gap-2 bg-[#232428] px-2">
        <div className="relative">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-discord-blurple text-xs font-bold text-white">
            VG
          </div>
          <span className="absolute -bottom-[1px] -right-[1px] h-3 w-3 rounded-full border-2 border-[#232428] bg-discord-green" />
        </div>
        <div className="min-w-0 leading-tight">
          <p className="truncate text-sm font-semibold text-white">
            Vamsi_Garlapati
          </p>
          <p className="truncate text-xs text-discord-muted">Online</p>
        </div>
      </div>
    </div>
  );
}
