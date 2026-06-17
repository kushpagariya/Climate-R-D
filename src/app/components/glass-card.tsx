import { ReactNode } from "react";
import { cn } from "./ui/utils";

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  noPadding?: boolean;
}

export function GlassCard({ children, className, noPadding }: GlassCardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border/50 bg-card/60 backdrop-blur-md shadow-lg",
        !noPadding && "p-6",
        className
      )}
    >
      {children}
    </div>
  );
}
