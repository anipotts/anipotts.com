export type RoadmapItem = {
  text: string;
  status: "done" | "in-progress" | "planned";
};

export type TechnicalSection = {
  title: string;
  content: string;
};

export type RelatedThought = {
  slug: string;
  title: string;
};

export type ProjectContent = {
  overview: string;
  technical?: TechnicalSection[];
  roadmap?: RoadmapItem[];
  relatedThoughts?: RelatedThought[];
};

export const projectContent: Record<string, ProjectContent> = {
  quantercise: {
    overview:
      "Quantercise is a platform I built to help candidates prepare for quantitative finance interviews at firms like Jane Street, Citadel, and Two Sigma. It started as a personal study tool and evolved into a full product with 400+ problems, real-time Python execution, and a gamification system to keep users engaged.",
    technical: [
      {
        title: "Stack Evolution",
        content:
          "Started as a MERN stack app, migrated to Next.js 15 with React 19 for better DX and performance. Backend runs on AWS Lambda for sandboxed Python execution, with Aurora Postgres for problem storage. Recently completed a migration from Aurora to Neon for cost optimization and better serverless compatibility.",
      },
      {
        title: "Problem Engine",
        content:
          "Problems support 5 answer types: numeric (with tolerance), exact string matching, single-choice MCQ, multi-choice MCQ, and Python coding challenges. Answer specifications are stored server-side only to prevent cheating. The grading system runs entirely on Lambda with isolated execution contexts.",
      },
      {
        title: "Editor & Math Rendering",
        content:
          "Monaco Editor powers the Python coding experience with syntax highlighting and autocomplete. KaTeX handles mathematical notation rendering across all problems. Both integrate cleanly with the Next.js App Router through client components.",
      },
      {
        title: "Gamification",
        content:
          "Points system awards 10/20/30 for easy/medium/hard problems with first-attempt bonuses. Daily streak tracking with 24-hour grace period. Leaderboards support daily, weekly, and all-time periods. User stats track progress by difficulty level.",
      },
    ],
    roadmap: [
      { text: "Aurora → Neon migration", status: "done" },
      { text: "Public user profiles", status: "done" },
      { text: "Chrome extension for mental math drills", status: "done" },
      { text: "CLI for terminal-based practice", status: "in-progress" },
      { text: "Fix LaTeX parsing edge cases", status: "in-progress" },
      { text: "Polish coding problems (NumPy, SciPy)", status: "in-progress" },
      { text: "Open source core platform", status: "planned" },
      { text: "Firm-specific problem packs", status: "planned" },
    ],
    relatedThoughts: [
      // Add related blog posts here when you write them
      // { slug: "building-quantercise", title: "Building Quantercise: From Study Tool to Product" },
    ],
  },
};
