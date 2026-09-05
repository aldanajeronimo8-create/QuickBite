import { liquidMetalFragmentShader, ShaderMount } from '@paper-design/shaders';
import { Sparkles } from 'lucide-react';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';

interface LiquidMetalButtonProps {
  label?: string;
  onClick?: () => void;
  viewMode?: 'text' | 'icon';
  disabled?: boolean;
  className?: string;
}

export function LiquidMetalButton({
  label = 'Get Started',
  onClick,
  viewMode = 'text',
  disabled = false,
  className = '',
}: LiquidMetalButtonProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isPressed, setIsPressed] = useState(false);
  const [ripples, setRipples] = useState<Array<{ x: number; y: number; id: number }>>([]);
  const shaderRef = useRef<HTMLDivElement>(null);
  const shaderMount = useRef<any>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const rippleId = useRef(0);

  useEffect(() => {
    const styleId = 'quickbite-liquid-metal-style';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        .quickbite-liquid-metal-shader canvas {
          width: 100% !important;
          height: 100% !important;
          display: block !important;
          position: absolute !important;
          inset: 0 !important;
          border-radius: 999px !important;
        }
        @keyframes quickbite-liquid-ripple {
          0% { transform: translate(-50%, -50%) scale(0); opacity: .55; }
          100% { transform: translate(-50%, -50%) scale(4); opacity: 0; }
        }
      `;
      document.head.appendChild(style);
    }

    if (!shaderRef.current) return;
    shaderMount.current?.destroy?.();
    shaderMount.current = new ShaderMount(
      shaderRef.current,
      liquidMetalFragmentShader,
      {
        u_repetition: 4,
        u_softness: 0.5,
        u_shiftRed: 0.3,
        u_shiftBlue: 0.3,
        u_distortion: 0,
        u_contour: 0,
        u_angle: 45,
        u_scale: 8,
        u_shape: 1,
        u_offsetX: 0.1,
        u_offsetY: -0.1,
      },
      undefined,
      0.6,
    );

    return () => {
      shaderMount.current?.destroy?.();
      shaderMount.current = null;
    };
  }, []);

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled) return;
    shaderMount.current?.setSpeed?.(2.4);
    window.setTimeout(() => shaderMount.current?.setSpeed?.(isHovered ? 1 : 0.6), 300);
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) {
      const ripple = { x: event.clientX - rect.left, y: event.clientY - rect.top, id: rippleId.current++ };
      setRipples((prev) => [...prev, ripple]);
      window.setTimeout(() => setRipples((prev) => prev.filter((item) => item.id !== ripple.id)), 600);
    }
    onClick?.();
  };

  return (
    <div className={`relative inline-flex ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={handleClick}
        onMouseEnter={() => { setIsHovered(true); shaderMount.current?.setSpeed?.(1); }}
        onMouseLeave={() => { setIsHovered(false); setIsPressed(false); shaderMount.current?.setSpeed?.(0.6); }}
        onMouseDown={() => setIsPressed(true)}
        onMouseUp={() => setIsPressed(false)}
        aria-label={label}
        className="relative isolate flex h-11 min-w-[142px] items-center justify-center overflow-hidden rounded-full border-0 bg-black p-0 shadow-[0_8px_24px_rgba(0,0,0,.18)] outline-none transition-transform duration-150 hover:shadow-[0_12px_28px_rgba(0,0,0,.24)] focus-visible:ring-2 focus-visible:ring-emerald-400/70 active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-50"
      >
        <div ref={shaderRef} className="quickbite-liquid-metal-shader absolute inset-0 overflow-hidden rounded-full" />
        <span className="pointer-events-none relative z-10 flex items-center gap-2 px-5 text-sm font-semibold text-slate-200 drop-shadow-[0_1px_2px_rgba(0,0,0,.7)]">
          {viewMode === 'icon' && <Sparkles size={16} />}
          {viewMode === 'text' && <span className="whitespace-nowrap">{label}</span>}
        </span>
        {ripples.map((ripple) => (
          <span key={ripple.id} className="pointer-events-none absolute z-20 h-5 w-5 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,.4)_0%,rgba(255,255,255,0)_70%)]" style={{ left: ripple.x, top: ripple.y, animation: 'quickbite-liquid-ripple .6s ease-out' }} />
        ))}
      </button>
      {isPressed && <span className="pointer-events-none absolute inset-0 rounded-full shadow-[inset_0_2px_5px_rgba(0,0,0,.45)]" />}
    </div>
  );
}
