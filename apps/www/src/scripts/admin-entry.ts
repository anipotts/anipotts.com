/** Presentation controls never navigate into the protected workspace. */
export function toggleEntrySidebar(button: HTMLButtonElement) {
  const shell = button.closest<HTMLElement>("[data-admin-entry]");
  if (!shell || shell.hasAttribute("inert")) return;
  const collapsed = shell.dataset.sidebarCollapsed !== "true";
  shell.dataset.sidebarCollapsed = String(collapsed);
  button.setAttribute("aria-expanded", String(!collapsed));
  const label = collapsed ? "expand sidebar" : "collapse sidebar";
  button.setAttribute("aria-label", label);
  button.title = label;
}

document.addEventListener("click", (event) => {
  if (!(event.target instanceof Element)) return;
  const button = event.target.closest<HTMLButtonElement>(
    "[data-admin-collapse]",
  );
  if (button) toggleEntrySidebar(button);
});
