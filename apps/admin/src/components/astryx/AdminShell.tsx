import React, { type ReactNode } from "react";
import { AppShell } from "@astryxdesign/core/AppShell";
import {
  SideNav,
  SideNavCollapseButton,
  SideNavItem,
  SideNavSection,
} from "@astryxdesign/core/SideNav";
import {
  CaretDownIcon,
  MagnifyingGlassIcon,
  MoonIcon,
  SunIcon,
  iconForNav,
} from "../admin-icons";
import type { NavItem } from "../../data/admin";

type AdminShellProps = {
  children: ReactNode;
  chrome: "admin" | "auth";
  currentRoute: string;
  deck?: string;
  hideHeader?: boolean;
  navItems: NavItem[];
  title: string;
};

const GROUPS: Array<{
  id: Exclude<NavItem["group"], "home">;
  label: string;
}> = [
  { id: "work", label: "Work" },
  { id: "knowledge", label: "Knowledge" },
  { id: "system", label: "System" },
  { id: "life", label: "Personal" },
  { id: "content", label: "Legacy content diagnostics" },
  { id: "website", label: "Website" },
];

export function AdminShell({
  children,
  chrome,
  currentRoute,
  deck,
  hideHeader = false,
  navItems,
  title,
}: AdminShellProps) {
  if (chrome === "auth") {
    return (
      <main className="admin-auth-frame">
        <section className="admin-auth-card">{children}</section>
      </main>
    );
  }

  const inbox = navItems.find((item) => item.group === "home");
  const mobileItems = navItems.filter((item) => item.mobile);

  const sideNav = (
    <SideNav
      className="admin-side-nav"
      collapsible={{ hasButton: false }}
      header={
        <div className="admin-nav-header">
          <AdminBrand />
          <button
            type="button"
            className="admin-global-search"
            data-admin-search-trigger=""
            aria-label="Search everything"
            aria-keyshortcuts="Meta+K Control+K"
            onClick={() =>
              document.dispatchEvent(new CustomEvent("admin:search"))
            }
          >
            <MagnifyingGlassIcon size={16} aria-hidden="true" />
            <span>Search anything</span>
            <kbd>⌘K</kbd>
          </button>
        </div>
      }
      footerIcons={
        <div className="admin-nav-utilities">
          <ThemeToggle />
          <SideNavCollapseButton />
        </div>
      }
    >
      {inbox ? (
        <SideNavSection title="Inbox" isHeaderHidden>
          <NavEntry item={inbox} currentRoute={currentRoute} />
        </SideNavSection>
      ) : null}
      <SideNavSection title="Admin" isHeaderHidden>
        {GROUPS.map((group) => {
          const parent = navItems.find(
            (item) => item.group === group.id && !item.parent,
          );
          const children = navItems.filter(
            (item) => item.group === group.id && item.parent,
          );
          if (!parent) return null;
          return (
            <NavEntry
              key={group.id}
              item={parent}
              currentRoute={currentRoute}
              collapsible={children.length > 0}
            >
              {children.map((item) => (
                <NavEntry
                  key={item.href}
                  item={item}
                  currentRoute={currentRoute}
                />
              ))}
            </NavEntry>
          );
        })}
      </SideNavSection>
    </SideNav>
  );

  return (
    <div className="admin-astryx-root">
      <header className="admin-mobile-topbar">
        <AdminBrand mobile />
        <details className="admin-mobile-menu">
          <summary
            aria-controls="admin-mobile-menu-panel"
            aria-label="Toggle navigation"
          >
            <CaretDownIcon size={20} aria-hidden="true" />
          </summary>
          <nav id="admin-mobile-menu-panel" aria-label="All admin destinations">
            {GROUPS.map((group) => {
              const items = navItems.filter(
                (item) => item.group === group.id && !item.mobile,
              );
              if (!items.length) return null;
              return (
                <section key={group.id} aria-label={group.label}>
                  <h2>{group.label}</h2>
                  {items.map((item) => (
                    <a
                      key={item.href}
                      href={item.href}
                      aria-current={
                        isActive(currentRoute, item.href) ? "page" : undefined
                      }
                    >
                      {item.group === "content" && !item.parent
                        ? "Review"
                        : item.label}
                    </a>
                  ))}
                </section>
              );
            })}
          </nav>
        </details>
      </header>
      <nav className="admin-mobile-nav" aria-label="Admin mobile navigation">
        {mobileItems.map((item) => {
          const Icon = iconForNav[item.icon];
          return (
            <a
              key={item.href}
              className={isActive(currentRoute, item.href) ? "is-active" : ""}
              href={item.href}
              aria-current={
                isActive(currentRoute, item.href) ? "page" : undefined
              }
            >
              <Icon size={20} weight="regular" aria-hidden="true" />
              <span>{item.label}</span>
            </a>
          );
        })}
      </nav>
      <AppShell
        variant="section"
        height="auto"
        contentPadding={0}
        mobileNav={false}
        sideNav={sideNav}
      >
        <div className="admin-page-frame">
          {!hideHeader && (
            <header className="page-header">
              <h1>{title}</h1>
              {deck ? <span>{deck}</span> : null}
            </header>
          )}
          <div className="admin-page-content">{children}</div>
        </div>
      </AppShell>
    </div>
  );
}

