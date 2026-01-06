"use client";

import Link from "next/link";
import posthog from "posthog-js";
import ViewCounter from "@/components/ViewCounter";

interface Thought {
  slug: string;
  title: string;
  summary: string;
  tags?: string | string[];
  created_at: string;
  views?: number;
}

export default function ThoughtLink({ thought }: { thought: Thought }) {
  const handleClick = () => {
    posthog.capture('thought_clicked', {
      thought_slug: thought.slug,
      thought_title: thought.title,
    });
  };

  return (
    <Link href={`/thoughts/${thought.slug}`} className="group block" onClick={handleClick}>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-baseline">
        <div className="md:col-span-2 flex flex-col gap-2">
          <h2 className="text-xl font-bold text-gray-200 group-hover:text-accent-400 transition-colors">
            {thought.title}
          </h2>
          <p className="text-gray-400 leading-relaxed line-clamp-2 text-sm md:text-base">
            {thought.summary}
          </p>
          {thought.tags && (
            <div className="flex gap-2 mt-1">
              {(Array.isArray(thought.tags) ? thought.tags : (typeof thought.tags === 'string' ? thought.tags.split(',') : [])).map((tag: string) => (
                <span key={tag} className="text-[10px] uppercase tracking-wider text-accent-400 border border-accent-400/20 px-2 py-1 rounded-sm">
                  {tag.trim()}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="md:col-span-1 md:text-right flex flex-col md:items-end gap-1">
          <span className="text-xs text-gray-500 uppercase tracking-wide">
            {new Date(thought.created_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
          </span>
          <ViewCounter slug={thought.slug} initialViews={thought.views} />
        </div>
      </div>
    </Link>
  );
}
