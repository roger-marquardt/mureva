import {
  assertCrawlAllowed,
  cityRef,
  citySlug,
  formatCityRef,
  hostFromUrl,
  isCrawlAllowed,
  listCoveredCities,
  listCrawlTargets,
  listSitesForCity,
  OutOfCoverageError,
  stateId,
  type CityRef,
} from "./coverage";
import { prisma } from "./db";

jest.mock("./db", () => ({
  prisma: {
    coverageCity: { findMany: jest.fn() },
    coverageSiteCity: { findFirst: jest.fn(), findMany: jest.fn() },
  },
}));

const mockCityFindMany = jest.mocked(prisma.coverageCity.findMany);
const mockFindFirst = jest.mocked(prisma.coverageSiteCity.findFirst);
const mockFindMany = jest.mocked(prisma.coverageSiteCity.findMany);

const CURITIBA: CityRef = { country: "BR", state: "PR", slug: "curitiba" };
const SINGAPORE: CityRef = { country: "SG", state: null, slug: "singapore" };
const CURITIBA_WHERE = { countryId: "BR", stateId: "BR_PR", slug: "curitiba" };
const SINGAPORE_WHERE = { countryId: "SG", stateId: null, slug: "singapore" };

describe("citySlug", () => {
  it("drops accents, case and punctuation", () => {
    expect(citySlug("São José dos Pinhais")).toBe("sao-jose-dos-pinhais");
    expect(citySlug("  Embu das Artes ")).toBe("embu-das-artes");
    expect(citySlug("Santa Bárbara d'Oeste")).toBe("santa-barbara-d-oeste");
    expect(citySlug("sao-jose-dos-pinhais")).toBe("sao-jose-dos-pinhais");
  });

  it("produces only slugs the database check accepts", () => {
    for (const name of ["Curitiba", "Mogi Guaçu", "Pau-d'Arco", "Zürich", "—", "  "]) {
      expect(citySlug(name)).toMatch(/^([a-z0-9]+(-[a-z0-9]+)*)?$/);
    }
  });
});

describe("cityRef", () => {
  it("normalizes name, country and state", () => {
    expect(cityRef("Curitiba", " br ", " pr ")).toEqual(CURITIBA);
  });

  it("treats a missing or blank state as a city without state", () => {
    expect(cityRef("Singapore", "SG")).toEqual(SINGAPORE);
    expect(cityRef("Singapore", "SG", null)).toEqual(SINGAPORE);
    expect(cityRef("Singapore", "SG", "  ")).toEqual(SINGAPORE);
  });

  it("accepts any well-formed code: which countries and states exist is data", () => {
    expect(cityRef("Portland", "US", "OR")).toEqual({ country: "US", state: "OR", slug: "portland" });
    expect(cityRef("Lisboa", "PT", "11")).toEqual({ country: "PT", state: "11", slug: "lisboa" });
  });

  it("rejects an empty name or malformed codes", () => {
    expect(cityRef("—", "BR", "PR")).toBeNull();
    expect(cityRef("Curitiba", "Brasil", "PR")).toBeNull();
    expect(cityRef("Curitiba", "BR", "Paraná")).toBeNull();
  });
});

describe("stateId", () => {
  it("joins country and state code the way State_id_check requires", () => {
    expect(stateId("BR", "AC")).toBe("BR_AC");
    expect(stateId("PT", "11")).toBe("PT_11");
  });
});

describe("formatCityRef", () => {
  it("omits the state when there is none", () => {
    expect(formatCityRef(CURITIBA)).toBe("curitiba/PR/BR");
    expect(formatCityRef(SINGAPORE)).toBe("singapore/SG");
  });
});

describe("hostFromUrl", () => {
  it("returns the exact lowercase hostname", () => {
    expect(hostFromUrl("https://WWW.Example.com.br:8443/imoveis?c=1")).toBe("www.example.com.br");
    expect(hostFromUrl("http://example.com.br./x")).toBe("example.com.br");
  });

  it("does not fold www into the apex domain", () => {
    expect(hostFromUrl("https://www.example.com.br/")).not.toBe(hostFromUrl("https://example.com.br/"));
  });

  it("rejects non-http URLs and garbage", () => {
    expect(hostFromUrl("ftp://example.com.br/")).toBeNull();
    expect(hostFromUrl("file:///etc/passwd")).toBeNull();
    expect(hostFromUrl("example.com.br")).toBeNull();
    expect(hostFromUrl("")).toBeNull();
  });
});

