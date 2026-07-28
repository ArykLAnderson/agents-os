import { isIP } from "node:net";

const PORTABLE_PUBLIC_AUDIENCES = new Set(["portable", "public"]);

function parseIpv4(hostname) {
  if (isIP(hostname) !== 4) return null;
  return hostname.split(".").map(Number);
}

function ipv4IsLocalOrPrivate(parts) {
  const [first, second] = parts;
  return first === 0
    || first === 10
    || first === 127
    || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 168);
}

function expandIpv6(hostname) {
  if (isIP(hostname) !== 6) return null;
  const halves = hostname.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  const omitted = halves.length === 2 ? 8 - left.length - right.length : 0;
  const groups = [...left, ...Array(Math.max(0, omitted)).fill("0"), ...right].map((value) => Number.parseInt(value || "0", 16));
  return groups.length === 8 && groups.every((value) => Number.isInteger(value) && value >= 0 && value <= 0xffff)
    ? groups
    : null;
}

function ipv6IsLocalOrPrivate(groups) {
  if (groups.every((value) => value === 0)) return true;
  if (groups.slice(0, 7).every((value) => value === 0) && groups[7] === 1) return true;
  const first = groups[0];
  if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 unique-local
  if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((first & 0xffc0) === 0xfec0) return true; // fec0::/10 deprecated site-local
  if (groups.slice(0, 5).every((value) => value === 0) && groups[5] === 0xffff) {
    return ipv4IsLocalOrPrivate([groups[6] >> 8, groups[6] & 0xff, groups[7] >> 8, groups[7] & 0xff]);
  }
  return false;
}

export function portablePublicLocatorAssessment(uri) {
  let parsed;
  try {
    parsed = new URL(uri);
  } catch {
    return { safe: false, reason: "absolute_http_locator_required" };
  }
  if (!new Set(["http:", "https:"]).has(parsed.protocol)) {
    return { safe: false, reason: "http_https_scheme_required" };
  }
  if (parsed.username || parsed.password) return { safe: false, reason: "locator_credentials_prohibited" };
  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
    return { safe: false, reason: "local_hostname_prohibited" };
  }
  const ipv4 = parseIpv4(hostname);
  if (ipv4 && ipv4IsLocalOrPrivate(ipv4)) return { safe: false, reason: "local_or_private_ip_prohibited" };
  const ipv6 = expandIpv6(hostname);
  if (ipv6 && ipv6IsLocalOrPrivate(ipv6)) return { safe: false, reason: "local_or_private_ip_prohibited" };
  return { safe: true, reason: null };
}

export function locatorSafeForAudience(locator, audience, audienceVisible = () => true) {
  if (!audienceVisible(locator?.audience, audience)) return false;
  return !PORTABLE_PUBLIC_AUDIENCES.has(audience) || portablePublicLocatorAssessment(locator?.uri).safe;
}
