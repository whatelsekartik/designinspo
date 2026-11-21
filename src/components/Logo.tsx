export function LogoMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="logo-grad" x1="4" y1="4" x2="28" y2="28" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F5C9A4" />
          <stop offset="0.55" stopColor="#E4794A" />
          <stop offset="1" stopColor="#8C3F22" />
        </linearGradient>
      </defs>
      <path
        d="M9.4 22.8c-3.6 0-5.4-2.4-5.4-6.6 0-5.3 2.6-9.2 6.4-9.2 3.1 0 4.9 2.3 6.1 6.1 1.2 3.9 2.3 5.7 4.2 5.7 2 0 3.1-1.9 3.1-5.2 0-3.6-1.2-5.4-3.3-5.4-1.6 0-2.6 1.1-3.2 3.4"
        stroke="url(#logo-grad)"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <circle cx="25.4" cy="8.2" r="1.9" fill="#F2C9A8" />
    </svg>
  );
}

export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark size={compact ? 19 : 22} />
      <span className="flex flex-col leading-none">
        <span className="text-[15px] font-medium tracking-[0.28em] text-paper">INFINITE</span>
        {!compact && <span className="mono mt-1 text-[8px] tracking-[0.24em] text-muted">AI VISUAL UNIVERSE</span>}
      </span>
    </span>
  );
}
