export const DEFAULT_CONSULTATION_SETTINGS = Object.freeze({
  id: 1,
  whatsapp_phone: "+201062270083",
  customer_service_phone: null,
  contact_phone: null,
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

// Customer service and footer contacts may use Egyptian landlines as well as mobiles.
export function normalizeContactPhone(value) {
  const compact = String(value || "").replace(/[\s()-]/g, "");
  const international = /^0\d{8,10}$/.test(compact)
    ? `+2${compact}`
    : /^00\d+$/.test(compact)
      ? `+${compact.slice(2)}`
      : compact.startsWith("+")
        ? compact
        : `+${compact}`;
  return /^\+[1-9]\d{7,14}$/.test(international) ? international : "";
}

export function phoneUrl(phone) {
  const normalized = normalizeContactPhone(phone);
  return normalized ? `tel:${normalized}` : "";
}
