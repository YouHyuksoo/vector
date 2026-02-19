'use client';

const SIZE_MAP = { xs: 16, sm: 20, md: 24, lg: 28, xl: 32, '2xl': 40 } as const;

interface IconProps {
  name: string;
  size?: keyof typeof SIZE_MAP;
  filled?: boolean;
  className?: string;
}

export function Icon({ name, size = 'sm', filled, className = '' }: IconProps) {
  const px = SIZE_MAP[size];
  return (
    <span
      className={`material-symbols-outlined ${filled ? 'filled' : ''} ${className}`}
      style={{ fontSize: px, width: px, height: px, lineHeight: `${px}px` }}
    >
      {name}
    </span>
  );
}
