/**
 * Normalizes an Indian mobile number to E.164 format: +91XXXXXXXXXX
 *
 * Accepts:
 *   "9876543210"       → "+919876543210"
 *   "+919876543210"    → "+919876543210"
 *   "919876543210"     → "+919876543210"
 *
 * Throws BadRequestException for any other input.
 */
export function normalizeIndianPhone(raw: string): string {
  if (!raw || typeof raw !== 'string') {
    throw new Error('Phone number is required');
  }
  const stripped = raw.trim().replace(/[\s\-()]/g, '');
  const digits = stripped.replace(/^\+/, '');

  if (digits.length === 10) {
    if (!/^[6-9]\d{9}$/.test(digits)) {
      throw new Error('Invalid Indian mobile number. Must start with 6-9 and be 10 digits.');
    }
    return '+91' + digits;
  }

  if (digits.length === 12 && digits.startsWith('91')) {
    const local = digits.slice(2);
    if (!/^[6-9]\d{9}$/.test(local)) {
      throw new Error('Invalid Indian mobile number. Must start with 6-9 and be 10 digits.');
    }
    return '+' + digits;
  }

  throw new Error(
    'Invalid Indian phone number. Enter a 10-digit mobile number (e.g. 9876543210) or full E.164 format (+919876543210).',
  );
}

/**
 * Masks a normalized Indian phone number for display.
 * "+919876543210" → "+91 98****3210"
 */
export function maskIndianPhone(normalized: string): string {
  if (normalized.startsWith('+91') && normalized.length === 13) {
    const local = normalized.slice(3);
    return '+91 ' + local.slice(0, 2) + '****' + local.slice(6);
  }
  return normalized;
}
