import type { LucideIcon } from "lucide-react";
import { CheckCircle2 } from "lucide-react";
import { cn } from "../ui/utils";

interface SelectionCardProps {
  title: string;
  description: string;
  icon: LucideIcon;
  selected: boolean;
  onClick: () => void;
  multi?: boolean;
}

export function SelectionCard({
  title,
  description,
  icon: Icon,
  selected,
  onClick,
  multi,
}: SelectionCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative min-h-[178px] overflow-hidden rounded-xl border p-4 text-left transition-all duration-300",
        "bg-[#0b1628]/80 backdrop-blur-md hover:-translate-y-1 hover:border-cyan-500/50 hover:bg-card/75 hover:shadow-xl hover:shadow-cyan-500/15",
        selected
          ? "border-cyan-500/70 bg-cyan-500/12 shadow-xl shadow-cyan-500/15"
          : "border-border/50",
      )}
      aria-pressed={selected}
    >
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/70 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      <div className="absolute -right-10 -top-10 h-24 w-24 rounded-full bg-cyan-500/20 blur-2xl opacity-70 transition-opacity duration-300 group-hover:opacity-100" />
      <div className="absolute bottom-0 left-4 right-4 h-px bg-gradient-to-r from-transparent via-blue-400/30 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

      <div className="relative flex h-full flex-col">
        <div className="mb-4 flex items-start justify-between">
          <div
            className={cn(
              "flex h-11 w-11 items-center justify-center rounded-lg border transition-all duration-300",
              selected
                ? "border-cyan-400/60 bg-cyan-500/20 text-cyan-200 shadow-[0_0_18px_rgba(6,182,212,0.16)]"
                : "border-border/60 bg-secondary/40 text-muted-foreground group-hover:border-cyan-500/30 group-hover:text-cyan-300",
            )}
          >
            <Icon className="w-5 h-5" />
          </div>
          <div
            className={cn(
              "flex h-6 min-w-6 items-center justify-center rounded-full border text-[10px] transition-all duration-300",
              selected
                ? "border-cyan-400/60 bg-cyan-500/20 text-cyan-200 shadow-[0_0_14px_rgba(6,182,212,0.14)]"
                : "border-border/50 text-muted-foreground",
            )}
          >
            {selected ? <CheckCircle2 className="w-4 h-4" /> : multi ? "+" : ""}
          </div>
        </div>

        <div className="space-y-2">
          <h3 className="text-base text-foreground">{title}</h3>
          <p className="text-sm leading-5 text-muted-foreground">{description}</p>
        </div>
      </div>
    </button>
  );
}
