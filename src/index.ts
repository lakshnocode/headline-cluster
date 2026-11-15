/**
 * headline-cluster: group near-duplicate news headlines into events, no LLM needed.
 * Extracted from the wire deduplication of yourkhabri.com.
 */

export interface Preset {
  stopWords: string[];
  /** Words too common in the domain to link two stories on their own. */
  genericWords: string[];
  /** Capitalised words that never identify a subject (months, countries, the domain's big generic names). */
  notNames: string[];
}

const STOP = (
  "the a an and or of to in on for with by from at as is are was were be been it its this that these those " +
  "will would can could may might has have had not no but into over under about after before amid says said say " +
  "new via vs more than just how why what when who here heres his her their they we you up out"
).split(" ");

const MONTHS_DAYS = (
  "jan january feb february mar march apr april may jun june jul july aug august sep sept september oct october " +
  "nov november dec december monday tuesday wednesday thursday friday saturday sunday"
).split(" ");

const GENERAL_GENERIC = (
  "market markets stock stocks shares price prices trading traders investors news report reports week weekend today " +
  "analysts million billion trillion percent year first record high low rises falls jumps drops surges deal firm company"
).split(" ");

export const general: Preset = {
  stopWords: STOP,
  genericWords: GENERAL_GENERIC,
  notNames: ["us", "uk", "eu", "ceo", "ai", ...MONTHS_DAYS],
};

export const crypto: Preset = {
  stopWords: STOP,
  genericWords: [
    ...GENERAL_GENERIC,
    ..."crypto cryptocurrency cryptocurrencies bitcoin btc ethereum eth ether token tokens coin coins digital asset assets stablecoin exchange etf etfs fund funds".split(" "),
  ],
  notNames: [...general.notNames, ..."bitcoin btc ether ethereum eth crypto sec etf etfs".split(" ")],
};

export const presets = { general, crypto };

export interface Options {
  preset?: Preset;
  /** Extra stop words, added to the preset's. */
  stopWords?: string[];
  /** Extra generic words, added to the preset's. */
  genericWords?: string[];
  /** Shared distinctive tokens needed for any match (default 2). */
  minDistinctive?: number;
  /** Shared distinctive tokens that make a strong match (default 3). */
  strongDistinctive?: number;
  /** Score given to a strong match when its Jaccard is lower (default 0.4). */
  strongScore?: number;
}

/** British spellings become American so "tokenised" and "tokenized" compare equal. */
const ISE =
  /^(tokeni|securiti|decentrali|centrali|legali|criminali|authori|organi|recogni|finali|reali|capitali|digitali|normali|stabili|utili|moneti|optimi|prioriti|privati|nationali|subsidi|penali|categori|apologi|minimi|maximi|summari|customi|standardi|synchroni|liberali|harmoni|saniti|weaponi|monopoli|scrutini|critici)s(e|ed|es|ing|ation|ations|er|ers)$/;
const SPELLING: Record<string, string> = {
  licence: "license", licences: "licenses", defence: "defense", offence: "offense",
  centre: "center", centres: "centers", programme: "program", programmes: "programs",
  cancelled: "canceled", cancelling: "canceling", labour: "labor", favour: "favor",
  judgement: "judgment", sceptical: "skeptical", analyse: "analyze", analysed: "analyzed",
};
const SCALE: Record<string, string> = {
  k: "k", thousand: "k", m: "m", mn: "m", million: "m", b: "b", bn: "b", billion: "b", t: "t", tn: "t", trillion: "t",
};

const setCache = new WeakMap<object, { stop: Set<string>; generic: Set<string> }>();
function sets(o: Options = {}) {
  let s = setCache.get(o);
  if (!s) {
    const p = o.preset ?? general;
    s = {
      stop: new Set([...p.stopWords, ...(o.stopWords ?? [])].map((w) => w.toLowerCase())),
      generic: new Set([...p.genericWords, ...(o.genericWords ?? [])].map(normWord)),
    };
    setCache.set(o, s);
  }
  return s;
}

function normWord(w: string): string {
  w = w.toLowerCase();
  return SPELLING[w] ?? w.replace(ISE, "$1z$2");
}

