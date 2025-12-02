export const METRIC_KEYS = ['ease','comfort','stability','pain','breath','focus'] as const;
export type MetricKey = typeof METRIC_KEYS[number];