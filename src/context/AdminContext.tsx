"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { checkAuth, login as serverLogin, logout as serverLogout } from "@/app/thoughts/actions";
import posthog from "posthog-js";

interface AdminContextType {
  isAdmin: boolean;
  isModalOpen: boolean;
  toggleModal: () => void;
  login: (password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
}

const AdminContext = createContext<AdminContextType | undefined>(undefined);

export function AdminProvider({ children }: { children: ReactNode }) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    // Check auth status on mount
    checkAuth().then(setIsAdmin);

    // Global keyboard listener
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+Shift+A (Mac) or Ctrl+Shift+A (Windows/Linux)
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "a") {
        e.preventDefault();
        setIsModalOpen((prev) => !prev);
      }
      
      // Escape to close
      if (e.key === "Escape" && isModalOpen) {
        setIsModalOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isModalOpen]);

  const toggleModal = () => setIsModalOpen((prev) => !prev);

  const login = async (password: string) => {
    const res = await serverLogin(password);
    if (res.success) {
      setIsAdmin(true);
      posthog.identify('admin_user', { role: 'admin' });
      posthog.capture('admin_login_success');
    }
    return res;
  };

  const logout = async () => {
    await serverLogout();
    setIsAdmin(false);
    posthog.capture('admin_logout');
    posthog.reset();
  };

  return (
    <AdminContext.Provider value={{ isAdmin, isModalOpen, toggleModal, login, logout }}>
      {children}
    </AdminContext.Provider>
  );
}

export function useAdmin() {
  const context = useContext(AdminContext);
  if (context === undefined) {
    throw new Error("useAdmin must be used within an AdminProvider");
  }
  return context;
}
