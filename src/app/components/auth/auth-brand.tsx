import { Cloud, RadioTower } from "lucide-react";

export function AuthBrand() {
  return (
    <div className="space-y-5">
      <div className="flex flex-col lg:flex-row items-center gap-3 text-center lg:text-left">
        <div className="bg-gradient-to-br from-cyan-500 to-blue-600 p-2.5 rounded-lg shadow-lg shadow-cyan-500/20">
          <Cloud className="w-7 h-7 text-white" />
        </div>
        <div>
          <h1 className="tracking-tight">
            <span className="bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
              INDRAVANI
            </span>{" "}
            <span className="text-foreground/80">WEATHER INTELLIGENCE</span>
          </h1>
          <p className="text-xs text-muted-foreground">
            Atmospheric Sounding & Radiosonde Analytics Platform
          </p>
        </div>
      </div>

      <div className="hidden lg:block space-y-4">
        <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-[11px] uppercase tracking-widest text-cyan-400">
          <RadioTower className="w-3.5 h-3.5" />
          Scientific access console
        </div>
        <div className="space-y-3">
          <h2 className="max-w-xl text-2xl md:text-3xl font-light leading-tight text-foreground">
            Mission-grade climate intelligence for research, teaching, and operational weather analysis.
          </h2>
          <p className="max-w-lg text-sm leading-6 text-muted-foreground">
            Built for institutions that need focused atmospheric data workflows, radiosonde analytics, and live mission visibility.
          </p>
        </div>
      </div>
    </div>
  );
}
