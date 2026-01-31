/**
 * Step 3: LLM Scoring
 * Scores posts using gpt-4.1-mini based on user interests
 */

import { posts } from "../db";
import { callFast } from "../llm/client";
import { loadPromptTemplate } from "../llm/prompts/index";
import type { Post, Config } from "../types";
import * as fs from "fs";
import * as path from "path";
import * as yaml from "yaml";

const DATA_DIR = path.join(process.cwd(), "data");
const FAILED_LOG = path.join(DATA_DIR, "scoring-failed.jsonl");
const PROGRESS_LOG = path.join(DATA_DIR, "scoring-progress.log");

interface ScoreResult {
	score: number;
	matched_interest: string | null;
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

function buildScoringPrompt(config: Config, post: Post): string {
	const template = loadPromptTemplate("scoring");
	const interestsYaml = yaml.stringify(config.interests);
	const excludeList = config.exclude.join(", ");

	return template
		.replace("{{profile}}", config.profile)
		.replace("{{interests_yaml}}", interestsYaml)
		.replace("{{exclude_list}}", excludeList)
		.replace("{{post.source}}", post.source)
		.replace("{{post.name}}", post.name || "")
		.replace("{{post.username}}", post.username || "")
		.replace("{{post.description}}", post.description || "(no description)")
		.replace("{{post.stars}}", String(post.stars));
}

function parseScoreResponse(response: string): ScoreResult & { parseError?: string } {
	try {
		const jsonMatch = response.match(/\{[\s\S]*\}/);
		if (jsonMatch) {
			const parsed = JSON.parse(jsonMatch[0]);
			return {
				score: Math.max(0, Math.min(1, parsed.score || 0)),
				matched_interest: parsed.matched_interest || null,
			};
		}
		return { score: 0, matched_interest: null, parseError: "No JSON found in response" };
	} catch (e) {
		return { score: 0, matched_interest: null, parseError: `JSON parse error: ${e}` };
	}
}

async function scorePost(post: Post, config: Config): Promise<ScoreResult & { failed?: boolean; error?: string; response?: string }> {
	const prompt = buildScoringPrompt(config, post);

	try {
		const response = await callFast(prompt);
		const result = parseScoreResponse(response);

		if (result.parseError) {
			return { ...result, failed: true, error: result.parseError, response };
		}
		return result;
	} catch (error: any) {
		const errorMsg = error?.message || String(error);
		return { score: 0, matched_interest: null, failed: true, error: errorMsg };
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}

export async function runScore(options: { batchSize?: number; delayMs?: number } = {}): Promise<{ scored: number; failed: number }> {
	const { batchSize = 10, delayMs = 500 } = options;

	logProgress("\n[3/6] Scoring posts with LLM...");

	const config = loadConfig();
	const postsToScore = posts.getUnscored();

	logProgress(`  Found ${postsToScore.length} unscored posts`);

	if (postsToScore.length === 0) {
		logProgress("  Nothing to score");
		return { scored: 0, failed: 0 };
	}

	let scored = 0;
	let failed = 0;
	const startTime = Date.now();

	for (let i = 0; i < postsToScore.length; i += batchSize) {
		const batch = postsToScore.slice(i, i + batchSize);

		// Process batch in parallel
		const results = await Promise.all(
			batch.map(async (post) => {
				const result = await scorePost(post, config);
				return { post, result };
			})
		);

		// Update database and log failures
		for (const { post, result } of results) {
			if (result.failed) {
				// Don't write score — leave as unscored so it retries next run
				logFailed(post, result.error || "unknown", result.response);
				failed++;
			} else {
				posts.updateScore(post.id, post.source, result.score, result.matched_interest);
				scored++;
			}
		}

		// Progress logging every 100 posts
		if ((i + batchSize) % 100 < batchSize || i + batchSize >= postsToScore.length) {
			const progress = Math.min(i + batchSize, postsToScore.length);
			const elapsedSec = (Date.now() - startTime) / 1000;
			const elapsed = elapsedSec.toFixed(0);
			const rate = elapsedSec > 0 ? (progress / elapsedSec * 60).toFixed(0) : "∞";
			logProgress(`  Progress: ${progress}/${postsToScore.length} (${Math.round(progress / postsToScore.length * 100)}%) | ${elapsed}s | ~${rate}/min | failed: ${failed}`);
		}

		// Rate limiting
		if (i + batchSize < postsToScore.length && delayMs > 0) {
			await sleep(delayMs);
		}
	}

	const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
	logProgress(`  Completed: ${scored} scored, ${failed} failed in ${totalTime}s`);

	return { scored, failed };
}
