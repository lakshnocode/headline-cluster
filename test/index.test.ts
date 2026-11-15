import { describe, it, expect } from "vitest";
import { tokens, similarity, explain, cluster, onSubject, subjects, crypto, general } from "../src/index.js";

describe("tokens", () => {
  it("lowercases, drops stop words and possessives, de-duplicates", () => {
    expect(tokens("The SEC's new rule for the SEC")).toEqual(["sec", "rule"]);
  });
  it("normalises British and American spelling", () => {
    expect(tokens("Tokenised securities")).toEqual(tokens("tokenized securities"));
    expect(tokens("organisations authorised")).toEqual(["organizations", "authorized"]);
    expect(tokens("payments licence")).toEqual(["payments", "license"]);
  });
  it("normalises number formats", () => {
    expect(tokens("$170M")).toEqual(tokens("170 million"));
    expect(tokens("1,036 BTC")).toEqual(tokens("1036 BTC"));
    expect(tokens("20% tax")).toEqual(tokens("20 percent tax"));
    expect(tokens("1inch")).toEqual(["1inch"]);
  });
});

describe("similarity", () => {
  it("is 0 when only generic words are shared", () => {
    expect(similarity("Bitcoin price falls as crypto market slides", "Bitcoin price rises as crypto market rebounds", { preset: crypto })).toBe(0);
  });
  it("is 0 with a single distinctive token", () => {
    expect(similarity("Binance lists ORBX", "Binance fined in France")).toBe(0);
  });
  it("uses Jaccard with two distinctive tokens", () => {
    const e = explain("Kraken files IPO", "Kraken IPO filing confirmed");
    expect(e.distinctive).toEqual(["kraken", "ipo"]);
    expect(e.score).toBeCloseTo(2 / 5);
  });
  it("gives a strong match at least 0.4 with three distinctive tokens", () => {
    const s = similarity("Zentra Finance drained of $170M in lending pool exploit by attacker overnight", "Zentra Finance loses $170 million");
    expect(s).toBeGreaterThanOrEqual(0.4);
  });
  it("respects custom generic words", () => {
    expect(similarity("Kraken files IPO", "Kraken IPO filing", { genericWords: ["ipo"] })).toBe(0);
  });
  it("crypto preset treats bitcoin as generic, general does not", () => {
    expect(explain("bitcoin Saylor", "bitcoin Saylor", { preset: crypto }).distinctive).toEqual(["saylor"]);
    expect(explain("bitcoin Saylor", "bitcoin Saylor", { preset: general }).distinctive).toEqual(["bitcoin", "saylor"]);
  });
});

describe("cluster", () => {
  it("groups the same story across outlets and keeps different stories apart", () => {
    const out = cluster([
      "Zentra Finance drained of $170M in lending pool exploit",
      "DeFi lender Zentra Finance loses $170 million to attacker",
      "Kraken confidentially files for US IPO",
    ]);
    expect(out.map((c) => c.items.length)).toEqual([2, 1]);
  });
  it("splits matching headlines outside the time window", () => {
    const items = [
      { title: "Strategy buys 1,036 BTC for $110M", publishedAt: "2026-11-03T12:00:00Z" },
      { title: "Strategy buys 2,140 BTC for $231M", publishedAt: "2026-11-10T12:00:00Z" },
    ];
    expect(cluster(items, { preset: crypto, threshold: 0.2 })).toHaveLength(2);
    expect(cluster(items, { preset: crypto, threshold: 0.2, windowMs: Infinity })).toHaveLength(1);
  });
  it("compares against every member, not just the lead", () => {
    // The third headline matches only the second, which already joined the first.
    const out = cluster([
      { title: "Alpha Beta Gamma Delta", publishedAt: "2026-11-01T00:00:00Z" },
      { title: "Alpha Beta Gamma Epsilon Zeta", publishedAt: "2026-11-01T01:00:00Z" },
      { title: "Gamma Epsilon Zeta Theta", publishedAt: "2026-11-01T02:00:00Z" },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].lead.title).toBe("Alpha Beta Gamma Delta");
  });
});

describe("onSubject", () => {
  const items = [
    { title: "OKX and ICE to debut tokenized stock trading" },
    { title: "Kraken expands xStocks to Japan" },
    { title: "Exchange sets Nov. 23 launch", summary: "OKX venture backed by ICE" },
    { title: "NYSE tokenized shares on Avalanche", official: true },
  ];
  it("finds proper-noun subjects", () => {
    expect(subjects("OKX and ICE to debut tokenized stock trading")).toEqual(["okx", "ice"]);
  });
  it("keeps the first, official and on-subject items only", () => {
    expect(onSubject("OKX and ICE to debut tokenized stock trading", items).map((i) => i.title)).toEqual([
      items[0].title, items[2].title, items[3].title,
    ]);
  });
  it("keeps everything when the headline names no subject", () => {
    expect(onSubject("Bitcoin rises in quiet trading", items)).toHaveLength(4);
  });
});
