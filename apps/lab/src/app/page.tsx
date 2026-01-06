import { FadeIn } from "@anipotts/ui";
import { FaFlask, FaArchive, FaPlay, FaExternalLinkAlt } from "react-icons/fa";

const experiments = [
  { name: "Perlin Waves", description: "Interactive noise-based wave animation", status: "active", url: "/waves" },
  { name: "Terminal UI", description: "macOS-style window state machine", status: "active", url: "/terminal" },
  { name: "Real-time Multiplier", description: "WebSocket-based game sync", status: "active", url: "/multiplayer" },
];

const archived = [
  { name: "GPT Wrapper v1", description: "First iteration of AI chat interface", year: "2023" },
  { name: "Crypto Dashboard", description: "Portfolio tracker with DeFi integration", year: "2022" },
  { name: "Tweet Scheduler", description: "Twitter automation tool", year: "2021" },
];

export default function LabPage() {
  return (
    <div className="flex flex-col gap-8 py-8 px-4 max-w-4xl mx-auto">
      <FadeIn>
        <div className="border-b border-white/10 pb-6">
          <h1 className="text-xs uppercase tracking-widest text-accent-400 mb-2">Lab</h1>
          <p className="text-gray-500 text-sm">Experiments, demos, and archived work</p>
        </div>
      </FadeIn>

      <FadeIn delay={0.1}>
        <div className="space-y-3">
          <h2 className="text-xs uppercase tracking-widest text-gray-500 flex items-center gap-2">
            <FaFlask className="text-accent-400" />
            Active Experiments
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {experiments.map((exp) => (
              <a key={exp.name} href={exp.url} className="flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-lg hover:bg-white/[0.07] hover:border-accent-400/20 transition-all group">
                <div>
                  <h3 className="text-white font-medium group-hover:text-accent-400 transition-colors">{exp.name}</h3>
                  <p className="text-gray-500 text-sm">{exp.description}</p>
                </div>
                <div className="flex items-center gap-2">
                  <FaPlay className="text-green-400 text-xs" />
                  <FaExternalLinkAlt className="text-gray-600 group-hover:text-accent-400 transition-colors" />
                </div>
              </a>
            ))}
          </div>
        </div>
      </FadeIn>

      <FadeIn delay={0.2}>
        <div className="space-y-3">
          <h2 className="text-xs uppercase tracking-widest text-gray-500 flex items-center gap-2">
            <FaArchive className="text-gray-600" />
            Archived
          </h2>
          <div className="space-y-2">
            {archived.map((project) => (
              <div key={project.name} className="flex items-center justify-between p-3 bg-black/40 border border-white/5 rounded-lg opacity-60">
                <div>
                  <h3 className="text-gray-400 font-medium">{project.name}</h3>
                  <p className="text-gray-600 text-sm">{project.description}</p>
                </div>
                <span className="text-gray-600 text-xs">{project.year}</span>
              </div>
            ))}
          </div>
        </div>
      </FadeIn>

      <FadeIn delay={0.3}>
        <div className="p-5 bg-accent-400/5 border border-accent-400/20 rounded-lg text-center">
          <FaFlask className="text-accent-400 text-2xl mx-auto mb-3" />
          <p className="text-gray-400 text-sm">More experiments coming soon. Ideas welcome!</p>
        </div>
      </FadeIn>
    </div>
  );
}
