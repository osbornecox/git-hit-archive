/**
 * GitHub fetcher with progress tracking and 7-day chunking
 * Handles GitHub API pagination and rate limiting
 */

import { posts } from "../db";
import { sleep } from "../utils";
import type { Post, GitHubSourceConfig } from "../types";
import * as fs from "fs";
import * as path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const PROGRESS_PATH = path.join(DATA_DIR, "progress.json");

interface FetchProgress {
	completedRanges: Array<{ start: string; end: string; count: number; language?: string }>;
	lastUpdated: string;
}

interface FetchResult {
	posts: Post[];
	totalCount: number;
	hitLimit: boolean;
}

function loadProgress(): FetchProgress {
	if (fs.existsSync(PROGRESS_PATH)) {
		return JSON.parse(fs.readFileSync(PROGRESS_PATH, "utf-8"));
	}
	return { completedRanges: [], lastUpdated: new Date().toISOString() };
}

function saveProgress(progress: FetchProgress): void {
	progress.lastUpdated = new Date().toISOString();
	fs.writeFileSync(PROGRESS_PATH, JSON.stringify(progress, null, 2));
}

async function fetchGitHubRange(
	startDate: string,
	endDate: string,
	minStars: number,
	language: string
): Promise<FetchResult> {
	const fetchedPosts: Post[] = [];
	const headers: Record<string, string> = { "User-Agent": "git-hit-archive" };

	if (process.env.GITHUB_TOKEN) {
		headers["Authorization"] = `token ${process.env.GITHUB_TOKEN}`;
	}

	let totalCount = 0;

	for (let page = 1; page <= 10; page++) {
		const query = `language:${language}+created:${startDate}..${endDate}+stars:>=${minStars}`;
		const url = `https://api.github.com/search/repositories?q=${query}&sort=stars&order=desc&per_page=100&page=${page}`;

		const resp = await fetch(url, { headers, signal: AbortSignal.timeout(30000) });

		if (!resp.ok) {
			if (resp.status === 403) {
				console.error(`  Rate limited. Waiting 60s...`);
				await sleep(60000);
				page--;
				continue;
			}
			throw new Error(`GitHub API error: ${resp.status} ${resp.statusText}`);
		}

		const data = await resp.json() as any;

		if (page === 1) {
			totalCount = data.total_count || 0;
		}

		if (!data.items || data.items.length === 0) break;

		for (const repo of data.items) {
			if (repo.stargazers_count < minStars) continue;
			fetchedPosts.push({
				id: repo.id.toString(),
				source: "github",
				username: repo.owner.login,
				name: repo.name,
				stars: repo.stargazers_count,
				description: repo.description || "",
				url: repo.html_url,
				created_at: repo.created_at,
			});
		}

		if (data.items.length < 100) break;
		await sleep(200);
	}

	return { posts: fetchedPosts, totalCount, hitLimit: totalCount > 1000 };
}

function generateDateRanges(totalDays: number, chunkDays: number = 7): Array<{ start: string; end: string }> {
	const ranges: Array<{ start: string; end: string }> = [];
	const now = new Date();

	for (let daysBack = 0; daysBack < totalDays; daysBack += chunkDays) {
		const endDate = new Date(now);
		endDate.setDate(endDate.getDate() - daysBack);

		const startDate = new Date(now);
		startDate.setDate(startDate.getDate() - Math.min(daysBack + chunkDays, totalDays));

		ranges.push({
			start: startDate.toISOString().slice(0, 10),
			end: endDate.toISOString().slice(0, 10),
		});
	}

	return ranges;
}

export async function fetchGitHubPosts(
	config: GitHubSourceConfig,
	totalDays: number = 365
): Promise<{ fetched: number; saved: number }> {
	const minStars = config.min_stars;
	const languages = config.languages ?? ["python"];
	const progress = loadProgress();

	console.log(`  [GitHub] min_stars=${minStars}, languages=${languages.join(",")}, chunk=7 days`);

	const ranges = generateDateRanges(totalDays, 7);
	let totalFetched = 0;
	let totalSaved = 0;
	let rangesHitLimit = 0;

	console.log(`  [GitHub] ${ranges.length} date ranges × ${languages.length} language(s)\n`);

	for (const range of ranges) {
		for (const language of languages) {
			const isCompleted = progress.completedRanges.some(
				r => r.start === range.start && r.end === range.end && (r.language ?? "python") === language
			);

			if (isCompleted) {
				process.stdout.write(`  [SKIP] ${range.start} to ${range.end} (${language})\n`);
				continue;
			}

			process.stdout.write(`  [FETCH] ${range.start} to ${range.end} (${language})...`);

			try {
				const result = await fetchGitHubRange(range.start, range.end, minStars, language);
				totalFetched += result.posts.length;

				if (result.hitLimit) {
					rangesHitLimit++;
					process.stdout.write(` ${result.posts.length}/${result.totalCount} [LIMIT HIT]\n`);
				} else {
					process.stdout.write(` ${result.posts.length}\n`);
				}

				if (result.posts.length > 0) {
					const saved = posts.upsertMany(result.posts);
					totalSaved += saved;
				}

				progress.completedRanges.push({
					start: range.start,
					end: range.end,
					count: result.posts.length,
					language,
				});
				saveProgress(progress);

				await sleep(500);
			} catch (err) {
				console.error(`\n  Error: ${err}`);
			}
		}
	}

	if (rangesHitLimit > 0) {
		console.log(`\n  [GitHub] WARNING: ${rangesHitLimit} ranges hit the 1000 result limit`);
	}

	console.log(`  [GitHub] Fetched: ${totalFetched}, Saved: ${totalSaved}`);
	return { fetched: totalFetched, saved: totalSaved };
}
