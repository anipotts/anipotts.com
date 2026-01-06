"use client";

import { useEffect, useState } from "react";
import { getAdminStats } from "../actions";
import { FaTerminal, FaServer, FaEye, FaFileAlt, FaGlobe } from "react-icons/fa";

export default function AnalyticsMonitor() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<string[]>([]);

  useEffect(() => {
    fetchStats();
    // Simulate log stream
    const interval = setInterval(() => {
      const actions = ["GET /thoughts", "GET /api/stats", "DB_READ thoughts", "CACHE_HIT thought:slug"];
      const action = actions[Math.floor(Math.random() * actions.length)];
      const time = new Date().toISOString().split("T")[1].split(".")[0];
      setLogs(prev => [`[${time}] ${action}`, ...prev].slice(0, 10));
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const fetchStats = async () => {
    const data = await getAdminStats();
    if (data) setStats(data);
    setLoading(false);
  };

  if (loading) return <div className="p-8 font-mono text-xs text-gray-500 animate-pulse">Initializing monitor...</div>;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 font-mono text-xs">
      {/* System Status */}
      <div className="col-span-1 md:col-span-3 bg-black/40 border border-white/10 p-4 rounded-lg">
        <div className="flex items-center gap-2 text-gray-400 mb-4 border-b border-white/5 pb-2">
          <FaServer />
          <span className="uppercase tracking-widest">System Status</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-gray-600 uppercase">Total Views</span>
            <span className="text-2xl text-accent-400 font-bold">{stats?.totalViews.toLocaleString()}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-gray-600 uppercase">Thoughts</span>
            <span className="text-2xl text-white font-bold">{stats?.totalThoughts}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-gray-600 uppercase">Published</span>
            <span className="text-2xl text-green-400 font-bold">{stats?.publishedCount}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-gray-600 uppercase">Drafts</span>
            <span className="text-2xl text-yellow-400 font-bold">{stats?.draftCount}</span>
          </div>
        </div>
      </div>

      {/* Top Thoughts */}
      <div className="col-span-1 md:col-span-2 bg-black/40 border border-white/10 p-4 rounded-lg">
        <div className="flex items-center gap-2 text-gray-400 mb-4 border-b border-white/5 pb-2">
          <FaEye />
          <span className="uppercase tracking-widest">Top Performing Thoughts</span>
        </div>
        <div className="flex flex-col gap-2">
          {stats?.topThoughts.map((thought: any, i: number) => (
            <div key={thought.id} className="flex items-center justify-between p-2 hover:bg-white/5 rounded transition-colors">
              <div className="flex items-center gap-3">
                <span className="text-gray-600 w-4">#{i + 1}</span>
                <span className="text-gray-300 truncate max-w-[200px] md:max-w-xs">{thought.title}</span>
              </div>
              <div className="flex items-center gap-4">
                <span className={`px-1.5 py-0.5 rounded text-[10px] ${thought.published ? "bg-green-500/10 text-green-400" : "bg-yellow-500/10 text-yellow-400"}`}>
                  {thought.published ? "PUB" : "DRF"}
                </span>
                <span className="text-accent-400 font-bold w-16 text-right">{thought.views.toLocaleString()}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Live Logs */}
      <div className="col-span-1 bg-black/40 border border-white/10 p-4 rounded-lg flex flex-col">
        <div className="flex items-center gap-2 text-gray-400 mb-4 border-b border-white/5 pb-2">
          <FaTerminal />
          <span className="uppercase tracking-widest">Live Logs</span>
        </div>
        <div className="flex flex-col gap-1 overflow-hidden relative">
           <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/20 pointer-events-none" />
           {logs.map((log, i) => (
             <div key={i} className={`truncate transition-all duration-500 ${i === 0 ? "text-white" : "text-gray-600"}`}>
               {log}
             </div>
           ))}
        </div>
      </div>
    </div>
  );
}