/** Normalised, de-duplicated tokens of a headline. "$170M" and "$170 million" both become "170m". */
export function tokens(text: string, options?: Options): string[] {
  const { stop } = sets(options);
  const t = text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[’']s\b/g, "")
    .replace(/\b((?:[a-z]\.){2,})/g, (m) => m.replace(/\./g, ""))
    // Numbers: drop currency and thousands commas, attach the scale word.
    .replace(/(?<![a-z0-9])[$€£]?(\d[\d,]*(?:\.\d+)?)\s?(k|thousand|mn|m|million|bn|b|billion|tn|t|trillion|%|percent)?(?![a-z0-9])/g,
      (_, n: string, s?: string) => " " + n.replace(/,/g, "") + (s ? (s === "%" || s === "percent" ? "pct" : SCALE[s]) : "") + " ")
    .replace(/[^a-z0-9. ]+/g, " ");
  const out = t
    .split(/\s+/)
    .map((w) => normWord(w.replace(/^\.+|\.+$/g, "")))
    .filter((w) => w.length > 2 && !stop.has(w));
  return Array.from(new Set(out));
}

export interface Explanation {
  shared: string[];
  distinctive: string[];
  jaccard: number;
  score: number;
}

/** Why two headlines do or do not match. */
export function explain(a: string | string[], b: string | string[], options: Options = {}): Explanation {
  const ta = typeof a === "string" ? tokens(a, options) : a;
  const tb = typeof b === "string" ? tokens(b, options) : b;
  const { generic } = sets(options);
  const sb = new Set(tb);
  const shared = ta.filter((t) => sb.has(t));
  const distinctive = shared.filter((t) => !generic.has(t));
  const union = ta.length + tb.length - shared.length;
  const jaccard = union ? shared.length / union : 0;
  let score = 0;
  if (distinctive.length >= (options.minDistinctive ?? 2)) {
    score = Math.max(jaccard, distinctive.length >= (options.strongDistinctive ?? 3) ? options.strongScore ?? 0.4 : 0);
  }
  return { shared, distinctive, jaccard, score };
}

/**
 * Same event? 0 unless the headlines share at least two distinctive tokens (names, places, numbers),
 * so sharing only "bitcoin" never links two stories. Otherwise Jaccard, raised to 0.4 for three or more.
 */
export function similarity(a: string | string[], b: string | string[], options?: Options): number {
  return explain(a, b, options).score;
}

export interface ClusterOptions<T> extends Options {
  /** Minimum score to join a cluster (default 0.38). */
  threshold?: number;
  /** Only members published within this many ms of an item are compared (default 48h). */
  windowMs?: number;
  /** Headline of an item (default item.title, or the item itself when it is a string). */
  text?: (item: T) => string;
  /** Publish time of an item (default item.publishedAt). */
  time?: (item: T) => string | number | Date | undefined;
}

export interface Cluster<T> {
  items: T[];
  /** Earliest item. */
  lead: T;
}

/**
 * Greedy clustering over time-sorted items. Each item joins the cluster holding its best-matching member
 * (every member is compared, not only the lead), if that member is within the time window.
 */
export function cluster<T>(items: T[], opts: ClusterOptions<T> = {}): Cluster<T>[] {
  const text = opts.text ?? ((it: T) => (typeof it === "string" ? it : (it as { title: string }).title));
  const time = opts.time ?? ((it: T) => (it as { publishedAt?: string }).publishedAt);
  const threshold = opts.threshold ?? 0.38;
  const windowMs = opts.windowMs ?? 48 * 3600_000;
  const rows = items
    .map((item, i) => {
      const raw = time(item);
      const t = raw === undefined ? NaN : new Date(raw).getTime();
      return { item, i, t, tk: tokens(text(item), opts) };
    })
    .sort((a, b) => (a.t - b.t) || a.i - b.i);
  const clusters: (typeof rows)[] = [];
  for (const r of rows) {
    let home: (typeof rows) | undefined;
    let best = 0;
    for (const c of clusters) {
      for (const m of c) {
        if (Math.abs(r.t - m.t) > windowMs) continue; // NaN times always compare
        const s = similarity(r.tk, m.tk, opts);
        if (s > best) { best = s; home = c; }
      }
    }
    if (home && best >= threshold) home.push(r);
    else clusters.push([r]);
  }
  return clusters.map((c) => ({ items: c.map((r) => r.item), lead: c[0].item }));
}

/** Proper-noun subjects of a sentence-case headline: "OKX and ICE to debut..." gives ["okx", "ice"]. */
export function subjects(headline: string, preset: Preset = crypto): string[] {
  const skip = new Set([...preset.notNames, ...preset.stopWords]);
  return headline
    .split(/\s+/)
    .map((w) => w.replace(/^[^A-Za-z0-9]+/, ""))
    .filter((w, i) => (i > 0 ? /^[A-Z]/.test(w) : /^[A-Z][A-Za-z]*[A-Z]/.test(w)))
    .map((w) => w.replace(/[’']s$/, "").replace(/[^A-Za-z0-9]/g, "").toLowerCase())
    .filter((w) => w.length >= 2 && !skip.has(w));
}

/**
 * Keep only the items that name one of the headline's proper-noun subjects. The first item and any
 * item marked official always stay; with no subject to test, every item stays.
 */
export function onSubject<T extends { title: string; summary?: string; official?: boolean }>(
  headline: string,
  items: T[],
  preset: Preset = crypto,
): T[] {
  const names = subjects(headline, preset);
  if (!names.length) return items;
  const pats = names.map((n) => new RegExp(`\\b${n}`));
  return items.filter((it, i) => i === 0 || it.official || pats.some((p) => p.test(`${it.title} ${it.summary ?? ""}`.toLowerCase())));
}
