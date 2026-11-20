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
          border: 'border-emerald-200',
          bg: 'bg-white',
          iconBg: 'bg-emerald-50 text-emerald-700',
        };
      case 'warning':
        return {
          border: 'border-amber-200',
          bg: 'bg-white',
          iconBg: 'bg-amber-50 text-amber-700',
        };
      case 'danger':
        return {
          border: 'border-rose-200',
          bg: 'bg-white',
          iconBg: 'bg-rose-50 text-rose-700',
        };
      default:
        return {
          border: 'border-clinical-200',
          bg: 'bg-white',
          iconBg: 'bg-clinical-50 text-clinical-700',
        };
    }
  };

  const styles = getVariantStyles();

  return (
    <div className={`rounded-xl border ${styles.border} ${styles.bg} p-5 shadow-xs transition-shadow hover:shadow-sm`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-clinical-500">{label}</span>
        <div className={`p-2 rounded-lg ${styles.iconBg}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="mt-3 flex items-baseline space-x-1.5">
        <span className="text-2xl font-bold tracking-tight text-clinical-900 tabular-nums">{value}</span>
        {unit && <span className="text-sm font-medium text-clinical-500">{unit}</span>}
      </div>
      {subtext && (
        <p className="mt-1.5 text-xs text-clinical-500 line-clamp-1">{subtext}</p>
      )}
    </div>
  );
};
