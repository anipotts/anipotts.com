import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
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

/** SDK 0.2.2 Menu does not expose a portal container. Mark only the owned
 * portal ancestors before paint so its surface inherits the scoped tokens.
 * Never mark body or a legacy sibling; clean up when this content unmounts. */
export function AdminPortalScope({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const { enabled, mode } = useContext(AdminUIContext);
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
  return enabled ? <div ref={ref}>{children}</div> : children;
}
export function AdminMenuContent({
  children,
  ...props
}: ComponentProps<typeof Menu.Content>) {
  return (
    <Menu.Content {...props}>
      <AdminPortalScope>{children}</AdminPortalScope>
    </Menu.Content>
  );
}
