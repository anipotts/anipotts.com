"use client";
import { useState, useEffect } from "react";
import { useAdmin } from "@/context/AdminContext";
import posthog from "posthog-js";
import { FaTerminal } from "react-icons/fa";

export default function AdminLoginModal() {
  const { login } = useAdmin();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [cursorVisible, setCursorVisible] = useState(true);

  // Blinking cursor effect
  useEffect(() => {
    const interval = setInterval(() => {
      setCursorVisible((v) => !v);
    }, 530);
    return () => clearInterval(interval);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    posthog.capture('admin_login_attempted');

    try {
      const res = await login(password);
      if (!res.success) {
        setError(res.error || "ACCESS DENIED");
        setPassword("");
        posthog.capture('admin_login_failed', { error: res.error });
      }
    } catch (err) {
      setError("SYSTEM ERROR");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-sm bg-[#0a0a0a] border border-white/10 rounded-md shadow-2xl overflow-hidden font-mono">
      {/* Terminal Header */}
      <div className="bg-white/5 border-b border-white/5 px-4 py-2 flex items-center justify-between select-none">
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500/50" />
          <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/50" />
          <div className="w-2.5 h-2.5 rounded-full bg-green-500/50" />
        </div>
        <div className="text-[10px] text-gray-500 flex items-center gap-1.5">
          <FaTerminal className="text-xs" />
          <span>admin — -zsh</span>
        </div>
        <div className="w-8" /> {/* Spacer for centering */}
      </div>

      {/* Terminal Body */}
      <div className="p-6 flex flex-col gap-4 min-h-[200px]">
        <div className="text-xs text-gray-500 leading-relaxed">
          <p>Last login: {new Date().toLocaleString()} on ttys001</p>
          <p className="mt-1">Authorized personnel only. All access attempts are logged.</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-2 mt-2">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-green-400">➜</span>
            <span className="text-blue-400">~</span>
            <span className="text-gray-400">sudo authenticate</span>
          </div>

          <div className="flex items-center gap-2 text-sm relative">
            <span className="text-gray-500">[sudo] password for ani:</span>
            <div className="relative flex-grow">
              <input
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError("");
                }}
                className="bg-transparent border-none outline-none text-transparent w-full caret-transparent absolute inset-0 z-10"
                autoFocus
                autoComplete="off"
              />
              <div className="flex items-center">
                {/* Masked password display */}
                <span className="text-gray-200 tracking-widest">
                  {"*".repeat(password.length)}
                </span>
                {/* Custom cursor */}
                <span className={`w-2 h-4 bg-gray-500 ml-0.5 ${cursorVisible ? "opacity-100" : "opacity-0"}`} />
              </div>
            </div>
          </div>

          {/* Status Output */}
          <div className="mt-2 h-6">
            {loading && (
              <span className="text-xs text-yellow-400 animate-pulse">
                Verifying credentials...
              </span>
            )}
            {error && (
              <span className="text-xs text-red-500 font-bold">
                {error}
              </span>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
