import type { CSSProperties, ReactNode } from 'react';

type BentoSpan = '1x1' | '2x1' | '1x2' | '2x2' | '3x1' | '4x1';

interface BentoCardProps {
  span?: BentoSpan;
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
  noPad?: boolean;
  onClick?: () => void;
}

export function BentoGrid({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div className="bento-grid" style={style}>
      {children}
    </div>
  );
}

export function BentoCard({
  span = '1x1',
  children,
  style,
  className = '',
  noPad = false,
  onClick,
}: BentoCardProps) {
  return (
    <div
      className={`card bento-${span} ${className}`}
      style={{ padding: noPad ? 0 : undefined, overflow: 'hidden', ...style }}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
    >
      {children}
    </div>
  );
}
