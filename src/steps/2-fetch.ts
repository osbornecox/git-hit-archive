/**
 * Step 2: Fetch posts from all enabled sources
 * Orchestrates GitHub, Reddit, etc.
 */

import { posts } from "../db";
import { fetchGitHubPosts, fetchRedditPosts } from "../fetchers";
import type { Config } from "../types";
import * as fs from "fs";
import * as path from "path";
import * as yaml from "yaml";

function loadConfig(): Config {
	const configPath = path.join(process.cwd(), "config", "config.yaml");
	const content = fs.readFileSync(configPath, "utf-8");
	return yaml.parse(content) as Config;
}

export async function runFetch(options: { totalDays?: number; sources?: string[] | null } = {}): Promise<{ fetched: number; saved: number }> {
	const { totalDays = 365, sources = null } = options;

	console.log(`\n[2/8] Fetching posts (${totalDays} days)...`);

	const config = loadConfig();
	let totalFetched = 0;
	let totalSaved = 0;

	// GitHub
	const githubEnabled = config.sources.github?.enabled !== false;
	const shouldFetchGithub = githubEnabled && (!sources || sources.includes("github"));

	if (shouldFetchGithub) {
		const result = await fetchGitHubPosts(config.sources.github, totalDays);
		totalFetched += result.fetched;
		totalSaved += result.saved;
	} else {
		console.log("  [GitHub] Skipped (disabled or not selected)");
	}

	// Reddit
	const redditConfig = config.sources.reddit;
	const redditEnabled = redditConfig && redditConfig.enabled !== false;
	const shouldFetchReddit = redditEnabled && (!sources || sources.includes("reddit"));

	if (shouldFetchReddit && redditConfig) {
		const redditPosts = await fetchRedditPosts(redditConfig);
		if (redditPosts.length > 0) {
			const saved = posts.upsertMany(redditPosts);
			totalFetched += redditPosts.length;
			totalSaved += saved;
		}
	} else if (redditConfig) {
		console.log("  [Reddit] Skipped (disabled or not selected)");
	}

	console.log(`\n  Total fetched: ${totalFetched}, Total saved: ${totalSaved}`);
	return { fetched: totalFetched, saved: totalSaved };
}
