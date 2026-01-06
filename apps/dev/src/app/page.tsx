import { FadeIn } from "@anipotts/ui";
import { FaTerminal, FaCode, FaServer, FaTools, FaLaptopCode } from "react-icons/fa";

const stack = {
  languages: ["TypeScript", "Python", "Go", "Rust"],
  frontend: ["Next.js", "React", "Tailwind CSS", "Framer Motion"],
  backend: ["Node.js", "FastAPI", "PostgreSQL", "Redis"],
  infrastructure: ["Vercel", "AWS", "Docker", "Terraform"],
  tools: ["Neovim", "tmux", "Claude Code", "Arc Browser"],
  hardware: ["MacBook Pro M3 Max", "Apple Studio Display", "ZSA Moonlander"],
};

const categories = [
  { name: "Languages", items: stack.languages, icon: FaCode },
  { name: "Frontend", items: stack.frontend, icon: FaLaptopCode },
  { name: "Backend", items: stack.backend, icon: FaServer },
  { name: "Infrastructure", items: stack.infrastructure, icon: FaServer },
  { name: "Tools", items: stack.tools, icon: FaTools },
  { name: "Hardware", items: stack.hardware, icon: FaTerminal },
];

export default function DevPage() {
  return (
    <div className="flex flex-col gap-8 py-8 px-4 max-w-4xl mx-auto">
      <FadeIn>
        <div className="border-b border-white/10 pb-6">
          <h1 className="text-xs uppercase tracking-widest text-accent-400 mb-2">Development Setup</h1>
          <p className="text-gray-500 text-sm">The tools and technologies I use daily</p>
        </div>
      </FadeIn>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {categories.map((category, i) => (
          <FadeIn key={category.name} delay={i * 0.1}>
            <div className="p-5 bg-white/5 border border-white/10 rounded-lg hover:border-accent-400/20 transition-colors">
              <h2 className="text-xs uppercase tracking-widest text-gray-500 mb-4 flex items-center gap-2">
                <category.icon className="text-accent-400" />
                {category.name}
              </h2>
              <div className="flex flex-wrap gap-2">
                {category.items.map((item) => (
                  <span key={item} className="px-3 py-1.5 bg-black/40 border border-white/10 rounded text-sm text-gray-300 hover:border-accent-400/30 hover:text-white transition-colors">
                    {item}
                  </span>
                ))}
              </div>
            </div>
          </FadeIn>
        ))}
      </div>

      <FadeIn delay={0.6}>
        <div className="p-5 bg-accent-400/5 border border-accent-400/20 rounded-lg">
          <h2 className="text-xs uppercase tracking-widest text-accent-400 mb-3">Terminal Config</h2>
          <pre className="text-xs text-gray-400 font-mono overflow-x-auto">
{`# ~/.zshrc
export EDITOR="nvim"
alias c="claude"
alias dev="pnpm dev"
alias build="pnpm build"

# Navigation
alias ..="cd .."
alias ...="cd ../.."
alias code="cd ~/Code/active"`}
          </pre>
        </div>
      </FadeIn>
    </div>
  );
}
