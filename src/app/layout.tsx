import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import clsx from "clsx";
import { PostHogProvider } from "@/components/PostHogProvider";
import { AdminProvider } from "@/context/AdminContext";
import AdminOverlay from "@/components/admin/AdminOverlay";
import Waves from "@/components/Waves";
import { WindowProvider } from "@/context/WindowContext";
import WindowContainer from "@/components/window/WindowContainer";
import WindowControls from "@/components/window/WindowControls";
import TerminalPromptCentered from "@/components/window/TerminalPromptCentered";
import MinimizedPill from "@/components/window/MinimizedPill";
import WindowInner from "@/components/window/WindowInner";
import WindowLayoutWrapper from "@/components/window/WindowLayoutWrapper";
import TerminalHeaderTitle from "@/components/window/TerminalHeaderTitle";

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Ani Potts",
  description: "ani@nyc:~/anipotts.com",
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
          <div className="absolute inset-0 z-20 opacity-30 pointer-events-none">
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
                      <TerminalHeaderTitle />
                    </div>
                    <div className="text-[10px] md:text-xs text-gray-600 font-mono">
                      zsh • v3.0.1
                    </div>
                  </div>

                  {/* Terminal Body with Navbar/Footer handling */}
                  <WindowInner>
                    {children}
                  </WindowInner>

                  {/* Terminal Status Bar */}
                  <div className="border-t border-white/10 bg-white/5 px-4 py-1.5 flex justify-between items-center text-[10px] font-mono text-gray-500 select-none">
                    <div className="flex gap-4">
                      <span>NORMAL</span>
                      <span>main</span>
                      <span>utf-8</span>
                    </div>
                    <div className="flex gap-4">
                      <span>100%</span>
                      <span>ln 1, col 1</span>
                    </div>
                  </div>
                </WindowContainer>

                {/* Collapsed/Minimized States */}
                <TerminalPromptCentered />
                <MinimizedPill />

              </WindowLayoutWrapper>
              
              <AdminOverlay />
            </WindowProvider>
          </AdminProvider>
        </PostHogProvider>
      </body>
    </html>
  );
}
