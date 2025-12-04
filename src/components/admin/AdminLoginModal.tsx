"use client";
import { useState } from "react";
import { useAdmin } from "@/context/AdminContext";
import posthog from "posthog-js";

export default function AdminLoginModal() {
  const { login } = useAdmin();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    posthog.capture('admin_login_attempted');

    try {
      const res = await login(password);
      if (!res.success) {
        setError(res.error || "Invalid password");
        posthog.capture('admin_login_failed', { error: res.error });
      }
    } catch (err) {
      setError("An unexpected error occurred");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md bg-black/80 backdrop-blur-xl border border-white/10 p-8 rounded-2xl shadow-2xl">
      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <div className="flex flex-col gap-4 text-center border-b border-white/10 pb-6 mb-2">
          <div className="flex flex-col gap-1 font-mono text-xs text-gray-500 uppercase tracking-widest">
            <span>System Access</span>
            <span>ani@nyc</span>
          </div>
          <div className="font-mono text-[10px] text-gray-600">
            uptime: {Math.floor(process.uptime() || 0)}s
          </div>
        </div>
        
        <div className="flex flex-col gap-2">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••••••"
            className="bg-white/5 border border-white/10 p-3 rounded-lg text-gray-200 focus:border-accent-400 outline-none text-center tracking-widest transition-colors"
            autoFocus
          />
          {error && <p className="text-red-400 text-xs text-center">{error}</p>}
        </div>

        <button 
          type="submit" 
          disabled={loading}
          className="bg-accent-400 text-black font-bold py-3 rounded-lg hover:bg-accent-400/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-accent-400/20"
        >
          {loading ? "Verifying..." : "Authenticate"}
        </button>
      </form>
    </div>
  );
}
