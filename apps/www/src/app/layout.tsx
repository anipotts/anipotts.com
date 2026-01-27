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
import TerminalStatusBar from "@/components/window/TerminalStatusBar";
import PersonSchema from "@/components/PersonSchema";

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL('https://anipotts.com'),
  title: {
    default: 'Ani Potts | Software Engineer',
    template: '%s | Ani Potts',
  },
  description:
    'Ani Potts (Anirudh Pottammal) is a software engineer based in NYC who builds minimal interfaces to orchestrate complex systems. NYU \'26.',
  keywords: [
    'Ani Potts',
    'Anirudh Pottammal',
    'software engineer',
    'NYC',
    'developer',
    'NYU',
  ],
  authors: [{ name: 'Ani Potts', url: 'https://anipotts.com' }],
  creator: 'Ani Potts',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://anipotts.com',
    siteName: 'Ani Potts',
    title: 'Ani Potts | Software Engineer',
    description:
      'Software engineer based in NYC who builds minimal interfaces to orchestrate complex systems.',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Ani Potts - Software Engineer',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    creator: '@anipottsbuilds',
    site: '@anipottsbuilds',
    title: 'Ani Potts | Software Engineer',
    description:
      'Software engineer based in NYC who builds minimal interfaces to orchestrate complex systems.',
    images: ['/og-image.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  alternates: {
    canonical: 'https://anipotts.com',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={clsx(jetbrainsMono.variable, "dark")}>
      <head>
        <PersonSchema />
      </head>
      <body className="relative min-h-screen antialiased text-foreground bg-transparent font-mono selection:bg-accent-400/20 selection:text-accent-400 overflow-x-hidden">

        {/* Fixed Background Container */}
        <div className="fixed inset-0 -z-10 min-h-[100svh] bg-background">
          {/* Ambient Background Effects */}
          <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-gray-900/40 via-background to-background pointer-events-none" />
          <div className="absolute inset-0 z-10 opacity-[0.03] bg-noise pointer-events-none mix-blend-overlay" />
          
          {/* Waves Animation */}
          <div className="hidden md:block absolute inset-0 z-20 opacity-30 pointer-events-none">
            <Waves
              lineColor="rgba(97, 171, 234, 0.96)"
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
                  <TerminalStatusBar />
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
