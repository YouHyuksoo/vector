interface CardProps {
  children: React.ReactNode;
  hover?: boolean;
  noPadding?: boolean;
  className?: string;
}

export function Card({ children, hover, noPadding, className = '' }: CardProps) {
  return (
    <div className={`rounded-2xl border border-border bg-card transition-all duration-200
      ${hover ? 'hover:shadow-lg hover:border-primary/50' : ''}
      ${noPadding ? '' : 'p-6'} ${className}`}>
      {children}
    </div>
  );
}

export function CardHeader({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`mb-4 ${className}`}>{children}</div>;
}

export function CardContent({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={className}>{children}</div>;
}
