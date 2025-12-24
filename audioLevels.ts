export const MIN_DB = -20;
export const MAX_DB = 20;

export const clampDb = (value: number): number => Math.min(MAX_DB, Math.max(MIN_DB, value));

export const dbToGain = (db: number): number => Math.pow(10, clampDb(db) / 20);

export const gainToDb = (gain: number): number => {
  if (!Number.isFinite(gain) || gain <= 0) {
    return MIN_DB;
  }
  return clampDb(20 * Math.log10(gain));
};

export const formatDb = (db: number): string => {
  const rounded = Math.round(db);
  const sign = rounded > 0 ? '+' : '';
  return `${sign}${rounded} dB`;
};
