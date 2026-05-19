import type { ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
};

export function Button({ className, variant = "primary", ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-2xl border px-4 py-2 text-sm font-medium transition duration-200 disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" &&
          "border-orange-400/30 bg-orange-400 text-slate-950 shadow-lg shadow-orange-500/20 hover:bg-orange-300",
        variant === "secondary" &&
          "border-white/10 bg-white/8 text-white hover:bg-white/12",
        variant === "ghost" && "border-transparent bg-transparent text-slate-300 hover:bg-white/6",
        className
      )}
      {...props}
    />
  );
}