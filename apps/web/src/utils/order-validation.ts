const ORDER_VALIDATION_QR_PREFIX = "KINSELL:ORDER_VALIDATION:V1";

function normalizeValidationCode(code: string) {
  return code.trim().toUpperCase();
}

export function buildOrderValidationQrPayload(orderId: string, code: string) {
  return `${ORDER_VALIDATION_QR_PREFIX}|${orderId}|${normalizeValidationCode(code)}`;
}

export function extractValidationCodeFromQrPayload(rawValue: string, expectedOrderId?: string) {
  const raw = rawValue.trim();
  if (!raw) {
    return null;
  }

  if (raw.startsWith(`${ORDER_VALIDATION_QR_PREFIX}|`)) {
    const [, orderId, code] = raw.split("|");
    if (!orderId || !code) {
      return null;
    }

    if (expectedOrderId && orderId !== expectedOrderId) {
      return null;
    }

    const normalized = normalizeValidationCode(code);
    return /^[A-Z0-9]{4,20}$/.test(normalized) ? normalized : null;
  }

  const normalized = normalizeValidationCode(raw);
  return /^[A-Z0-9]{4,20}$/.test(normalized) ? normalized : null;
}