# git-hit-archive

Curated AI/ML repository database with semantic search. Fetches GitHub repos, scores them by relevance to your interests, enriches top results with summaries, and builds a vector index for semantic search.

## How it works

```
1. Import    ← Optional: seed from existing database
2. Fetch     ← GitHub API (configurable languages, stars >= 25)
3. Score     ← gpt-4.1-mini rates relevance to your profile
4. Enrich    ← gpt-5-mini writes summaries (score >= 0.8 only)
5. Embed     ← text-embedding-3-small → LanceDB vectors
6. Export    ← SQLite → CSV
```

Each step is idempotent — safe to re-run without duplicating work.

## Setup

```bash
# Install dependencies
npm install

# Copy and customize config
cp config/config.example.yaml config/config.yaml
# Edit config.yaml with your profile and interests

# Set up environment variables
cp .env.example .env
# Add your OPENAI_API_KEY and GITHUB_TOKEN
```

## Usage

### Build the archive

```bash
# Full pipeline (fetch → score → enrich → embed → export)
npm run build-archive

# Dry run — fetch only, skip LLM and embeddings
npm run build-archive:dry

# Incremental update (last 7 days)
npm run build-archive -- --days=7

# Run a single step
npm run build-archive -- --step=2

# Skip specific stages
npm run build-archive -- --skip-llm
npm run build-archive -- --skip-embed
```

### Semantic search

```bash
npm run search "agent orchestration"
npm run search "vector databases" -- --limit=20
npm run search "RAG retrieval" -- --min-score=0.7
```

### Auto-update (macOS)

The `scripts/update.sh` script runs the pipeline with `--days=7` for incremental updates. You can schedule it with launchd:

```bash
# Edit the plist to set your path and schedule
cp scripts/update.sh /path/to/your/scripts/
# Create a launchd plist pointing to update.sh
```

The script uses `flock` to prevent concurrent runs.

## Configuration

Edit `config/config.yaml` to customize:

- **profile** — who you are (used for scoring relevance)
- **interests** — high/medium/low priority topics with score ranges
- **exclude** — topics to always score as 0
- **sources.github.min_stars** — minimum stars threshold
- **sources.github.languages** — GitHub language filter (default: `["python"]`). Common choices: `python`, `typescript`, `javascript`, `rust`, `go`, `jupyter-notebook`

## Cost estimate

For ~13,000 repos/year (stars >= 25, single language):

| Component | Cost |
|-----------|------|
| GitHub API | $0 |
| Scoring (gpt-4.1-mini) | ~$3 |
| Enrichment (gpt-5-mini) | ~$2.50 |
| Embeddings (text-embedding-3-small) | ~$0.08 |
| **Total** | **~$6** |

## Project structure

```
src/
  pipeline.ts        — Orchestrator (steps 1-6)
  search.ts          — Semantic search CLI
  db.ts              — SQLite operations
  env.ts             — Environment variable loader
  types.ts           — TypeScript interfaces
  steps/
    1-import.ts      — Seed from existing DB
    2-fetch.ts       — GitHub API fetcher
    3-score.ts       — LLM relevance scoring
    4-enrich.ts      — LLM summary generation
    5-embed.ts       — Vector embeddings → LanceDB
    6-export.ts      — Export to CSV
  llm/
    client.ts        — OpenAI client with retry
    prompts/         — Scoring and enrichment prompts
config/
  config.example.yaml
data/                — Generated (gitignored)
  posts.db           — SQLite database
  archive.lance/     — LanceDB vectors
  feed.csv           — Exported data
```

## License

MIT
