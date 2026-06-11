/**
 * Strip a leading `[module/fn]` bracket prefix from a service error so the clerk
 * sees only the plain-language remainder (services throw e.g.
 * "[billing/setClientBillingConfig] set a billing rate for this client first").
 * Falls back to the raw message when there's no prefix.
 *
 * Shared by the admin server actions so error copy is stripped consistently —
 * developer-shaped `[module/fn]` prefixes must never reach a clerk.
 */
export function plainMessage(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  return raw.replace(/^\[[^\]]+\]\s*/, '').trim() || raw;
}
