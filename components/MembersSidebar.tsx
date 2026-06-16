// Column 4 — 240px online members list.

export default function MembersSidebar() {
  return (
    <aside className="hidden h-full w-60 flex-shrink-0 flex-col bg-discord-sidebar lg:flex">
      <div className="discord-scroll flex-1 overflow-y-auto px-4 py-4">
        {/* ONLINE group */}
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-discord-muted">
          Online — 1
        </h2>
        <MemberRow
          initials="VG"
          name="Vamsi_Garlapati"
          status="Playing: MS AI at UT Austin"
          badgeColor="bg-discord-green"
        />

        {/* BOTS group */}
        <h2 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-discord-muted">
          Bots — 1
        </h2>
        <MemberRow
          initials="VB"
          name="vamsi-bot"
          status="Listening to your prompts"
          badgeColor="bg-discord-green"
          bot
        />
      </div>
    </aside>
  );
}

function MemberRow({
  initials,
  name,
  status,
  badgeColor,
  bot = false,
}: {
  initials: string;
  name: string;
  status: string;
  badgeColor: string;
  bot?: boolean;
}) {
  return (
    <button className="group flex w-full items-center gap-3 rounded px-2 py-1.5 text-left transition-colors hover:bg-[#35373c]">
      <div className="relative flex-shrink-0">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-discord-blurple text-xs font-bold text-white">
          {initials}
        </div>
        <span
          className={`absolute -bottom-[1px] -right-[1px] h-3 w-3 rounded-full border-2 border-discord-sidebar ${badgeColor} group-hover:border-[#35373c]`}
        />
      </div>
      <div className="min-w-0 leading-tight">
        <p className="flex items-center gap-1.5 truncate text-[15px] font-medium text-discord-text">
          {name}
          {bot && (
            <span className="rounded bg-discord-blurple px-1 py-[1px] text-[10px] font-bold uppercase leading-none text-white">
              Bot
            </span>
          )}
        </p>
        <p className="truncate text-xs text-discord-muted">{status}</p>
      </div>
    </button>
  );
}
