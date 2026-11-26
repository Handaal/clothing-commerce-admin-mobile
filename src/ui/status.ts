import type { MessageKey } from "../i18n";

export type StatusTone = "neutral" | "brand" | "success" | "warning" | "danger";

/**
 * Server lifecycle values (orders, products, collections, staff, devices, settings…) mapped to a
 * localized label and a semantic tone, so badges never show raw API codes such as
 * "partially_fulfilled" — and never in English to an Arabic-speaking owner.
 */
const STATUS: Record<string, { key: MessageKey; tone: StatusTone }> = {
  active: { key: "status.active", tone: "success" },
  inactive: { key: "status.inactive", tone: "danger" },
  disabled: { key: "status.disabled", tone: "danger" },
  archived: { key: "status.archived", tone: "danger" },
  draft: { key: "status.draft", tone: "neutral" },
  published: { key: "status.published", tone: "success" },
  unpublished: { key: "status.unpublished", tone: "neutral" },
  placed: { key: "status.placed", tone: "brand" },
  cancelled: { key: "status.cancelled", tone: "danger" },
  fulfilled: { key: "status.fulfilled", tone: "success" },
  partially_fulfilled: { key: "status.partially_fulfilled", tone: "warning" },
  unfulfilled: { key: "status.unfulfilled", tone: "warning" },
  completed: { key: "status.completed", tone: "success" },
  pending: { key: "status.pending", tone: "warning" },
  done: { key: "status.done", tone: "success" },
  open: { key: "status.open", tone: "warning" },
  closed: { key: "status.closed", tone: "neutral" },
  requested: { key: "status.requested", tone: "warning" },
  approved: { key: "status.approved", tone: "success" },
  declined: { key: "status.declined", tone: "danger" },
  invited: { key: "status.invited", tone: "warning" },
  suspended: { key: "status.suspended", tone: "danger" },
  deactivated: { key: "status.deactivated", tone: "danger" },
  enrolled: { key: "status.enrolled", tone: "success" },
  provisioning: { key: "status.provisioning", tone: "warning" },
  revoked: { key: "status.revoked", tone: "danger" },
  expired: { key: "status.expired", tone: "danger" },
  refunded: { key: "status.refunded", tone: "neutral" },
  failed: { key: "status.failed", tone: "danger" },
  succeeded: { key: "status.succeeded", tone: "success" },
  authorized: { key: "status.authorized", tone: "warning" },
  captured: { key: "status.captured", tone: "success" },
};

const CHANNEL: Record<string, MessageKey> = {
  pos: "orderChannel.pos",
  online: "orderChannel.online",
};

/** "partially_fulfilled" → "Partially fulfilled" for values without a translation yet. */
function humanize(value: string): string {
  const words = value.replace(/[_-]+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : value;
}

export function statusLabel(value: string, t: (key: MessageKey) => string): string {
  const entry = STATUS[value.toLowerCase()];
  return entry ? t(entry.key) : humanize(value);
}

export function statusTone(value: string): StatusTone {
  return STATUS[value.toLowerCase()]?.tone ?? "neutral";
}

export function channelLabel(value: string, t: (key: MessageKey) => string): string {
  const key = CHANNEL[value.toLowerCase()];
  return key ? t(key) : humanize(value);
}
