/**
 * Step 7: Export to CSV
 * Exports all posts to feed.csv
 */

import { posts } from "../db";
import type { Post } from "../types";
import * as fs from "fs";
import * as path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const CSV_PATH = path.join(DATA_DIR, "feed.csv");

function escapeCsv(str: string | null | undefined): string {
	if (!str) return "";
	// Prevent CSV formula injection
	let safe = str;
	if (/^[=+\-@\t\r]/.test(safe)) {
		safe = "'" + safe;
	}
	const escaped = safe.replace(/"/g, '""');
	if (escaped.includes(",") || escaped.includes('"') || escaped.includes("\n") || escaped.includes("\r")) {
		return `"${escaped}"`;
	}
	return escaped;
}

export async function runExport(): Promise<{ exported: number }> {
	console.log("\n[7/8] Exporting to CSV...");

	const headers = [
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
		"relevance",
		"scored_at"
	];

	const allPosts = posts.iterate();
	const stream = fs.createWriteStream(CSV_PATH);
	stream.write(headers.join(",") + "\n");

	let count = 0;
	for (const p of allPosts) {
		const row = [
			escapeCsv(p.id),
			escapeCsv(p.source),
			escapeCsv(p.username),
			escapeCsv(p.name),
			p.stars,
			escapeCsv(p.description),
			escapeCsv(p.url),
			escapeCsv(p.created_at),
			p.relevance_score?.toFixed(2) || "",
			escapeCsv(p.matched_interest),
			escapeCsv(p.summary),
			escapeCsv(p.relevance),
			escapeCsv(p.scored_at),
		].join(",");
		stream.write(row + "\n");
		count++;
	}

	stream.end();
	await new Promise<void>((resolve, reject) => {
		stream.on("finish", resolve);
		stream.on("error", reject);
	});

	console.log(`  Found ${count} posts to export`);

	if (count === 0) {
		console.log("  Nothing to export");
		return { exported: 0 };
	}

	console.log(`  Exported ${count} posts to ${CSV_PATH}`);

	const stats = posts.getStats();
	console.log(`\n  Stats:`);
	console.log(`    Total: ${stats.total}`);
	console.log(`    Scored: ${stats.scored}`);
	console.log(`    Enriched: ${stats.enriched}`);
	console.log(`    Embedded: ${stats.embedded}`);

	return { exported: count };
}
