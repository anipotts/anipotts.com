import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import clsx from "clsx";
import { PostHogProvider } from "@/components/PostHogProvider";
import { AdminProvider } from "@/context/AdminContext";
import AdminOverlay from "@/components/admin/AdminOverlay";

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
      <PostHogProvider>
        <AdminProvider>
          <body className="antialiased min-h-screen flex flex-col items-center bg-background text-foreground selection:bg-accent-400/20 selection:text-accent-400 font-mono overflow-x-hidden">
            
            {/* Ambient Background Effects */}
            <div className="fixed inset-0 z-[-1] bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-gray-900/40 via-background to-background pointer-events-none" />
            <div className="fixed inset-0 z-[-1] opacity-[0.03] bg-noise pointer-events-none mix-blend-overlay" />

            <div className="w-full min-h-screen p-2 md:p-8 lg:p-16 flex justify-center items-start md:items-center">
              
              {/* Terminal Window Frame */}
              <div className="w-full max-w-4xl bg-[#0a0a0a] border border-white/10 rounded-lg shadow-2xl flex flex-col relative overflow-hidden ring-1 ring-white/5">
                
                {/* Terminal Header Bar */}
                <div className="flex items-center justify-between px-4 py-2 bg-white/5 border-b border-white/5 select-none">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1.5">
                      <div className="w-3 h-3 rounded-full bg-red-500/20 border border-red-500/50" />
                      <div className="w-3 h-3 rounded-full bg-yellow-500/20 border border-yellow-500/50" />
                      <div className="w-3 h-3 rounded-full bg-green-500/20 border border-green-500/50" />
                    </div>
                    <span className="ml-3 text-[10px] md:text-xs text-gray-500 font-medium tracking-wide">
                      ani@nyc:~/anipotts.com
                    </span>
                  </div>
                  <div className="text-[10px] md:text-xs text-gray-600 font-mono">
                    zsh • v1.0.0
                  </div>
                </div>

                {/* Terminal Body */}
                <div className="px-6 md:px-12 lg:px-16 flex flex-col min-h-[calc(100vh-8rem)] bg-black/40 relative">
                  
                  {/* Navbar as Command Row */}
                  <div className="relative z-10">
                    <Navbar />
                  </div>

                  {/* Main Content Area */}
                  <main className="flex-grow w-full relative z-10">
                    {children}
                  </main>

                  {/* Footer as System Status */}
                  <div className="relative z-10 mt-auto pt-12">
                    <div className="border-t border-white/5 pt-4 mb-8 flex justify-between items-center text-[10px] uppercase tracking-widest text-gray-600">
                      <span>status: online</span>
                      <span>mode: portfolio</span>
                    </div>
                    <Footer />
                  </div>

                  {/* Subtle Grid Overlay inside terminal body */}
                  <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none opacity-20" />
                </div>
              </div>
            </div>
            
            <AdminOverlay />
          </body>
        </AdminProvider>
      </PostHogProvider>
    </html>
  );
}
