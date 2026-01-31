# git-hit-archive — TODO

## Объединение с HypeSeeker

Оба проекта дублируют ~90% кода (DB, scoring, enrichment, промты, конфиг, LLM client). Разница — в источниках и выходах.

**Идея:** один проект, один пайплайн, множество входов и выходов:
- Sources: GitHub (7д лента + 365д архив), Reddit, HuggingFace, Replicate
- Pipeline: Score → Enrich → Embed (shared)
- Outputs: Telegram, Slack, Semantic Search CLI, CSV

Название: hypeseeker (более зрелый, 4 источника). git-hit-archive становится фичей (semantic search).

**Статус:** пока работают параллельно, решение после тестирования.

## Telegram-бот как интерфейс поиска

Сейчас бот только постит дайджест. Добавить интерактивный режим:
- Пользователь пишет боту запрос → бот делает semantic search по LanceDB → возвращает топ-N результатов
- По сути RAG-интерфейс через Telegram
- Требует: webhook или polling mode, вызов search из git-hit-archive (или объединённого проекта)
