const BOM = "\uFEFF";

export const PRODUCT_CSV_COLUMNS = [
  "schema_version",
  "brand_id",
  "brand_name_en",
  "product_id",
  "revision",
  "name_en",
  "name_ar",
  "size_value",
  "size_unit",
  "qty",
  "discount",
  "final_price",
  "product_url",
  "image_url",
];

const FORMULA_START = /^[=+\-@]/;

function csvCell(value) {
  let text = String(value ?? "");
  if (FORMULA_START.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function serializeCsv(rows, columns = PRODUCT_CSV_COLUMNS) {
  return (
    BOM +
    [columns, ...rows.map((row) => columns.map((column) => row[column] ?? ""))]
      .map((values) => values.map(csvCell).join(","))
      .join("\r\n") +
    "\r\n"
  );
}

export function downloadCsv(filename, rows, columns = PRODUCT_CSV_COLUMNS) {
  const blob = new Blob([serializeCsv(rows, columns)], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function parseCsv(input) {
  const text = String(input || "").replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"' && cell === "") {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell);
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (quoted) throw new Error("CSV contains an unfinished quoted field");
  if (cell !== "" || row.length) {
    row.push(cell);
    if (row.some((value) => value !== "")) rows.push(row);
  }
  if (rows.length < 1) throw new Error("CSV is empty");
  const headers = rows.shift().map((value) => value.trim());
  const missing = ["name_en", "name_ar", "final_price"].filter(
    (key) => !headers.includes(key),
  );
  if (missing.length)
    throw new Error(`CSV is missing columns: ${missing.join(", ")}`);
  return rows.map((values) =>
    Object.fromEntries(
      headers.map((header, index) => [
        header,
        unescapeCell(values[index] || ""),
      ]),
    ),
  );
}

function unescapeCell(value) {
  return /^'[=+\-@]/.test(value) ? value.slice(1) : value;
}

export function productExportRows(brand, products) {
  return products.map((product) => ({
    schema_version: "1",
    brand_id: brand.id,
    brand_name_en: brand.name_en,
    product_id: product.id,
    revision: product.revision,
    name_en: product.name_en,
    name_ar: product.name_ar,
    size_value: product.size_value,
    size_unit: product.size_unit,
    qty: product.qty,
    discount: product.discount,
    final_price: product.final_price,
    product_url: product.product_url,
    image_url: product.img_url,
  }));
}

export function productTemplateRows(brand) {
  return [
    {
      schema_version: "1",
      brand_id: brand.id,
      brand_name_en: brand.name_en,
      product_id: "",
      revision: "",
      name_en: "",
      name_ar: "",
      size_value: "",
      size_unit: "ml",
      qty: "",
      discount: "",
      final_price: "",
      product_url: "",
      image_url: "",
    },
  ];
}

export function importRows(rows, brand) {
  return rows.map((row) => ({
    ...row,
    brand_id: row.brand_id?.trim() || brand.id,
    brand_name_en: row.brand_name_en?.trim() || brand.name_en,
  }));
}
