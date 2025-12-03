"use client";

import posthog from "posthog-js";

interface CompanyLinkProps {
  href: string;
  children: React.ReactNode;
  companyName: string;
}

export default function CompanyLink({ href, children, companyName }: CompanyLinkProps) {
  const handleClick = () => {
    posthog.capture('company_link_clicked', {
      company_name: companyName,
      href: href,
    });
  };

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-gray-200 hover:text-accent-400 font-medium underline decoration-white/30 underline-offset-4 transition-colors"
      onClick={handleClick}
    >
      {children}
    </a>
  );
}
