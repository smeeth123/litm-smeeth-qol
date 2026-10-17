const SYSTEM_ID = "mist-engine-fvtt";
const ENTRY = "/module/mist-engine-fvtt.mjs";

/** Resolve against the system's actual entry URL, preserving its ESM identity. */
export function systemModuleURL(path, { scripts = document.scripts, baseURI = document.baseURI,
  modules = game.system.esmodules, getRoute = foundry.utils.getRoute } = {}) {
  const entries = [...scripts].map(script => script.src).filter(Boolean);
  // The rendered script URL is authoritative on CDN hosts. Declared absolute
  // entries cover loaders which do not retain a script element.
  entries.push(...[...(modules ?? [])].filter(url => /^https?:\/\/|^\//.test(url)));
  for (const entry of entries) {
    const url = new URL(entry, baseURI);
    if (!url.pathname.endsWith(ENTRY)) continue;
    return new URL(path, url).href;
  }
  return new URL(getRoute(`systems/${SYSTEM_ID}/module/${path}`), baseURI).href;
}

export function importSystemModule(path) {
  return import(systemModuleURL(path));
}
