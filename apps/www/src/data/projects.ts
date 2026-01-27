export type ProjectStatus = "live" | "in-progress" | "coming-soon";

export type Project = {
  slug: string;
  title: string;
  subtitle: string;
  description: string;
  year: string;
  category: "ai" | "product" | "quant" | "music" | "other";
  role: string;
  duration: string;
  tags: string[];
  status?: ProjectStatus; // defaults to "live" if not specified
  featured?: boolean; // for dedicated project pages
  icon?: "chrome"; // optional icon override
  links?: {
    live?: string;
    repo?: string;
    page?: string; // internal dedicated page route
  };
};

export const projects: Project[] = [
  // === FLAGSHIP PRODUCTS ===
  {
    slug: "quantercise",
    title: "Quantercise",
    subtitle: "Quant interview prep for Jane Street, Citadel, Two Sigma.",
    description:
      "400+ problems with Python code editor, KaTeX math rendering, instant grading, and gamification. Next.js 15, React 19, Postgres (Aurora → Neon migration), Lambda for sandboxed execution. Actively used by candidates targeting top trading firms.",
    year: "2024–",
    category: "product",
    role: "Founder & Engineer",
    duration: "Ongoing",
    tags: ["Next.js 15", "TypeScript", "Postgres", "AWS Lambda", "Monaco", "Stripe"],
    status: "live",
    featured: true,
    links: {
      live: "https://quantercise.com",
      page: "/projects/quantercise",
    },
  },

  {
    slug: "quantercise-extension",
    title: "Mental Math Chrome Extension",
    subtitle: "2-min timed drills for quant interview prep.",
    description:
      "Brings quantercise.com's mental math mode to the browser. Keyboard-driven, sound feedback, progress tracking. Vanilla JS, Manifest V3, zero external dependencies.",
    year: "2026",
    category: "product",
    role: "Creator",
    duration: "Winter 2026",
    tags: ["Chrome Extension", "JavaScript", "Manifest V3"],
    status: "live",
    icon: "chrome",
    links: {
      repo: "https://github.com/anipotts/quantercise-mental-math-extension",
    },
  },

  // === ACTIVE WORK ===
  {
    slug: "pgi-research-platform",
    title: "PGI Research Portal",
    subtitle: "Macro research platform for quants.",
    description:
      "Rebuilt PGI's static site into a TypeScript PWA backed by Postgres, aggregating RSS feeds and cutting manual research overhead. Enables analysts to monitor macro catalysts and event signals directly from mobile.",
    year: "2025",
    category: "quant",
    role: "Chief Tech Officer",
    duration: "2025–",
    tags: ["Next.js", "TypeScript", "Postgres", "TailwindCSS", "RSS"],
    status: "live",
    links: {
      live: "https://paragoninvestments.org",
    },
  },

  {
    slug: "chainedchat",
    title: "ChainedChat",
    subtitle: "Multi-LLM workflow orchestration platform.",
    description:
      "Built a full-stack platform for interacting with multiple LLMs in a single conversational workflow. Implements shared-context caching, multi-model routing, and intuitive UI for cost-efficient prompt chaining.",
    year: "2025",
    category: "ai",
    role: "Founder",
    duration: "Summer 2025",
    tags: ["Next.js", "TypeScript", "Convex", "LangGraph", "Stripe", "TailwindCSS"],
    status: "live",
    links: {
      live: "https://chained.chat",
      repo: "https://github.com/anipotts/chained-chat",
    },
  },

  {
    slug: "nyu-purity-test",
    title: "NYU Purity Test",
    subtitle: "A campus quiz taken by 3,000+ NYU students (200k+ visits).",
    description:
      "Designed and launched a high-traffic TypeScript web app that replicated a purity-style questionnaire tailored to NYU culture. Reached 3,000+ completions in under a week, demonstrating viral distribution and resilient client-side engineering under load.",
    year: "2024",
    category: "product",
    role: "Creator",
    duration: "Fall 2024",
    tags: ["TypeScript", "React", "Next.js", "TailwindCSS", "Analytics"],
    status: "live",
    links: {
      live: "https://nyupuritytest.com",
      repo: "https://github.com/anipotts/nyu-rice-purity",
    },
  },

  // === PROFESSIONAL EXPERIENCE ===
  {
    slug: "habittracker-obh",
    title: "Artist Scouting Dashboard",
    subtitle: "Cross-platform artist growth tracking for an Atlantic Records venture.",
    description:
      "Aggregated Chartmetric, YouTube, TikTok, and Instagram signals into a centralized scouting dashboard. Implemented geo-based artist discovery to find emerging talent in targeted campaign markets.",
    year: "2024",
    category: "music",
    role: "Data Engineering Intern",
    duration: "Summer 2024",
    tags: ["Python", "Streamlit", "SQL", "APIs", "Data Pipelines"],
    status: "live",
  },

  // === QUANT/FINANCE ===
  {
    slug: "options-pricing-sensitivity",
    title: "Options Pricing + Sensitivity Analysis",
    subtitle: "Black–Scholes and binomial pricing with volatility sweeps.",
    description:
      "Developed a Python tool to price European options using Black–Scholes and binomial models, analyzing how prices move across volatility regimes to illustrate Greeks and model behavior.",
    year: "2023",
    category: "quant",
    role: "Developer",
    duration: "Spring 2023",
    tags: ["Python", "NumPy", "Pandas", "Quantitative Finance"],
    status: "live",
    links: {
      repo: "https://github.com/anirudhp15/Options-Pricing-and-Sensitivity-Analysis-Tool",
    },
  },
];
