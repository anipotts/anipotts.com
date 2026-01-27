import { projects } from "@/data/projects";
import { supabase } from "@/lib/supabaseClient";
import FadeIn from "@/components/FadeIn";
import ProjectCard from "@/components/ProjectCard";
import CompanyLink from "@/components/CompanyLink";
import ThoughtLink from "@/app/thoughts/ThoughtLink";
import Link from "next/link";

export const revalidate = 0;

async function getLatestThoughts() {
  if (!supabase) return [];
  try {
    const { data } = await supabase
      .from("thoughts")
      .select("slug, title, summary, created_at, views")
      .eq("published", true)
      .order("created_at", { ascending: false })
      .limit(5);
    return data || [];
  } catch (e) {
    console.error("Error fetching thoughts:", e);
    return [];
  }
}

export default async function Home() {
  const recentProjects = projects.slice(0, 5);
  const latestThoughts = await getLatestThoughts();

  return (
    <div className="flex flex-col gap-16 pb-20">
      
      {/* Index Section */}
      <section className="grid grid-cols-1 md:grid-cols-4 gap-8">
        <div className="col-span-1">
          <FadeIn delay={0.0}>
            <span className="text-xs font-mono text-accent-400 tracking-widest uppercase">
              index
            </span>
          </FadeIn>
        </div>
        <div className="col-span-1 md:col-span-3 flex flex-col gap-6">
          <FadeIn delay={0.1}>
            <h1 className="text-3xl md:text-4xl font-bold font-heading text-gray-100">
              hi, i'm ani potts.
            </h1>
          </FadeIn>
          <FadeIn delay={0.2}>
            <p className="text-lg md:text-xl text-gray-400 leading-relaxed">
              i'm a SWE based in NYC, who builds minimal interfaces to orchestrate complex systems.
            </p>
          </FadeIn>
        </div>
      </section>

      {/* About Section */}
      <section className="grid grid-cols-1 md:grid-cols-4 gap-8">
        <div className="col-span-1">
          <FadeIn delay={0.3}>
            <span className="text-xs font-mono text-accent-400 tracking-widest uppercase">
              about me
            </span>
          </FadeIn>
        </div>
        <div className="col-span-1 md:col-span-3 flex flex-col gap-6 text-gray-300 leading-relaxed">
          <FadeIn delay={0.4}>
            <p>
              Right now, I'm building an investment research platform for <CompanyLink href="https://www.pgiuchicago.com/" companyName="PGI">PGI</CompanyLink>, serving quants at UChicago, NYU, Princeton, Brown, and other top institutions.
            </p>
          </FadeIn>
          <FadeIn delay={0.5}>
            <p>
              Previously, I built internal analytics dashboards for <CompanyLink href="https://www.atlanticrecords.com/" companyName="Atlantic Records">Atlantic</CompanyLink>, automated social media scraping for <CompanyLink href="https://www.rangemp.com/" companyName="Range Media Partners">Range Media Partners</CompanyLink>, and launched several profitable <a href="#selected-work" className="text-gray-200 hover:text-accent-400 font-medium underline decoration-white/30 underline-offset-4 transition-colors">PWAs</a> (see below).
            </p>
          </FadeIn>
        </div>
      </section>

      {/* Selected Work Section */}
      <section id="selected-work" className="grid grid-cols-1 md:grid-cols-4 gap-8">
        <div className="col-span-1">
          <FadeIn delay={0.5}>
            <span className="text-xs font-mono text-accent-400 tracking-widest uppercase">
              past work
            </span>
          </FadeIn>
        </div>
        <div className="col-span-1 md:col-span-3 flex flex-col gap-4">
          {recentProjects.map((project, index) => (
            <FadeIn key={project.slug} delay={0.6 + index * 0.1}>
              <ProjectCard project={project} />
            </FadeIn>
          ))}
        </div>
      </section>

      {/* Latest Thoughts Section */}
      <section className="grid grid-cols-1 md:grid-cols-4 gap-8">
        <div className="col-span-1">
          <FadeIn delay={1.0}>
            <span className="text-xs font-mono text-accent-400 tracking-widest uppercase">
              latest thoughts
            </span>
          </FadeIn>
        </div>
        <div className="col-span-1 md:col-span-3 flex flex-col gap-8">
          {latestThoughts.length > 0 ? (
            latestThoughts.map((thought: any, index: number) => (
              <FadeIn key={thought.slug} delay={1.1 + index * 0.1}>
                <ThoughtLink thought={thought} />
              </FadeIn>
            ))
          ) : (
            <FadeIn delay={1.1}>
              <p className="text-gray-500 font-mono text-sm italic">
                // no thoughts published yet
              </p>
            </FadeIn>
          )}
        </div>
      </section>

    </div>
  );
}
