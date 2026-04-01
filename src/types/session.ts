import type { PracticeType, SequenceGroup, SequenceSegment, Side, Status } from "@prisma/client";

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
    scoreCards: SessionViewerCard[]; // alias to practicedCards
    practicedCards: SessionViewerCard[];
    scoredCards: SessionViewerCard[];
  };
};
