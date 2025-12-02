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
      "Rebuilt PGI’s static site into a TypeScript PWA backed by Postgres, aggregating RSS feeds and cutting manual research overhead. Gives analysts mobile access to curated event signals.",
    year: "2025",
    category: "quant",
    role: "Chief Tech Officer",
    duration: "Fall 2025",
    tags: ["Next.js", "TypeScript", "Postgres", "TailwindCSS", "RSS"],
  },
  {
    slug: "chainedchat",
    title: "ChainedChat",
    subtitle: "Multi-LLM workflow orchestration platform.",
    description:
      "Built a full-stack app to intuitively chat with multiple LLMs, caching shared context to cut redundant token usage.",
    year: "2025",
    category: "ai",
    role: "Founder",
    duration: "Summer 2025",
    tags: ["Next.js", "TypeScript", "Convex", "LangGraph", "Stripe", "TailwindCSS"],
    links: {
      live: "https://chained.chat",
      repo: "https://github.com/…"  
    },
  },
  {
    slug: "underground-artist-ig-analytics",
    title: "IG Analytics Tool",
    subtitle: "Track viral posts from potential artists.",
    description:
      "Automated daily scraping of +3k Instagram artists with robust retry logic, normalizing post, comment, and follower deltas into SQLite + streamlit dashboard.",
    year: "2024",
    category: "music",
    role: "Software Engineer",
    duration: "Spring 2025",
    tags: ["Python", "Streamlit", "SQLite", "Instaloader", "Pandas"],
  },
  {
    slug: "habittracker-obh",
    title: "Our Bad Habit Artist Scouting Platform",
    subtitle: "Cross-platform artist growth tracking for Atlantic Records venture.",
    description:
      "Built a Python + Streamlit tool aggregating Chartmetric, YouTube, TikTok, and Instagram signals to help A&R teams scout campaign-ready artists in targeted regions. Implemented geo-based matching to highlight cities where artists were gaining traction.",
    year: "2024",
    category: "music",
    role: "Data Engineering Intern",
    duration: "Summer 2024",
    tags: ["Python", "Streamlit", "SQL", "APIs", "Data Pipelines"],
  },
  {
    slug: "dada-digital-frontends",
    title: "DADA Digital Client Frontend Fixes",
    subtitle: "Rapid frontend fixes and conversion-focused UI improvements.",
    description:
      "Shipped fast production updates for SMB client sites by debugging vague UI issues, improving cross-device responsiveness, and implementing custom JavaScript CTAs. Clarified conversion flows and tightened SEO structure under tight deadlines.",
    year: "2024",
    category: "product",
    role: "Client Facing Frontend Developer",
    duration: "Fall 2024",
    tags: ["JavaScript", "TypeScript", "React", "HTML", "CSS", "SEO"],
  },
  {
    slug: "quantercise",
    title: "Quantercise",
    subtitle: "Full-stack quant trading interview practice platform.",
    description:
      "Built a MERN-based quant interview prep platform with spaced repetition, calendar integrations, and personal analytics. Implemented CRUD, auth, dashboards, and job application tracking to help students prepare systematically for quant roles.",
    year: "2023",
    category: "quant",
    role: "Full-Stack Developer",
    duration: "Fall 2023",
    tags: ["MongoDB", "Express", "React", "Node.js", "REST APIs", "TailwindCSS"],
  },
  {
    slug: "options-pricing-sensitivity",
    title: "Options Pricing and Sensitivity Analysis Tool",
    subtitle: "Black–Scholes and binomial option pricing with volatility sweeps.",
    description:
      "Developed a Python tool to price European options using both Black–Scholes and binomial models, then analyze how prices move across volatility regimes. Outputs tabulated results to help understand Greeks and model behavior for different parameters.",
    year: "2023",
    category: "quant",
    role: "Quant Developer",
    duration: "Spring 2023",
    tags: ["Python", "NumPy", "Pandas", "Quantitative Finance"],
    links: {
      repo: "https://github.com/anirudhp15/Options-Pricing-and-Sensitivity-Analysis-Tool",
    },
  },
];
