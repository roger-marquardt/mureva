import { z } from "zod";

export type IpLocation = {
  city: string | null;
  region: string | null;
  country: string | null;
  network: string | null;
};

const liteResponseSchema = z.object({
  country: z.string().optional(),
  as_name: z.string().optional(),
});

const coreResponseSchema = z.object({
  geo: z
    .object({
      city: z.string().optional(),
      region: z.string().optional(),
      country: z.string().optional(),
    })
    .optional(),
  as: z.object({ name: z.string().optional() }).optional(),
});

const PRIVATE_IP = /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|fc|fd|fe80)/i;
const LOOKUP_TIMEOUT_MS = 3000;

export function clientIpFrom(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip")?.trim() || null;
}

function lookupUrl(ip: string, token: string): string {
  const encodedIp = encodeURIComponent(ip);
  const encodedToken = encodeURIComponent(token);
  return process.env.IPINFO_PLAN === "core"
    ? `https://api.ipinfo.io/lookup/${encodedIp}?token=${encodedToken}`
    : `https://api.ipinfo.io/lite/${encodedIp}?token=${encodedToken}`;
}

export function parseIpinfoResponse(body: unknown): IpLocation | null {
  const core = coreResponseSchema.safeParse(body);
  if (core.success && core.data.geo) {
    return {
      city: core.data.geo.city ?? null,
      region: core.data.geo.region ?? null,
      country: core.data.geo.country ?? null,
      network: core.data.as?.name ?? null,
    };
  }
  const lite = liteResponseSchema.safeParse(body);
  if (!lite.success) {
    return null;
  }
  return {
    city: null,
    region: null,
    country: lite.data.country ?? null,
    network: lite.data.as_name ?? null,
  };
}

export async function lookupIpLocation(ip: string): Promise<IpLocation | null> {
  const token = process.env.IPINFO_TOKEN;
  if (!token || PRIVATE_IP.test(ip)) {
    return null;
  }
  const response = await fetch(lookupUrl(ip, token), {
    signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`ipinfo respondeu ${response.status}`);
  }
  return parseIpinfoResponse(await response.json());
}

export function formatIpLocation(location: IpLocation): string {
  return [location.city, location.region, location.country].filter(Boolean).join(", ");
}
