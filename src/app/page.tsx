import Link from "next/link";
import { projects } from "@/data/projects";
import { supabase } from "@/lib/supabaseClient";
import FadeIn from "@/components/FadeIn";
import ProjectCard from "@/components/ProjectCard";
import CompanyLink from "@/components/CompanyLink";
import CommandSection from "@/components/CommandSection";

async function getLatestThoughts() {
  if (!supabase) return [];
  try {
    const { data } = await supabase
      .from("thoughts")
      .select("slug, title, summary, created_at")
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
  const recentProjects = projects.slice(0, 3);
  const latestThoughts = await getLatestThoughts();

  return (
    <div className="flex flex-col gap-16 pb-20">
      {/* Hero */}
      <CommandSection command="cat index.md" delay={0}>
        <div className="flex flex-col gap-6 max-w-2xl">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-gray-100">
            hi, i'm ani potts
          </h1>
          <p className="text-lg md:text-xl text-gray-400 leading-relaxed">
            i'm a <span className="hidden md:inline">21 y/o</span> SWE based in NYC, who builds minimal interfaces for orchestrating complex systems.
          </p>
        </div>
      </CommandSection>

      {/* About */}
      <CommandSection command="cat about.txt" delay={0.2}>
        <div className="flex flex-col gap-6 text-gray-300 leading-relaxed max-w-2xl">
          <p>
            Right now, I'm building an investment research platform for <CompanyLink href="https://www.pgiuchicago.com/" companyName="PGI">PGI</CompanyLink>, serving quants at UChicago, NYU, Princeton, Brown, and other top institutions.
          </p>
          <p>
            Previously, I built internal analytics dashboards for <CompanyLink href="https://www.atlanticrecords.com/" companyName="Atlantic Records">Atlantic</CompanyLink>, automated social media scraping for <CompanyLink href="https://www.rangemp.com/" companyName="Range Media Partners">Range Media Partners</CompanyLink>, and launched several profitable <a href="#selected-work" className="text-gray-200 hover:text-accent-400 font-medium underline decoration-white/30 underline-offset-4 transition-colors">PWAs</a> (see below).
          </p>
        </div>
      </CommandSection>

      {/* Recent Work */}
      <CommandSection command="ls -la ./work" delay={0.4}>
        <div className="flex flex-col gap-4">
          {recentProjects.map((project, i) => (
            <ProjectCard key={project.slug} project={project} />
          ))}
        </div>
      </CommandSection>

      {/* Latest Thoughts */}
      <CommandSection command="tail -n 5 ./thoughts.log" delay={0.6}>
        <div className="flex flex-col gap-6">
          {!supabase ? (
            <div className="p-4 border border-white/5 rounded-sm bg-white/5">
              <p className="text-gray-500 text-xs uppercase tracking-wider">System Offline (Dev Mode)</p>
            </div>
          ) : latestThoughts.length > 0 ? (
            latestThoughts.map((thought: any) => (
              <Link key={thought.slug} href={`/thoughts/${thought.slug}`} className="group block">
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
            ))
          ) : (
             <p className="text-gray-500 italic text-sm">No thoughts published yet.</p>
          )}
        </div>
      </CommandSection>
    </div>
  );
}
