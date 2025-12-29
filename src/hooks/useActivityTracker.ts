"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { usePathname } from "next/navigation";

export interface PageVisit {
  path: string;
  name: string;
  startTime: number;
  totalTime: number;
}

export interface ActivityMetrics {
  scrollSpeed: number;
  pagesVisited: PageVisit[];
  timeOnSite: number;
  projectsExpanded: number;
  currentPage: string;
}

const getPageName = (path: string): string => {
  if (path === "/") return "index";
  return path.slice(1).replace(/\//g, "_") || "index";
};

export function useActivityTracker() {
  const pathname = usePathname();
  const startTimeRef = useRef<number>(Date.now());
  const scrollSpeedRef = useRef<number>(0);
  const lastScrollY = useRef<number>(0);
  const lastScrollTime = useRef<number>(Date.now());

  const [metrics, setMetrics] = useState<ActivityMetrics>({
    scrollSpeed: 0,
    pagesVisited: [],
    timeOnSite: 0,
    projectsExpanded: 0,
    currentPage: pathname,
  });

  // Track scroll speed
  useEffect(() => {
    let animationFrame: number;
    let decayInterval: NodeJS.Timeout;

    const handleScroll = () => {
      const now = Date.now();
      const deltaY = Math.abs(window.scrollY - lastScrollY.current);
      const deltaTime = now - lastScrollTime.current;

      if (deltaTime > 0) {
        // Calculate speed (pixels per second), normalized to 0-100
        const speed = Math.min((deltaY / deltaTime) * 100, 100);
        scrollSpeedRef.current = Math.max(scrollSpeedRef.current, speed);
      }

      lastScrollY.current = window.scrollY;
      lastScrollTime.current = now;
    };

    // Decay scroll speed over time
    decayInterval = setInterval(() => {
      scrollSpeedRef.current = Math.max(0, scrollSpeedRef.current * 0.9);
      setMetrics((prev) => ({
        ...prev,
        scrollSpeed: Math.round(scrollSpeedRef.current),
      }));
    }, 100);

    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleScroll);
      clearInterval(decayInterval);
      if (animationFrame) cancelAnimationFrame(animationFrame);
    };
  }, []);

  // Track page visits
  useEffect(() => {
    setMetrics((prev) => {
      const existingIndex = prev.pagesVisited.findIndex(
        (p) => p.path === pathname
      );

      if (existingIndex === -1) {
        // New page visit
        return {
          ...prev,
          currentPage: pathname,
          pagesVisited: [
            ...prev.pagesVisited,
            {
              path: pathname,
              name: getPageName(pathname),
              startTime: Date.now(),
              totalTime: 0,
            },
          ],
        };
      } else {
        // Returning to existing page
        const updated = [...prev.pagesVisited];
        updated[existingIndex] = {
          ...updated[existingIndex],
          startTime: Date.now(),
        };
        return {
          ...prev,
          currentPage: pathname,
          pagesVisited: updated,
        };
      }
    });

    // Update time on previous page when leaving
    return () => {
      setMetrics((prev) => {
        const currentIndex = prev.pagesVisited.findIndex(
          (p) => p.path === pathname
        );
        if (currentIndex !== -1) {
          const updated = [...prev.pagesVisited];
          const elapsed = Date.now() - updated[currentIndex].startTime;
          updated[currentIndex] = {
            ...updated[currentIndex],
            totalTime: updated[currentIndex].totalTime + elapsed,
          };
          return { ...prev, pagesVisited: updated };
        }
        return prev;
      });
    };
  }, [pathname]);

  // Track time on site
  useEffect(() => {
    const interval = setInterval(() => {
      setMetrics((prev) => ({
        ...prev,
        timeOnSite: Math.floor((Date.now() - startTimeRef.current) / 1000),
      }));
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Increment projects expanded (called externally)
  const incrementProjectsExpanded = useCallback(() => {
    setMetrics((prev) => ({
      ...prev,
      projectsExpanded: prev.projectsExpanded + 1,
    }));
  }, []);

  return { metrics, incrementProjectsExpanded };
}
