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
  links?: {
    live?: string;
    repo?: string;
  };
};

export const projects: Project[] = [
  {
    slug: "pgi-research-platform",
    title: "PGI Research Portal",
    subtitle: "Macro research platform for quants.",
    description:
      "Rebuilt PGI’s static site into a TypeScript PWA backed by Postgres, aggregating RSS feeds and cutting manual research overhead. Enables analysts to monitor macro catalysts and event signals directly from mobile.",
    year: "2025",
    category: "quant",
    role: "Chief Tech Officer",
    duration: "Fall 2025",
    tags: ["Next.js", "TypeScript", "Postgres", "TailwindCSS", "RSS"],
    links: {
      live: "https://paragoninvestments.org"
    },
  },

  {
    slug: "hebbiani",
    title: "Hebbiani",
    subtitle: "Local cross-encoder reranking (inspired by Hebbia’s Matrix).",
    description:
      "A local, MIME-agnostic playground inspired by Hebbia’s Matrix—supporting cross-encoder reranking, late-interaction token matching, and multi-document search evaluation. Designed for reproducible backend search experiments without relying on cloud inference.",
    year: "2025",
    category: "ai",
    role: "Creator",
    duration: "Winter 2025",
    tags: ["Python", "Jupyter", "Transformers", "Retrieval", "Reranking"],
    links: {
      repo: "https://github.com/anipotts/hebbiani",
    },
  },

  {
    slug: "hedgefund-cache-simulator",
    title: "Document-Scoped Cache Simulator",
    subtitle: "Caching optimization for simulated hedge-fund workflows.",
    description:
      "A simulation exploring document-scoped caching policies, TTL strategies, and eviction behavior under hedge-fund-style research workloads. Models reuse distributions, cost reduction, and latency improvements for versioned documents at scale.",
    year: "2025",
    category: "quant",
    role: "Research Engineer",
    duration: "Fall 2025",
    tags: ["Python", "NumPy", "Simulation", "Caching", "Distributed Systems"],
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
    links: {
      live: "https://chained.chat",
      repo: "https://github.com/anipotts/chained"
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
    links: {
      live: "https://nyupuritytest.com",
      repo: "https://github.com/anipotts/nyu-rice-purity"
    },
  },

  {
    slug: "mimicry",
    title: "mimicry",
    subtitle: "IG Reel script extraction + content analysis workflow tool.",
    description:
      "A TypeScript workflow tool that parses IG reels from a single link, extracts transcripts, normalizes metadata, and runs lightweight analysis to identify hooks, pacing, and content structure. Built for creators exploring what makes reels go viral.",
    year: "2024",
    category: "ai",
    role: "Engineer",
    duration: "Summer 2024",
    tags: ["TypeScript", "Next.js", "APIs", "Content Analysis"],
    links: {
      repo: "https://github.com/anipotts/mimicry"
    },
  },

  {
    slug: "underground-artist-ig-analytics",
    title: "Instagram Scraper",
    subtitle: "Tracks viral posts from 3k+ potential artists.",
    description:
      "Automated daily scraping of 3k+ Instagram artists with robust retry logic, normalizing post, comment, and follower deltas into a SQLite + Streamlit dashboard.",
    year: "2024",
    category: "music",
    role: "Software Engineer",
    duration: "Spring 2025",
    tags: ["Python", "Streamlit", "SQLite", "Instaloader", "Pandas"],
  },

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
  },

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
    links: {
      repo: "https://github.com/anirudhp15/Options-Pricing-and-Sensitivity-Analysis-Tool",
    },
  },
];
