const art = "./assets/campaign.webp";
const brandNames = [
  ["luma", "LUMA", "لوما", "Skin essentials"],
  ["rove", "rove.", "روف", "Daily rituals"],
  ["nacre", "NACRE", "ناكر", "Considered care"],
  ["petale", "pétale", "بيتال", "Everyday beauty"],
  ["serein", "SEREIN", "سيرين", "A softer routine"],
  ["velin", "vélin", "فيلين", "Made for moments"],
  ["forma", "FORMA", "فورما", "Simple essentials"],
  ["aura", "aura", "أورا", "Beauty in balance"],
  ["mira", "MIRA", "ميرا", "A fresh perspective"],
  ["nolia", "nolia", "نوليا", "Care, thoughtfully"],
];
const productNames = [
  ["Hydrating serum", "سيروم مرطّب", 30, "ml", 285],
  ["Daily moisturizer", "مرطّب يومي", 50, "g", 320],
  ["Gentle cleanser", "غسول لطيف", 200, "ml", 245],
  ["Nourishing cream", "كريم مغذٍّ", 100, "g", 195],
  ["Softening lotion", "لوشن منعّم", 250, "ml", 275],
  ["Skin mist", "رذاذ للبشرة", 100, "ml", 180],
  ["Night cream", "كريم ليلي", 50, "g", 345],
  ["Care oil", "زيت للعناية", 30, "ml", 310],
  ["Fresh toner", "تونر منعش", 150, "ml", 225],
];
export function seedData() {
  return {
    companies: brandNames.map(([id, name_en, name_ar, tagline], i) => ({
      id,
      name_en,
      name_ar,
      phone: "",
      logo_url: "",
      tagline,
      style: i % 5,
      revision: 1,
    })),
    products: brandNames.flatMap(([company_id], i) =>
      productNames.map(
        ([name_en, name_ar, size_value, size_unit, price], j) => ({
          id: `${company_id}-${j + 1}`,
          company_id,
          name_en,
          name_ar,
          size_value,
          size_unit,
          qty: j % 3 === 0 ? 12 : null,
          img_url: j % 2 === 0 ? "./assets/serum.webp" : "./assets/cream.webp",
          discount: j % 4 === 0 ? 15 : null,
          final_price: price + i * 10,
          revision: 1,
        }),
      ),
    ),
    offers: [
      {
        id: "offer-1",
        company_id: "luma",
        name_ar: "عناية تستحق مكانًا\nفي مجموعتك.",
        name_en: "A little care.\nA beautiful difference.",
        description_ar: "اكتشف مجموعة العناية اليومية من لوما.",
        description_en: "Meet LUMA’s everyday skincare collection.",
        img_link: art,
      },
      {
        id: "offer-2",
        company_id: "rove",
        name_ar: "أساسيات الجمال،\nبتفاصيل مختلفة.",
        name_en: "Your daily ritual,\nbeautifully reimagined.",
        description_ar: "تصفّح أساسيات روتين العناية من روف.",
        description_en: "Explore everyday care essentials from rove.",
        img_link: art,
      },
      {
        id: "offer-3",
        company_id: "nacre",
        name_ar: "اختيارات جديدة.\nاحتمالات أجمل.",
        name_en: "Fresh discoveries.\nBeautiful possibilities.",
        description_ar: "اكتشف اختيارات العناية من ناكر.",
        description_en: "Discover thoughtful skincare from NACRE.",
        img_link: art,
      },
    ].map((x) => ({ ...x, revision: 1 })),
  };
}
