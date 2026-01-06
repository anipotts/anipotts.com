import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";
import clsx from "clsx";
import {
  PostHogProvider,
  WindowProvider,
  WindowContainer,
  WindowControls,
  WindowInner,
  WindowLayoutWrapper,
  TerminalHeaderTitle,
  TerminalStatusBar,
  TerminalPromptCentered,
  MinimizedPill,
  Waves,
} from "@anipotts/ui";
import { AdminProvider } from "@/context/AdminContext";

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "thoughts | ani potts",
  description: "Technical writings and reflections from ani potts",
  openGraph: {
    title: "thoughts | ani potts",
    description: "Technical writings and reflections from ani potts",
    url: "https://thoughts.anipotts.com",
    siteName: "thoughts.anipotts.com",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "thoughts | ani potts",
    description: "Technical writings and reflections from ani potts",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={clsx(jetbrainsMono.variable, "dark")}>
      <body className="relative min-h-screen antialiased text-foreground bg-transparent font-mono selection:bg-accent-400/20 selection:text-accent-400 overflow-x-hidden">

        {/* Fixed Background Container */}
        <div className="fixed inset-0 -z-10 min-h-[100svh] bg-background">
          {/* Ambient Background Effects */}
          <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-gray-900/40 via-background to-background pointer-events-none" />
          <div className="absolute inset-0 z-10 opacity-[0.03] bg-noise pointer-events-none mix-blend-overlay" />

          {/* Waves Animation */}
          <div className="hidden md:block absolute inset-0 z-20 opacity-30 pointer-events-none">
            <Waves
              lineColor="rgba(167, 139, 250, 0.96)"
              backgroundColor="transparent"
              waveSpeedX={0.02}
              waveSpeedY={0.01}
              waveAmpX={40}
              waveAmpY={20}
              friction={0.9}
              tension={0.01}
              maxCursorMove={120}
              xGap={12}
              yGap={36}
            />
          </div>
        </div>

        <PostHogProvider>
          <AdminProvider>
            <WindowProvider>
            <WindowLayoutWrapper>

              {/* Dynamic Window Container */}
              <WindowContainer>

                {/* Terminal Header Bar */}
                <div className="flex items-center justify-between px-4 py-2 bg-white/5 border-b border-white/5 select-none">
                  <div className="flex items-center gap-2">
                    <WindowControls />
                    <TerminalHeaderTitle defaultTitle="thoughts.anipotts.com" />
                  </div>
                  <div className="text-[10px] md:text-xs text-gray-600 font-mono">
                    zsh
                  </div>
                </div>

                {/* Terminal Body */}
                <WindowInner showNavbar={false} showFooter={false}>
                  <nav className="flex items-center justify-between py-4 px-2 border-b border-white/5 mb-8">
                    <a href="https://anipotts.com" className="text-xs uppercase tracking-widest text-gray-500 hover:text-accent-400 transition-colors">
                      ani potts
                    </a>
                    <div className="flex items-center gap-4">
                      <a href="/" className="text-xs uppercase tracking-widest text-accent-400">
                        thoughts
                      </a>
                      <a href="/admin" className="text-xs uppercase tracking-widest text-gray-500 hover:text-accent-400 transition-colors">
                        admin
                      </a>
                    </div>
                  </nav>
                  {children}
                </WindowInner>

                {/* Terminal Status Bar */}
                <TerminalStatusBar />
              </WindowContainer>

              {/* Collapsed/Minimized States */}
              <TerminalPromptCentered />
              <MinimizedPill />

            </WindowLayoutWrapper>
          </WindowProvider>
          </AdminProvider>
        </PostHogProvider>
      </body>
    </html>
  );
}
