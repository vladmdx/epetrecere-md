import { cn } from "@/lib/utils";

export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 32 32"
      className={cn("h-7 w-7", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M15.8 4.2c1.4 4.8 3.2 6.6 8 8-4.8 1.4-6.6 3.2-8 8-1.4-4.8-3.2-6.6-8-8 4.8-1.4 6.6-3.2 8-8Z" />
      <path d="M7.8 19.2c.8 2.8 1.8 3.8 4.6 4.6-2.8.8-3.8 1.8-4.6 4.6-.8-2.8-1.8-3.8-4.6-4.6 2.8-.8 3.8-1.8 4.6-4.6ZM25.2 3.6c.5 1.8 1.2 2.5 3 3-1.8.5-2.5 1.2-3 3-.5-1.8-1.2-2.5-3-3 1.8-.5 2.5-1.2 3-3Z" />
      <circle cx="16" cy="12.3" r="1.3" />
    </svg>
  );
}
