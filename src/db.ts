import Database from "better-sqlite3";
import type { Post } from "./types";
import * as path from "path";
import * as fs from "fs";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "posts.db");

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
	fs.mkdirSync(DATA_DIR, { recursive: true });
}

let db: Database.Database | null = null;

function getDb(): Database.Database {
	if (!db) {
		db = new Database(DB_PATH);
		db.pragma("journal_mode = WAL");
		initSchema();
	}
	return db;
}

function initSchema(): void {
	const database = db!;
	database.exec(`
		CREATE TABLE IF NOT EXISTS posts (
			id TEXT NOT NULL,
			source TEXT NOT NULL,
			username TEXT,
			name TEXT,
			stars INTEGER,
			description TEXT,
			url TEXT,
			created_at TEXT,
			relevance_score REAL,
			matched_interest TEXT,
			summary TEXT,
			relevance TEXT,
			scored_at TEXT,
			embedded_at TEXT,
			enrich_attempts INTEGER DEFAULT 0,
			inserted_at TEXT DEFAULT CURRENT_TIMESTAMP,
			PRIMARY KEY (id, source)
		);

		CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at);
		CREATE INDEX IF NOT EXISTS idx_posts_relevance ON posts(relevance_score DESC);
		CREATE INDEX IF NOT EXISTS idx_posts_source ON posts(source);
		CREATE INDEX IF NOT EXISTS idx_posts_scored ON posts(scored_at);
		CREATE INDEX IF NOT EXISTS idx_posts_embedded ON posts(embedded_at);
	`);

	// Migration: add enrich_attempts if missing
	try {
		database.exec(`ALTER TABLE posts ADD COLUMN enrich_attempts INTEGER DEFAULT 0`);
	} catch {
		// Column already exists
	}
}

