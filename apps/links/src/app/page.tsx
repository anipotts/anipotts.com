import { FadeIn } from "@anipotts/ui";
import { FaGithub, FaLinkedin, FaTwitter, FaEnvelope, FaGlobe, FaCode, FaTerminal } from "react-icons/fa";

const links = [
  { name: "Website", url: "https://anipotts.com", icon: FaGlobe, description: "Main portfolio" },
  { name: "GitHub", url: "https://github.com/anipotts", icon: FaGithub, description: "@anipotts" },
  { name: "LinkedIn", url: "https://linkedin.com/in/anipotts", icon: FaLinkedin, description: "Professional" },
  { name: "Twitter", url: "https://twitter.com/anipotts", icon: FaTwitter, description: "@anipotts" },
  { name: "Email", url: "mailto:hi@anipotts.com", icon: FaEnvelope, description: "hi@anipotts.com" },
];

const projects = [
  { name: "Quantercise", url: "https://quantercise.com", description: "Mental math training" },
  { name: "ChainedChat", url: "https://chained.chat", description: "Multi-agent AI chat" },
];

export default function LinksPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] py-12 px-4">
      <FadeIn>
        <div className="flex items-center gap-3 mb-2">
          <FaTerminal className="text-accent-400" />
          <h1 className="text-2xl font-bold text-white">ani potts</h1>
        </div>
        <p className="text-gray-500 text-sm text-center mb-8">Software Engineer in NYC</p>
      </FadeIn>

      <div className="w-full max-w-md space-y-3 mb-8">
        {links.map((link, i) => (
          <FadeIn key={link.name} delay={i * 0.1}>
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-4 p-4 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 hover:border-accent-400/30 transition-all group"
            >
              <link.icon className="text-gray-400 group-hover:text-accent-400 transition-colors" />
              <div className="flex-grow">
                <span className="text-white font-medium">{link.name}</span>
                <span className="text-gray-500 text-xs ml-2">{link.description}</span>
              </div>
              <span className="text-gray-600 text-xs">→</span>
            </a>
          </FadeIn>
        ))}
      </div>

      <FadeIn delay={0.5}>
        <div className="w-full max-w-md">
          <h2 className="text-xs uppercase tracking-widest text-gray-500 mb-3 flex items-center gap-2">
            <FaCode className="text-accent-400" />
            Projects
          </h2>
          <div className="space-y-2">
            {projects.map((project) => (
              <a
                key={project.name}
                href={project.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between p-3 bg-black/40 border border-white/5 rounded-lg hover:border-accent-400/20 transition-all"
              >
                <span className="text-gray-300 text-sm">{project.name}</span>
                <span className="text-gray-600 text-xs">{project.description}</span>
              </a>
            ))}
          </div>
        </div>
      </FadeIn>
    </div>
  );
}
