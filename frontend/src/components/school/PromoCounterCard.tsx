import { Card } from '@/components/ui/Card';

interface PromoCounterCardProps {
  count: number;
  label: string;
  tone?: 'default' | 'success' | 'warning' | 'destructive';
}

export function PromoCounterCard({ count, label, tone = 'default' }: PromoCounterCardProps) {
  const toneStyles = {
    default: 'text-foreground',
    success: 'text-success-foreground',
    warning: 'text-warning-foreground',
    destructive: 'text-destructive-foreground',
  };

  return (
    <Card className="flex flex-col items-center gap-2 p-4 sm:p-5">
      <span className={`text-4xl font-bold ${toneStyles[tone]}`}>{count}</span>
      <span className="text-center text-sm text-muted-foreground">{label}</span>
    </Card>
  );
}
