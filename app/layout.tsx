import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vamsi's Hub — Portfolio",
  description: "A Discord-style portfolio for Vamsi Garlapati.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-discord-server text-discord-text antialiased">
        {children}
      </body>
    </html>
  );
}
