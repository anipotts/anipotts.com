"use client";

import { useState, useEffect } from "react";
import { FaCircle, FaPlus, FaSearch, FaSave, FaTrash } from "react-icons/fa";
import { upsertThought, deleteThought, getAdminThoughts } from "../actions";
import MarkdownEditor from "@/components/MarkdownEditor";
import posthog from "posthog-js";
import { useDebounce } from "@/hooks/useDebounce";

export default function ContentManager() {
  const [thoughts, setThoughts] = useState<any[]>([]);
  const [editing, setEditing] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [unsavedChanges, setUnsavedChanges] = useState(false);

  const debouncedEditing = useDebounce(editing, 1000);

  useEffect(() => {
    fetchThoughts();
  }, []);

  useEffect(() => {
    if (!editing) return;
    setUnsavedChanges(true);
  }, [editing]);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (editing) handleSave();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [editing]);

  const fetchThoughts = async () => {
    const data = await getAdminThoughts();
    if (data) setThoughts(data);
  };

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!editing) return;

    setLoading(true);
    try {
      const savedThought = await upsertThought(editing);

      posthog.capture('thought_saved', {
        thought_title: editing.title,
        thought_slug: editing.slug,
        is_new: !editing.id,
        is_published: editing.published,
      });

      setThoughts(prev => {
        const exists = prev.find(t => t.id === savedThought.id);
        if (exists) return prev.map(t => t.id === savedThought.id ? savedThought : t);
        return [savedThought, ...prev];
      });

      setEditing(savedThought);
      setUnsavedChanges(false);
    } catch (err) {
      posthog.captureException(err);
      alert("Error saving");
      console.error(err);
    }
    setLoading(false);
  };

  const handleDelete = async () => {
    if (!editing || !editing.id) return;
    if (!confirm("Delete this thought? This cannot be undone.")) return;

    try {
      await deleteThought(editing.id);
      posthog.capture('thought_deleted', { thought_id: editing.id });

      setThoughts(prev => prev.filter(t => t.id !== editing.id));
      setEditing(null);
    } catch (err) {
      alert("Error deleting");
    }
  };

  const startNew = () => {
    const newThought = {
      title: "",
      slug: "",
      summary: "",
      content: "",
      tags: [],
      published: false,
    };
    setEditing(newThought);
    setUnsavedChanges(false);
  };

  const filteredThoughts = thoughts.filter(t =>
    t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.slug.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex h-[75vh] border border-white/10 rounded-xl overflow-hidden bg-black/40 backdrop-blur-sm">
      {/* Sidebar */}
      <div className="w-64 border-r border-white/10 flex flex-col bg-black/20">
        <div className="p-4 border-b border-white/10 flex flex-col gap-3">
          <button
            onClick={startNew}
            className="w-full bg-accent-400/10 hover:bg-accent-400/20 text-accent-400 border border-accent-400/20 py-2 rounded text-xs font-mono uppercase tracking-wider flex items-center justify-center gap-2 transition-colors"
          >
            <FaPlus /> New Thought
          </button>
          <div className="relative">
            <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600 text-xs" />
            <input
              className="w-full bg-black/40 border border-white/10 rounded py-1.5 pl-8 pr-2 text-xs text-gray-300 focus:border-accent-400/50 focus:outline-none"
              placeholder="Search..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="flex-grow overflow-y-auto">
          {filteredThoughts.map(thought => (
            <div
              key={thought.id}
              onClick={() => setEditing(thought)}
              className={`p-3 border-b border-white/5 cursor-pointer hover:bg-white/5 transition-colors ${editing?.id === thought.id ? "bg-white/10 border-l-2 border-l-accent-400" : "border-l-2 border-l-transparent"}`}
            >
              <div className="flex justify-between items-start mb-1">
                <h4 className={`text-xs font-bold truncate pr-2 ${editing?.id === thought.id ? "text-white" : "text-gray-400"}`}>
                  {thought.title || "Untitled"}
                </h4>
                {thought.published && <div className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0 mt-1" />}
              </div>
              <div className="flex justify-between items-center text-[10px] text-gray-600 font-mono">
                <span className="truncate max-w-[100px]">{thought.slug}</span>
                <span>{new Date(thought.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Main Editor Area */}
      <div className="flex-grow flex flex-col bg-[#050505]">
        {editing ? (
          <>
            {/* Editor Header */}
            <div className="h-14 border-b border-white/10 flex items-center justify-between px-6 bg-white/5">
              <div className="flex items-center gap-4 flex-grow">
                <div className="flex flex-col w-full">
                  <input
                    className="bg-transparent text-sm font-bold text-white focus:outline-none w-full placeholder-gray-600"
                    placeholder="Thought Title"
                    value={editing.title}
                    onChange={e => setEditing({ ...editing, title: e.target.value, slug: !editing.id ? e.target.value.toLowerCase().replace(/ /g, '-').replace(/[^\w-]+/g, '') : editing.slug })}
                  />
                  <input
                    className="bg-transparent text-xs text-gray-400 focus:outline-none w-full placeholder-gray-700 mt-1 font-mono"
                    placeholder="Subtext / Summary (displayed under title)"
                    value={editing.summary || ""}
                    onChange={e => setEditing({ ...editing, summary: e.target.value })}
                  />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 mr-4">
                  <span className={`text-[10px] uppercase tracking-wider ${unsavedChanges ? "text-yellow-500" : "text-gray-600"}`}>
                    {unsavedChanges ? "Unsaved" : "Saved"}
                  </span>
                </div>
                <button
                  onClick={() => handleDelete()}
                  className="p-2 text-gray-500 hover:text-red-400 transition-colors"
                  title="Delete"
                >
                  <FaTrash />
                </button>
                <button
                  onClick={(e) => handleSave(e)}
                  disabled={loading}
                  className="bg-white/10 hover:bg-white/20 text-white px-4 py-1.5 rounded text-xs font-mono uppercase tracking-wider flex items-center gap-2 transition-colors disabled:opacity-50"
                >
                  <FaSave /> {loading ? "Saving..." : "Save"}
                </button>
              </div>
            </div>

            {/* Metadata Bar */}
            <div className="px-6 py-3 border-b border-white/10 flex gap-4 items-center bg-black/20 flex-wrap">
              <div className="flex items-center gap-2 min-w-[200px]">
                <span className="text-[10px] text-gray-500 uppercase tracking-widest font-mono">Slug:</span>
                <input
                  className="bg-transparent text-xs text-accent-400 font-mono focus:outline-none flex-grow"
                  value={editing.slug}
                  onChange={e => setEditing({ ...editing, slug: e.target.value })}
                  placeholder="url-slug"
                />
              </div>

              <div className="w-px h-4 bg-white/10" />

              {/* Tags Input */}
              <div className="flex items-center gap-2 flex-grow">
                <span className="text-[10px] text-gray-500 uppercase tracking-widest font-mono">Tags:</span>
                <div className="flex flex-wrap gap-2 items-center">
                  {(Array.isArray(editing.tags) ? editing.tags : []).map((tag: string) => (
                    <span key={tag} className="bg-white/10 text-gray-300 px-1.5 py-0.5 rounded text-[10px] font-mono flex items-center gap-1">
                      {tag}
                      <button
                        onClick={() => setEditing({ ...editing, tags: editing.tags.filter((t: string) => t !== tag) })}
                        className="hover:text-red-400"
                      >
                        &times;
                      </button>
                    </span>
                  ))}
                  <input
                    className="bg-transparent text-xs text-gray-400 font-mono focus:outline-none min-w-[60px]"
                    placeholder="Add tag..."
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const val = e.currentTarget.value.trim();
                        if (val && !editing.tags?.includes(val)) {
                          setEditing({
                            ...editing,
                            tags: [...(Array.isArray(editing.tags) ? editing.tags : []), val]
                          });
                          e.currentTarget.value = "";
                        }
                      }
                    }}
                  />
                </div>
              </div>

              <div className="w-px h-4 bg-white/10" />

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editing.published}
                  onChange={e => setEditing({ ...editing, published: e.target.checked })}
                  className="accent-accent-400"
                />
                <span className={`text-[10px] uppercase tracking-widest font-mono ${editing.published ? "text-green-400" : "text-gray-500"}`}>
                  {editing.published ? "Published" : "Draft"}
                </span>
              </label>
            </div>

            {/* Editor Body */}
            <div className="flex-grow overflow-hidden p-4">
              <MarkdownEditor
                value={editing.content || ""}
                onChange={val => setEditing({ ...editing, content: val })}
              />
            </div>
          </>
        ) : (
          <div className="flex-grow flex flex-col items-center justify-center text-gray-600 gap-4">
            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center text-2xl">
              <FaCircle className="text-gray-700" />
            </div>
            <p className="font-mono text-xs uppercase tracking-widest">Select a thought or create new</p>
          </div>
        )}
      </div>
    </div>
  );
}
