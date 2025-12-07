"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import posthog from "posthog-js";
import { motion } from "framer-motion";

const navItems = [
  { name: "index", path: "/" },
  { name: "work", path: "/work" },
  { name: "thoughts", path: "/thoughts" },
  { name: "connect", path: "/connect" },
];

export default function Navbar() {
  const pathname = usePathname();

  const handleNavClick = (item: { name: string; path: string }) => {
    posthog.capture('nav_link_clicked', {
      link_name: item.name,
      link_path: item.path,
      from_path: pathname,
    });
  };

  return (
    <nav className="w-full flex flex-col md:flex-row md:items-center justify-between md:gap-28 py-8 md:py-12 gap-6 md:mb-16">
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      >
        <Link href="/" className="text-lg font-bold tracking-tight whitespace-nowrap text-accent-400 hover:text-accent-400/80 transition-colors duration-300 mb-10 md:mb-0 font-heading">
          ani potts
        </Link>
      </motion.div>
      
      <div className="flex w-full justify-between items-center md:flex-wrap gap-6 text-sm font-medium tracking-wide">
        {navItems.map((item, index) => {
          const isActive = pathname === item.path;
          return (
            <motion.div
              key={item.path}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1, ease: "easeOut" }}
            >
              <Link
                href={item.path}
                onClick={() => handleNavClick(item)}
                className={`transition-colors duration-300 ${
                  isActive
                    ? "text-gray-200 underline decoration-white/30 underline-offset-4 hover:text-accent-400"
                    : "text-gray-400 hover:text-gray-200"
                }`}
              >
                {item.name}
              </Link>
            </motion.div>
          );
        })}
      </div>
    </nav>
  );
}
