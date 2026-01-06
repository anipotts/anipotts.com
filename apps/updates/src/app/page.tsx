import { FadeIn } from "@anipotts/ui";
import { FaRocket, FaBug, FaWrench, FaStar } from "react-icons/fa";

const changelog = [
  {
    version: "3.0.0",
    date: "2025-01-05",
    type: "major",
    project: "anipotts.com",
    changes: [
      { type: "feature", text: "Converted to Turborepo monorepo architecture" },
      { type: "feature", text: "Added 10 subdomain apps" },
      { type: "improvement", text: "Shared UI component library" },
    ],
  },
  {
    version: "2.5.0",
    date: "2025-01-02",
    type: "minor",
    project: "quantercise.com",
    changes: [
      { type: "feature", text: "Added leaderboard system" },
      { type: "fix", text: "Fixed scoring race condition" },
    ],
  },
  {
    version: "1.0.0",
    date: "2024-12-28",
    type: "major",
    project: "chained.chat",
    changes: [
      { type: "feature", text: "Initial release of multi-agent chat" },
      { type: "feature", text: "Agent handoff protocol" },
    ],
  },
];

const typeIcons = { feature: FaRocket, fix: FaBug, improvement: FaWrench };
const typeColors = { feature: "text-green-400", fix: "text-red-400", improvement: "text-yellow-400" };

export default function UpdatesPage() {
  return (
    <div className="flex flex-col gap-8 py-8 px-4 max-w-3xl mx-auto">
      <FadeIn>
        <div className="border-b border-white/10 pb-6">
          <h1 className="text-xs uppercase tracking-widest text-accent-400 mb-2">Changelog</h1>
          <p className="text-gray-500 text-sm">What I've been shipping</p>
        </div>
      </FadeIn>

      <div className="space-y-6">
        {changelog.map((release, i) => (
          <FadeIn key={`${release.project}-${release.version}`} delay={i * 0.1}>
            <div className="border-l-2 border-accent-400/30 pl-4">
              <div className="flex items-center gap-3 mb-3">
                <span className="px-2 py-1 bg-accent-400/10 text-accent-400 rounded text-xs font-mono">
                  v{release.version}
                </span>
                <span className="text-gray-500 text-xs">{release.project}</span>
                <span className="text-gray-600 text-xs">{release.date}</span>
              </div>
              <ul className="space-y-2">
                {release.changes.map((change, j) => {
                  const Icon = typeIcons[change.type as keyof typeof typeIcons] || FaStar;
                  const color = typeColors[change.type as keyof typeof typeColors] || "text-gray-400";
                  return (
                    <li key={j} className="flex items-start gap-2 text-sm">
                      <Icon className={`${color} mt-1 flex-shrink-0`} />
                      <span className="text-gray-300">{change.text}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </FadeIn>
        ))}
      </div>

      <FadeIn delay={0.4}>
        <div className="text-center pt-4 border-t border-white/5">
          <p className="text-xs text-gray-600">Subscribe to updates via RSS (coming soon)</p>
        </div>
      </FadeIn>
    </div>
  );
}
