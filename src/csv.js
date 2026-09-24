const BOM = "\uFEFF";

export const PRODUCT_CSV_COLUMNS = [
  "name_en",
  "name_ar",
  "size_value",
  "size_unit",
  "qty",
  "discount",
  "final_price",
  "product_url",
  "image_url",
  "brand_id",
  "product_id",
  "revision",
];

export const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 5000;
// Keep headroom below the RPC's 5 MiB JSONB-text limit for Postgres formatting.
export const MAX_IMPORT_PAYLOAD_BYTES = 4.5 * 1024 * 1024;

const FORMULA_START = /^[=+\-@]/;
const NUMERIC_COLUMNS = ["size_value", "qty", "discount", "final_price"];

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

export async function readCsvFile(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const startsWith = (...prefix) =>
    prefix.every((byte, index) => bytes[index] === byte);

  try {
    if (startsWith(0xef, 0xbb, 0xbf))
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (startsWith(0xff, 0xfe))
      return new TextDecoder("utf-16le", { fatal: true }).decode(bytes);
    if (startsWith(0xfe, 0xff))
      return new TextDecoder("utf-16be", { fatal: true }).decode(bytes);
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    // Older Excel saves Arabic CSV in Windows-1256; only accept that fallback
    // when decoding actually yields Arabic instead of silently corrupting text.
    if (
      startsWith(0xef, 0xbb, 0xbf) ||
      startsWith(0xff, 0xfe) ||
      startsWith(0xfe, 0xff)
    ) {
      throw csvError("csv_encoding", error);
    }
    const legacyText = new TextDecoder("windows-1256").decode(bytes);
    if (!/[\u0600-\u06ff]/u.test(legacyText))
      throw csvError("csv_encoding", error);
    return legacyText;
  }
}

function csvError(code, cause) {
  const error = new Error(code);
  error.code = code;
  if (cause instanceof Error) error.cause = cause;
  else if (cause !== undefined) error.row = cause;
  return error;
}

function countHeaderDelimiters(header, delimiter) {
  let count = 0;
  let quoted = false;
  for (let index = 0; index < header.length; index += 1) {
    const char = header[index];
    if (quoted && char === '"' && header[index + 1] === '"') {
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (!quoted && char === delimiter) {
      count += 1;
    }
  }
  return count;
}

function detectDelimiter(text) {
  const firstLine = text.split(/\r\n|\n|\r/, 1)[0] || "";
  return [",", ";", "\t", "،"].reduce(
    (best, candidate) =>
      countHeaderDelimiters(firstLine, candidate) >
      countHeaderDelimiters(firstLine, best)
        ? candidate
        : best,
    ",",
  );
}

export function parseCsv(input) {
  const text = String(input || "").replace(/^\uFEFF/, "");
  const delimiter = detectDelimiter(text);
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
    } else if (char === delimiter) {
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
  if (quoted) throw csvError("csv_unfinished_quote");
  if (cell !== "" || row.length) {
    row.push(cell);
    if (row.some((value) => value !== "")) rows.push(row);
  }
  if (rows.length < 1) throw csvError("csv_empty");
  const headers = rows.shift().map((value) => value.trim());
  if (headers.some((header) => !header)) throw csvError("csv_empty_header");
  if (new Set(headers).size !== headers.length)
    throw csvError("csv_duplicate_headers");
  const missing = ["name_en", "name_ar", "final_price"].filter(
    (key) => !headers.includes(key),
  );
  if (missing.length) throw csvError("csv_missing_columns");
  return rows.map((values, index) => {
    if (values.length > headers.length)
      throw csvError("csv_extra_fields", index + 2);
    return Object.fromEntries(
      headers.map((header, column) => [
        header,
        unescapeCell(values[column] || ""),
      ]),
    );
  });
}

function unescapeCell(value) {
  return /^'[=+\-@]/.test(value) ? value.slice(1) : value;
}

// A legacy spreadsheet save can replace Arabic letters with literal '?' bytes.
// Reject the damaged value before a preview can write it back to the catalog.
export function hasCorruptArabic(value) {
  return /^\?{2,}$/.test(String(value || "").replace(/\s/g, ""));
}

export function productExportRows(brand, products) {
  return products.map((product) => ({
    name_en: product.name_en,
    name_ar: product.name_ar,
    size_value: product.size_value,
    size_unit: product.size_unit,
    qty: product.qty,
    discount: product.discount,
    final_price: product.final_price,
    product_url: product.product_url,
    image_url: product.img_url,
    brand_id: brand.id,
    product_id: product.id,
    revision: product.revision,
  }));
}

export function productTemplateRows(brand) {
  return [
    {
      name_en: "",
      name_ar: "",
      size_value: "",
      size_unit: "ml",
      qty: "",
      discount: "",
      final_price: "",
      product_url: "",
      image_url: "",
      brand_id: brand.id,
      product_id: "",
      revision: "",
    },
  ];
}

export function importRows(rows, brand) {
  return rows.map((row, index) => {
    if (hasCorruptArabic(row.name_ar))
      throw csvError("csv_arabic_corrupt", index + 2);
    const imported = {
      ...row,
      brand_id: row.brand_id?.trim() || brand.id,
    };
    for (const column of NUMERIC_COLUMNS) {
      if (imported[column] != null && imported[column] !== "")
        imported[column] = normalizeImportNumber(imported[column]);
    }
    if (imported.size_unit)
      imported.size_unit = normalizeSizeUnit(imported.size_unit);
    return imported;
  });
}

function normalizeImportNumber(value) {
  let text = String(value)
    .replace(/[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "")
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/[\u066c\u00a0\u202f\s]/g, "")
    .replaceAll("٫", ".")
    .replaceAll("−", "-")
    .trim();

  const sign = text.startsWith("-") || text.startsWith("+") ? text[0] : "";
  const unsigned = sign ? text.slice(1) : text;
  const lastComma = unsigned.lastIndexOf(",");
  const lastDot = unsigned.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    // Respect the rightmost separator as the decimal mark (1.234,5 and
    // 1,234.5 are both common in spreadsheets exported from different locales).
    if (lastComma > lastDot) {
      text = `${sign}${unsigned.replaceAll(".", "").replace(",", ".")}`;
    } else {
      text = `${sign}${unsigned.replaceAll(",", "")}`;
    }
  } else if (lastComma >= 0) {
    const commaDecimal = /^\d+,\d+$/.test(unsigned);
    const commaThousands = /^\d{1,3}(?:,\d{3})+$/.test(unsigned);
    if (commaDecimal && !commaThousands) {
      text = `${sign}${unsigned.replace(",", ".")}`;
    } else if (commaThousands) {
      text = `${sign}${unsigned.replaceAll(",", "")}`;
    }
  }
  return text;
}

function normalizeSizeUnit(value) {
  const unit = String(value).trim().toLocaleLowerCase();
  if (["ml", "مل", "ملليلتر", "مليلتر", "مللي لتر"].includes(unit)) return "ml";
  if (["g", "جم", "جرام", "غ", "غم", "غرام"].includes(unit)) return "g";
  return value;
}
