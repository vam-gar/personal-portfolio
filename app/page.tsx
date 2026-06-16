"use client";

// Pinned full-screen Discord-style shell. Holds the activeChannel state and
// passes it down so clicking a channel swaps the chat feed instantly.
//
// Desktop (md+): static 4-column layout — unchanged.
// Mobile (< md): the server + channel rails slide in as an off-canvas drawer
// toggled from the chat header; the chat takes the full width.

import { useState } from "react";
import ServerSidebar from "@/components/ServerSidebar";
import ChannelSidebar from "@/components/ChannelSidebar";
import ChatCanvas from "@/components/ChatCanvas";
import MembersSidebar from "@/components/MembersSidebar";
import { DEFAULT_CHANNEL } from "@/lib/data";

export default function Home() {
  const [activeChannel, setActiveChannel] = useState<string>(DEFAULT_CHANNEL);
  const [navOpen, setNavOpen] = useState(false);

  const selectChannel = (id: string) => {
    setActiveChannel(id);
    setNavOpen(false); // close the drawer after picking a channel on mobile
  };

  return (
    <div className="fixed inset-0 flex overflow-hidden">
      {/* Mobile backdrop — tap to dismiss the drawer */}
      {navOpen && (
        <button
          aria-label="Close navigation"
          onClick={() => setNavOpen(false)}
          className="fixed inset-0 z-20 bg-black/50 md:hidden"
        />
      )}

      {/* Server + channel rails: off-canvas drawer on mobile, static on desktop */}
      <div
        className={`fixed inset-y-0 left-0 z-30 flex h-full flex-shrink-0 transition-transform duration-200 ease-out md:static md:translate-x-0 ${
          navOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <ServerSidebar />
        <ChannelSidebar activeChannel={activeChannel} onSelect={selectChannel} />
      </div>

      <ChatCanvas
        activeChannel={activeChannel}
        onOpenNav={() => setNavOpen(true)}
      />
      <MembersSidebar />
    </div>
  );
}
