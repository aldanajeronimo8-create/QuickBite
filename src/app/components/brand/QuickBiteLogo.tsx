import ritenaLogo from '../../../Diseño sin título (1).png';

type QuickBiteLogoProps = { className?: string; imageClassName?: string; alt?: string };

export function QuickBiteLogo({ className = '', imageClassName = '', alt = 'Ritena' }: QuickBiteLogoProps) {
  return (
    <span className={`qb-logo inline-flex size-auto max-h-14 max-w-[11rem] shrink-0 items-center justify-center border-0 bg-transparent p-0 shadow-none ${className}`}>
      <img src={ritenaLogo} alt={alt} className={`block max-h-14 max-w-[11rem] object-contain ${imageClassName}`} />
    </span>
  );
}
