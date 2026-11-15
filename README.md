# headline-cluster

Group near-duplicate news headlines from many outlets into events ("same story, different outlet") without an LLM. Zero runtime dependencies, ESM, TypeScript types included.

Extracted from the wire deduplication of [yourkhabri.com](https://yourkhabri.com).

## How it works

- **Tokens**: lowercase, stop words and possessives dropped, British spellings mapped to American (`tokenised` = `tokenized`, `licence` = `license`), numbers normalised (`$170M` = `170 million` = `170m`, `1,036` = `1036`, `20%` = `20 percent`).
- **Distinctive terms**: a preset lists generic words (in `crypto`: bitcoin, crypto, token, etf...). Two headlines score 0 unless they share at least 2 non-generic tokens, so sharing "bitcoin" never links two stories.
- **Score**: Jaccard of the token sets, raised to 0.4 when 3 or more distinctive tokens are shared. A match needs 0.38.
- **Clustering**: greedy over time-sorted items. Each item is compared with every member of every cluster (not only the lead) within a 48 hour window and joins the best match.

## Quick start

```ts
import { cluster, crypto } from "headline-cluster";

const groups = cluster(
  [
    { title: "Zentra Finance drained of $170M in lending pool exploit", publishedAt: "2026-11-04T02:00:00Z" },
    { title: "DeFi lender Zentra Finance loses $170 million to attacker", publishedAt: "2026-11-04T02:47:00Z" },
    { title: "Kraken confidentially files for US IPO", publishedAt: "2026-11-04T03:00:00Z" },
  ],
  { preset: crypto },
);
// groups[0].items has both Zentra headlines; groups[1] is the Kraken story.
```

Also exported: `tokens(text, opts)`, `similarity(a, b, opts)`, `explain(a, b, opts)` (shared and distinctive tokens), `onSubject(headline, items)` (keeps items naming the headline's proper-noun subjects), `subjects(headline)`, and the `general` and `crypto` presets. Options take extra `stopWords` and `genericWords`, plus `threshold`, `windowMs`, `text` and `time` accessors.

## Benchmark

`npm run bench` on `bench/headlines.json`: 51 headlines written for this repo (fictional outlets) in 21 events, including two Binance stories on one day, two Strategy purchases a week apart, spelling and number-format variants. Defaults were not tuned on it.

| Config | Precision | Recall | F1 | Purity | Clusters |
|---|---|---|---|---|---|
| Plain Jaccard >= 0.5, no rules | 1.000 | 0.214 | 0.353 | 1.000 | 43 |
| general preset (default) | 1.000 | 0.738 | 0.849 | 1.000 | 28 |
| crypto preset | 1.000 | 0.738 | 0.849 | 1.000 | 28 |
| crypto preset, no time window | 0.939 | 0.738 | 0.827 | 0.980 | 27 |

The rules favour precision. Misses are paraphrases with few shared names ("Bitcoin tops $120,000" vs "BTC breaks above $120K"); those need embeddings, which this library does not include.

## License

MIT
