/**
 * Step 5: LLM Enrichment
 * Generates summaries for top-scored posts
 */

import { posts } from "../db";
import { callStrong } from "../llm/client";
import { loadPromptTemplate } from "../llm/prompts/index";
import { sleep } from "../utils";
import type { Post, Config } from "../types";
import * as fs from "fs";
import * as path from "path";
import * as yaml from "yaml";

const DATA_DIR = path.join(process.cwd(), "data");
const FAILED_LOG = path.join(DATA_DIR, "enrichment-failed.jsonl");
const PROGRESS_LOG = path.join(DATA_DIR, "enrichment-progress.log");

interface EnrichmentResult {
	summary: string;
	summary_local?: string;
}

function logProgress(message: string): void {
	const timestamp = new Date().toISOString();
	const line = `[${timestamp}] ${message}\n`;
	console.log(message);
	fs.appendFileSync(PROGRESS_LOG, line);
}

function logFailed(post: Post, error: string, response?: string): void {
	const entry = {
		timestamp: new Date().toISOString(),
		id: post.id,
		source: post.source,
		name: post.name,
		score: post.relevance_score,
		error,
		response: response?.slice(0, 500),
	};
	fs.appendFileSync(FAILED_LOG, JSON.stringify(entry) + "\n");
}

function loadConfig(): Config {
	const configPath = path.join(process.cwd(), "config", "config.yaml");
	const content = fs.readFileSync(configPath, "utf-8");
	return yaml.parse(content) as Config;
}

function buildEnrichmentPrompt(post: Post, config: Config): string {
	const template = loadPromptTemplate("enrichment");

	let prompt = template
		.replace("{{post.source}}", post.source)
		.replace("{{post.name}}", post.name || "")
		.replace("{{post.username}}", post.username || "")
		.replace("{{post.description}}", post.description || "(no description)")
		.replace("{{post.url}}", post.url)
		.replace("{{post.stars}}", String(post.stars))
		.replace("{{post.matched_interest}}", post.matched_interest || "general ML/AI interest")
		.replace("{{profile}}", config.profile);

	// If notify_language is set and not English, request a localized summary too
	const lang = config.notify_language;
	if (lang && lang !== "en") {
		prompt = prompt.replace(
			'{"summary": "..."}',
			`{"summary": "...", "summary_local": "... (same summary in ${lang}, keep technical terms in English)"}`
		);
	}

	return prompt;
}

function parseEnrichmentResponse(response: string): EnrichmentResult & { parseError?: string } {
	try {
		const jsonMatch = response.match(/\{[\s\S]*\}/);
		if (jsonMatch) {
			const parsed = JSON.parse(jsonMatch[0]);
			if (parsed.summary) {
				return { summary: parsed.summary, summary_local: parsed.summary_local };
			}
			return { summary: "", parseError: "Empty summary in response" };
		}
		return { summary: "", parseError: "No JSON found in response" };
	} catch (e) {
		return { summary: "", parseError: `JSON parse error: ${e}` };
	}
}

async function enrichPost(post: Post, config: Config): Promise<EnrichmentResult & { failed?: boolean; error?: string; response?: string }> {
	const prompt = buildEnrichmentPrompt(post, config);

	try {
		const response = await callStrong(prompt);
		const result = parseEnrichmentResponse(response);

		if (result.parseError) {
			return { ...result, failed: true, error: result.parseError, response };
		}
		return result;
	} catch (error: any) {
		const errorMsg = error?.message || String(error);
		return { summary: "", failed: true, error: errorMsg };
	}
}

export async function runEnrich(options: { delayMs?: number } = {}): Promise<{ enriched: number; failed: number }> {
	const { delayMs = 500 } = options;

	logProgress("\n[5/8] Enriching top posts with LLM...");

	const config = loadConfig();
	const minScore = (config.min_score ?? 80) / 100;
	const postsToEnrich = posts.getUnenriched(minScore);

	logProgress(`  Found ${postsToEnrich.length} posts to enrich (score >= ${minScore})`);

	if (postsToEnrich.length === 0) {
		logProgress("  Nothing to enrich");
		return { enriched: 0, failed: 0 };
	}

	let enriched = 0;
	let failed = 0;
	const startTime = Date.now();

	for (let i = 0; i < postsToEnrich.length; i++) {
		const post = postsToEnrich[i];

		const result = await enrichPost(post, config);

		if (result.summary) {
			posts.updateEnrichment(post.id, post.source, result.summary, result.summary_local);
			enriched++;
		} else {
			posts.incrementEnrichAttempts(post.id, post.source);
			logFailed(post, result.error || "empty summary", result.response);
			failed++;
		}

		if ((i + 1) % 50 === 0 || i + 1 === postsToEnrich.length) {
			const elapsedSec = (Date.now() - startTime) / 1000;
			const elapsed = elapsedSec.toFixed(0);
			const rate = elapsedSec > 0 ? ((i + 1) / elapsedSec * 60).toFixed(0) : "∞";
			logProgress(`  Progress: ${i + 1}/${postsToEnrich.length} (${Math.round((i + 1) / postsToEnrich.length * 100)}%) | ${elapsed}s | ~${rate}/min | failed: ${failed}`);
		}

		if (i + 1 < postsToEnrich.length && delayMs > 0) {
			await sleep(delayMs);
		}
	}

	const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
	logProgress(`  Completed: ${enriched} enriched, ${failed} failed in ${totalTime}s`);

	return { enriched, failed };
}
