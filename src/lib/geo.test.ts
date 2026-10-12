import { clientIpFrom, parseIpinfoResponse } from "./geo";

describe("clientIpFrom", () => {
  it("uses the first x-forwarded-for entry", () => {
    const headers = new Headers({ "x-forwarded-for": "200.100.50.25, 10.0.0.1" });
    expect(clientIpFrom(headers)).toBe("200.100.50.25");
  });

  it("falls back to x-real-ip, then null", () => {
    expect(clientIpFrom(new Headers({ "x-real-ip": "200.1.1.1" }))).toBe("200.1.1.1");
    expect(clientIpFrom(new Headers())).toBeNull();
  });
});

describe("parseIpinfoResponse", () => {
  it("reads the free Lite response (country and network only)", () => {
    expect(parseIpinfoResponse({ ip: "1.1.1.1", country: "Brazil", as_name: "Operadora X" })).toEqual({
      city: null,
      region: null,
      country: "Brazil",
      network: "Operadora X",
    });
  });

  it("reads the Core response with city and region", () => {
    expect(
      parseIpinfoResponse({
        geo: { city: "Curitiba", region: "Paraná", country: "Brazil" },
        as: { name: "Operadora X" },
      }),
    ).toEqual({ city: "Curitiba", region: "Paraná", country: "Brazil", network: "Operadora X" });
  });
});
