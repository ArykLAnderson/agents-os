// Owner-neutral locator normalization. Keep this shared by projection and every
// exact resolver; callers must submit this canonical representation.
export function normalizeExactLocator(value) {
  if (typeof value !== "string" || !value || value.length > 256) throw new TypeError("Exact locator must be a non-empty bounded string.");
  return value.normalize("NFC").toLocaleLowerCase("und").normalize("NFC");
}
