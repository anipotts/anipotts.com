import { FadeIn } from "@anipotts/ui";
import { FaTerminal, FaDownload, FaGithub, FaCog } from "react-icons/fa";

export default function CliPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] py-12 px-4">
      <FadeIn>
        <div className="text-center max-w-md">
          <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-accent-400/10 border border-accent-400/20 flex items-center justify-center">
            <FaTerminal className="text-accent-400 text-3xl" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">CLI Tools</h1>
          <p className="text-gray-500 mb-8">Command-line utilities for developers</p>
        </div>
      </FadeIn>

      <FadeIn delay={0.1}>
        <div className="w-full max-w-lg p-6 bg-white/5 border border-white/10 rounded-xl mb-6">
          <div className="flex items-center gap-2 text-gray-500 text-xs mb-4">
            <FaCog className="text-accent-400" />
            <span className="uppercase tracking-widest">Coming Soon</span>
          </div>
          <pre className="text-sm text-gray-400 font-mono bg-black/40 p-4 rounded-lg overflow-x-auto">
{`# Install (coming soon)
npm install -g @anipotts/cli

# Usage
ani init        # Initialize a new project
ani deploy      # Deploy to production
ani status      # Check service status
ani metrics     # View coding metrics`}
          </pre>
        </div>
      </FadeIn>

      <FadeIn delay={0.2}>
        <div className="flex gap-4">
          <a href="https://github.com/anipotts" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-gray-400 hover:text-white hover:border-accent-400/30 transition-all text-sm">
            <FaGithub />
            View Source
          </a>
          <button disabled className="flex items-center gap-2 px-4 py-2 bg-accent-400/10 border border-accent-400/20 rounded-lg text-accent-400/50 cursor-not-allowed text-sm">
            <FaDownload />
            Coming Soon
          </button>
        </div>
      </FadeIn>

      <FadeIn delay={0.3}>
        <p className="text-xs text-gray-600 mt-8 text-center">
          Subscribe to updates at <span className="text-accent-400">updates.anipotts.com</span>
        </p>
      </FadeIn>
    </div>
  );
}
