"use client";

import FadeIn from "@/components/FadeIn";
import posthog from "posthog-js";

const socials = [
  { name: "email", value: "anirudhpottammal@nyu.edu", href: "mailto:anirudhpottammal@nyu.edu", label: "reach out" },
  { name: "x", value: "@anipottsbuilds", href: "https://x.com/anipottsbuilds", label: "follow" },
  { name: "github", value: "anipotts", href: "https://github.com/anipotts", label: "code" },
  { name: "instagram", value: "@ani_potts", href: "https://instagram.com/ani_potts", label: "life" },
  { name: "tiktok", value: "@anipotts", href: "https://tiktok.com/@anipotts", label: "content" },
  { name: "linkedin", value: "anipotts", href: "https://www.linkedin.com/in/anirudh-pottammal-01b186216/", label: "professional" },
];

const handleSocialClick = (social: typeof socials[0]) => {
  posthog.capture('social_link_clicked', {
    platform: social.name,
    link_value: social.value,
    href: social.href,
  });
};

import ContactForm from "@/components/ContactForm";

export default function ConnectPage() {
  return (
    <div className="flex flex-col gap-12 pb-20">
      {/* Intro Section */}
      <section className="grid grid-cols-1 md:grid-cols-4 gap-8 md:gap-12">
        <div className="col-span-1">
          <FadeIn>
            <h1 className="text-xs font-bold uppercase tracking-widest text-accent-400">connect</h1>
          </FadeIn>
        </div>
        <div className="col-span-1 md:col-span-3">
          <FadeIn delay={0.1}>
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-signal-green">
                <span>open to collaboration</span>
              </div>
              <p className="text-lg md:text-xl text-gray-300 leading-relaxed max-w-2xl">
                If you're working with LLM orchestration systems and think I can help, feel free to reach out:
              </p>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* Socials Section */}
      <section className="grid grid-cols-1 md:grid-cols-4 gap-8 md:gap-12">
        <div className="col-span-1">
          <FadeIn delay={0.2}>
            <h2 className="text-xs font-bold uppercase tracking-widest text-accent-400">Socials</h2>
          </FadeIn>
        </div>
        <div className="col-span-1 md:col-span-3">
          <FadeIn delay={0.2}>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {socials.map((social) => (
                <a
                  key={social.name}
                  href={social.href}
                  target={social.name === "email" ? undefined : "_blank"}
                  rel={social.name === "email" ? undefined : "noopener noreferrer"}
                  className="group flex items-center justify-between p-4 border border-white/5 rounded-sm bg-white/5 hover:bg-white/10 hover:border-white/10 transition-all duration-300"
                  onClick={() => handleSocialClick(social)}
                >
                  <span className="text-xs uppercase tracking-widest text-gray-400 group-hover:text-accent-400 transition-colors">
                    {social.name}
                  </span>
                  <span className="text-xs text-gray-600 group-hover:text-gray-400 transition-colors transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 duration-300">
                    ↗
                  </span>
                </a>
              ))}
            </div>
          </FadeIn>
        </div>
      </section>

      {/* Contact Form Section */}
      <section className="grid grid-cols-1 md:grid-cols-4 gap-8 md:gap-12">
        <div className="col-span-1">
          <FadeIn delay={0.3}>
            <h2 className="text-xs font-bold uppercase tracking-widest text-accent-400">Message Me</h2>
          </FadeIn>
        </div>
        <div className="col-span-1 md:col-span-3">
          <FadeIn delay={0.3}>
            <div className="max-w-xl">
              <ContactForm />
            </div>
          </FadeIn>
        </div>
      </section>
    </div>
  );
}
