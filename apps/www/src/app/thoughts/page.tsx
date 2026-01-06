import { supabase } from "@/lib/supabaseClient";
import FadeIn from "@/components/FadeIn";
import ThoughtLink from "./ThoughtLink";

export const revalidate = 0;

async function getThoughts() {
  if (!supabase) return [];
  try {
    const { data } = await supabase
      .from("thoughts")
      .select("*")
      .eq("published", true)
      .order("created_at", { ascending: false });
    return data || [];
  } catch (e) {
    console.error("Error fetching thoughts:", e);
    return [];
  }
}

export default async function ThoughtsPage() {
  const thoughts = await getThoughts();

  return (
    <div className="flex flex-col gap-12 pb-20">
      <section className="grid grid-cols-1 md:grid-cols-4 gap-8 md:gap-12">
        <div className="col-span-1">
          <FadeIn>
            <h1 className="text-xs font-bold uppercase tracking-widest text-accent-400">thoughts</h1>
          </FadeIn>
        </div>
        <div className="col-span-1 md:col-span-3 flex flex-col gap-8">
          {!supabase ? (
            <FadeIn delay={0.1}>
              <div className="p-4 border border-white/5 rounded-sm bg-white/5">
                <p className="text-gray-500 text-xs uppercase tracking-wider">System Offline (Dev Mode)</p>
              </div>
            </FadeIn>
          ) : thoughts.length === 0 ? (
            <FadeIn delay={0.1}>
              <p className="text-gray-500 italic text-sm">No thoughts published yet.</p>
            </FadeIn>
          ) : (
            thoughts.map((thought: any, i) => (
              <FadeIn key={thought.slug} delay={i * 0.1}>
                <ThoughtLink thought={thought} />
              </FadeIn>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
