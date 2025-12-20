export type LicenseStatus = 'active' | 'revoked';

export interface LicenseRecord {
  key: string;
  status?: LicenseStatus;
  expiresAt?: string | null;
  label?: string;
  notes?: string;
}

export interface LicenseFile {
  version: number;
  licenses: LicenseRecord[];
}

const LICENSE_PATH = '/licenses.json';

export const normalizeLicenseKey = (value: string) => value.trim().toUpperCase();

const sanitizeLicenseRecord = (record: LicenseRecord): LicenseRecord => {
  const key = typeof record?.key === 'string' ? normalizeLicenseKey(record.key) : '';
  const status: LicenseStatus = record?.status === 'revoked' ? 'revoked' : 'active';
  const expiresAt = typeof record?.expiresAt === 'string' ? record.expiresAt : null;
  const label = typeof record?.label === 'string' ? record.label : undefined;
  const notes = typeof record?.notes === 'string' ? record.notes : undefined;

  return { key, status, expiresAt, label, notes };
};

export const loadLicenseFile = async (path: string = LICENSE_PATH): Promise<LicenseFile> => {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`License list not found (${response.status}).`);
  }

  const data = (await response.json()) as LicenseFile;
  if (!data || !Array.isArray(data.licenses)) {
    throw new Error('License list is invalid.');
  }

  const licenses = data.licenses
    .map((record) => sanitizeLicenseRecord(record))
    .filter((record) => record.key.length > 0);

  return {
    version: typeof data.version === 'number' ? data.version : 1,
    licenses,
  };
};

const isExpired = (license: LicenseRecord, now: Date = new Date()): boolean => {
  if (!license.expiresAt) {
    return false;
  }

  const expiresAt = new Date(license.expiresAt);
  if (Number.isNaN(expiresAt.getTime())) {
    return true;
  }

  return expiresAt.getTime() < now.getTime();
};

export type LicenseValidationResult =
  | { ok: true; license: LicenseRecord }
  | { ok: false; reason: 'missing' | 'invalid' | 'revoked' | 'expired'; message: string };

export const validateLicenseKey = (
  input: string,
  licenses: LicenseRecord[]
): LicenseValidationResult => {
  const normalized = normalizeLicenseKey(input);
  if (!normalized) {
    return {
      ok: false,
      reason: 'missing',
      message: 'Please enter a license key.',
    };
  }

  const license = licenses.find((record) => normalizeLicenseKey(record.key) === normalized);
  if (!license) {
    return {
      ok: false,
      reason: 'invalid',
      message: 'This license key is not recognized. Please verify your partner credentials.',
    };
  }

  if (license.status && license.status !== 'active') {
    return {
      ok: false,
      reason: 'revoked',
      message: 'This license key has been revoked. Please use another key.',
    };
  }

  if (isExpired(license)) {
    return {
      ok: false,
      reason: 'expired',
      message: 'This license key has expired. Please use a new key.',
    };
  }

  return { ok: true, license };
};
