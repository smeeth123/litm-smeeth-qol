/** A theme's identity is its first power tag; the document name is its type. */
export function themeTitle(theme) {
  return String(theme?.system?.powertags?.[0]?.name ?? "").trim()
    || String(theme?.name ?? "").trim() || "Theme";
}
