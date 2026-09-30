export function toWhatsAppE164(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  const explicitInternational = trimmed.startsWith("+") || trimmed.startsWith("00");
  let digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("00")) digits = digits.slice(2);

  if (explicitInternational) {
    return digits.length >= 8 && digits.length <= 15 && digits[0] !== "0"
      ? `+${digits}`
      : null;
  }

  // The CRM is pt-BR: accept Brazilian numbers entered with DDD, or with 55.
  if ((digits.length === 10 || digits.length === 11) && digits[0] !== "0") {
    return `+55${digits}`;
  }
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    return `+${digits}`;
  }
  return null;
}

export function isWhatsAppWindowOpen(lastInboundAt: string | null | undefined, now = Date.now()) {
  if (!lastInboundAt) return false;
  const receivedAt = new Date(lastInboundAt).getTime();
  return Number.isFinite(receivedAt) && receivedAt <= now && now - receivedAt < 24 * 60 * 60 * 1000;
}
