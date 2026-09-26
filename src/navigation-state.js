import { t } from "./i18n.js";
import { ask } from "./ui.js";

// Keep navigation guard state out of the admin bundle so public pages can load
// without downloading editor, CSV, and image-library code.
let dirty = false;

export const isDirty = () => dirty;

export function markClean() {
  dirty = false;
}

export function setDirty(value) {
  dirty = Boolean(value);
}

export async function mayLeave() {
  if (!dirty) return true;
  const leave = await ask(t("discardQuestion"), t("discardText"), t("discard"));
  if (leave) markClean();
  return leave;
}
