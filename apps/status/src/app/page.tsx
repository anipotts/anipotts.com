import { FadeIn, StatusDot } from "@anipotts/ui";
import { FaServer, FaGlobe, FaCheck } from "react-icons/fa";

const services = [
  { name: "anipotts.com", status: "operational", uptime: "99.9%" },
  { name: "thoughts.anipotts.com", status: "operational", uptime: "99.9%" },
  { name: "quantercise.com", status: "operational", uptime: "99.8%" },
  { name: "chat.quantercise.com", status: "operational", uptime: "99.7%" },
  { name: "chained.chat", status: "coming_soon", uptime: "-" },
  { name: "fourtwenty.nyc", status: "coming_soon", uptime: "-" },
  { name: "saeshify.com", status: "coming_soon", uptime: "-" },
];

export default function StatusPage() {
  const operationalCount = services.filter(s => s.status === "operational").length;
  const allOperational = operationalCount === services.filter(s => s.status !== "coming_soon").length;

  return (
    <div className="flex flex-col gap-8 py-8 px-4 max-w-3xl mx-auto">
      <FadeIn>
        <div className="flex items-center justify-between border-b border-white/10 pb-6">
          <div>
            <h1 className="text-xs uppercase tracking-widest text-accent-400 mb-2">System Status</h1>
            <div className="flex items-center gap-2">
              {allOperational ? (
                <>
                  <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-green-400 text-sm font-medium">All Systems Operational</span>
                </>
              ) : (
                <>
                  <div className="w-3 h-3 rounded-full bg-yellow-500 animate-pulse" />
                  <span className="text-yellow-400 text-sm font-medium">Partial Outage</span>
                </>
              )}
            </div>
          </div>
          <div className="text-right">
            <span className="text-[10px] text-gray-500 uppercase tracking-wider">Last Updated</span>
            <p className="text-xs text-gray-400">{new Date().toLocaleString()}</p>
          </div>
        </div>
      </FadeIn>

      <div className="space-y-3">
        {services.map((service, i) => (
          <FadeIn key={service.name} delay={i * 0.05}>
            <div className="flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-lg hover:bg-white/[0.07] transition-colors">
              <div className="flex items-center gap-3">
                <FaGlobe className="text-gray-500" />
                <span className="text-gray-200">{service.name}</span>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-xs text-gray-500">{service.uptime}</span>
                {service.status === "operational" ? (
                  <span className="flex items-center gap-1.5 text-xs text-green-400">
                    <div className="w-2 h-2 rounded-full bg-green-500" />
                    Operational
                  </span>
                ) : service.status === "coming_soon" ? (
                  <span className="flex items-center gap-1.5 text-xs text-gray-500">
                    <div className="w-2 h-2 rounded-full bg-gray-600" />
                    Coming Soon
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-xs text-red-400">
                    <div className="w-2 h-2 rounded-full bg-red-500" />
                    Outage
                  </span>
                )}
              </div>
            </div>
          </FadeIn>
        ))}
      </div>

      <FadeIn delay={0.4}>
        <div className="text-center pt-8 border-t border-white/5">
          <p className="text-xs text-gray-600">
            Powered by BetterStack • Updates every 60 seconds
          </p>
        </div>
      </FadeIn>
    </div>
  );
}
