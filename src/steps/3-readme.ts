/**
 * Step 3: Fetch README content for GitHub posts with short descriptions
 * Enriches descriptions before LLM scoring for better relevance assessment
 */

import { posts } from "../db";
import { sleep } from "../utils";

const MAX_README_LENGTH = 2000;

function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
	const match = url.match(/github\.com\/([^\/]+)\/([^\/\?#]+)/);
	if (!match) return null;
	return { owner: match[1], repo: match[2] };
}

async function fetchReadme(url: string): Promise<string | null> {
	const parsed = parseGitHubUrl(url);
	if (!parsed) return null;

	const { owner, repo } = parsed;
	const readmeFiles = ["README.md", "readme.md", "README.rst", "README.txt", "README"];
	const branches = ["main", "master"];

	for (const branch of branches) {
		for (const filename of readmeFiles) {
			try {
				const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filename}`;
				const response = await fetch(rawUrl);
				if (response.ok) {
					let content = await response.text();
					if (content.length > MAX_README_LENGTH) {
						content = content.substring(0, MAX_README_LENGTH) + "\n\n[truncated]";
					}
					return content;
				}
			} catch {
				// Try next combination
			}
		}
	}

	// Fallback: GitHub API
	const token = process.env.GITHUB_TOKEN;
	try {
		const apiUrl = `https://api.github.com/repos/${owner}/${repo}/readme`;
		const headers: Record<string, string> = { Accept: "application/vnd.github.v3.raw" };
		if (token) headers.Authorization = `Bearer ${token}`;

		const response = await fetch(apiUrl, { headers });
		if (response.ok) {
			let content = await response.text();
			if (content.length > MAX_README_LENGTH) {
				content = content.substring(0, MAX_README_LENGTH) + "\n\n[truncated]";
			}
			return content;
		}
	} catch {
		// ignore
	}

	return null;
}

export async function runReadme(options: { batchSize?: number; delayMs?: number } = {}): Promise<{ updated: number }> {
	const { batchSize = 10, delayMs = 100 } = options;

	console.log("\n[3/8] Fetching READMEs for short descriptions...");

	const postsToUpdate = posts.getShortDescriptionPosts();
	console.log(`  Found ${postsToUpdate.length} GitHub posts with short descriptions`);

	if (postsToUpdate.length === 0) {
		console.log("  Nothing to update");
		return { updated: 0 };
	}

	let updated = 0;

	for (let i = 0; i < postsToUpdate.length; i += batchSize) {
		const batch = postsToUpdate.slice(i, i + batchSize);

		const results = await Promise.all(
			batch.map(async (post) => {
				const readme = await fetchReadme(post.url);
				return { post, readme };
			})
		);

		for (const { post, readme } of results) {
			if (readme) {
				const combined = post.description
					? `${post.description}\n\n${readme}`
					: readme;
				posts.updateDescription(post.id, post.source, combined);
				updated++;
			}
		}

		if ((i + batchSize) % 100 < batchSize) {
			const progress = Math.min(i + batchSize, postsToUpdate.length);
			console.log(`  Progress: ${progress}/${postsToUpdate.length} (updated: ${updated})`);
		}

		if (i + batchSize < postsToUpdate.length && delayMs > 0) {
			await sleep(delayMs);
		}
	}

	console.log(`  Updated ${updated} posts with README content`);
	return { updated };
}