export const posts = {
	upsert(post: Post): void {
		const database = getDb();
		const stmt = database.prepare(`
			INSERT INTO posts (id, source, username, name, stars, description, url, created_at, relevance_score, matched_interest, summary, relevance, scored_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(id, source) DO UPDATE SET
				stars = excluded.stars,
				description = CASE
					WHEN length(excluded.description) > length(COALESCE(posts.description, ''))
					THEN excluded.description
					ELSE posts.description
				END,
				relevance_score = COALESCE(excluded.relevance_score, posts.relevance_score),
				matched_interest = COALESCE(excluded.matched_interest, posts.matched_interest),
				summary = COALESCE(excluded.summary, posts.summary),
				relevance = COALESCE(excluded.relevance, posts.relevance),
				scored_at = COALESCE(excluded.scored_at, posts.scored_at)
		`);

		stmt.run(
			post.id,
			post.source,
			post.username,
			post.name,
			post.stars,
			post.description,
			post.url,
			post.created_at,
			post.relevance_score ?? null,
			post.matched_interest ?? null,
			post.summary ?? null,
			post.relevance ?? null,
			post.scored_at ?? null
		);
	},

	upsertMany(postsToInsert: Post[]): number {
		const database = getDb();
		const stmt = database.prepare(`
			INSERT INTO posts (id, source, username, name, stars, description, url, created_at, relevance_score, matched_interest, summary, relevance, scored_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(id, source) DO UPDATE SET
				stars = excluded.stars,
				description = CASE
					WHEN length(excluded.description) > length(COALESCE(posts.description, ''))
					THEN excluded.description
					ELSE posts.description
				END,
				relevance_score = COALESCE(excluded.relevance_score, posts.relevance_score),
				matched_interest = COALESCE(excluded.matched_interest, posts.matched_interest),
				summary = COALESCE(excluded.summary, posts.summary),
				relevance = COALESCE(excluded.relevance, posts.relevance),
				scored_at = COALESCE(excluded.scored_at, posts.scored_at)
		`);

		let count = 0;
		const transaction = database.transaction((items: Post[]) => {
			for (const post of items) {
				stmt.run(
					post.id,
					post.source,
					post.username,
					post.name,
					post.stars,
					post.description,
					post.url,
					post.created_at,
					post.relevance_score ?? null,
					post.matched_interest ?? null,
					post.summary ?? null,
					post.relevance ?? null,
					post.scored_at ?? null
				);
				count++;
			}
		});
		transaction(postsToInsert);
		return count;
	},

	getUnscored(limit: number = 50000): Post[] {
		const database = getDb();
		const stmt = database.prepare(`
			SELECT * FROM posts
			WHERE relevance_score IS NULL
			ORDER BY stars DESC
			LIMIT ?
		`);
		return stmt.all(limit) as Post[];
	},

	getUnenriched(minScore: number = 0.8, limit: number = 1000, maxAttempts: number = 3): Post[] {
		const database = getDb();
		const stmt = database.prepare(`
			SELECT * FROM posts
			WHERE relevance_score >= ?
			  AND summary IS NULL
			  AND COALESCE(enrich_attempts, 0) < ?
			ORDER BY relevance_score DESC, stars DESC
			LIMIT ?
		`);
		return stmt.all(minScore, maxAttempts, limit) as Post[];
	},

	getUnembedded(limit: number = 10000): Post[] {
		const database = getDb();
		const stmt = database.prepare(`
			SELECT * FROM posts
			WHERE embedded_at IS NULL AND summary IS NOT NULL
			ORDER BY relevance_score DESC NULLS LAST, stars DESC
			LIMIT ?
		`);
		return stmt.all(limit) as Post[];
	},

	getAll(): Post[] {
		const database = getDb();
		const stmt = database.prepare(`
			SELECT * FROM posts
			ORDER BY relevance_score DESC NULLS LAST, stars DESC
		`);
		return stmt.all() as Post[];
	},

	*iterate(): Generator<Post> {
		const database = getDb();
		const stmt = database.prepare(`
			SELECT * FROM posts
			ORDER BY relevance_score DESC NULLS LAST, stars DESC
		`);
		for (const row of stmt.iterate()) {
			yield row as Post;
		}
	},

	getCount(): number {
		const database = getDb();
		const stmt = database.prepare("SELECT COUNT(*) as count FROM posts");
		const row = stmt.get() as { count: number };
		return row.count;
	},

	getStats(): { total: number; scored: number; enriched: number; embedded: number } {
		const database = getDb();
		const total = (database.prepare("SELECT COUNT(*) as c FROM posts").get() as any).c;
		const scored = (database.prepare("SELECT COUNT(*) as c FROM posts WHERE relevance_score IS NOT NULL").get() as any).c;
		const enriched = (database.prepare("SELECT COUNT(*) as c FROM posts WHERE summary IS NOT NULL").get() as any).c;
		const embedded = (database.prepare("SELECT COUNT(*) as c FROM posts WHERE embedded_at IS NOT NULL").get() as any).c;
		return { total, scored, enriched, embedded };
	},

	updateScore(id: string, source: string, score: number, matchedInterest: string | null): void {
		const database = getDb();
		const stmt = database.prepare(`
			UPDATE posts
			SET relevance_score = ?, matched_interest = ?, scored_at = ?
			WHERE id = ? AND source = ?
		`);
		stmt.run(score, matchedInterest, new Date().toISOString(), id, source);
	},

	updateEnrichment(id: string, source: string, summary: string): void {
		const database = getDb();
		const stmt = database.prepare(`
			UPDATE posts
			SET summary = ?, enrich_attempts = COALESCE(enrich_attempts, 0) + 1
			WHERE id = ? AND source = ?
		`);
		stmt.run(summary, id, source);
	},

	incrementEnrichAttempts(id: string, source: string): void {
		const database = getDb();
		const stmt = database.prepare(`
			UPDATE posts
			SET enrich_attempts = COALESCE(enrich_attempts, 0) + 1
			WHERE id = ? AND source = ?
		`);
		stmt.run(id, source);
	},

	markAsEmbedded(ids: Array<{ id: string; source: string }>): void {
		const database = getDb();
		const stmt = database.prepare(`
			UPDATE posts
			SET embedded_at = ?
			WHERE id = ? AND source = ?
		`);
		const now = new Date().toISOString();
		const transaction = database.transaction((items: Array<{ id: string; source: string }>) => {
			for (const item of items) {
				stmt.run(now, item.id, item.source);
			}
		});
		transaction(ids);
	},

	close(): void {
		if (db) {
			db.close();
			db = null;
		}
	}
};
