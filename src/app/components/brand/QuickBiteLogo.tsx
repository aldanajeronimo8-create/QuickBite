type QuickBiteLogoProps = { className?: string; imageClassName?: string; alt?: string };

export function QuickBiteLogo({ className = '', imageClassName = '', alt = 'Ritena' }: QuickBiteLogoProps) {
  return (
    <span
      role="img"
      aria-label={alt}
      className={`qb-logo inline-flex aspect-square size-auto max-h-14 max-w-[11rem] shrink-0 items-center justify-center border-0 bg-transparent p-0 shadow-none ${className}`}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 64 64"
        className={`block h-full w-full max-h-14 max-w-14 object-contain ${imageClassName}`}
        fill="none"
      >
        <circle cx="32" cy="32" r="30" fill="#102A43" />
        <path d="M13 22c4.4-7 10.7-10.5 19-10.5S46.6 15 51 22" stroke="#5EEAD4" strokeWidth="5" strokeLinecap="round" />
        <path d="M13 42c4.4 7 10.7 10.5 19 10.5S46.6 49 51 42" stroke="#5EEAD4" strokeWidth="5" strokeLinecap="round" />
        <path d="M18 32h28" stroke="#FACC15" strokeWidth="5" strokeLinecap="round" />
        <circle cx="32" cy="32" r="4.2" fill="#FACC15" />
      </svg>
    </span>
  );
}
