import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
  type RefObject,
} from "react";
import { AppsSDKUIProvider } from "@openai/apps-sdk-ui/components/AppsSDKUIProvider";
import { Menu } from "@openai/apps-sdk-ui/components/Menu";
import type { AdminColorMode } from "../../lib/openai-theme";
import "../../styles/openai.css";
import "./openai-workspace.css";

const AdminUIContext = createContext<{
  enabled: boolean;
  mode: AdminColorMode;
}>({ enabled: false, mode: "light" });
export function useOpenAIUI() {
  return useContext(AdminUIContext).enabled;
}
export function useAdminTheme() {
  return useContext(AdminUIContext).mode;
}

export function AdminUIProvider({
  enabled,
  mode = "system",
  children,
}: {
  enabled: boolean;
  mode?: AdminColorMode | "system";
  children: ReactNode;
}) {
  const [system, setSystem] = useState<AdminColorMode>("light");
  useEffect(() => {
    if (mode !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => setSystem(media.matches ? "dark" : "light");
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, [mode]);
  const resolved = mode === "system" ? system : mode;
  return (
    <AdminUIContext.Provider value={{ enabled, mode: resolved }}>
      {enabled ? (
        <AppsSDKUIProvider linkComponent="a">
          <div
            data-admin-ui="openai"
            data-theme={resolved}
            className="admin-openai-boundary"
          >
            {children}
          </div>
        </AppsSDKUIProvider>
      ) : (
        children
      )}
    </AdminUIContext.Provider>
  );
}

type PortalOwner = {
  element: RefObject<HTMLDivElement | null>;
  parent: PortalOwner | null;
};
const AdminPortalOwner = createContext<PortalOwner | null>(null);

/** SDK 0.2.2 Menu does not expose a portal container. Mark only the owned
 * portal ancestors before paint so its surface inherits the scoped tokens.
 * Never mark body or a legacy sibling; clean up when this content unmounts. */
export function AdminPortalScope({
  children,
  portalContent = false,
}: {
  children: ReactNode;
  /** Only SDK menu content owns a body portal that may need relocation. */
  portalContent?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { enabled, mode } = useContext(AdminUIContext);
  const parent = useContext(AdminPortalOwner);
  const owner = useMemo(() => ({ element: ref, parent }), [parent]);
  useLayoutEffect(() => {
    if (!enabled || !portalContent || !ref.current) return;
    // Native modal dialogs make body portals inert, regardless of z-index.
    // React ancestry identifies this menu's owner even through nested portals.
    let ancestor = parent;
    let dialog: HTMLDialogElement | null = null;
    while (ancestor && !dialog) {
      dialog =
        ancestor.element.current?.closest<HTMLDialogElement>("dialog[open]") ??
        null;
      ancestor = ancestor.parent;
    }
    // Never move an existing dialog or a portal another modal already owns.
    if (!dialog || ref.current.closest("dialog")) return;
    let portal: HTMLElement = ref.current;
    while (portal.parentElement && portal.parentElement !== document.body)
      portal = portal.parentElement;
    if (portal.parentElement !== document.body) return;
    const container = portal.parentElement;
    const next = portal.nextSibling;
    dialog.appendChild(portal);
    // React still owns this portal under body. Restore that relationship before
    // its teardown, including an auth-lock unmount of the entire dialog.
    return () => {
      if (portal.parentElement === dialog)
        container.insertBefore(
          portal,
          next?.parentNode === container ? next : null,
        );
    };
  }, [enabled, parent, portalContent]);
  useLayoutEffect(() => {
    if (!enabled || !portalContent || !ref.current) return;
    const content =
      ref.current.closest<HTMLElement>('[role="menu"]') ?? ref.current;
    const reserveEscape = (event: KeyboardEvent) => {
      // The SDK closes its top menu from a body listener. Prevent native dialog
      // cancellation first, without stopping that listener from receiving Escape.
      if (event.key === "Escape" && !event.isComposing) event.preventDefault();
    };
    content.addEventListener("keydown", reserveEscape);
    return () => content.removeEventListener("keydown", reserveEscape);
  }, [enabled, portalContent]);
  useLayoutEffect(() => {
    if (!enabled || !ref.current) return;
    const marked: Array<{
      node: HTMLElement;
      ui: string | null;
      theme: string | null;
    }> = [];
    let node: HTMLElement | null = ref.current;
    while (
      node &&
      node !== document.body &&
      node !== document.documentElement
    ) {
      if (node.dataset.adminUi === "openai") break;
      marked.push({
        node,
        ui: node.getAttribute("data-admin-ui"),
        theme: node.getAttribute("data-theme"),
      });
      node.setAttribute("data-admin-ui", "openai");
      node.setAttribute("data-theme", mode);
      node = node.parentElement;
    }
    return () =>
      marked.forEach(({ node, ui, theme }) => {
        if (ui === null) node.removeAttribute("data-admin-ui");
        else node.setAttribute("data-admin-ui", ui);
        if (theme === null) node.removeAttribute("data-theme");
        else node.setAttribute("data-theme", theme);
      });
  }, [enabled, mode]);
  return enabled ? (
    <AdminPortalOwner.Provider value={owner}>
      <div ref={ref}>{children}</div>
    </AdminPortalOwner.Provider>
  ) : (
    children
  );
}
export function AdminMenuContent({
  children,
  ...props
}: ComponentProps<typeof Menu.Content>) {
  return (
    <Menu.Content {...props}>
      <AdminPortalScope portalContent>{children}</AdminPortalScope>
    </Menu.Content>
  );
}
