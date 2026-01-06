"use client";

import { useEffect, useRef } from "react";
import { incrementThoughtViews } from "@/app/thoughts/actions";

export default function IncrementView({ slug }: { slug: string }) {
  const hasIncremented = useRef(false);

  useEffect(() => {
    if (!hasIncremented.current) {
      incrementThoughtViews(slug);
      hasIncremented.current = true;
    }
  }, [slug]);

  return null;
}