describe("isCrawlAllowed", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it("allows a pair that has an allowlist row", async () => {
    mockFindFirst.mockResolvedValue({ siteId: "site_1" } as never);

    await expect(isCrawlAllowed("https://www.example.com.br/venda/curitiba", CURITIBA)).resolves.toBe(true);

    expect(mockFindFirst).toHaveBeenCalledWith({
      where: { site: { host: "www.example.com.br" }, city: CURITIBA_WHERE },
      select: { siteId: true },
    });
  });

  it("looks up a city without state as exactly that: stateId null", async () => {
    mockFindFirst.mockResolvedValue({ siteId: "site_2" } as never);

    await expect(isCrawlAllowed("https://www.example.sg/", SINGAPORE)).resolves.toBe(true);

    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { site: { host: "www.example.sg" }, city: SINGAPORE_WHERE } }),
    );
  });

  it("refuses when no row names the site for that city", async () => {
    mockFindFirst.mockResolvedValue(null);

    await expect(
      isCrawlAllowed("https://www.example.com.br/venda/londrina", { country: "BR", state: "PR", slug: "londrina" }),
    ).resolves.toBe(false);
  });

  it("normalizes the city before asking the database", async () => {
    mockFindFirst.mockResolvedValue(null);

    await isCrawlAllowed("https://www.example.com.br/", { country: "br", state: "sp", slug: "São Paulo" });

    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          city: { countryId: "BR", stateId: "BR_SP", slug: "sao-paulo" },
        }),
      }),
    );
  });

  it("refuses bad input without touching the database", async () => {
    await expect(isCrawlAllowed("not a url", CURITIBA)).resolves.toBe(false);
    await expect(isCrawlAllowed("https://www.example.com.br/", { ...CURITIBA, country: "BRA" })).resolves.toBe(false);
    await expect(isCrawlAllowed("https://www.example.com.br/", { ...CURITIBA, state: "Paraná" })).resolves.toBe(false);
    await expect(isCrawlAllowed("https://www.example.com.br/", { ...CURITIBA, slug: "" })).resolves.toBe(false);

    expect(mockFindFirst).not.toHaveBeenCalled();
  });
});

describe("assertCrawlAllowed", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it("throws OutOfCoverageError for a pair that is not allowlisted", async () => {
    mockFindFirst.mockResolvedValue(null);

    await expect(assertCrawlAllowed("https://www.example.com.br/", CURITIBA)).rejects.toBeInstanceOf(
      OutOfCoverageError,
    );
  });

  it("passes for an allowlisted pair", async () => {
    mockFindFirst.mockResolvedValue({ siteId: "site_1" } as never);

    await expect(assertCrawlAllowed("https://www.example.com.br/", CURITIBA)).resolves.toBeUndefined();
  });
});

describe("listCoveredCities", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it("flattens country and state codes, with null for cities without state", async () => {
    mockCityFindMany.mockResolvedValue([
      { id: "c1", name: "Curitiba", slug: "curitiba", countryId: "BR", state: { code: "PR" } },
      { id: "c2", name: "Singapore", slug: "singapore", countryId: "SG", state: null },
    ] as never);

    await expect(listCoveredCities()).resolves.toEqual([
      { id: "c1", name: "Curitiba", ...CURITIBA },
      { id: "c2", name: "Singapore", ...SINGAPORE },
    ]);
  });
});

describe("listSitesForCity", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it("returns the hosts allowlisted for the city", async () => {
    mockFindMany.mockResolvedValue([
      { site: { host: "a.example.com.br" } },
      { site: { host: "b.example.com.br" } },
    ] as never);

    await expect(listSitesForCity(CURITIBA)).resolves.toEqual(["a.example.com.br", "b.example.com.br"]);
    expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { city: CURITIBA_WHERE } }));
  });

  it("returns nothing for an invalid city without querying", async () => {
    await expect(listSitesForCity({ ...CURITIBA, country: "XXX" })).resolves.toEqual([]);
    expect(mockFindMany).not.toHaveBeenCalled();
  });
});

describe("listCrawlTargets", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it("returns one target per allowlist row and reads only from the allowlist table", async () => {
    mockFindMany.mockResolvedValue([
      {
        site: { host: "www.example.com.br" },
        city: { id: "c1", name: "Curitiba", slug: "curitiba", countryId: "BR", state: { code: "PR" } },
      },
      {
        site: { host: "www.example.sg" },
        city: { id: "c2", name: "Singapore", slug: "singapore", countryId: "SG", state: null },
      },
    ] as never);

    await expect(listCrawlTargets()).resolves.toEqual([
      { host: "www.example.com.br", city: { id: "c1", name: "Curitiba", ...CURITIBA } },
      { host: "www.example.sg", city: { id: "c2", name: "Singapore", ...SINGAPORE } },
    ]);
    expect(mockFindMany.mock.calls[0][0]).not.toHaveProperty("where");
  });
});
