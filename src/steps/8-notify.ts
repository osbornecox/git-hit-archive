/**
 * Step 8: Send notifications to Telegram and Slack
 * Gracefully skips if env vars not configured
 */

import { posts } from "../db";
import { sleep } from "../utils";
import type { Post, Config } from "../types";
import * as fs from "fs";
import * as path from "path";
import * as yaml from "yaml";

// ── Telegram ──────────────────────────────────────────────

const TELEGRAM_API = "https://api.telegram.org/bot";

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

function formatTelegramPost(post: Post, index: number): string {
	const score = ((post.relevance_score ?? 0) * 100).toFixed(0);
	const name = escapeHtml(post.name || "Untitled");
	const source = post.source || "unknown";
	const interest = escapeHtml(post.matched_interest || "—");
	const summary = post.summary ? escapeHtml(post.summary) : "";

	let text = `<b>${index}. <a href="${post.url}">${name}</a></b> [${score}% · ${source}]\n`;
	if (summary) {
		text += `\n${summary}\n\n`;
	}
	text += `(${interest})\n`;

	return text;
}

async function sendTelegramMessage(botToken: string, chatId: string, text: string): Promise<boolean> {
	try {
		const response = await fetch(`${TELEGRAM_API}${botToken}/sendMessage`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				chat_id: chatId,
				text,
				parse_mode: "HTML",
				disable_web_page_preview: true,
			}),
		});

		const result = await response.json() as any;
		if (!result.ok) {
			console.error("  Telegram API error:", result);
			return false;
		}
		return true;
	} catch (error) {
		console.error("  Failed to send Telegram message:", error);
		return false;
	}
}

async function sendTelegramDigest(minScore: number): Promise<{ sent: number }> {
	const botToken = process.env.TELEGRAM_BOT_TOKEN;
	const chatId = process.env.TELEGRAM_CHAT_ID;

	if (!botToken || !chatId) {
		console.log("  [Telegram] Not configured (TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID not set), skipping");
		return { sent: 0 };
	}

	const topPosts = posts.getUnsentTelegramPosts(minScore);

	if (topPosts.length === 0) {
		console.log("  [Telegram] No new posts to send");
		return { sent: 0 };
	}

	const date = new Date().toLocaleDateString("en-US", {
		day: "numeric",
		month: "long",
		year: "numeric",
	});

	const stats = posts.getStats();
	let message = `🔥 <b>git-hit-archive Digest</b>\n📅 ${date}\n\n`;

	for (let i = 0; i < topPosts.length; i++) {
		message += formatTelegramPost(topPosts[i], i + 1) + "\n";
	}

	message += `\n📊 Scored: ${stats.scored} of ${stats.total} posts`;

	// Telegram 4096 char limit — chunk if needed
	if (message.length > 4000) {
		const chunkSize = 5;
		for (let i = 0; i < topPosts.length; i += chunkSize) {
			const chunk = topPosts.slice(i, i + chunkSize);
			let chunkMessage = i === 0
				? `🔥 <b>git-hit-archive Digest</b>\n📅 ${date}\n\n`
				: "";

			for (let j = 0; j < chunk.length; j++) {
				chunkMessage += formatTelegramPost(chunk[j], i + j + 1) + "\n";
			}

			if (i + chunkSize >= topPosts.length) {
				chunkMessage += `\n📊 Scored: ${stats.scored} of ${stats.total} posts`;
			}

			await sendTelegramMessage(botToken, chatId, chunkMessage);
			await sleep(500);
		}
	} else {
		await sendTelegramMessage(botToken, chatId, message);
	}

	posts.markAsSentToTelegram(topPosts.map(p => ({ id: p.id, source: p.source })));
	console.log(`  [Telegram] Sent digest with ${topPosts.length} posts`);

	return { sent: topPosts.length };
}

// ── Slack ─────────────────────────────────────────────────

function formatSlackPostBlocks(post: Post, index: number): any[] {
	const score = ((post.relevance_score ?? 0) * 100).toFixed(0);
	const name = post.name || "Untitled";
	const source = post.source || "unknown";
	const interest = post.matched_interest || "—";
	const summary = post.summary || "";

	const blocks: any[] = [
		{
			type: "section",
			text: { type: "mrkdwn", text: `*${index}. <${post.url}|${name}>* [${score}% · ${source}]` },
		},
	];

	if (summary) {
		blocks.push({
			type: "section",
			text: { type: "mrkdwn", text: summary },
		});
	}

	blocks.push({
		type: "context",
		elements: [{ type: "mrkdwn", text: `_${interest}_` }],
	});

	return blocks;
}

