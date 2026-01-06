"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function ViewCounter({
  slug,
  initialViews = 0,
  className = "",
}: {
  slug: string;
  initialViews?: number;
  className?: string;
}) {
  const [views, setViews] = useState(initialViews);

  useEffect(() => {
    if (!supabase) return;

    const channel = supabase
      .channel(`thought_views:${slug}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "thoughts",
          filter: `slug=eq.${slug}`,
        },
        (payload) => {
          if (payload.new && typeof payload.new.views === "number") {
            setViews(payload.new.views);
          }
        }
      )
      .subscribe();

    return () => {
      if (supabase) supabase.removeChannel(channel);
    };
  }, [slug]);

  return (
    <span className={`font-mono text-[10px] text-gray-500 flex items-center gap-1.5 ${className}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-accent-400/40 animate-pulse" />
      {views.toLocaleString()} views
    </span>
  );
}
