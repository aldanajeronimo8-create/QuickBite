import { useState } from 'react';
import quickBiteLogo from '../../../assets/quickbite-logo.png';
import { useVisualTheme } from '../../contexts/VisualThemeProvider';

type QuickBiteLogoProps = {
  className?: string;
  imageClassName?: string;
  alt?: string;
};

export function QuickBiteLogo({ className = '', imageClassName = '', alt }: QuickBiteLogoProps) {
  const { settings } = useVisualTheme();
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
  const isLogin = pathname === '/' || pathname === '/login';
  const preferredSource = (isLogin ? settings.login_logo_url : settings.logo_url) || settings.logo_url || quickBiteLogo;
  const [source, setSource] = useState(preferredSource);

  if (source !== preferredSource && preferredSource === quickBiteLogo) setSource(quickBiteLogo);

  const label = alt || settings.app_name || 'QuickBite';

  return (
    <span
      className={`qb-logo inline-flex size-auto max-h-14 max-w-[11rem] shrink-0 items-center justify-center border-0 bg-transparent p-0 shadow-none ${className}`}
    >
      <img
        src={source}
        alt={label}
        className={`block max-h-14 max-w-[11rem] object-contain ${imageClassName}`}
        onError={() => {
          if (source !== quickBiteLogo) setSource(quickBiteLogo);
        }}
      />
    </span>
  );
}