function NavEntry({
  item,
  currentRoute,
  collapsible = false,
  children,
}: {
  item: NavItem;
  currentRoute: string;
  collapsible?: boolean;
  children?: ReactNode;
}) {
  const Icon = iconForNav[item.icon];
  const groupIsActive = isGroupActive(currentRoute, item);
  if (collapsible) {
    const firstLabel: Record<string, string> = {
      work: "Now",
      content: "Review",
      life: "Life",
      knowledge: "All knowledge",
      system: "Overview",
    };
    return (
      <details
        className="admin-nav-group"
        data-admin-nav-group={item.group}
        open={groupIsActive}
      >
        <summary>
          <Icon size={18} weight="regular" aria-hidden="true" />
          <span>{item.label}</span>
          <CaretDownIcon
            className="admin-nav-group-caret"
            size={14}
            aria-hidden="true"
          />
        </summary>
        <div>
          <SideNavItem
            href={item.href}
            label={firstLabel[item.group] ?? item.label}
            isSelected={isActive(currentRoute, item.href)}
          />
          {children}
        </div>
      </details>
    );
  }

  return (
    <SideNavItem
      href={item.href}
      label={item.label}
      icon={<Icon size={18} weight="regular" aria-hidden="true" />}
      selectedIcon={<Icon size={18} weight="regular" aria-hidden="true" />}
      isSelected={isActive(currentRoute, item.href)}
      collapsible={false}
    >
      {children}
    </SideNavItem>
  );
}

function AdminBrand({ mobile = false }: { mobile?: boolean }) {
  return (
    <a
      href="/inbox"
      className={mobile ? "admin-mobile-brand" : "admin-brand-lockup"}
      aria-label="ani potts operations"
    >
      <span>ani potts</span>
      <span className="admin-brand-workspace">operations</span>
    </a>
  );
}

function ThemeToggle() {
  return (
    <button
      type="button"
      className="admin-theme-toggle"
      data-theme-toggle=""
      aria-label="Switch color theme"
      aria-pressed={false}
      title="Switch color theme"
    >
      <SunIcon
        className="admin-theme-icon is-light"
        size={18}
        aria-hidden="true"
      />
      <MoonIcon
        className="admin-theme-icon is-dark"
        size={18}
        aria-hidden="true"
      />
      <span className="sr-only" data-theme-label>
        switch color theme
      </span>
    </button>
  );
}

function isGroupActive(currentRoute: string, item: NavItem) {
  const pathname = currentRoute.split("?")[0];
  if (item.group === "system") {
    return [
      "/system",
      "/fleet",
      "/proof",
      "/deploys",
      "/repos",
      "/mutations",
      "/ops/destructive",
    ].some((prefix) => pathname.startsWith(prefix));
  }
  if (item.group === "work")
    return pathname === "/work" || pathname === "/handoffs";
  if (item.group === "content") return pathname.startsWith("/content/");
  return pathname.startsWith(item.href.split("?")[0]);
}

function isActive(currentRoute: string, href: string): boolean {
  const [currentPath, currentQuery = ""] = currentRoute.split("?");
  const [targetPath, targetQuery = ""] = href.split("?");
  const canonicalCurrentPath = currentPath;
  const currentParams = new URLSearchParams(currentQuery);

  if (targetQuery) {
    const targetParams = new URLSearchParams(targetQuery);
    return (
      canonicalCurrentPath === targetPath &&
      [...targetParams].every(
        ([key, value]) => currentParams.get(key) === value,
      )
    );
  }

  if (href === "/inbox") return canonicalCurrentPath === "/inbox";
  if (href === "/knowledge") {
    return canonicalCurrentPath === "/knowledge" && !currentParams.has("kind");
  }
  return canonicalCurrentPath === href;
}
