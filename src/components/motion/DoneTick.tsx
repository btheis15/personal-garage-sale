/** The big green tick: the circle pops, the tick draws itself, a ring spreads out. */
export function DoneTick({ size = 64, className = "" }: { size?: number; className?: string }) {
  return (
    <span className={`done-tick mx-auto grid place-items-center rounded-full bg-leaf text-white ${className}`} style={{ width: size, height: size }}>
      <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
    </span>
  );
}
