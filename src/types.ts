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

	// Notification tracking
	sent_to_telegram_at?: string;
	sent_to_slack_at?: string;
}

export interface GitHubSourceConfig {
	enabled?: boolean;
	min_stars: number;
	languages: string[];
}

export interface RedditSourceConfig {
	enabled?: boolean;
	subreddits: string[];
	min_score: number;
	flair_filters?: Record<string, string[]>;
}

export interface SourceConfig {
	github: GitHubSourceConfig;
	reddit?: RedditSourceConfig;
	huggingface?: {
		enabled?: boolean;
		min_likes: number;
		min_downloads: number;
	};
	replicate?: {
		enabled?: boolean;
		min_runs: number;
	};
	spam_keywords?: string[];
}

export interface ScheduleConfig {
	enabled: boolean;
	times: string[];
	timezone?: string;
}

export interface Config {
	language: string;
	min_score: number;
	profile: string;
	interests: {
		high: string[];
		medium: string[];
		low: string[];
	};
	exclude: string[];
	sources: SourceConfig;
	schedule?: ScheduleConfig;
}

export interface FetchProgress {
	completedRanges: Array<{ start: string; end: string; count: number; language?: string }>;
	lastUpdated: string;
}
