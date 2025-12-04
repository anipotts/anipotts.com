"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Project } from "@/data/projects";
import Link from "next/link";
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
      className={`group w-full cursor-pointer border-l-2 pl-4 py-2 transition-all duration-300 ${isOpen ? "border-accent-400 bg-white/5" : "border-white/10 hover:border-white/30 hover:bg-white/5"}`}
    >
      <motion.div layout className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className={`font-mono text-sm ${isOpen ? "text-accent-400" : "text-gray-500 group-hover:text-gray-300"}`}>
              {isOpen ? "[-]" : "[+]"}
            </span>
            <motion.h3 layout="position" className="text-lg font-bold text-gray-200 group-hover:text-accent-400 transition-colors">
              {project.title}
            </motion.h3>
          </div>
          <motion.p layout="position" className="text-sm text-gray-500 font-medium pl-8">
            {project.subtitle}
          </motion.p>
        </div>
        <div className="flex flex-col items-end gap-1 text-xs uppercase tracking-wide text-gray-500 font-mono">
          <motion.span layout="position">{project.role}</motion.span>
          <motion.span layout="position">{project.year}</motion.span>
        </div>
      </motion.div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, height: "auto", marginTop: 16 }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="overflow-hidden pl-8"
          >
            <p className="text-gray-300 text-sm leading-relaxed mb-4 font-mono">
              {project.description}
            </p>
            
            <div className="flex items-center justify-between">
              <div className="flex flex-wrap gap-2">
                {project.tags.slice(0, 3).map((tag) => (
                  <span
                    key={tag}
                    className="text-[10px] uppercase tracking-wider text-gray-500 border border-white/10 px-2 py-1"
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
