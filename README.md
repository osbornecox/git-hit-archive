# git-hit-archive

A curated database of AI/ML repositories from GitHub and Reddit, scored and enriched for relevance. Comes pre-built with ~19,000 repos focused on agents, RAG, developer tools, and LLM infrastructure. Includes semantic search via vector embeddings.

## What's inside

The database is built around a specific interest profile (AI/ML developer tools, agents, context engineering). Each repository is:

1. **Fetched** from GitHub (stars >= 25) and Reddit (r/machinelearning, r/localllama, r/ClaudeAI, r/ChatGPTCoding)
2. **Scored** by an LLM for relevance to the interest profile (0-100)
3. **Enriched** with English summaries (repos scoring >= 80 only)
4. **Embedded** as vectors for semantic search (text-embedding-3-small → LanceDB)

## Quick start: use the pre-built database

```bash
npm install

# Search for repos by topic
npm run search "agent orchestration"
npm run search "vector databases" -- --limit=20
npm run search "RAG retrieval" -- --min-score=0.7
```

No API keys needed for search — it uses the pre-built vector index.

## Build your own database

If the default interest profile doesn't match yours, you can re-score and re-enrich the entire database with your own settings.

```bash
# 1. Configure
cp config/config.example.yaml config/config.yaml
cp .env.example .env
# Edit config.yaml — change profile, interests, and exclude lists
# Edit .env — add OPENAI_API_KEY (required), GITHUB_TOKEN (optional)

# 2. Re-run the full pipeline
npm run build-archive
```

This will re-score all posts against your profile, generate new summaries, and rebuild the vector index. Existing fetch data is preserved — only scoring, enrichment, and embeddings are regenerated.

### Incremental updates

```bash
# Fetch new repos from the last 7 days and process them
npm run build-archive -- --days=7
```

### Pipeline steps

```
1. Import    ← Optional: seed from existing database
2. Fetch     ← GitHub API + Reddit
3. README    ← Fetch full README for short descriptions
4. Score     ← LLM rates relevance to your profile (0-100)
5. Enrich    ← LLM writes summaries (score >= min_score only)
6. Embed     ← text-embedding-3-small → LanceDB vectors
7. Export    ← SQLite → CSV
8. Notify    ← Optional: Telegram & Slack digest
```

Each step is idempotent — safe to re-run without duplicating work.

### CLI flags

```bash
npm run build-archive -- --days=7           # fetch last N days only
npm run build-archive -- --step=4           # run a single step
npm run build-archive -- --skip-llm         # skip scoring + enrichment
npm run build-archive -- --skip-embed       # skip vector embeddings
npm run build-archive -- --skip-readme      # skip README fetching
npm run build-archive -- --skip-notify      # skip notifications
npm run build-archive -- --sources=github   # fetch from specific sources
```

### LLM provider

OpenAI is used by default. To use Anthropic instead:

```
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
```

## Configuration

Edit `config/config.yaml`:

```yaml
# What goes into the database
profile: |
  Software engineer working on AI-powered applications.
  Interested in practical ML tools and developer productivity.

interests:
  high:
    - Agent architectures (multi-agent, orchestration, tool use)
    - Context engineering (RAG, retrieval, embeddings, vector DBs)
  medium:
    - LLM inference optimization
  low:
    - Fine-tuning and model training

exclude:
  - Image generation
  - Video generation

# Minimum score (0-100) to enrich and include in the database
min_score: 80

# Sources
sources:
  github:
    enabled: true
    min_stars: 25
    languages: [python]
  reddit:
    enabled: true
    subreddits: [machinelearning, localllama, ClaudeAI, ChatGPTCoding]
    min_score: 20
```

## Optional: Telegram & Slack digest

Send a digest of new high-scoring posts to messengers. Posts are sent once (deduplicated).

```bash
npm run telegram        # send unsent posts to Telegram
npm run slack           # send unsent posts to Slack
```

Both are also called at step 8 of the pipeline (skip with `--skip-notify`).

Set in `.env`:

```
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
```

If not configured, notifications are silently skipped.

## Optional: Scheduler

### Built-in daemon

```bash
npm run daemon              # run on schedule from config.yaml
npm run daemon -- --run-now # run immediately, then schedule
```

Configure in `config.yaml`:

```yaml
schedule:
  enabled: true
  times: ["09:00", "18:00"]
  timezone: America/New_York
```

### macOS launchd

`scripts/update.sh` runs an incremental update (`--days=7`) with directory-based locking.

## Cost estimate

For ~13,000 GitHub repos/year (stars >= 25, single language):

| Component | Cost |
|-----------|------|
| GitHub API | $0 |
| Reddit API | $0 |
| Scoring (gpt-4.1-mini) | ~$3 |
| Enrichment (gpt-5-mini) | ~$2.50 |
| Embeddings (text-embedding-3-small) | ~$0.08 |
| **Total** | **~$6** |

## Project structure

```
src/
  pipeline.ts        — Orchestrator (steps 1-8)
  search.ts          — Semantic search CLI
  daemon.ts          — Built-in scheduler
  db.ts              — SQLite operations
  types.ts           — TypeScript interfaces
  utils.ts           — Shared utilities
  fetchers/
    github.ts        — GitHub API fetcher
    reddit.ts        — Reddit API fetcher
  steps/
    1-import.ts      — Seed from existing DB
    2-fetch.ts       — Source orchestrator
    3-readme.ts      — README content fetcher
    4-score.ts       — LLM relevance scoring
    5-enrich.ts      — LLM summary generation
    6-embed.ts       — Vector embeddings → LanceDB
    7-export.ts      — Export to CSV
    8-notify.ts      — Telegram & Slack digest
  llm/
    client.ts        — OpenAI + Anthropic with retry
    prompts/         — Scoring and enrichment prompts
config/
  config.example.yaml
data/                — Generated (gitignored)
  posts.db           — SQLite database
  archive.lance/     — LanceDB vectors
  feed.csv           — Exported CSV
```

## License

MIT
