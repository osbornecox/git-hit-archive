/**
 * Step 1: Import posts from external SQLite database
 * One-time import of pre-existing posts with summaries
 */

import Database from "better-sqlite3";
import { posts } from "../db";
import type { Post } from "../types";
import * as fs from "fs";

const IMPORT_DB_PATH = process.env.IMPORT_DB_PATH || "";

export async function runImport(): Promise<{ imported: number }> {
	console.log("\n[1/8] Importing posts from external database...");

	if (!IMPORT_DB_PATH || !fs.existsSync(IMPORT_DB_PATH)) {
		console.log("  IMPORT_DB_PATH not set or file not found, skipping import");
		return { imported: 0 };
	}

	// Open source database (read-only)
	const sourceDb = new Database(IMPORT_DB_PATH, { readonly: true });

	// Get GitHub posts with summary
	const stmt = sourceDb.prepare(`
		SELECT * FROM posts
		WHERE source = 'github'
		  AND summary IS NOT NULL
		ORDER BY relevance_score DESC, stars DESC
	`);

	const sourcePosts = stmt.all() as Post[];
	sourceDb.close();

	console.log(`  Found ${sourcePosts.length} posts with summary`);

	if (sourcePosts.length === 0) {
		console.log("  Nothing to import");
		return { imported: 0 };
	}

	const imported = posts.upsertMany(sourcePosts);
	console.log(`  Imported ${imported} posts`);

	const dates = sourcePosts.map(p => p.created_at).filter(Boolean).sort();
	if (dates.length > 0) {
		console.log(`  Date range: ${dates[0]?.slice(0, 10)} to ${dates[dates.length - 1]?.slice(0, 10)}`);
	}

	return { imported };
}
