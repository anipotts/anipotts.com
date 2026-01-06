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
    <div
      onClick={handleCardClick}
      className={`
        group w-full cursor-pointer border-l-2 pl-4 pr-4 transition-all duration-300 ease-in-out
        ${isOpen 
          ? "py-6 border-accent-400 bg-white/[0.03] rounded-r-xl" 
          : "py-3 border-white/10 hover:border-white/30 hover:bg-white/[0.02]"
        }
      `}
    >
      <div className="flex justify-between items-start">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 font-mono text-sm">
            <span className={isOpen ? "text-accent-400" : "text-gray-500 group-hover:text-gray-300"}>
              {isOpen ? "[-]" : "[+]"}
            </span>
            <h3 className={`font-bold ${isOpen ? "text-gray-100" : "text-gray-300 group-hover:text-gray-100"}`}>
              {project.title}
            </h3>
          </div>
          <p className="text-xs text-gray-500 pl-6">{project.subtitle}</p>
        </div>
        <span className="text-xs text-gray-600 font-mono">{project.year}</span>
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="pl-6 pt-6 pb-2 flex flex-col gap-6">
              <p className="text-sm text-gray-300 leading-relaxed max-w-2xl border-l border-white/10 pl-4">
                {project.description}
              </p>
              
              <div className="flex flex-wrap gap-2">
                {project.tags.map((tag) => (
                  <span key={tag} className="text-[10px] uppercase tracking-wider text-gray-500 bg-white/5 px-2 py-1 rounded-sm">
                    {tag}
                  </span>
                ))}
              </div>

              {(project.links?.live || project.links?.repo) && (
                <div className="flex gap-4 text-xs font-mono pt-2">
                  {project.links.live && (
                    <a 
                      href={project.links.live}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent-400 hover:underline decoration-accent-400/30 underline-offset-4"
                      onClick={(e) => e.stopPropagation()}
                    >
                      ./launch_site.sh
                    </a>
                  )}
                  {project.links.repo && (
                    <a 
                      href={project.links.repo}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-gray-400 hover:text-gray-200 hover:underline decoration-white/30 underline-offset-4"
                      onClick={(e) => e.stopPropagation()}
                    >
                      ./view_source.git
                    </a>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
