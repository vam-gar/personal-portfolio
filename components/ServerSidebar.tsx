// Column 1 — fixed 72px server rail, Discord-style.

export default function ServerSidebar() {
  return (
    <nav className="flex h-full w-[72px] flex-shrink-0 flex-col items-center gap-2 bg-discord-server py-3">
      {/* Primary server / avatar pill */}
      <button
        className="group relative flex h-12 w-12 items-center justify-center rounded-[24px] bg-discord-blurple text-base font-bold text-white transition-all duration-200 ease-out hover:rounded-[16px]"
        title="Vamsi's Hub"
      >
        VG
        {/* active pill indicator */}
        <span className="absolute -left-3 h-10 w-1 rounded-r-full bg-white" />
      </button>

      <span className="my-1 h-[2px] w-8 rounded-full bg-[#35363c]" />

      {/* A couple of secondary placeholder servers for the look */}
      {["🎮", "📚"].map((icon) => (
        <button
          key={icon}
          className="flex h-12 w-12 items-center justify-center rounded-[24px] bg-discord-sidebar text-xl transition-all duration-200 ease-out hover:rounded-[16px] hover:bg-discord-blurple"
        >
          {icon}
        </button>
      ))}
    </nav>
  );
}
