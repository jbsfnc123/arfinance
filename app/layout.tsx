import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { PREFS_SCRIPT } from "@/lib/ui/prefs-script";
import { PrefsSync } from "@/components/prefs-sync";
import "./globals.css";
import { currentWorkspace } from "@/lib/workspace-server";
import { WORKSPACES } from "@/lib/workspace";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
  preload: false, // cadangan saja: Mac/iOS memakai SF Pro, Windows memakai Segoe UI (lihat --font-sans)
});

// Judul tab mengikuti workspace (host): Finance / AR / AP Workspace.
export async function generateMetadata(): Promise<Metadata> {
  const ws = await currentWorkspace();
  return { title: `${WORKSPACES[ws].label} — Penguin`, description: WORKSPACES[ws].desc };
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="id" className={`${inter.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        {/* Tema & kepadatan dari localStorage sebelum paint pertama (tanpa kedip); atribut <html> diatur skrip ini. */}
        <script dangerouslySetInnerHTML={{ __html: PREFS_SCRIPT }} />
      </head>
      <body className="min-h-full">
        <PrefsSync />
        {children}
      </body>
    </html>
  );
}
