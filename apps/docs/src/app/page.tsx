import { FadeIn } from "@anipotts/ui";
import { FaBook, FaCode, FaServer, FaExternalLinkAlt } from "react-icons/fa";

const documentation = [
  { name: "Quantercise API", description: "REST API for mental math challenges", status: "published", url: "/quantercise" },
  { name: "ChainedChat Protocol", description: "Multi-agent orchestration spec", status: "draft", url: "/chained" },
  { name: "Design System", description: "Component library documentation", status: "published", url: "/design" },
];

const systemDesigns = [
  { name: "Real-time Scoring", description: "How Quantercise handles live scoring" },
  { name: "Multi-agent Architecture", description: "ChainedChat's agent handoff system" },
  { name: "Terminal UI", description: "Building the window state machine" },
];

export default function DocsPage() {
  return (
    <div className="flex flex-col gap-8 py-8 px-4 max-w-4xl mx-auto">
      <FadeIn>
        <div className="border-b border-white/10 pb-6">
          <h1 className="text-xs uppercase tracking-widest text-accent-400 mb-2">Documentation</h1>
          <p className="text-gray-500 text-sm">API references and system design documents</p>
        </div>
      </FadeIn>

      <FadeIn delay={0.1}>
        <div className="space-y-3">
          <h2 className="text-xs uppercase tracking-widest text-gray-500 flex items-center gap-2">
            <FaBook className="text-accent-400" />
            API Documentation
          </h2>
          {documentation.map((doc) => (
            <a key={doc.name} href={doc.url} className="flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-lg hover:bg-white/[0.07] hover:border-accent-400/20 transition-all group">
              <div>
                <h3 className="text-white font-medium group-hover:text-accent-400 transition-colors">{doc.name}</h3>
                <p className="text-gray-500 text-sm">{doc.description}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-xs px-2 py-1 rounded ${doc.status === "published" ? "bg-green-500/10 text-green-400" : "bg-yellow-500/10 text-yellow-400"}`}>
                  {doc.status}
                </span>
                <FaExternalLinkAlt className="text-gray-600 group-hover:text-accent-400 transition-colors" />
              </div>
            </a>
          ))}
        </div>
      </FadeIn>

      <FadeIn delay={0.2}>
        <div className="space-y-3">
          <h2 className="text-xs uppercase tracking-widest text-gray-500 flex items-center gap-2">
            <FaServer className="text-accent-400" />
            System Design
          </h2>
          {systemDesigns.map((design) => (
            <div key={design.name} className="p-4 bg-white/5 border border-white/10 rounded-lg">
              <h3 className="text-white font-medium">{design.name}</h3>
              <p className="text-gray-500 text-sm">{design.description}</p>
            </div>
          ))}
        </div>
      </FadeIn>

      <FadeIn delay={0.3}>
        <div className="p-5 bg-accent-400/5 border border-accent-400/20 rounded-lg text-center">
          <FaCode className="text-accent-400 text-2xl mx-auto mb-3" />
          <p className="text-gray-400 text-sm">Documentation is work in progress. Check back soon!</p>
        </div>
      </FadeIn>
    </div>
  );
}
