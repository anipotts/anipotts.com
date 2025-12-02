"use client";

import { useState } from "react";
import { projects } from "@/data/projects";
import FadeIn from "@/components/FadeIn";
import StatusDot from "@/components/StatusDot";
import { motion, AnimatePresence } from "framer-motion";

const categories = ["all", "ai", "product", "quant", "music"];

export default function WorkPage() {
  const [filter, setFilter] = useState("all");

  const filteredProjects = projects.filter(p => filter === "all" || p.category === filter);

  return (
    <div className="flex flex-col gap-12 pb-20">
      <section className="grid grid-cols-1 md:grid-cols-4 gap-8 md:gap-12">
        <div className="col-span-1">
          <FadeIn>
            <h1 className="text-xs font-bold uppercase tracking-widest text-gray-500">work</h1>
          </FadeIn>
        </div>
        <div className="col-span-1 md:col-span-3 flex flex-col gap-8">
          <FadeIn delay={0.1}>
            <div className="flex flex-wrap gap-2">
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setFilter(cat)}
                  className={`px-3 py-1 text-[10px] uppercase tracking-wider rounded-sm border transition-all duration-300 ${
                    filter === cat 
                      ? "border-accent-400 text-accent-400 bg-accent-400/10" 
                      : "border-white/10 text-gray-500 hover:border-white/30 hover:text-gray-300"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </FadeIn>

          <div className="flex flex-col gap-12 mt-4">
            <AnimatePresence mode="popLayout">
              {filteredProjects.map((project) => (
                <motion.div
                  key={project.slug}
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.4 }}
                  id={project.slug}
                  className="group block"
                >
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="md:col-span-2 flex flex-col gap-2">
                      <div className="flex items-baseline justify-between md:hidden">
                        <h2 className="text-xl font-bold text-gray-200 group-hover:text-accent-400 transition-colors">
                          {project.title}
                        </h2>
                      </div>
                      <h2 className="hidden md:block text-xl font-bold text-gray-200 group-hover:text-accent-400 transition-colors">
                        {project.title}
                      </h2>
                      <p className="text-lg text-gray-300 font-medium">{project.subtitle}</p>
                      <p className="text-gray-400 leading-relaxed max-w-2xl text-sm md:text-base mt-2">
                        {project.description}
                      </p>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {project.tags.map(tag => (
                          <span key={tag} className="text-[10px] uppercase tracking-wider text-gray-500 border border-white/10 px-2 py-1 rounded-sm">
                            {tag}
                          </span>
                        ))}
                      </div>
                      {project.links && (
                        <div className="flex gap-4 mt-2 text-xs font-medium uppercase tracking-wide">
                          {project.links.live && (
                            <a href={project.links.live} target="_blank" rel="noopener noreferrer" className="text-accent-400 hover:underline hover:text-accent-300 transition-colors">
                              view project ↗
                            </a>
                          )}
                          {project.links.repo && (
                            <a href={project.links.repo} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-gray-200 transition-colors">
                              view code ↗
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="md:col-span-1 flex flex-col md:items-end text-xs text-gray-500 uppercase tracking-wide gap-1 order-first md:order-last">
                      <span>{project.year}</span>
                      <span>{project.role}</span>
                      <span className="flex items-center gap-2">
                        {project.duration === "Ongoing" && <StatusDot />}
                        {project.duration}
                      </span>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      </section>
    </div>
  );
}
