/**
 * Step 7: Export public archive.db
 * Exports only enriched posts (summary IS NOT NULL) to a clean SQLite file.
 * This is the shareable artifact — raw posts.db stays local.
 */

import Database from "better-sqlite3";
import { posts, getDb } from "../db";
import * as fs from "fs";
import * as path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const ARCHIVE_PATH = path.join(DATA_DIR, "archive.db");

const PUBLIC_COLUMNS = [
	"id",
	"source",
	"username",
	"name",
	"stars",
	"description",
	"url",
	"created_at",
	"relevance_score",
	"matched_interest",
	"summary",
];

export async function runExport(): Promise<{ exported: number }> {
	console.log("\n[7/8] Exporting public archive.db...");

	if (fs.existsSync(ARCHIVE_PATH)) fs.unlinkSync(ARCHIVE_PATH);

	const archive = new Database(ARCHIVE_PATH);
	archive.exec(`
		CREATE TABLE posts (
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
			summary TEXT NOT NULL,
			PRIMARY KEY (id, source)
		);
		CREATE INDEX idx_archive_score ON posts(relevance_score DESC);
		CREATE INDEX idx_archive_created ON posts(created_at DESC);
	`);

	const source = getDb();
	const rows = source.prepare(`
		SELECT ${PUBLIC_COLUMNS.join(", ")}
		FROM posts
		WHERE summary IS NOT NULL
		ORDER BY relevance_score DESC, stars DESC
	`).all() as Array<Record<string, any>>;

	const insert = archive.prepare(`
		INSERT INTO posts (${PUBLIC_COLUMNS.join(", ")})
		VALUES (${PUBLIC_COLUMNS.map(() => "?").join(", ")})
	`);

	const insertMany = archive.transaction((items: Array<Record<string, any>>) => {
		for (const row of items) {
			insert.run(...PUBLIC_COLUMNS.map(c => row[c] ?? null));
		}
	});
	insertMany(rows);

	archive.close();

	console.log(`  Exported ${rows.length} enriched posts to ${ARCHIVE_PATH}`);

	const stats = posts.getStats();
	console.log(`\n  Stats:`);
	console.log(`    Total: ${stats.total}`);
	console.log(`    Scored: ${stats.scored}`);
	console.log(`    Enriched: ${stats.enriched}`);
	console.log(`    Embedded: ${stats.embedded}`);

	return { exported: rows.length };
}
