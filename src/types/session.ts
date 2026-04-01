import type { PracticeType, SequenceGroup, SequenceSegment, Side, Status } from "@prisma/client";
import type { MetricKey } from "../lib/constants.js";
import type { NumericStats } from "../lib/insights/helpers.js";

export type SessionViewerPose = {
  id: string;
  slug: string;
  sanskritName: string;
  englishName: string | null;
  sequenceGroup: SequenceGroup;
  isTwoSided: boolean;
};

export type SessionViewerCard = {
  id: string;
  orderInSession: number;
  segment: SequenceSegment | null;
  side: Side | null;
  scored: boolean;
  skipped: boolean;
  overallScore: number | null;
  isComplete: boolean;
  canToggleSkipped: boolean;
  canEditScore: boolean;
  pose: SessionViewerPose;
};

export type SessionViewerSummary = {
  total: number; // legacy key for existing clients
  complete: number; // legacy key for existing clients
  incomplete: number; // legacy key for existing clients
  totalScoreCards: number;
  scoredScoreCards: number;
  unscoredScoreCards: number;
  activeScoreCards: number;
  skippedScoreCards: number;
  completeScoreCards: number;
  incompleteScoreCards: number;
  firstIncompleteScoreCardId: string | null;
};

export type GetSessionByIdResponse = {
  session: {
    id: string;
    status: Status;
    label: string | null;
    practiceType: PracticeType | null;
    durationMinutes: number | null;
    mood: number | null;
    energyLevel: number | null;
    notes: string | null;
    date: string; // ISO
    overallScore: number | null;
    summary: SessionViewerSummary;
    practicedCards: SessionViewerCard[];
    scoredCards: SessionViewerCard[];
  };
};

export type SessionStatsBucket = {
  key: string;
  count: number;
  overallScore: NumericStats;
  metrics: Record<MetricKey, NumericStats>;
};

export type GetSessionStatsResponse = {
  session: {
    id: string;
    status: Status;
    date: string; // ISO
    label: string | null;
    practiceType: PracticeType | null;
    durationMinutes: number | null;
    overallScore: number | null;
  };
  summary: {
    totalScoreCards: number;
    scoredScoreCards: number;
    unscoredScoreCards: number;
    activeScoreCards: number;
    skippedScoreCards: number;
    completeScoreCards: number;
    incompleteScoreCards: number;
  };
  statistics: {
    overallScore: NumericStats;
    metrics: Record<MetricKey, NumericStats>;
    bySegment: SessionStatsBucket[];
    bySide: SessionStatsBucket[];
  };
};

export type SessionListItem = {
  id: string;
  date: string; // ISO
  label: string | null;
  status: Status;
  overallScore: number | null;
  energyLevel: number | null;
  mood: number | null;
  practiceType: PracticeType | null;
};

export type GetAllSessionsResponse = {
  items: SessionListItem[];
  nextCursor: string | null;
};

export type UpdateSessionByIdResponse = {
  session: {
    id: string;
    status: Status;
    date: string; // ISO
    label: string | null;
    practiceType: PracticeType | null;
    durationMinutes: number | null;
    overallScore: number | null;
    energyLevel: number | null;
    mood: number | null;
    notes: string | null;
  };
};
