export const siteConfig = {
  name: "Ani Potts",
  fullName: "Anirudh Pottammal",
  title: "Software Engineer",
  location: "NYC",
  bio: "ani potts. previously worked on real-time agent i/o at structured ai (YC F25) and our bad habit.",
  shortBio: "ani potts, nyc",
  url: "https://anipotts.com",
  domain: "anipotts.com",
  email: "contact@anipotts.com",
  handle: "@anipottsbuilds",
  github: "anipotts",
  ogImage: "/og-image.png",
  headshot: "/images/ani-potts-headshot.png",
  version: "4.0.0",
} as const;

export const navItems = [
  { name: "writing", path: "/writing" },
  { name: "making", path: "/making" },
  { name: "orchestrating", path: "/orchestrating" },
] as const;

export const homeContent = {
  heading: "hi, i'm ani",
  summary:
    "previously worked on real-time agent i/o at structured ai (YC F25) and our bad habit, an atlantic records venture. every so often i post about my coding agent workflows, which business insider covered in a story on how work is being restructured around agents and skills.",
  proof: [
    {
      label: "structured ai",
      href: "https://getstructured.ai/",
      title: "drawing chat with page-level citations",
      detail:
        "architectural PDFs in, cited answers out. streamed claude/gemini and kept redis replay for live spectating and later debugging.",
    },
    {
      label: "quantercise",
      href: "https://quantercise.com",
      title: "quant prep with real grading",
      detail:
        "next.js, typescript, postgres, drizzle, stripe, sandboxed python, and math-heavy grading paths.",
    },
    {
      label: "paragon global investments",
      href: "https://paragoninvestments.org",
      title: "research portal for a quant fund",
      detail:
        "next.js and typescript on supabase. made fund research searchable and usable from mobile instead of buried in scattered docs.",
    },
    {
      label: "public tooling",
      href: "/projects/claude-code-tips",
      title: "tools i actually use",
      detail:
        "claude-code-tips and imessage mcp are small public receipts from the same local-first workflow i run every day.",
    },
  ],
  press: {
    href: "/writing/saturdays-are-for-claude-code",
    label: "business insider",
  },
  mentions: {
    structuredAi: {
      label: "structured ai",
      href: "https://getstructured.ai/",
      logoSrc: "/images/brand/structured-ai-favicon.png",
      logoAlt: "structured ai",
      logoTone: "white",
    },
    yCombinatorF25: {
      label: "F25",
      logoSrc: "/images/brand/ycombinator-favicon.ico",
      logoAlt: "y combinator",
    },
    badHabit: {
      label: "our bad habit",
      href: "https://ourbadhabit.com/",
      logoSrc: "/images/brand/bad-habit-favicon.png",
      logoAlt: "our bad habit",
    },
    atlanticRecords: {
      label: "atlantic records",
      href: "https://www.atlanticrecords.com/",
      logoSrc: "/images/brand/atlantic-records-logo-cropped.png",
      logoAlt: "atlantic records",
      logoShape: "wide",
    },
    businessInsider: {
      label: "business insider",
      href: "/writing/saturdays-are-for-claude-code",
      logoSrc: "/images/brand/business-insider-favicon.svg",
      logoAlt: "business insider",
    },
  },
} as const;
