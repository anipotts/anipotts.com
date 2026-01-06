"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { usePostHog } from "posthog-js/react";
import { motion, AnimatePresence } from "framer-motion";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

interface FileEntry {
  name: string;
  path: string;
  type: "dir" | "file";
  secret?: boolean;
}

const FILE_STRUCTURE: FileEntry[] = [
  { name: "index/", path: "/", type: "dir" },
  { name: "work/", path: "/work", type: "dir" },
  { name: "thoughts/", path: "/thoughts", type: "dir" },
  { name: "connect/", path: "/connect", type: "dir" },
  { name: ".secret", path: "secret", type: "file", secret: true },
];

const SECRET_MESSAGE = `
-----BEGIN SECRET-----
thanks for exploring.

if you're reading this, you're
 someone who appreciates
the details. i fw that.

reach out to my #: 732-666-3371
-----END SECRET-----
`;

export default function FileBrowser({ isOpen, onClose }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const posthog = usePostHog();
  const inputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  const [command, setCommand] = useState("");
  const [output, setOutput] = useState<string | null>(null);
  const [showSecret, setShowSecret] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
      posthog.capture("file_browser_opened");
      setOutput(null);
      setShowSecret(false);
      setCommand("");
    }
  }, [isOpen, posthog]);

  useEffect(() => {
    if (!isOpen) return;

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    window.addEventListener("keydown", handleEsc);
    window.addEventListener("mousedown", handleClickOutside);

    return () => {
      window.removeEventListener("keydown", handleEsc);
      window.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, onClose]);

  const executeCommand = (cmd: string) => {
    const parts = cmd.trim().toLowerCase().split(/\s+/);
    const action = parts[0];
    const arg = parts[1];

    posthog.capture("file_browser_command", { command: cmd });

    if (action === "cd" && arg) {
      const target = FILE_STRUCTURE.find(
        (f) =>
          f.name.replace("/", "") === arg ||
          f.path === `/${arg}` ||
          (arg === "/" && f.path === "/") ||
          (arg === "~" && f.path === "/")
      );

      if (target && target.type === "dir") {
        router.push(target.path);
        onClose();
        return;
      } else {
        setOutput(`cd: no such directory: ${arg}`);
      }
    } else if (action === "ls") {
      setOutput(null); // Show file list
    } else if (action === "cat" && arg === ".secret") {
      setShowSecret(true);
      setOutput(null);
    } else if (action === "pwd") {
      setOutput(pathname);
    } else if (action === "clear") {
      setOutput(null);
      setShowSecret(false);
    } else if (action === "help") {
      setOutput("commands: cd, ls, cat, pwd, clear, help");
    } else if (action) {
      setOutput(`command not found: ${action}`);
    }

    setCommand("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executeCommand(command);
  };

  const handleFileClick = (file: FileEntry) => {
    if (file.secret) {
      setShowSecret(true);
      posthog.capture("file_browser_command", { command: "cat .secret" });
    } else if (file.type === "dir") {
      router.push(file.path);
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={modalRef}
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.98 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="absolute bottom-full right-0 mb-2 mx-4 md:mx-0 md:right-4 md:left-auto md:w-80 z-50 bg-black border border-white/10 rounded-md shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-white/5 bg-white/5">
            <span className="text-[10px] text-gray-500 font-mono">
              ~/anipotts.com
            </span>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-300 transition-colors text-xs"
              aria-label="Close"
            >
              [×]
            </button>
          </div>

          {/* File List or Output */}
          <div className="p-3 font-mono text-xs max-h-48 overflow-y-auto">
            {showSecret ? (
              <pre className="text-accent-400 whitespace-pre-wrap text-[10px] leading-relaxed">
                {SECRET_MESSAGE}
              </pre>
            ) : output ? (
              <div className="text-gray-400">{output}</div>
            ) : (
              <div className="flex flex-col gap-0.5">
                {FILE_STRUCTURE.map((file) => (
                  <button
                    key={file.name}
                    onClick={() => handleFileClick(file)}
                    className={`flex items-center gap-2 text-left hover:bg-white/5 px-1 py-0.5 rounded transition-colors ${
                      file.path === pathname
                        ? "text-accent-400"
                        : file.secret
                        ? "text-gray-600"
                        : "text-gray-400"
                    }`}
                  >
                    <span className="text-gray-600 text-[9px] w-20">
                      {file.type === "dir" ? "drwxr-xr-x" : "-rw-r--r--"}
                    </span>
                    <span className="text-gray-600 text-[9px]">ani</span>
                    <span
                      className={file.type === "dir" ? "text-accent-400" : ""}
                    >
                      {file.name}
                    </span>
                    {file.path === pathname && (
                      <span className="text-accent-400 text-[9px]">*</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Command Input */}
          <form
            onSubmit={handleSubmit}
            className="border-t border-white/5 px-3 py-2"
          >
            <div className="flex items-center gap-1 text-xs font-mono">
              <span className="text-accent-400">&gt;</span>
              <input
                ref={inputRef}
                type="text"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                className="flex-1 bg-transparent text-gray-300 outline-none placeholder:text-gray-600"
                placeholder="cd, ls, cat .secret"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          </form>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
