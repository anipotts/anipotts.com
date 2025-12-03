import Link from "next/link";
import { projects } from "@/data/projects";
import { supabase } from "@/lib/supabaseClient";
import FadeIn from "@/components/FadeIn";
import ProjectCard from "@/components/ProjectCard";
import CompanyLink from "@/components/CompanyLink";

async function getLatestThoughts() {
  if (!supabase) return [];
  try {
    const { data } = await supabase
      .from("thoughts")
      .select("slug, title, summary, created_at")
      .eq("published", true)
      .order("created_at", { ascending: false })
      .limit(3);
    return data || [];
  } catch (e) {
    console.error("Error fetching thoughts:", e);
    return [];
  }
}

export default async function Home() {
  const recentProjects = projects.slice(0, 3);
  const latestThoughts = await getLatestThoughts();

  return (
    <div className="flex flex-col gap-20 pb-20">
      {/* Hero */}
      <section className="grid grid-cols-1 md:grid-cols-4 gap-8 md:gap-12">
        <div className="col-span-1">
          <FadeIn>
            <span className="text-xs font-bold uppercase tracking-widest text-gray-500">index</span>
          </FadeIn>
        </div>
        <div className="col-span-1 md:col-span-3 flex flex-col gap-6">
          <FadeIn delay={0.1}>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-gray-100">
              hi, i'm ani potts
            </h1>
          </FadeIn>
          <FadeIn delay={0.2}>
            <p className="text-lg md:text-xl text-gray-400 leading-relaxed">
              i'm a 21 y/o SWE based in NYC, building minimal interfaces for orchestration systems.
            </p>
          </FadeIn>
        </div>
      </section>

      {/* About */}
      <section className="grid grid-cols-1 md:grid-cols-4 gap-8 md:gap-12">
        <div className="col-span-1">
          <FadeIn delay={0.3}>
            <span className="text-xs font-bold uppercase tracking-widest text-gray-500">about</span>
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

      {/* Recent Work */}
      <section id="selected-work" className="grid grid-cols-1 md:grid-cols-4 gap-8 md:gap-12">
        <div className="col-span-1">
          <FadeIn delay={0.6}>
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500">selected work</h2>
          </FadeIn>
        </div>
        <div className="col-span-1 md:col-span-3 flex flex-col gap-6">
          {recentProjects.map((project, i) => (
            <FadeIn key={project.slug} delay={0.6 + (i * 0.1)}>
              <ProjectCard project={project} />
            </FadeIn>
          ))}
        </div>
      </section>

      {/* Latest Thoughts */}
      <section className="grid grid-cols-1 md:grid-cols-4 gap-8 md:gap-12">
        <div className="col-span-1">
          <FadeIn delay={0.8}>
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500">thoughts</h2>
          </FadeIn>
        </div>
        <div className="col-span-1 md:col-span-3 flex flex-col gap-8">
          {!supabase ? (
            <FadeIn delay={0.9}>
              <div className="p-4 border border-white/5 rounded-sm bg-white/5">
                <p className="text-gray-500 text-xs uppercase tracking-wider">System Offline (Dev Mode)</p>
              </div>
            </FadeIn>
          ) : latestThoughts.length > 0 ? (
            latestThoughts.map((thought: any, i) => (
              <FadeIn key={thought.slug} delay={0.9 + (i * 0.1)}>
                <Link href={`/thoughts/${thought.slug}`} className="group block">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-baseline">
                    <div className="md:col-span-2">
                      <h3 className="text-base font-bold text-gray-200 group-hover:text-accent-400 transition-colors">
                        {thought.title}
                      </h3>
                      <p className="text-sm text-gray-500 mt-1 line-clamp-2">{thought.summary}</p>
                    </div>
                    <div className="md:col-span-1 md:text-right">
                      <span className="text-xs text-gray-500 uppercase tracking-wide">
                        {new Date(thought.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </span>
                    </div>
                  </div>
                </Link>
              </FadeIn>
            ))
          ) : (
             <FadeIn delay={0.9}>
               <p className="text-gray-500 italic text-sm">No thoughts published yet.</p>
             </FadeIn>
          )}
        </div>
      </section>
    </div>
  );
}
