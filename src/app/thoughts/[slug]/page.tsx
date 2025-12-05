import Link from "next/link";
import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import ReactMarkdown from "react-markdown";
import FadeIn from "@/components/FadeIn";
import { getPostHogClient } from "@/lib/posthog-server";
import { headers } from "next/headers";
import ViewCounter from "@/components/ViewCounter";
import IncrementView from "@/components/IncrementView";

export const revalidate = 60;

async function getThought(slug: string) {
  if (!supabase) return null;
  const { data } = await supabase
    .from("thoughts")
    .select("*")
    .eq("slug", slug)
    .single();
  return data;
}

export default async function ThoughtPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const thought = await getThought(slug);

  // Track thought_read event on the server
  if (thought) {
    try {
      const headersList = await headers();
      const posthog = getPostHogClient();
      // Use an anonymous distinct ID based on IP or fallback
      const forwardedFor = headersList.get('x-forwarded-for');
      const ip = forwardedFor ? forwardedFor.split(',')[0] : 'anonymous';
      const distinctId = `anon_${ip}`;

      posthog.capture({
        distinctId: distinctId,
        event: 'thought_read',
        properties: {
          thought_slug: thought.slug,
          thought_title: thought.title,
          thought_tags: thought.tags,
          $current_url: `/thoughts/${slug}`,
        },
      });
    } catch (error) {
      console.error('PostHog capture error:', error);
    }
  }

  if (!thought) {
    if (!supabase) {
       return (
        <div className="flex flex-col gap-12 pb-20">
          <section className="grid grid-cols-1 md:grid-cols-4 gap-8 md:gap-12">
            <div className="col-span-1">
              <FadeIn>
                <Link href="/thoughts" className="text-xs font-bold uppercase tracking-widest text-accent-400 hover:text-accent-400 transition-colors">
                  back
                </Link>
              </FadeIn>
            </div>
            <div className="col-span-1 md:col-span-3">
              <FadeIn delay={0.1}>
                <div className="p-4 border border-white/5 rounded-sm bg-white/5">
                  <p className="text-gray-500 text-xs uppercase tracking-wider">System Offline (Dev Mode)</p>
                </div>
              </FadeIn>
            </div>
          </section>
        </div>
       );
    }
    notFound();
  }

  return (
    <div className="flex flex-col gap-12 pb-20">
      <IncrementView slug={thought.slug} />
      <section className="grid grid-cols-1 md:grid-cols-4 gap-8 md:gap-12">
        <div className="col-span-1 flex flex-col gap-4">
          <FadeIn>
            <Link href="/thoughts" className="text-xs font-bold uppercase tracking-widest text-gray-500 hover:text-accent-400 transition-colors">
              back
            </Link>
          </FadeIn>
          <FadeIn delay={0.1}>
            <div className="flex flex-col gap-1 text-xs text-gray-500 uppercase tracking-wide mt-8">
              <span>published</span>
              <time dateTime={thought.created_at} className="text-gray-300">
                {new Date(thought.created_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
              </time>
              <div className="mt-2">
                <ViewCounter slug={thought.slug} initialViews={thought.views} />
              </div>
            </div>
          </FadeIn>
          {thought.tags && (
             <FadeIn delay={0.2}>
              <div className="flex flex-col gap-2 mt-4">
                <span className="text-xs text-gray-500 uppercase tracking-wide">tags</span>
                <div className="flex flex-wrap gap-2">
                  {(Array.isArray(thought.tags) ? thought.tags : (typeof thought.tags === 'string' ? thought.tags.split(',') : [])).map((tag: string) => (
                    <span key={tag} className="text-[10px] uppercase tracking-wider text-accent-400 border border-accent-400/20 px-2 py-1 rounded-sm">
                      {tag.trim()}
                    </span>
                  ))}
                </div>
              </div>
            </FadeIn>
          )}
        </div>

        <div className="col-span-1 md:col-span-3">
          <FadeIn delay={0.1}>
            <h1 className="text-3xl md:text-4xl font-bold text-gray-100 leading-tight mb-8">
              {thought.title}
            </h1>
          </FadeIn>

          <FadeIn delay={0.2}>
            <div className="prose prose-invert prose-gray max-w-none prose-headings:font-bold prose-a:text-accent-400 prose-a:no-underline hover:prose-a:underline prose-img:rounded-lg prose-p:leading-relaxed prose-li:marker:text-gray-500">
              <ReactMarkdown
                components={{
                  img: ({ node, ...props }) => {
                    if (!props.src) return null;
                    // eslint-disable-next-line @next/next/no-img-element
                    return <img {...props} alt={props.alt || ""} style={{ maxWidth: "100%" }} />;
                  },
                }}
              >
                {thought.content}
              </ReactMarkdown>
            </div>
          </FadeIn>
        </div>
      </section>
    </div>
  );
}
