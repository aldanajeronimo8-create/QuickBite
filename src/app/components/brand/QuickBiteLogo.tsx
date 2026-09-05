import quickBiteLogo from '../../../assets/quickbite-logo.png';

type QuickBiteLogoProps = {
  className?: string;
  imageClassName?: string;
  alt?: string;
};

/**
 * Branded mark with its own light surface so the transparent wordmark remains
 * legible on both the student (green) and admin (blue) interfaces.
 */
export function QuickBiteLogo({
  className = '',
  imageClassName = '',
  alt = 'QuickBite',
}: QuickBiteLogoProps) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden bg-white p-1.5 shadow-lg ring-1 ring-slate-950/10 ${className}`}
    >
      <img src={quickBiteLogo} alt={alt} className={`h-full w-full scale-[1.55] object-contain ${imageClassName}`} />
    </span>
  );
}
