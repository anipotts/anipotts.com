/** Presentation controls never navigate into the protected workspace. */
export function toggleEntrySidebar(button: HTMLButtonElement) {
  const shell = button.closest<HTMLElement>("[data-admin-entry]");
  if (!shell || shell.hasAttribute("inert")) return;
  const collapsed = shell.dataset.sidebarCollapsed !== "true";
  shell.dataset.sidebarCollapsed = String(collapsed);
  button.setAttribute("aria-expanded", String(!collapsed));
}

export function bindEntrySidebar() {
  for (const button of document.querySelectorAll<HTMLButtonElement>(
    "[data-admin-collapse]",
  )) {
    // Rebind safely after navigation or development hot updates.
    button.onclick = () => toggleEntrySidebar(button);
    button.dataset.entryControlsBound = "true";
  }
}
bindEntrySidebar();
document.addEventListener("astro:page-load", bindEntrySidebar);
