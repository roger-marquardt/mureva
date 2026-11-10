import { prisma } from "./db";

/**
 * Coverage list: the only source of truth for which cities are in play and which websites may be
 * read for each of them. Everything that fetches external listings must ask here first, and
 * everything here fails closed: an unknown site, an unknown city, a site/city pair without an
 * allowlist row, or an unparseable URL all mean "do not crawl".
 */

/**
 * Identifies a covered city the same way the database does: ISO country code, state code within
 * that country (null for countries without states) and the slug of the city name.
 */
export type CityRef = { country: string; state: string | null; slug: string };

export type CoveredCity = CityRef & { id: string; name: string };

export type CrawlTarget = { host: string; city: CoveredCity };

export class OutOfCoverageError extends Error {
  constructor(
    readonly url: string,
    readonly city: CityRef,
  ) {
    super(`Fora da cobertura: ${url} não está liberado para ${formatCityRef(city)}`);
    this.name = "OutOfCoverageError";
  }
}

/** Same formats as Country_id_check and State_code_check. Which codes exist is data, not code. */
const COUNTRY_CODE = /^[A-Z]{2}$/;
const STATE_CODE = /^[A-Z0-9]{1,3}$/;

const CITY_SELECT = {
  id: true,
  name: true,
  slug: true,
  countryId: true,
  state: { select: { code: true } },
} as const;

type CityRow = {
  id: string;
  name: string;
  slug: string;
  countryId: string;
  state: { code: string } | null;
};

function toCoveredCity(row: CityRow): CoveredCity {
  return {
    id: row.id,
    name: row.name,
    country: row.countryId,
    state: row.state?.code ?? null,
    slug: row.slug,
  };
}

/** State.id for a state code within a country: ("BR", "AC") -> "BR_AC". Matches State_id_check. */
export function stateId(country: string, state: string): string {
  return `${country}_${state}`;
}

/** "São José dos Pinhais" -> "sao-jose-dos-pinhais". Matches CoverageCity_slug_check. */
export function citySlug(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Builds a CityRef from free text, or null when a code is malformed or the name is empty.
 * A blank state means "no state"; whether that is right for the country is for the database to
 * answer, and a Brazilian city looked up without its state simply matches nothing.
 */
export function cityRef(name: string, country: string, state?: string | null): CityRef | null {
  const slug = citySlug(name);
  const countryCode = country.trim().toUpperCase();
  const stateCode = state?.trim().toUpperCase() || null;
  if (!slug || !COUNTRY_CODE.test(countryCode) || (stateCode !== null && !STATE_CODE.test(stateCode))) {
    return null;
  }
  return { country: countryCode, state: stateCode, slug };
}

export function formatCityRef(city: CityRef): string {
  return [city.slug, city.state, city.country].filter(Boolean).join("/");
}

function normalizedRef(city: CityRef): CityRef | null {
  return cityRef(city.slug, city.country, city.state);
}

/** Prisma filter for exactly this city: stateless refs only match cities without a state. */
function cityWhere(ref: CityRef) {
  return {
    countryId: ref.country,
    stateId: ref.state === null ? null : stateId(ref.country, ref.state),
    slug: ref.slug,
  };
}

/**
 * Hostname exactly as CoverageSite.host stores it, or null for anything that is not an http(s) URL.
 * No "www." folding: "example.com.br" and "www.example.com.br" are different sites.
 */
export function hostFromUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null;
  }
  return parsed.hostname.toLowerCase().replace(/\.$/, "") || null;
}

export async function listCoveredCities(): Promise<CoveredCity[]> {
  const rows = await prisma.coverageCity.findMany({
    select: CITY_SELECT,
    orderBy: [{ countryId: "asc" }, { stateId: "asc" }, { slug: "asc" }],
  });
  return rows.map(toCoveredCity);
}

/** Hosts allowed for the city. Empty when the city is not covered. */
export async function listSitesForCity(city: CityRef): Promise<string[]> {
  const ref = normalizedRef(city);
  if (!ref) {
    return [];
  }
  const rows = await prisma.coverageSiteCity.findMany({
    where: { city: cityWhere(ref) },
    select: { site: { select: { host: true } } },
    orderBy: { site: { host: "asc" } },
  });
  return rows.map((row) => row.site.host);
}

/** Every (site, city) pair that may be crawled. A crawler should iterate this and nothing else. */
export async function listCrawlTargets(): Promise<CrawlTarget[]> {
  const rows = await prisma.coverageSiteCity.findMany({
    select: { site: { select: { host: true } }, city: { select: CITY_SELECT } },
    orderBy: [
      { city: { countryId: "asc" } },
      { city: { stateId: "asc" } },
      { city: { slug: "asc" } },
      { site: { host: "asc" } },
    ],
  });
  return rows.map((row) => ({ host: row.site.host, city: toCoveredCity(row.city) }));
}

/** True only when the URL's host is a listed site whose allowlist names this city. */
export async function isCrawlAllowed(url: string, city: CityRef): Promise<boolean> {
  const host = hostFromUrl(url);
  const ref = normalizedRef(city);
  if (!host || !ref) {
    return false;
  }
  const row = await prisma.coverageSiteCity.findFirst({
    where: { site: { host }, city: cityWhere(ref) },
    select: { siteId: true },
  });
  return row !== null;
}

/** Call immediately before fetching a page for a city. Throws OutOfCoverageError otherwise. */
export async function assertCrawlAllowed(url: string, city: CityRef): Promise<void> {
  if (!(await isCrawlAllowed(url, city))) {
    throw new OutOfCoverageError(url, city);
  }
}
