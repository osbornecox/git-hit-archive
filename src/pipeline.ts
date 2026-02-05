/**
 * git-hit-archive Unified Pipeline
 * 8-step orchestrator: Import → Fetch → README → Score → Enrich → Embed → Export → Notify
 *
 * Usage:
 *   npm run build-archive                    # Full pipeline
 *   npm run build-archive -- --days=7        # Incremental (last 7 days)
 *   npm run build-archive -- --skip-llm      # Skip scoring + enrichment
 *   npm run build-archive -- --skip-embed    # Skip embeddings
 *   npm run build-archive -- --skip-readme   # Skip README fetching
 *   npm run build-archive -- --skip-notify   # Skip Telegram/Slack
 *   npm run build-archive -- --sources=github,reddit
 *   npm run build-archive -- --step=4        # Run only step 4
 */

import { loadEnv } from "./env";
import { posts } from "./db";

loadEnv();

// Import steps
import { runImport } from "./steps/1-import";
import { runFetch } from "./steps/2-fetch";
import { runReadme } from "./steps/3-readme";
import { runScore } from "./steps/4-score";
import { runEnrich } from "./steps/5-enrich";
import { runEmbed } from "./steps/6-embed";
import { runExport } from "./steps/7-export";
import { runNotify } from "./steps/8-notify";

interface PipelineOptions {
	skipLlm: boolean;
	skipEmbed: boolean;
	skipReadme: boolean;
	skipNotify: boolean;
	stepOnly: number | null;
	fetchDays: number;
	sources: string[] | null;
}

function parseArgs(): PipelineOptions {
	const args = process.argv.slice(2);

	const options: PipelineOptions = {
		skipLlm: args.includes("--skip-llm"),
		skipEmbed: args.includes("--skip-embed"),
		skipReadme: args.includes("--skip-readme"),
		skipNotify: args.includes("--skip-notify"),
		stepOnly: null,
		fetchDays: 365,
		sources: null,
	};

	const stepArg = args.find(a => a.startsWith("--step="));
	if (stepArg) {
		options.stepOnly = parseInt(stepArg.split("=")[1]);
	}

	const daysArg = args.find(a => a.startsWith("--days="));
	if (daysArg) {
		options.fetchDays = parseInt(daysArg.split("=")[1]) || 365;
	}

	const sourcesArg = args.find(a => a.startsWith("--sources="));
	if (sourcesArg) {
		options.sources = sourcesArg.split("=")[1].split(",").map(s => s.trim());
	}

	return options;
}

function shouldRun(step: number, options: PipelineOptions): boolean {
	return !options.stepOnly || options.stepOnly === step;
}

export async function runPipeline(overrides?: Partial<PipelineOptions>): Promise<void> {
	const options = { ...parseArgs(), ...overrides };
	const startTime = Date.now();

	console.log("=".repeat(50));
	console.log("git-hit-archive Pipeline");
	console.log("=".repeat(50));

	if (options.skipLlm) console.log("  --skip-llm: Skipping scoring and enrichment");
	if (options.skipEmbed) console.log("  --skip-embed: Skipping embeddings");
	if (options.skipReadme) console.log("  --skip-readme: Skipping README fetching");
	if (options.skipNotify) console.log("  --skip-notify: Skipping notifications");
	if (options.stepOnly) console.log(`  --step=${options.stepOnly}: Running only step ${options.stepOnly}`);
	if (options.fetchDays !== 365) console.log(`  --days=${options.fetchDays}: Fetching last ${options.fetchDays} days`);
	if (options.sources) console.log(`  --sources=${options.sources.join(",")}`);

	const results: Record<string, any> = {};

	try {
		// Step 1: Import
		if (shouldRun(1, options)) {
			results.import = await runImport();
		}

		// Step 2: Fetch
		if (shouldRun(2, options)) {
			results.fetch = await runFetch({ totalDays: options.fetchDays, sources: options.sources });
		}

		// Step 3: README
		if (shouldRun(3, options)) {
			if (options.skipReadme) {
				console.log("\n[3/8] README fetching SKIPPED (--skip-readme)");
				results.readme = { updated: 0, skipped: true };
			} else {
				results.readme = await runReadme();
			}
		}

		// Step 4: Score
		if (shouldRun(4, options)) {
			if (options.skipLlm) {
				console.log("\n[4/8] Scoring SKIPPED (--skip-llm)");
				results.score = { scored: 0, skipped: true };
			} else {
				results.score = await runScore();
			}
		}

		// Step 5: Enrich
		if (shouldRun(5, options)) {
			if (options.skipLlm) {
				console.log("\n[5/8] Enrichment SKIPPED (--skip-llm)");
				results.enrich = { enriched: 0, skipped: true };
			} else {
				results.enrich = await runEnrich();
			}
		}

		// Step 6: Embed
		if (shouldRun(6, options)) {
			if (options.skipEmbed || options.skipLlm) {
				console.log("\n[6/8] Embeddings SKIPPED (--skip-embed)");
				results.embed = { embedded: 0, skipped: true };
			} else {
				results.embed = await runEmbed();
			}
		}

		// Step 7: Export
		if (shouldRun(7, options)) {
			results.export = await runExport();
		}

		// Step 8: Notify
		if (shouldRun(8, options)) {
			if (options.skipNotify || options.skipLlm) {
				console.log("\n[8/8] Notifications SKIPPED (--skip-notify)");
				results.notify = { telegram: 0, slack: 0, skipped: true };
			} else {
				results.notify = await runNotify();
			}
		}

		// Summary
		const duration = ((Date.now() - startTime) / 1000).toFixed(1);
		console.log("\n" + "=".repeat(50));
		console.log("PIPELINE COMPLETE");
		console.log("=".repeat(50));
		console.log(`Duration: ${duration}s`);
		console.log("\nResults:");
		console.log(JSON.stringify(results, null, 2));

		const stats = posts.getStats();
		console.log("\nDatabase stats:");
		console.log(`  Total posts: ${stats.total}`);
		console.log(`  Scored: ${stats.scored}`);
		console.log(`  Enriched: ${stats.enriched}`);
		console.log(`  Embedded: ${stats.embedded}`);

	} catch (error) {
		console.error("\nPipeline failed:", error);
		process.exit(1);
	} finally {
		posts.close();
	}
}

// Run when called directly (not when imported by daemon)
if (import.meta.url === `file://${process.argv[1]}`) {
	runPipeline();
}
