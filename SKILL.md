---
name: git-hit-archive
description: Semantic search over curated AI/ML repositories from GitHub & Reddit (past year, 19k+ repos)
---

## When to use

Use this skill when:
- User asks to find ML/AI repositories by topic
- User needs recommendations for tools, libraries, or frameworks
- User asks "what's interesting in X area"
- User wants to explore specific ML/AI technologies
- User needs to check if a tool/approach exists on GitHub

## How to use

```bash
npx tsx src/search.ts "your query" --limit=10
```

### Options

- `--limit=N` — Number of results (default: 10)
- `--min-score=X` — Minimum relevance score 0-1 (default: none)

### Examples

```bash
npx tsx src/search.ts "agent orchestration"
npx tsx src/search.ts "vector databases" --limit=20
npx tsx src/search.ts "RAG retrieval" --min-score=0.7
npx tsx src/search.ts "code generation LLM"
```

## Output format

Returns top-N repositories sorted by semantic similarity:

```
1. repo-name (stars 1234)
   https://github.com/user/repo
   Score: 0.85 | Distance: 0.123
   Summary: English summary of what the project does and why it matters
```

## Database stats

- ~19,700 repositories from GitHub (past 365 days, stars >= 25)
- ~2,800 posts enriched with English summaries (score >= 0.8)
- Vector embeddings via text-embedding-3-small (only enriched posts)
- Scoring: gpt-4.1-mini | Enrichment: gpt-5-mini

## Notes

- Search uses semantic similarity (vector search), not keyword matching
- Higher relevance_score = better match to user interests (AI/ML focus)
- Lower distance = closer semantic match to your query
- Summaries are in English for embedding quality and reusability
- Only enriched posts (with summaries) are in the vector index
