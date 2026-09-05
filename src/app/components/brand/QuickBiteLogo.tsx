import quickBiteLogo from '../../../assets/quickbite-logo.png';

type QuickBiteLogoVariant =
  | 'primary'
  | 'white-blue'
  | 'blue-yellow'
  | 'white-green'
  | 'monochrome'
  | 'dark-color';

type QuickBiteLogoProps = {
  className?: string;
  imageClassName?: string;
  alt?: string;
  variant?: QuickBiteLogoVariant;
};

/** QuickBite brand mark with the six approved identity applications. */
export function QuickBiteLogo({
  className = '',
  imageClassName = '',
  alt = 'QuickBite',
  variant = 'primary',
}: QuickBiteLogoProps) {
  return (
    <span
      className={`qb-logo qb-logo--${variant} inline-flex shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white p-1.5 shadow-lg ring-1 ring-slate-950/10 ${className}`}
    >
      <img
        src={quickBiteLogo}
        alt={alt}
        className={`h-full w-full scale-[1.55] object-contain ${imageClassName}`}
      />
    </span>
  );
}
