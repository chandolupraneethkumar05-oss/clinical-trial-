import type { FC } from 'react';
import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: string | number;
  unit?: string;
  subtext?: string;
  icon: LucideIcon;
  variant?: 'default' | 'safe' | 'warning' | 'danger';
}

export const StatCard: FC<StatCardProps> = ({
  label,
  value,
  unit,
  subtext,
  icon: Icon,
  variant = 'default'
}) => {
  const getVariantStyles = () => {
    switch (variant) {
      case 'safe':
        return {
          border: 'border-sage-200 hover:border-sage-300',
          bg: 'bg-white',
          iconBg: 'bg-sage-50 text-sage-600 border border-sage-200/60',
          accent: 'text-sage-700',
        };
      case 'warning':
        return {
          border: 'border-amber-200 hover:border-amber-300',
          bg: 'bg-white',
          iconBg: 'bg-amber-50 text-amber-600 border border-amber-200/60',
          accent: 'text-amber-700',
        };
      case 'danger':
        return {
          border: 'border-terracotta-200 hover:border-terracotta-300',
          bg: 'bg-white',
          iconBg: 'bg-terracotta-50 text-terracotta-600 border border-terracotta-200/60',
          accent: 'text-terracotta-700',
        };
      default:
        return {
          border: 'border-linen-300 hover:border-linen-400',
          bg: 'bg-white',
          iconBg: 'bg-linen-100 text-charcoal-700 border border-linen-200',
          accent: 'text-charcoal-900',
        };
    }
  };

  const styles = getVariantStyles();

  return (
    <div className={`rounded-2xl border ${styles.border} ${styles.bg} p-5 shadow-xs transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 group`}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-mono uppercase tracking-wider text-charcoal-500 font-semibold">{label}</span>
        <div className={`p-2 rounded-xl ${styles.iconBg} transition-transform duration-200 group-hover:scale-105`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="mt-3 flex items-baseline space-x-1.5">
        <span className={`font-serif text-3xl font-bold tracking-tight ${styles.accent} tabular-nums`}>
          {value}
        </span>
        {unit && <span className="text-xs font-mono font-medium text-charcoal-500">{unit}</span>}
      </div>
      {subtext && (
        <p className="mt-2 text-[11px] text-charcoal-500 line-clamp-1 font-mono leading-relaxed">{subtext}</p>
      )}
    </div>
  );
};
