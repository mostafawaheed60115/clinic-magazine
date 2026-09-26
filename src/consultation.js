export const DEFAULT_CONSULTATION_SETTINGS = Object.freeze({
  id: 1,
  whatsapp_phone: "+201062270083",
  telesales_whatsapp_phone: "+201200186286",
  complaints_phone: "+201005758214",
  customer_service_phone: null,
  contact_phone: null,
  revision: 1,
});

export const CONSULTATION_MESSAGE =
  "مرحبا ...  أريد استشارة طبية من خبير ديرموكوزمتكس";
export const TELESALES_MESSAGE = "اهلا، محتاج اتواصل مع أحد ممثلي خدمه العملاء";

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

export function whatsappUrl(phone, message) {
  const normalized = normalizeWhatsappPhone(phone);
  return normalized
    ? `https://wa.me/${normalized.slice(1)}?text=${encodeURIComponent(message)}`
    : "";
}

export const consultationUrl = (phone) =>
  whatsappUrl(phone, CONSULTATION_MESSAGE);
export const telesalesUrl = (phone) => whatsappUrl(phone, TELESALES_MESSAGE);

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
