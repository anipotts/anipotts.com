"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Project } from "@/data/projects";
import Link from "next/link";
import { ChevronDown } from "lucide-react"; // We might not have lucide-react, I'll use a simple SVG or text if needed.
import posthog from "posthog-js";

export default function ProjectCard({ project }: { project: Project }) {
  const [isOpen, setIsOpen] = useState(false);

  const handleCardClick = () => {
    const newOpenState = !isOpen;
    setIsOpen(newOpenState);

    posthog.capture('project_card_clicked', {
      project_title: project.title,
      project_slug: project.slug,
      project_category: project.category,
      action: newOpenState ? 'expanded' : 'collapsed',
    });
  };

  return (
    <motion.div
      layout
      onClick={handleCardClick}
      className="group w-full cursor-pointer rounded-lg border border-white/5 bg-white/5 p-6 transition-all duration-300 hover:bg-white/10 hover:border-white/10 hover:shadow-lg hover:shadow-black/20"
      initial={{ borderRadius: 8 }}
    >
      <motion.div layout className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <motion.h3 layout="position" className="text-lg font-bold text-gray-200 group-hover:text-accent-400 transition-colors">
            {project.title}
          </motion.h3>
          <motion.p layout="position" className="text-sm text-gray-500 font-medium">
            {project.subtitle}
          </motion.p>
        </div>
        <div className="flex flex-col items-end gap-2">
           <div className="text-right text-xs uppercase tracking-wide text-gray-500 flex flex-col items-end gap-1">
            <motion.span layout="position">{project.role}</motion.span>
            <motion.span layout="position">{project.year}</motion.span>
          </div>
          <motion.div 
            layout="position"
            animate={{ rotate: isOpen ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            className="text-gray-600"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </motion.div>
        </div>
      </motion.div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, height: "auto", marginTop: 24 }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <p className="text-gray-300 text-sm leading-relaxed mb-6 border-l-2 border-white/10 pl-4">
              {project.description}
            </p>
            
            <div className="flex items-center justify-between">
              <div className="flex flex-wrap gap-2">
                {project.tags.slice(0, 3).map((tag) => (
                  <span
                    key={tag}
                    className="text-[10px] uppercase tracking-wider text-gray-500 border border-white/10 px-2 py-1 rounded-sm"
                  >
                    {tag}
                  </span>
                ))}
              </div>
              
              <Link
                href={`/work#${project.slug}`}
                className="text-xs font-bold uppercase tracking-widest text-accent-400 hover:text-accent-300 flex items-center gap-1"
                onClick={(e) => e.stopPropagation()}
              >
                {/* details */}
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
