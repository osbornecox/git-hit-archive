# git-hit-archive

A ready-to-use research database of AI/ML GitHub repositories. 30,000+ Python repos (25+ stars) — scored, enriched with LLM summaries, and embedded for semantic search.

Find answers in seconds: "What approaches exist for context window management?" or "Agent orchestration frameworks" — without scrolling through GitHub search results.

Runs locally, updates daily, includes a Claude Code skill for AI-assisted research. Optionally sends top new repos to Telegram/Slack.

## How to use

### 1. Use the pre-built database

Everything is ready — just search:

```bash
npm install
npm run search "agent orchestration"
npm run search "RAG retrieval techniques" -- --limit=20
```

No API keys needed. The database ships pre-built.

**Included database (August 2024 – February 2026):**

| Setting | Value |
|---------|-------|
| Language | Python |
| Min stars | 25 |
| Min score for enrichment | 70% |
| Total repos | ~30,000 |
| Enriched (with summaries) | ~5,000 |
| Embedded (vector index) | ~5,000 |

### 2. Keep it updated daily

Add API keys to fetch and process new repos every day:

```bash
cp .env.example .env
# Add OPENAI_API_KEY or ANTHROPIC_API_KEY

npm run daemon  # runs on schedule from config.yaml (cross-platform: macOS, Linux, Windows)
```

Or run incremental updates manually:

```bash
npm run build-archive -- --days=7
```

### 3. Rebuild with your own interests

Want different topics or languages? Rebuild from scratch:

```bash
cp config/config.example.yaml config/config.yaml
# Edit: change profile, interests, languages, thresholds

npm run build-archive
```

⚠️ Full rebuild = 30k+ LLM calls. Expect ~$10 in API costs and several hours.

## Claude Code skill

The repo includes `SKILL.md` for use with Claude Code. Add the repo to your workspaces and search with `/git-hit`:

```
/git-hit what tools exist for multi-agent orchestration?
```

## Current database settings

The pre-built database was scored with this interest profile:

**High priority (score 0.7–1.0):**
- Agent architectures (multi-agent, orchestration, reasoning, tool use)
- Context engineering (RAG, retrieval, embeddings, vector DBs, MCP, memory)
- Knowledge engineering (extraction, structure, graphs)
- AI workflow tools (Claude Code, Cursor, Copilot)
- Prompt engineering, structured outputs
- Human-AI collaboration

**Medium (0.4–0.6):** No-code AI, productivity tools, tutorials, inference optimization

**Excluded:** Image/video/audio generation, game AI, crypto/NFT

## Telegram & Slack digest

Get top new repos (score ≥ 90%) delivered daily:

```bash
# Set in .env
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
```

## Pipeline

```
1. Import    ← Optional: seed from existing database
2. Fetch     ← GitHub API
3. README    ← Fetch full README for short descriptions
4. Score     ← LLM rates relevance to your profile (0-100)
5. Enrich    ← LLM writes summaries (score >= min_score only)
6. Embed     ← text-embedding-3-small → LanceDB vectors
7. Export    ← SQLite → CSV
8. Notify    ← Optional: Telegram & Slack digest
```

Each step is idempotent — safe to re-run.

### CLI flags

```bash
npm run build-archive -- --days=7           # fetch last N days only
npm run build-archive -- --step=4           # run a single step
npm run build-archive -- --skip-llm         # skip scoring + enrichment
npm run build-archive -- --skip-embed       # skip vector embeddings
npm run build-archive -- --skip-notify      # skip notifications
```

## Configuration

Edit `config/config.yaml`:

```yaml
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

min_score: 70
notify_min_score: 90
notify_language: en

sources:
  github:
    enabled: true
    min_stars: 25
    languages: [python]
  # Optional: enable Reddit
  # reddit:
  #   enabled: true
  #   subreddits: [machinelearning, localllama, ClaudeAI]
  #   min_score: 20
```

## LLM provider

OpenAI by default. To use Anthropic:

```
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
```

## Cost

For ~13,000 new repos/year:

| Component | Cost |
|-----------|------|
| Scoring (gpt-4.1-mini) | ~$3 |
| Enrichment (gpt-5-mini) | ~$2.50 |
| Embeddings | ~$0.08 |
| **Total** | **~$6/year** |

## Project structure

```
src/
  search.ts      — Semantic search CLI
  pipeline.ts    — Full pipeline orchestrator
  daemon.ts      — Scheduler for daily updates
data/
  posts.db       — SQLite (ships pre-built)
  archive.lance/ — Vector index (ships pre-built)
config/
  config.yaml    — Your interests and settings
SKILL.md         — Claude Code skill definition
```

## License

MIT
