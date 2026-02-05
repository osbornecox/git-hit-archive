/**
 * Built-in scheduler daemon
 * Runs update pipeline at configured times — works on all platforms
 *
 * Usage: npm run daemon [--run-now]
 */

import { loadEnv } from "./env";
import type { Config } from "./types";
import * as fs from "fs";
import * as path from "path";
import * as yaml from "yaml";

loadEnv();

function loadConfig(): Config {
	const configPath = path.join(process.cwd(), "config", "config.yaml");
	const content = fs.readFileSync(configPath, "utf-8");
	return yaml.parse(content) as Config;
}

function parseTime(timeStr: string): { hours: number; minutes: number } | null {
	const match = timeStr.match(/^(\d{1,2}):(\d{2})$/);
	if (!match) return null;
	const hours = parseInt(match[1], 10);
	const minutes = parseInt(match[2], 10);
	if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
	return { hours, minutes };
}

function getNextRunTime(times: string[], timezone?: string): Date {
	const now = new Date();

	const nowInTz = timezone
		? new Date(now.toLocaleString("en-US", { timeZone: timezone }))
		: now;

	const currentMinutes = nowInTz.getHours() * 60 + nowInTz.getMinutes();

	const parsedTimes = times
		.map(parseTime)
		.filter((t): t is { hours: number; minutes: number } => t !== null)
		.map((t) => t.hours * 60 + t.minutes)
		.sort((a, b) => a - b);

	if (parsedTimes.length === 0) {
		throw new Error("No valid times configured in schedule.times");
	}

	let nextTimeMinutes = parsedTimes.find((t) => t > currentMinutes);
	let daysToAdd = 0;

	if (nextTimeMinutes === undefined) {
		nextTimeMinutes = parsedTimes[0];
		daysToAdd = 1;
	}

	const nextRun = new Date(nowInTz);
	nextRun.setDate(nextRun.getDate() + daysToAdd);
	nextRun.setHours(Math.floor(nextTimeMinutes / 60), nextTimeMinutes % 60, 0, 0);

	if (timezone) {
		const localNow = new Date();
		const tzNow = new Date(localNow.toLocaleString("en-US", { timeZone: timezone }));
		const offsetMs = localNow.getTime() - tzNow.getTime();
		nextRun.setTime(nextRun.getTime() + offsetMs);
	}

	return nextRun;
}

function formatDuration(ms: number): string {
	const hours = Math.floor(ms / (1000 * 60 * 60));
	const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
	if (hours > 0) return `${hours}h ${minutes}m`;
	return `${minutes}m`;
}

async function runUpdate(): Promise<void> {
	console.log("\n" + "=".repeat(50));
	console.log(`[${new Date().toISOString()}] Starting scheduled update...`);
	console.log("=".repeat(50));

	try {
		const { runPipeline } = await import("./pipeline");
		await runPipeline({ fetchDays: 7 });
	} catch (error) {
		console.error("Update failed:", error);
	}
}

async function main(): Promise<void> {
	const config = loadConfig();

	if (!config.schedule?.enabled) {
		console.error("Error: schedule.enabled is not set to true in config.yaml");
		console.error("Either set schedule.enabled: true, or use 'npm run build-archive' for manual runs");
		process.exit(1);
	}

	const { times, timezone } = config.schedule;

	if (!times || times.length === 0) {
		console.error("Error: schedule.times is empty in config.yaml");
		process.exit(1);
	}

	console.log("=".repeat(50));
	console.log("git-hit-archive Daemon Started");
	console.log("=".repeat(50));
	console.log(`Scheduled times: ${times.join(", ")}`);
	console.log(`Timezone: ${timezone || "system default"}`);
	console.log("\nPress Ctrl+C to stop\n");

	if (process.argv.includes("--run-now")) {
		await runUpdate();
	}

	const scheduleNext = (): void => {
		const nextRun = getNextRunTime(times, timezone);
		const msUntilNext = nextRun.getTime() - Date.now();

		console.log(`Next update: ${nextRun.toLocaleString()} (in ${formatDuration(msUntilNext)})`);

		setTimeout(async () => {
			await runUpdate();
			scheduleNext();
		}, msUntilNext);
	};

	scheduleNext();

	process.on("SIGINT", () => {
		console.log("\nDaemon stopped");
		process.exit(0);
	});

	process.on("SIGTERM", () => {
		console.log("\nDaemon stopped");
		process.exit(0);
	});
}

main().catch((err) => {
	console.error("Daemon failed:", err);
	process.exit(1);
});
