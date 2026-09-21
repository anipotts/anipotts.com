export type NavItem = {
  href: string;
  label: string;
  status: string;
  group:
    "home" | "work" | "content" | "life" | "knowledge" | "system" | "website";
  description: string;
  icon:
    | "work"
    | "content"
    | "life"
    | "knowledge"
    | "locations"
    | "search"
    | "system"
    | "fleet"
    | "deploy"
    | "repo"
    | "proof"
    | "handoff"
    | "edit"
    | "review"
    | "draft"
    | "media"
    | "newsletter"
    | "health"
    | "aesthetics";
  parent?: string;
  mobile?: boolean;
};

export type QueueRow = {
  title: string;
  owner: string;
  status: string;
  evidence: string;
};

export const navItems: NavItem[] = [
  {
    href: "/work?view=now",
    label: "Work",
    status: "now",
    group: "work",
    description: "current execution, waiting, proof, and lineage",
    icon: "work",
    mobile: true,
  },
  {
    href: "/work?view=projects",
    label: "Projects",
    status: "view",
    group: "work",
    description: "work grouped by project",
    icon: "repo",
    parent: "work",
  },
  {
    href: "/work?view=history",
    label: "History",
    status: "view",
    group: "work",
    description: "recently completed and preserved work",
    icon: "handoff",
    parent: "work",
  },
  {
    href: "/content",
    label: "Website",
    status: "workspace",
    group: "website",
    description: "Website content and private writing drafts",
    icon: "content",
  },
  {
    href: "/content/review",
    label: "Legacy content diagnostics",
    status: "content",
    group: "content",
    description: "Retained D1 content review; separate from the Website editor",
    icon: "review",
  },
  {
    href: "/content/carousels",
    label: "Carousels",
    status: "media",
    group: "content",
    description: "carousel sets and export review",
    icon: "media",
    parent: "content",
  },
  {
    href: "/content/preview",
    label: "Preview",
    status: "content",
    group: "content",
    description: "draft preview surfaces",
    icon: "review",
    parent: "content",
  },
  {
    href: "/content/drafts",
    label: "Drafts",
    status: "content",
    group: "content",
    description: "saved draft operations and publish state",
    icon: "draft",
    parent: "content",
  },
  {
    href: "/content/operations",
    label: "History",
    status: "content",
    group: "content",
    description: "draft operation metadata",
    icon: "handoff",
    parent: "content",
  },
  {
    href: "/life",
    label: "Personal",
    status: "status",
    group: "life",
    description: "quiet personal overview",
    icon: "life",
    mobile: true,
  },
  {
    href: "/life/health",
    label: "Health",
    status: "status",
    group: "life",
    description: "status-only health visibility",
    icon: "health",
    parent: "life",
  },
  {
    href: "/life/aesthetics",
    label: "Aesthetics",
    status: "shell",
    group: "life",
    description: "wardrobe, outfits, looks, and references",
    icon: "aesthetics",
    parent: "life",
  },
  {
    href: "/knowledge",
    label: "Knowledge",
    status: "index",
    group: "knowledge",
    description: "current context and source proof",
    icon: "knowledge",
    mobile: true,
  },
  {
    href: "/knowledge?kind=people",
    label: "People",
    status: "index",
    group: "knowledge",
    description: "people and current relationships",
    icon: "search",
    parent: "knowledge",
  },
  {
    href: "/knowledge/locations",
    label: "Locations",
    status: "map",
    group: "knowledge",
    description: "fleet topology and known places",
    icon: "locations",
    parent: "knowledge",
  },
  {
    href: "/system",
    label: "System",
    status: "status",
    group: "system",
    description: "service status, proof, and gates",
    icon: "system",
    mobile: true,
  },
  {
    href: "/operations/observability",
    label: "Observability",
    status: "coverage",
    group: "system",
    description: "System service status, read-only",
    icon: "system",
    parent: "system",
  },
  {
    href: "/proof",
    label: "Proof",
    status: "passkeys",
    group: "system",
    description: "auth, proof, and blocked checks",
    icon: "proof",
    parent: "system",
  },
  {
    href: "/ops/destructive",
    label: "Gates",
    status: "gated",
    group: "system",
    description: "delete, dns, auth, deploy, secrets",
    icon: "proof",
    parent: "system",
  },
];

/** Gate records rendered by /ops/destructive. */
export const mutationRows: QueueRow[] = [
  {
    title: "remove Cloudflare Access",
    owner: "admin auth",
    status: "requires verified authentication proof",
    evidence:
      "Required: verify app-native authentication and blocking before changing Access",
  },
  {
    title: "publish content edits",
    owner: "content admin",
    status: "requires draft review and approval",
    evidence:
      "Required: approved private revision, Git-backed publication and release verification",
  },
];

export function routeTitle(pathname: string): string {
  if (pathname.startsWith("/content/edit/")) return "Writing editor";

  const match =
    navItems.find((item) => item.href === pathname) ??
    [...navItems]
      .sort((a, b) => b.href.length - a.href.length)
      .find(
        (item) => item.href !== "/" && pathname.startsWith(`${item.href}/`),
      );
  return match?.label ?? "Admin";
}
