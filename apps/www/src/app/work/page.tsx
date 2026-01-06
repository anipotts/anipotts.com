"use client";

import { useState } from "react";
import { projects } from "@/data/projects";
import FadeIn from "@/components/FadeIn";
import ProjectCard from "@/components/ProjectCard";
import { motion, AnimatePresence } from "framer-motion";
import posthog from "posthog-js";

const categories = ["all", "ai", "product", "quant", "music"];

export default function WorkPage() {
  const [filter, setFilter] = useState("all");

  const filteredProjects = projects.filter(p => filter === "all" || p.category === filter);

  const handleCategoryFilter = (category: string) => {
    setFilter(category);
    posthog.capture('work_category_filtered', {
      category: category,
      results_count: projects.filter(p => category === "all" || p.category === category).length,
    });
  };

  return (
    <div className="flex flex-col gap-12 pb-20">
      <section className="grid grid-cols-1 md:grid-cols-4 gap-8 md:gap-12">
        <div className="col-span-1">
          <FadeIn>
            <h1 className="text-xs font-bold uppercase tracking-widest text-accent-400">work</h1>
          </FadeIn>
        </div>
        <div className="col-span-1 md:col-span-3 flex flex-col gap-8">
          <FadeIn delay={0.1}>
            <div className="flex flex-wrap gap-2">
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => handleCategoryFilter(cat)}
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

          <div className="flex flex-col gap-6 mt-4">
            <AnimatePresence mode="popLayout">
              {filteredProjects.map((project) => (
                <motion.div
                  key={project.slug}
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.4 }}
                >
                  <ProjectCard project={project} />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      </section>
    </div>
  );
}
