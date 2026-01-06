import { FadeIn } from "@anipotts/ui";
import { FaGithub, FaClock, FaCode, FaFire, FaCalendar } from "react-icons/fa";

const stats = {
  totalCommits: "2,847",
  currentStreak: "23 days",
  longestStreak: "67 days",
  totalRepos: "142",
  codingHoursWeek: "38h 24m",
  topLanguages: [
    { name: "TypeScript", percentage: 45, color: "#3178c6" },
    { name: "Python", percentage: 25, color: "#3572A5" },
    { name: "JavaScript", percentage: 15, color: "#f1e05a" },
    { name: "Go", percentage: 10, color: "#00ADD8" },
    { name: "Other", percentage: 5, color: "#6b7280" },
  ],
};

export default function MetricsPage() {
  return (
    <div className="flex flex-col gap-8 py-8 px-4 max-w-4xl mx-auto">
      <FadeIn>
        <div className="border-b border-white/10 pb-6">
          <h1 className="text-xs uppercase tracking-widest text-accent-400 mb-2">Coding Metrics</h1>
          <p className="text-gray-500 text-sm">GitHub & WakaTime statistics</p>
        </div>
      </FadeIn>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Commits", value: stats.totalCommits, icon: FaGithub },
          { label: "Current Streak", value: stats.currentStreak, icon: FaFire },
          { label: "Longest Streak", value: stats.longestStreak, icon: FaCalendar },
          { label: "This Week", value: stats.codingHoursWeek, icon: FaClock },
        ].map((stat, i) => (
          <FadeIn key={stat.label} delay={i * 0.1}>
            <div className="p-4 bg-white/5 border border-white/10 rounded-lg">
              <div className="flex items-center gap-2 text-gray-500 text-xs mb-2">
                <stat.icon className="text-accent-400" />
                {stat.label}
              </div>
              <span className="text-2xl font-bold text-white">{stat.value}</span>
            </div>
          </FadeIn>
        ))}
      </div>

      <FadeIn delay={0.4}>
        <div className="p-6 bg-white/5 border border-white/10 rounded-lg">
          <h2 className="text-xs uppercase tracking-widest text-gray-500 mb-4 flex items-center gap-2">
            <FaCode className="text-accent-400" />
            Top Languages
          </h2>
          <div className="space-y-3">
            {stats.topLanguages.map((lang) => (
              <div key={lang.name} className="flex items-center gap-3">
                <span className="w-20 text-sm text-gray-300">{lang.name}</span>
                <div className="flex-grow h-2 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${lang.percentage}%`, backgroundColor: lang.color }} />
                </div>
                <span className="w-12 text-xs text-gray-500 text-right">{lang.percentage}%</span>
              </div>
            ))}
          </div>
        </div>
      </FadeIn>

      <FadeIn delay={0.5}>
        <div className="text-center pt-4 border-t border-white/5">
          <p className="text-xs text-gray-600">Data from GitHub API & WakaTime</p>
        </div>
      </FadeIn>
    </div>
  );
}
