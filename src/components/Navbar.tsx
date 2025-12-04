"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import posthog from "posthog-js";

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
    <nav className="w-full flex flex-col md:flex-row md:items-center justify-between md:gap-28 py-8 md:py-12 mb-8 md:mb-16">
      <Link href="/" className="text-lg font-bold tracking-tight whitespace-nowrap text-gray-100 hover:text-accent-400 transition-colors duration-300 mb-4 md:mb-0 font-heading">
        ani potts
      </Link>
      
      <div className="flex w-full justify-between items-center md:flex-wrap gap-6 text-sm font-medium tracking-wide">
        {navItems.map((item) => {
          const isActive = pathname === item.path;
          return (
            <Link
              key={item.path}
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
          );
        })}
      </div>
    </nav>
  );
}
