import { notFound } from "next/navigation";
import Link from "next/link";
import { projects } from "@/data/projects";
import { projectContent } from "@/data/project-content";
import FadeIn from "@/components/FadeIn";

export async function generateStaticParams() {
  return projects
    .filter((p) => p.featured && p.links?.page)
    .map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const project = projects.find((p) => p.slug === slug);
  if (!project) return { title: "Project Not Found" };

  return {
    title: `${project.title} | Ani Potts`,
    description: project.description,
  };
}

export default async function ProjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const project = projects.find((p) => p.slug === slug);
  const content = projectContent[slug];

  if (!project || !project.featured) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-16 pb-20">
      {/* Header */}
      <section className="grid grid-cols-1 md:grid-cols-4 gap-8 md:gap-12">
        <div className="col-span-1">
          <FadeIn>
            <Link
              href="/work"
              className="text-xs font-mono text-gray-500 hover:text-accent-400 transition-colors"
            >
              ← back to work
            </Link>
          </FadeIn>
        </div>
        <div className="col-span-1 md:col-span-3 flex flex-col gap-6">
          <FadeIn delay={0.1}>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-100">{project.title}</h1>
              {project.status === "live" && (
                <span className="text-[9px] uppercase tracking-wider text-green-500 bg-green-500/10 px-1.5 py-0.5 rounded font-medium">
                  live
                </span>
              )}
            </div>
            <p className="text-gray-400 text-sm mt-2">{project.subtitle}</p>
          </FadeIn>

          <FadeIn delay={0.2}>
            <div className="flex flex-wrap gap-2">
              {project.tags.map((tag) => (
                <span
                  key={tag}
                  className="text-[10px] uppercase tracking-wider text-gray-500 bg-white/5 px-2 py-1 rounded-sm"
                >
                  {tag}
                </span>
              ))}
            </div>
          </FadeIn>

          <FadeIn delay={0.3}>
            <div className="flex gap-4 text-xs font-mono">
              {project.links?.live && (
                <a
                  href={project.links.live}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent-400 hover:underline decoration-accent-400/30 underline-offset-4"
                >
                  ./launch_site.sh
                </a>
              )}
              {project.links?.repo && (
                <a
                  href={project.links.repo}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-400 hover:text-gray-200 hover:underline decoration-white/30 underline-offset-4"
                >
                  ./view_source.git
                </a>
              )}
            </div>
          </FadeIn>
        </div>
      </section>

      {/* Overview */}
      <section className="grid grid-cols-1 md:grid-cols-4 gap-8 md:gap-12">
        <div className="col-span-1">
          <FadeIn delay={0.4}>
            <h2 className="text-xs font-bold uppercase tracking-widest text-accent-400">
              overview
            </h2>
          </FadeIn>
        </div>
        <div className="col-span-1 md:col-span-3">
          <FadeIn delay={0.5}>
            <p className="text-sm text-gray-300 leading-relaxed max-w-2xl">
              {content?.overview || project.description}
            </p>
          </FadeIn>
        </div>
      </section>

      {/* Technical Details */}
      {content?.technical && (
        <section className="grid grid-cols-1 md:grid-cols-4 gap-8 md:gap-12">
          <div className="col-span-1">
            <FadeIn delay={0.6}>
              <h2 className="text-xs font-bold uppercase tracking-widest text-accent-400">
                technical
              </h2>
            </FadeIn>
          </div>
          <div className="col-span-1 md:col-span-3 flex flex-col gap-6">
            {content.technical.map((section, i) => (
              <FadeIn key={section.title} delay={0.7 + i * 0.1}>
                <div className="border-l border-white/10 pl-4">
                  <h3 className="text-sm font-medium text-gray-200 mb-2">
                    {section.title}
                  </h3>
                  <p className="text-sm text-gray-400 leading-relaxed">
                    {section.content}
                  </p>
                </div>
              </FadeIn>
            ))}
          </div>
        </section>
      )}

      {/* Roadmap / What's Next */}
      {content?.roadmap && (
        <section className="grid grid-cols-1 md:grid-cols-4 gap-8 md:gap-12">
          <div className="col-span-1">
            <FadeIn delay={0.9}>
              <h2 className="text-xs font-bold uppercase tracking-widest text-accent-400">
                roadmap
              </h2>
            </FadeIn>
          </div>
          <div className="col-span-1 md:col-span-3">
            <FadeIn delay={1.0}>
              <div className="flex flex-col gap-3">
                {content.roadmap.map((item, i) => (
                  <div key={i} className="flex items-start gap-3 text-sm">
                    <span
                      className={`text-xs font-mono px-1.5 py-0.5 rounded ${
                        item.status === "done"
                          ? "text-green-500 bg-green-500/10"
                          : item.status === "in-progress"
                          ? "text-yellow-500 bg-yellow-500/10"
                          : "text-gray-500 bg-gray-500/10"
                      }`}
                    >
                      {item.status === "done" ? "✓" : item.status === "in-progress" ? "→" : "○"}
                    </span>
                    <span className={item.status === "done" ? "text-gray-500" : "text-gray-300"}>
                      {item.text}
                    </span>
                  </div>
                ))}
              </div>
            </FadeIn>
          </div>
        </section>
      )}

      {/* Related Thoughts */}
      {content?.relatedThoughts && content.relatedThoughts.length > 0 && (
        <section className="grid grid-cols-1 md:grid-cols-4 gap-8 md:gap-12">
          <div className="col-span-1">
            <FadeIn delay={1.1}>
              <h2 className="text-xs font-bold uppercase tracking-widest text-accent-400">
                related thoughts
              </h2>
            </FadeIn>
          </div>
          <div className="col-span-1 md:col-span-3">
            <FadeIn delay={1.2}>
              <div className="flex flex-col gap-2">
                {content.relatedThoughts.map((thought) => (
                  <Link
                    key={thought.slug}
                    href={`/thoughts/${thought.slug}`}
                    className="text-sm text-gray-400 hover:text-accent-400 transition-colors"
                  >
                    → {thought.title}
                  </Link>
                ))}
              </div>
            </FadeIn>
          </div>
        </section>
      )}
    </div>
  );
}
