import type { InputHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "w-full rounded-2xl border border-white/10 bg-black/20 px-4 text-sm text-white outline-none placeholder:text-slate-500 focus:border-orange-400/40 focus:ring-2 focus:ring-orange-400/20",
        className
      )}
      {...props}
    />
  );
}