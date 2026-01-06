"use client";

import { useState } from "react";
import { login } from "../actions";
import posthog from "posthog-js";

export default function LoginForm() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    posthog.capture('admin_login_attempted');

    const res = await login(password);
    if (res.success) {
      posthog.identify('admin_user', {
        role: 'admin',
      });
      posthog.capture('admin_login_success');
      window.location.reload();
    } else {
      posthog.capture('admin_login_failed', {
        error: res.error || "Unknown error",
      });
      setError(res.error || "Error");
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh]">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 w-full max-w-sm">
        <h1 className="text-2xl font-bold text-gray-100">Admin Access</h1>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="bg-white/5 border border-white/10 p-2 rounded text-gray-200 focus:border-accent-400 outline-none"
        />
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <button type="submit" className="bg-accent-400 text-black font-bold py-2 rounded hover:bg-accent-400/90 transition-colors">
          Enter
        </button>
      </form>
    </div>
  );
}
