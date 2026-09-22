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

// The retired console pages were the only operational entries. The shell
// palette indexes the sidebar destinations instead.
export const navItems: NavItem[] = [];

export function routeTitle(pathname: string): string {
  return pathname.startsWith("/content/edit/") ? "Writing editor" : "Admin";
}
