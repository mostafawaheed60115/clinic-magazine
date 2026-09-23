export const DEFAULT_CONSULTATION_SETTINGS = Object.freeze({
  id: 1,
  whatsapp_phone: "+201062270083",
  revision: 1,
});

export const CONSULTATION_MESSAGE =
  "مرحبا ...  أريد استشارة طبية من خبير ديرموكوزمتكس";

// Accept Egyptian mobile numbers in local form, or an international number.
export function normalizeWhatsappPhone(value) {
  const compact = String(value || "").replace(/[\s()-]/g, "");
  const international = /^01\d{9}$/.test(compact)
    ? `+2${compact}`
    : /^00\d+$/.test(compact)
      ? `+${compact.slice(2)}`
      : compact.startsWith("+")
        ? compact
        : `+${compact}`;
  return /^\+[1-9]\d{7,14}$/.test(international) ? international : "";
}

export function consultationUrl(phone) {
  const normalized = normalizeWhatsappPhone(phone);
  return normalized
    ? `https://wa.me/${normalized.slice(1)}?text=${encodeURIComponent(CONSULTATION_MESSAGE)}`
    : "";
}
