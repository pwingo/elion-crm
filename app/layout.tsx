import type { Metadata } from "next";
import { Providers } from "./providers";
import { Nav } from "@/components/Nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Elion Outreach",
  description: "AI-powered outreach campaign management",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased bg-white text-gray-900">
        <Providers>
          <Nav />
          <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
