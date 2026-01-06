import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";
import clsx from "clsx";
import { PostHogProvider, WindowProvider, WindowContainer, WindowControls, WindowInner, WindowLayoutWrapper, TerminalHeaderTitle, TerminalStatusBar, TerminalPromptCentered, MinimizedPill, Waves } from "@anipotts/ui";

const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: "updates | ani potts",
  description: "Changelog and development velocity",
  openGraph: { title: "updates | ani potts", description: "Changelog and updates", url: "https://updates.anipotts.com", siteName: "updates.anipotts.com", type: "website" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={clsx(jetbrainsMono.variable, "dark")}>
      <body className="relative min-h-screen antialiased text-foreground bg-transparent font-mono selection:bg-accent-400/20 selection:text-accent-400 overflow-x-hidden">
        <div className="fixed inset-0 -z-10 min-h-[100svh] bg-background">
          <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-gray-900/40 via-background to-background pointer-events-none" />
          <div className="absolute inset-0 z-10 opacity-[0.03] bg-noise pointer-events-none mix-blend-overlay" />
          <div className="hidden md:block absolute inset-0 z-20 opacity-30 pointer-events-none">
            <Waves lineColor="rgba(167, 139, 250, 0.96)" backgroundColor="transparent" waveSpeedX={0.02} waveSpeedY={0.01} waveAmpX={40} waveAmpY={20} friction={0.9} tension={0.01} maxCursorMove={120} xGap={12} yGap={36} />
          </div>
        </div>
        <PostHogProvider>
          <WindowProvider>
            <WindowLayoutWrapper>
              <WindowContainer>
                <div className="flex items-center justify-between px-4 py-2 bg-white/5 border-b border-white/5 select-none">
                  <div className="flex items-center gap-2"><WindowControls /><TerminalHeaderTitle defaultTitle="updates.anipotts.com" /></div>
                  <div className="text-[10px] md:text-xs text-gray-600 font-mono">zsh</div>
                </div>
                <WindowInner showNavbar={false} showFooter={false}>{children}</WindowInner>
                <TerminalStatusBar />
              </WindowContainer>
              <TerminalPromptCentered /><MinimizedPill />
            </WindowLayoutWrapper>
          </WindowProvider>
        </PostHogProvider>
      </body>
    </html>
  );
}
