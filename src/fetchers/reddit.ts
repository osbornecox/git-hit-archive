/**
 * Reddit fetcher — top posts from configured subreddits
 */

import { sleep, base36ToInt } from "../utils";
import type { Post, RedditSourceConfig } from "../types";

export async function fetchRedditPosts(config: RedditSourceConfig): Promise<Post[]> {
	const { subreddits, min_score, flair_filters } = config;
	const allPosts: Post[] = [];

	for (const subreddit of subreddits) {
		try {
			const resp = await fetch(
				`https://www.reddit.com/r/${subreddit}/top.json?sort=top&t=week&limit=100`,
				{ headers: { "User-Agent": "git-hit-archive" } }
			);
			const data = (await resp.json()) as any;

			for (const thread of data.data?.children || []) {
				const { title, author, subreddit: sub, score, created_utc, id, permalink, link_flair_text } = thread.data;

				if (score < min_score) continue;
				const flairFilter = flair_filters?.[sub];
				if (flairFilter && !flairFilter.includes(link_flair_text)) continue;

				allPosts.push({
					id: base36ToInt(id),
					source: "reddit",
					username: author,
					name: title,
					stars: score,
					description: `/r/${sub}`,
					url: `https://www.reddit.com${permalink}`,
					created_at: new Date(created_utc * 1000).toISOString(),
				});
			}

			await sleep(500);
		} catch (err) {
			console.error(`  [Reddit] Error fetching r/${subreddit}:`, err);
		}
	}

	console.log(`  [Reddit] Fetched ${allPosts.length} posts from ${subreddits.length} subreddits`);
	return allPosts;
}
