export interface Post {
	id: string;
	source: string;
	username: string;
	name: string;
	stars: number;
	description: string;
	url: string;
	created_at: string;

	// LLM scoring fields
	relevance_score?: number;      // 0.0 - 1.0
	matched_interest?: string;     // which interest matched
	summary?: string;              // post summary in configured language
	relevance?: string;            // relevance explanation in configured language
	scored_at?: string;            // when LLM scored this post
}

export interface GitHubSourceConfig {
	min_stars: number;
	languages: string[];
}

export interface SourceConfig {
	github: GitHubSourceConfig;
	reddit?: {
		subreddits: string[];
		min_score: number;
	};
	huggingface?: {
		min_likes: number;
		min_downloads: number;
	};
	replicate?: {
		min_runs: number;
	};
	spam_keywords?: string[];
}

export interface Config {
	language: string;
	min_score_for_digest: number;
	profile: string;
	interests: {
		high: string[];
		medium: string[];
		low: string[];
	};
	exclude: string[];
	sources: SourceConfig;
}

export interface FetchProgress {
	completedRanges: Array<{ start: string; end: string; count: number }>;
	lastUpdated: string;
}
