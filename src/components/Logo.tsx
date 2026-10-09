export function Logo({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="gitray-logo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#22d3ee" />
          <stop offset="1" stopColor="#34d399" />
        </linearGradient>
      </defs>
      <circle cx="14" cy="14" r="9" fill="none" stroke="url(#gitray-logo)" strokeWidth="2.5" />
      <path d="M21 21l7 7" stroke="url(#gitray-logo)" strokeWidth="3" strokeLinecap="round" />
      <path d="M8 14h12" stroke="#22d3ee" strokeWidth="1.5" strokeLinecap="round" opacity="0.9" />
      <circle cx="11" cy="11" r="1.4" fill="#34d399" />
      <circle cx="17" cy="17" r="1.4" fill="#34d399" />
    </svg>
  );
}
