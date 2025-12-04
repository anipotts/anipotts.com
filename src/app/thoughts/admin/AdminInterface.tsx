"use client";

import { useState, useEffect, useCallback } from "react";
import { FaCheck, FaTerminal, FaCircle } from "react-icons/fa";
import { upsertThought, deleteThought, getAdminThoughts } from "../actions";
import Editor from "@/components/Editor";
import posthog from "posthog-js";
import { useAdmin } from "@/context/AdminContext";
import Link from "next/link";
import { checkAuth } from "../actions";

export default function AdminInterface() {
  const { logout } = useAdmin();
  const [thoughts, setThoughts] = useState<any[]>([]);
  const [editing, setEditing] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    fetchThoughts();
    checkAuth().then(setIsAuthenticated);
  }, []);

  // Keyboard Navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (editing) return; // Disable list nav when editing

      switch (e.key) {
        case "j":
          setSelectedIndex((prev) => Math.min(prev + 1, thoughts.length - 1));
          break;
        case "k":
          setSelectedIndex((prev) => Math.max(prev - 1, 0));
          break;
        case "o":
        case "Enter":
          if (thoughts[selectedIndex]) setEditing(thoughts[selectedIndex]);
          break;
        case "p":
          if (thoughts[selectedIndex]) {
            // Toggle publish logic would go here, but requires update function. 
            // For now, just open edit.
            setEditing(thoughts[selectedIndex]);
          }
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [thoughts, selectedIndex, editing]);

  const fetchThoughts = async () => {
    const data = await getAdminThoughts();
    if (data) setThoughts(data);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await upsertThought(editing);

      // Capture thought saved event
      posthog.capture('thought_saved', {
        thought_title: editing.title,
        thought_slug: editing.slug,
        is_new: !editing.id,
        is_published: editing.published,
      });

      setEditing(null);
      fetchThoughts();
    } catch (err) {
      // Capture error
      posthog.captureException(err);
      alert("Error saving");
      console.error(err);
    }
    setLoading(false);
  };

  const handleDelete = async (id: string, thought: any) => {
    if (!confirm("Delete this thought?")) return;
    try {
      await deleteThought(id);

      // Capture thought deleted event
      posthog.capture('thought_deleted', {
        thought_id: id,
        thought_title: thought.title,
        thought_slug: thought.slug,
      });

      fetchThoughts();
    } catch (err) {
      // Capture error
      posthog.captureException(err);
      alert("Error deleting");
    }
  };

  const startNew = () => {
    setEditing({
      title: "",
      slug: "",
      summary: "",
      content: "",
      tags: [],
      published: false,
    });
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="flex justify-between items-center border-b border-white/10 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-2 py-1 bg-green-500/10 border border-green-500/20 rounded text-green-400 text-xs font-mono uppercase tracking-wider">
            <FaCircle className="w-2 h-2" />
            <span>root</span>
          </div>
          <span className="text-xs text-gray-500 font-mono hidden md:inline">⌘+Shift+A to toggle</span>
        </div>
        <div className="flex items-center gap-6">
          <Link href="/thoughts" target="_blank" className="text-xs text-gray-500 hover:text-accent-400 font-mono flex items-center gap-1 transition-colors">
            View live page ↗
          </Link>
          <button onClick={() => logout()} className="text-xs text-gray-500 hover:text-red-400 font-mono uppercase tracking-wider transition-colors">
            Logout
          </button>
        </div>
      </div>

      {editing ? (
        <form onSubmit={handleSave} className="flex flex-col gap-6 bg-white/5 p-8 rounded-xl border border-white/10 shadow-2xl">
          <div className="flex justify-between items-center border-b border-white/10 pb-4 font-mono">
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <span className="text-gray-600">ani@nyc:~</span>
              <span>thoughts/{editing.slug || "new"}</span>
              <span className={`text-[10px] uppercase px-1.5 py-0.5 rounded ${editing.published ? "bg-green-500/20 text-green-400" : "bg-yellow-500/20 text-yellow-400"}`}>
                [{editing.published ? "published" : "draft"}]
              </span>
            </div>
            <div className="flex gap-4">
              <button type="button" onClick={() => setEditing(null)} className="text-gray-500 hover:text-gray-300 text-xs uppercase tracking-wider">
                Cancel
              </button>
              <button type="submit" disabled={loading} className="text-accent-400 hover:text-accent-300 text-xs uppercase tracking-wider font-bold disabled:opacity-50">
                {loading ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex flex-col gap-2">
              <label className="text-xs uppercase tracking-widest text-gray-500">Title</label>
              <input
                className="bg-black/20 border border-white/10 p-3 rounded-lg text-gray-200 focus:border-accent-400/50 focus:outline-none transition-colors"
                placeholder="Enter title..."
                value={editing.title}
                onChange={e => setEditing({ ...editing, title: e.target.value, slug: !editing.id ? e.target.value.toLowerCase().replace(/ /g, '-').replace(/[^\w-]+/g, '') : editing.slug })}
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-xs uppercase tracking-widest text-gray-500">Slug</label>
              <input
                className="bg-black/20 border border-white/10 p-3 rounded-lg text-gray-200 focus:border-accent-400/50 focus:outline-none transition-colors font-mono text-sm"
                placeholder="url-slug"
                value={editing.slug}
                onChange={e => setEditing({ ...editing, slug: e.target.value })}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs uppercase tracking-widest text-gray-500">Summary</label>
            <textarea
              className="bg-black/20 border border-white/10 p-3 rounded-lg text-gray-200 h-24 focus:border-accent-400/50 focus:outline-none transition-colors resize-none"
              placeholder="Brief summary for the list view..."
              value={editing.summary}
              onChange={e => setEditing({ ...editing, summary: e.target.value })}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs uppercase tracking-widest text-gray-500">Content</label>
            <Editor 
              value={editing.content} 
              onChange={(val) => setEditing({ ...editing, content: val })} 
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
            <div className="flex flex-col gap-2">
              <label className="text-xs uppercase tracking-widest text-gray-500">Tags</label>
              <input
                className="bg-black/20 border border-white/10 p-3 rounded-lg text-gray-200 focus:border-accent-400/50 focus:outline-none transition-colors"
                placeholder="ai, engineering, life"
                value={Array.isArray(editing.tags) ? editing.tags.join(", ") : editing.tags}
                onChange={e => setEditing({ ...editing, tags: e.target.value.split(",").map((t: string) => t.trim()) })}
              />
            </div>
            
            <label className="flex items-center gap-3 text-gray-300 cursor-pointer p-3 rounded-lg hover:bg-white/5 transition-colors self-end">
              <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${editing.published ? "bg-accent-400 border-accent-400" : "border-gray-500"}`}>
                {editing.published && <span className="text-black text-xs font-bold"><FaCheck />  </span>}
              </div>
              <input
                type="checkbox"
                className="hidden"
                checked={editing.published}
                onChange={e => setEditing({ ...editing, published: e.target.checked })}
              />
              <span className="text-sm font-medium">Publish to site</span>
            </label>
          </div>

        </form>
      ) : (
        <button onClick={startNew} className="bg-white/10 text-gray-200 px-6 py-3 rounded-lg hover:bg-white/20 self-start flex items-center gap-2 transition-all hover:shadow-lg">
          <span className="text-xl leading-none">+</span>
          <span className="font-medium">New Thought</span>
        </button>
      )}

      <div className="flex flex-col gap-2">
        {thoughts.map((thought, index) => (
          <div 
            key={thought.id} 
            className={`group flex items-center justify-between p-4 rounded-lg border transition-all cursor-pointer ${
              index === selectedIndex 
                ? "bg-white/10 border-accent-400/50" 
                : "bg-white/5 border-white/5 hover:border-white/10"
            }`}
            onClick={() => {
              setSelectedIndex(index);
              setEditing(thought);
            }}
          >
            <div className="flex items-center gap-4">
              <span className={`font-mono text-xs ${index === selectedIndex ? "text-accent-400" : "text-gray-600 opacity-0 group-hover:opacity-100"}`}>
                {index === selectedIndex ? ">" : "#"}
              </span>
              <div className="flex flex-col gap-1">
                <h3 className={`font-bold text-sm transition-colors ${index === selectedIndex ? "text-white" : "text-gray-300"}`}>
                  {thought.title}
                </h3>
                <div className="flex gap-3 text-[10px] text-gray-500 font-mono items-center">
                  <span>{thought.slug}</span>
                  <span className="w-0.5 h-0.5 rounded-full bg-gray-700"></span>
                  <span className={thought.published ? "text-green-400" : "text-yellow-400"}>
                    {thought.published ? "PUB" : "DRF"}
                  </span>
                  <span className="w-0.5 h-0.5 rounded-full bg-gray-700"></span>
                  <span>{new Date(thought.created_at).toLocaleDateString()}</span>
                </div>
              </div>
            </div>
            <div className="flex gap-4 text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity">
              <span className="text-gray-600 font-mono hidden md:inline">[Enter to edit]</span>
            </div>
          </div>
        ))}
      </div>

      {/* Live Status Footer */}
      <div className="border-t border-white/10 pt-4 mt-4 flex justify-between items-center text-[10px] font-mono text-gray-600 uppercase tracking-wider">
        <div className="flex gap-6">
          <div className="flex items-center gap-2">
            <div className={`w-1.5 h-1.5 rounded-full ${process.env.NEXT_PUBLIC_SUPABASE_URL ? "bg-green-500" : "bg-red-500"}`} />
            <span>Supabase: {process.env.NEXT_PUBLIC_SUPABASE_URL ? "Connected" : "Error"}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-1.5 h-1.5 rounded-full ${isAuthenticated ? "bg-green-500" : "bg-red-500"}`} />
            <span>Auth: {isAuthenticated ? "Valid" : "Invalid"}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-1.5 h-1.5 rounded-full ${posthog ? "bg-green-500" : "bg-gray-500"}`} />
            <span>PostHog: Active</span>
          </div>
        </div>
        <div>
          v3.0.1-admin
        </div>
      </div>
    </div>
  );
}
