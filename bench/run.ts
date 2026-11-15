import { readFileSync } from "node:fs";
import { cluster, crypto, general, type ClusterOptions } from "../src/index.js";

interface Row { id: string; event: string; source: string; publishedAt: string; title: string }
const rows: Row[] = JSON.parse(readFileSync(new URL("./headlines.json", import.meta.url), "utf8"));

function score(opts: ClusterOptions<Row>) {
  const pred = new Map<string, number>();
  cluster(rows, opts).forEach((c, ci) => c.items.forEach((r) => pred.set(r.id, ci)));
  let tp = 0, fp = 0, fn = 0;
  for (let i = 0; i < rows.length; i++)
    for (let j = i + 1; j < rows.length; j++) {
      const same = pred.get(rows[i].id) === pred.get(rows[j].id);
      const gold = rows[i].event === rows[j].event;
      if (same && gold) tp++;
      else if (same) fp++;
      else if (gold) fn++;
    }
  // Purity: share of headlines that sit in a cluster's majority event.
  const byCluster = new Map<number, Map<string, number>>();
  for (const r of rows) {
    const m = byCluster.get(pred.get(r.id)!) ?? new Map();
    m.set(r.event, (m.get(r.event) ?? 0) + 1);
    byCluster.set(pred.get(r.id)!, m);
  }
  const purity = [...byCluster.values()].reduce((s, m) => s + Math.max(...m.values()), 0) / rows.length;
  const p = tp / (tp + fp || 1), rc = tp / (tp + fn || 1);
  return { p, r: rc, f1: (2 * p * rc) / (p + rc || 1), purity, clusters: byCluster.size };
}

const configs: [string, ClusterOptions<Row>][] = [
  ["Plain Jaccard >= 0.5, no rules", { minDistinctive: 0, strongDistinctive: Infinity, threshold: 0.5 }],
  ["general preset (default)", { preset: general }],
  ["crypto preset", { preset: crypto }],
  ["crypto preset, no time window", { preset: crypto, windowMs: Infinity }],
];

const events = new Set(rows.map((r) => r.event)).size;
console.log(`${rows.length} headlines, ${events} events\n`);
console.log("| Config | Precision | Recall | F1 | Purity | Clusters |");
console.log("|---|---|---|---|---|---|");
for (const [name, o] of configs) {
  const s = score(o);
  const f = (x: number) => x.toFixed(3);
  console.log(`| ${name} | ${f(s.p)} | ${f(s.r)} | ${f(s.f1)} | ${f(s.purity)} | ${s.clusters} |`);
}
