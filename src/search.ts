/**
 * git-hit-archive Search CLI
 * Semantic search over ML/AI repositories
 *
 * Usage:
 *   npm run search "agent orchestration"
 *   npm run search "vector databases" --limit 20
 *   npm run search "RAG" --min-score 0.7
 */

import * as fs from "fs";
import * as path from "path";
import OpenAI from "openai";
import * as lancedb from "@lancedb/lancedb";
import { loadEnv } from "./env";

loadEnv();

const DATA_DIR = path.join(process.cwd(), "data");
const LANCE_PATH = path.join(DATA_DIR, "archive.lance");
const EMBEDDING_MODEL = "text-embedding-3-small";

interface SearchResult {
	id: string;
	source: string;
	name: string;
	username: string;
	url: string;
	stars: number;
	relevance_score: number | null;
	summary: string | null;
	description: string;
	_distance: number;
}

interface SearchOptions {
	query: string;
	limit: number;
	minScore: number | null;
}

function parseArgs(): SearchOptions {
	const args = process.argv.slice(2);

	// Find query (first non-flag argument)
	const query = args.find(a => !a.startsWith("--")) || "";

	// Parse flags
	let limit = 10;
	let minScore: number | null = null;

	const limitArg = args.find(a => a.startsWith("--limit="));
	if (limitArg) {
		limit = parseInt(limitArg.split("=")[1]) || 10;
	}

	const minScoreArg = args.find(a => a.startsWith("--min-score="));
	if (minScoreArg) {
		minScore = parseFloat(minScoreArg.split("=")[1]);
	}

	return { query, limit, minScore };
}

async function search(options: SearchOptions): Promise<void> {
	if (!options.query) {
		console.log("Usage: npm run search \"your query\" [--limit=10] [--min-score=0.5]");
		console.log("\nExamples:");
		console.log('  npm run search "agent orchestration"');
		console.log('  npm run search "vector databases" --limit=20');
		console.log('  npm run search "RAG retrieval" --min-score=0.7');
		process.exit(1);
	}

	// Check if LanceDB exists
	if (!fs.existsSync(LANCE_PATH)) {
		console.error("Error: LanceDB not found. Run 'npm run build-archive' first.");
		process.exit(1);
	}

	console.log(`Searching for: "${options.query}"\n`);

	// Initialize OpenAI client
	const apiKey = process.env.OPENAI_API_KEY;
	if (!apiKey) {
		console.error("Error: OPENAI_API_KEY environment variable is required");
		process.exit(1);
	}
	const openai = new OpenAI({ apiKey });

	// Generate embedding for query
	const embeddingResponse = await openai.embeddings.create({
		model: EMBEDDING_MODEL,
		input: options.query,
	});
	const queryVector = embeddingResponse.data[0].embedding;

	// Connect to LanceDB and search
	const db = await lancedb.connect(LANCE_PATH);
	const table = await db.openTable("posts");

	let results = await table
		.vectorSearch(queryVector)
		.limit(options.limit * 2) // Fetch more for filtering
		.toArray() as SearchResult[];

	// Filter by min score if specified
	if (options.minScore !== null) {
		results = results.filter(r => (r.relevance_score ?? 0) >= options.minScore!);
	}

	// Limit results
	results = results.slice(0, options.limit);

	if (results.length === 0) {
		console.log("No results found.");
		return;
	}

	// Display results
	console.log(`Found ${results.length} results:\n`);
	console.log("─".repeat(60));

	for (let i = 0; i < results.length; i++) {
		const r = results[i];
		const score = r.relevance_score?.toFixed(2) || "N/A";
		const distance = r._distance?.toFixed(3) || "N/A";

		console.log(`\n${i + 1}. ${r.name} (⭐ ${r.stars})`);
		console.log(`   ${r.url}`);
		console.log(`   Score: ${score} | Distance: ${distance}`);

		if (r.summary) {
			console.log(`   📝 ${r.summary}`);
		} else if (r.description) {
			const desc = r.description.length > 150
				? r.description.slice(0, 150) + "..."
				: r.description;
			console.log(`   📄 ${desc}`);
		}
	}

	console.log("\n" + "─".repeat(60));
}

// Run
search(parseArgs()).catch(err => {
	console.error("Search failed:", err);
	process.exit(1);
});
