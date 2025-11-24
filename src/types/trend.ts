// types/trend.ts
import type { SequenceSegment, Side } from '@prisma/client';

export const ALLOWED_METRICS = [
  'ease',
  'comfort',
  'stability',
  'pain',
  'breath',
  'focus',
  'overallScore',
] as const;

export type AllowedMetric = typeof ALLOWED_METRICS[number];

export type TrendPoint = {
  scoreCardId: string;
  sessionDate: string;           // ISO
  createdAt: string;             // ISO
  side: Side | null;             // LEFT/RIGHT/NA or null
  segment: SequenceSegment | null;
  orderInSession: number;
  skipped: boolean;
  values: Partial<Record<AllowedMetric, number | null>>;
};

export type PoseTrendResponse = {
  pose: {
    id: string;
    slug: string;
    sanskritName: string;
    englishName?: string | null;
  };
  metrics: AllowedMetric[];       // which metrics are present in values
  window: { from?: string; to?: string } // ISO boundaries actually used
  points: TrendPoint[];           // sorted by session.date asc, then orderInSession
};
