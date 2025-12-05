"use client";

import { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import { FaBold, FaItalic, FaLink, FaCode, FaQuoteRight, FaListUl, FaListOl, FaImage, FaEye, FaColumns } from "react-icons/fa";

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
}

export default function MarkdownEditor({ value, onChange }: MarkdownEditorProps) {
  const [viewMode, setViewMode] = useState<"split" | "edit" | "preview">("split");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const insertText = (before: string, after: string = "") => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const selectedText = text.substring(start, end);

    const newText = text.substring(0, start) + before + selectedText + after + text.substring(end);
    onChange(newText);

    // Restore cursor position
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + before.length, end + before.length);
    }, 0);
  };

  return (
    <div className="flex flex-col h-full border border-white/10 rounded-lg overflow-hidden bg-[#0a0a0a]">
      {/* Toolbar */}
      <div className="flex items-center justify-between p-2 border-b border-white/10 bg-white/5">
        <div className="flex items-center gap-1">
          <ToolbarButton icon={<FaBold />} onClick={() => insertText("**", "**")} tooltip="Bold" />
          <ToolbarButton icon={<FaItalic />} onClick={() => insertText("*", "*")} tooltip="Italic" />
          <div className="w-px h-4 bg-white/10 mx-1" />
          <ToolbarButton icon={<FaLink />} onClick={() => insertText("[", "](url)")} tooltip="Link" />
          <ToolbarButton icon={<FaImage />} onClick={() => insertText("![alt](", ")")} tooltip="Image" />
          <div className="w-px h-4 bg-white/10 mx-1" />
          <ToolbarButton icon={<FaCode />} onClick={() => insertText("`", "`")} tooltip="Code" />
          <ToolbarButton icon={<FaQuoteRight />} onClick={() => insertText("> ")} tooltip="Quote" />
          <div className="w-px h-4 bg-white/10 mx-1" />
          <ToolbarButton icon={<FaListUl />} onClick={() => insertText("- ")} tooltip="Bullet List" />
          <ToolbarButton icon={<FaListOl />} onClick={() => insertText("1. ")} tooltip="Numbered List" />
        </div>

        <div className="flex items-center gap-1 bg-black/40 rounded p-0.5 border border-white/10">
          <button
            onClick={() => setViewMode("edit")}
            className={`px-2 py-1 text-[10px] uppercase font-mono rounded transition-colors ${viewMode === "edit" ? "bg-white/10 text-white" : "text-gray-500 hover:text-gray-300"}`}
          >
            Edit
          </button>
          <button
            onClick={() => setViewMode("split")}
            className={`px-2 py-1 text-[10px] uppercase font-mono rounded transition-colors ${viewMode === "split" ? "bg-white/10 text-white" : "text-gray-500 hover:text-gray-300"}`}
          >
            Split
          </button>
          <button
            onClick={() => setViewMode("preview")}
            className={`px-2 py-1 text-[10px] uppercase font-mono rounded transition-colors ${viewMode === "preview" ? "bg-white/10 text-white" : "text-gray-500 hover:text-gray-300"}`}
          >
            Preview
          </button>
        </div>
      </div>

      {/* Editor Area */}
      <div className="flex-grow flex overflow-hidden relative">
        {/* Textarea */}
        <div className={`h-full flex flex-col ${viewMode === "split" ? "w-1/2 border-r border-white/10" : viewMode === "edit" ? "w-full" : "hidden"}`}>
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="flex-grow bg-[#0a0a0a] text-gray-300 font-mono text-sm p-4 resize-none focus:outline-none leading-relaxed"
            placeholder="Write your thought here..."
            spellCheck={false}
          />
        </div>

        {/* Preview */}
        <div className={`h-full overflow-y-auto bg-[#0a0a0a] p-4 md:p-8 ${viewMode === "split" ? "w-1/2" : viewMode === "preview" ? "w-full" : "hidden"}`}>
          <div className="prose prose-invert prose-sm max-w-none prose-headings:font-bold prose-a:text-accent-400 prose-pre:bg-white/5 prose-pre:border prose-pre:border-white/10">
            <ReactMarkdown>{value || "*Nothing to preview*"}</ReactMarkdown>
          </div>
        </div>
      </div>
    </div>
  );
}

function ToolbarButton({ icon, onClick, tooltip }: { icon: React.ReactNode, onClick: () => void, tooltip: string }) {
  return (
    <button
      onClick={onClick}
      className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded transition-colors"
      title={tooltip}
    >
      <div className="text-xs">{icon}</div>
    </button>
  );
}
