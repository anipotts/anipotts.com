"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { marked } from "marked";
import TurndownService from "turndown";
import "react-quill-new/dist/quill.snow.css";

// Dynamic import for ReactQuill to avoid SSR issues
const ReactQuill = dynamic(() => import("react-quill-new"), { ssr: false });

const turndownService = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
});

interface EditorProps {
  value: string; // Markdown
  onChange: (value: string) => void;
}

export default function Editor({ value, onChange }: EditorProps) {
  const [html, setHtml] = useState("");
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    // Initial conversion from Markdown to HTML
    const convertToHtml = async () => {
      if (value) {
        const parsed = await marked.parse(value);
        setHtml(parsed);
      }
    };
    convertToHtml();
  }, []); // Run once on mount

  const handleChange = (content: string) => {
    setHtml(content);
    // Convert HTML back to Markdown
    const markdown = turndownService.turndown(content);
    onChange(markdown);
  };

  if (!isMounted) {
    return <div className="h-64 bg-white/5 rounded-lg animate-pulse" />;
  }

  return (
    <div className="bg-white/5 rounded-lg border border-white/10 overflow-hidden flex flex-col">
       <ReactQuill
         theme="snow"
         value={html}
         onChange={handleChange}
         modules={{
           toolbar: [
             [{ 'header': [1, 2, 3, false] }],
             ['bold', 'italic', 'underline', 'strike'],
             [{ 'list': 'ordered'}, { 'list': 'bullet' }],
             ['link', 'blockquote', 'code-block'],
             ['clean']
           ],
         }}
         className="text-gray-200 flex-grow"
       />
    </div>
  );
}
