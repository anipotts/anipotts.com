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
  description: "Software Engineer building minimal interfaces for messy systems.",
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
          <body className="antialiased min-h-screen flex flex-col items-center bg-background text-foreground selection:bg-accent-400/20 selection:text-accent-400 font-mono">
            <div className="w-full min-h-screen p-8 md:p-16 flex justify-center">
              <div className="w-full max-w-4xl bg-gray-950/50 border border-accent-400/10 rounded-2xl shadow-2xl flex flex-col relative">
                <div className="px-6 md:px-16 flex flex-col min-h-[calc(100vh-4rem-2px)]">
                  <Navbar />
                  <main className="flex-grow w-full">
                    {children}
                  </main>
                  <Footer />
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
