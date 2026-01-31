/**
 * Step 6: Generate Embeddings
 * Creates vector embeddings using OpenAI text-embedding-3-small
 * Stores in LanceDB for semantic search
 */

import { posts } from "../db";
import { sleep } from "../utils";
import type { Post } from "../types";
import OpenAI from "openai";
import * as lancedb from "@lancedb/lancedb";
import * as path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const LANCE_PATH = path.join(DATA_DIR, "archive.lance");
const EMBEDDING_MODEL = "text-embedding-3-small";

let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
	if (!openaiClient) {
		const apiKey = process.env.OPENAI_API_KEY;
		if (!apiKey) {
			throw new Error("OPENAI_API_KEY environment variable is required for embeddings");
		}
		openaiClient = new OpenAI({ apiKey });
	}
	return openaiClient;
}

interface EmbeddingRecord {
	[key: string]: unknown;
	id: string;
	source: string;
	name: string;
	username: string;
	url: string;
	stars: number;
	relevance_score: number | null;
	summary: string | null;
	description: string;
	vector: number[];
}

function buildEmbeddingText(post: Post): string {
	return post.summary || "";
}

async function generateEmbeddings(texts: string[]): Promise<number[][]> {
	const client = getOpenAIClient();

	const response = await client.embeddings.create({
		model: EMBEDDING_MODEL,
		input: texts,
	});

	return response.data.map(d => d.embedding);
}

export async function runEmbed(options: { batchSize?: number; delayMs?: number } = {}): Promise<{ embedded: number }> {
	const { batchSize = 100, delayMs = 200 } = options;

	console.log("\n[6/8] Generating embeddings...");

	const postsToEmbed = posts.getUnembedded();

	console.log(`  Found ${postsToEmbed.length} posts to embed`);

	if (postsToEmbed.length === 0) {
		console.log("  Nothing to embed");
		return { embedded: 0 };
	}

	const db = await lancedb.connect(LANCE_PATH);
	const tableNames = await db.tableNames();
	let table: lancedb.Table | null = tableNames.includes("posts")
		? await db.openTable("posts")
		: null;

	if (table) {
		console.log("  Opened existing LanceDB table");
	} else {
		console.log("  Will create new LanceDB table");
	}

	let embedded = 0;

	for (let i = 0; i < postsToEmbed.length; i += batchSize) {
		const batch = postsToEmbed.slice(i, i + batchSize);
		const texts = batch.map(buildEmbeddingText);

		try {
			const embeddings = await generateEmbeddings(texts);

			const records: EmbeddingRecord[] = batch.map((post, j) => ({
				id: post.id,
				source: post.source,
				name: post.name,
				username: post.username,
				url: post.url,
				stars: post.stars,
				relevance_score: post.relevance_score ?? null,
				summary: post.summary ?? null,
				description: post.description?.slice(0, 500) || "",
				vector: embeddings[j],
			}));

			if (!table) {
				table = await db.createTable("posts", records);
			} else {
				await table.add(records);
			}

			posts.markAsEmbedded(batch.map(p => ({ id: p.id, source: p.source })));
			embedded += batch.length;

			if ((i + batchSize) % 500 < batchSize || i + batchSize >= postsToEmbed.length) {
				const progress = Math.min(i + batchSize, postsToEmbed.length);
				console.log(`  Progress: ${progress}/${postsToEmbed.length} (${Math.round(progress / postsToEmbed.length * 100)}%)`);
			}

			if (i + batchSize < postsToEmbed.length && delayMs > 0) {
				await sleep(delayMs);
			}
		} catch (error) {
			console.error(`  Error embedding batch at ${i}:`, error);
		}
	}

	console.log(`  Embedded ${embedded} posts`);

	return { embedded };
}

/**
 * Search for similar posts using vector similarity
 */
export async function searchPosts(query: string, limit: number = 10): Promise<EmbeddingRecord[]> {
	const client = getOpenAIClient();

	const response = await client.embeddings.create({
		model: EMBEDDING_MODEL,
		input: query,
	});
	const queryVector = response.data[0].embedding;

	const db = await lancedb.connect(LANCE_PATH);
	const table = await db.openTable("posts");

	const results = await table
		.vectorSearch(queryVector)
		.limit(limit)
		.toArray();

	return results as EmbeddingRecord[];
}
