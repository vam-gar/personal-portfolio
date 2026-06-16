import type { Config } from "tailwindcss";
import typography from "@tailwindcss/typography";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        discord: {
          server: "#1e1f22", // Server sidebar
          sidebar: "#2b2d31", // Channel / members sidebar
          chat: "#313338", // Main chat feed
          input: "#383a40", // Chat input / highlights
          blurple: "#5865f2", // Accent
          green: "#23a55a", // Online status
          text: "#dbdee1",
          muted: "#949ba4",
          bright: "#f2f3f5",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [typography],
};

export default config;
