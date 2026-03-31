---
name: git-hit
description: Find AI/ML GitHub repos — "find repos for", "what tools exist for", "are there any projects that"
argument-hint: [search query]
allowed-tools: Bash(cd * && npx tsx src/search.ts *)
---

## When to use

- User asks to find ML/AI repositories or tools
- User asks "what exists for X" or "are there projects that do Y"
- User needs tool/library recommendations for an AI/ML task
- User says "git-hit", "/git-hit", or asks to search the repo database

## Command

```bash
cd /Users/oleg/Vibespace/git-hit-archive && npx tsx src/search.ts "<query>" --limit=<N>
```

- `--limit=N` — number of results (default: 10, use 5 for focused queries, 15-20 for broad exploration)
- `--min-score=X` — minimum relevance score 0-1 (use 0.7+ for strict filtering)

## Search strategy

**Simple query** (specific topic, e.g. "RLHF libraries", "vector databases"):
- Run a single search command with limit=10
- Present results directly

**Broad/exploratory query** (e.g. "всё про RLM", "what's out there for AI agents", "explore LLM tooling"):
- Decompose the user's query into 5-8 diverse sub-queries covering different angles, synonyms, and related concepts
- Launch all sub-queries **in parallel** using the Task tool (subagent_type=Bash, use the cheapest/fastest available model), each running the search command with limit=7
- Collect all results, deduplicate by repo name/URL, and merge
- Rank by frequency across sub-queries (appeared in more = more relevant) and star count
- Present a consolidated report grouped by theme

Example decomposition for "всё про RLM":
1. "reinforcement learning from human feedback RLHF"
2. "reward model training LLM"
3. "DPO direct preference optimization"
4. "LLM alignment techniques"
5. "preference tuning language models"
6. "PPO RLHF training framework"
7. "human feedback dataset annotation"

**How to detect broad queries:** user says "всё про", "everything about", "explore", "deep dive", "обзор", "what's the landscape", or the topic is very general (single acronym, broad field name).

## How to present results

**If user wants an overview** ("find repos about X", "what's out there for Y"):
- Show top 5-7 results as a compact list: name, stars, link, one-line summary
- Skip repos with no summary (less relevant)

**If user is solving a specific problem** ("I need a tool for X", "how to do Y"):
- Pick 2-3 best matches from results
- Explain what each does and which fits the use case
- Link to repos

**If broad/deep search was used:**
- Group results by theme/sub-topic
- Show 3-5 repos per group: name, stars, link, one-line summary
- Add a brief intro for each group explaining the sub-topic
- End with a summary of the landscape

**If 0 results returned:**
- Say the database doesn't have matches for this query
- Suggest rephrasing (more general or different angle)
- Offer to search the web instead

## Notes

- Database: curated GitHub repos (past year, stars >= 25), updated daily
- Search is semantic (vector similarity), not keyword — rephrase if results seem off
- Only ~15% of repos have summaries and are searchable (the highest-scored ones)