async function sendSlackMessage(webhookUrl: string, text: string, blocks?: any[]): Promise<boolean> {
	try {
		const body: any = { text };
		if (blocks) body.blocks = blocks;

		const response = await fetch(webhookUrl, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		});

		if (!response.ok) {
			console.error("  Slack API error:", response.status, await response.text());
			return false;
		}
		return true;
	} catch (error) {
		console.error("  Failed to send Slack message:", error);
		return false;
	}
}

async function sendSlackDigest(minScore: number): Promise<{ sent: number }> {
	const webhookUrl = process.env.SLACK_WEBHOOK_URL;

	if (!webhookUrl) {
		console.log("  [Slack] Not configured (SLACK_WEBHOOK_URL not set), skipping");
		return { sent: 0 };
	}

	const topPosts = posts.getUnsentSlackPosts(minScore);

	if (topPosts.length === 0) {
		console.log("  [Slack] No new posts to send");
		return { sent: 0 };
	}

	const date = new Date().toLocaleDateString("en-US", {
		day: "numeric",
		month: "long",
		year: "numeric",
	});

	const headerBlocks: any[] = [
		{ type: "header", text: { type: "plain_text", text: "🔥 git-hit-archive Digest", emoji: true } },
		{ type: "context", elements: [{ type: "mrkdwn", text: `📅 ${date}` }] },
		{ type: "divider" },
	];

	const MAX_BLOCKS = 45;
	let currentBlocks = [...headerBlocks];
	let messageCount = 0;

	for (let i = 0; i < topPosts.length; i++) {
		const postBlocks = formatSlackPostBlocks(topPosts[i], i + 1);

		if (currentBlocks.length + postBlocks.length > MAX_BLOCKS) {
			await sendSlackMessage(webhookUrl, `git-hit-archive Digest - Part ${messageCount + 1}`, currentBlocks);
			await sleep(500);
			messageCount++;
			currentBlocks = [];
		}

		currentBlocks.push(...postBlocks);

		if (i < topPosts.length - 1) {
			currentBlocks.push({ type: "divider" });
		}
	}

	// Footer
	const stats = posts.getStats();
	currentBlocks.push(
		{ type: "divider" },
		{ type: "context", elements: [{ type: "mrkdwn", text: `📊 Scored: ${stats.scored} of ${stats.total} posts` }] }
	);

	const fallbackText = topPosts.map((p, i) => {
		const score = ((p.relevance_score ?? 0) * 100).toFixed(0);
		return `${i + 1}. <${p.url}|${p.name}> [${score}%] ${p.summary || ""}`;
	}).join("\n");

	await sendSlackMessage(webhookUrl, fallbackText, currentBlocks);

	posts.markAsSentToSlack(topPosts.map(p => ({ id: p.id, source: p.source })));
	console.log(`  [Slack] Sent digest with ${topPosts.length} posts`);

	return { sent: topPosts.length };
}

// ── Orchestrator ──────────────────────────────────────────

function loadConfig(): Config {
	const configPath = path.join(process.cwd(), "config", "config.yaml");
	const content = fs.readFileSync(configPath, "utf-8");
	return yaml.parse(content) as Config;
}

export async function runNotify(): Promise<{ telegram: number; slack: number }> {
	console.log("\n[8/8] Sending notifications...");

	const config = loadConfig();
	const minScore = (config.min_score ?? 80) / 100;

	const telegramResult = await sendTelegramDigest(minScore);
	const slackResult = await sendSlackDigest(minScore);

	return { telegram: telegramResult.sent, slack: slackResult.sent };
}

// CLI: run directly
if (import.meta.url === `file://${process.argv[1]}`) {
	const { loadEnv } = await import("../env");
	loadEnv();

	const args = process.argv.slice(2);
	const telegramOnly = args.includes("--telegram-only");
	const slackOnly = args.includes("--slack-only");

	const config = loadConfig();
	const minScore = (config.min_score ?? 80) / 100;

	if (telegramOnly) {
		await sendTelegramDigest(minScore);
	} else if (slackOnly) {
		await sendSlackDigest(minScore);
	} else {
		await runNotify();
	}

	posts.close();
}
