import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { ChatCompletionCreateParamsNonStreaming } from "openai/resources/chat/completions";
import * as fs from "fs";
import * as path from "path";

const TIMEOUT_MS = 30000;
const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 1000;
const RATE_LIMIT_DELAY_MS = 15000;
const LOG_FILE = path.join(process.cwd(), "data", "llm-errors.log");

// Provider selection: "openai" or "anthropic"
const LLM_PROVIDER = process.env.LLM_PROVIDER || "openai";

let anthropicClient: Anthropic | null = null;
let openaiClient: OpenAI | null = null;

function log(message: string): void {
	const timestamp = new Date().toISOString();
	const line = `[${timestamp}] ${message}\n`;
	console.error(line.trim());
	try {
		fs.appendFileSync(LOG_FILE, line);
	} catch {
		// ignore write errors
	}
}

function getAnthropicClient(): Anthropic {
	if (!anthropicClient) {
		const apiKey = process.env.ANTHROPIC_API_KEY;
		if (!apiKey) {
			throw new Error("ANTHROPIC_API_KEY environment variable is required");
		}
		anthropicClient = new Anthropic({ apiKey, timeout: TIMEOUT_MS });
	}
	return anthropicClient;
}

function getOpenAIClient(): OpenAI {
	if (!openaiClient) {
		const apiKey = process.env.OPENAI_API_KEY;
		if (!apiKey) {
			throw new Error("OPENAI_API_KEY environment variable is required");
		}
		openaiClient = new OpenAI({ apiKey, timeout: TIMEOUT_MS });
	}
	return openaiClient;
}

function isRetryableError(error: any): boolean {
	const errorMsg = error?.message || String(error);
	return (
		errorMsg.includes("timeout") ||
		errorMsg.includes("ECONNRESET") ||
		errorMsg.includes("ETIMEDOUT") ||
		errorMsg.includes("overloaded") ||
		error?.status === 429 ||
		error?.status === 529 ||
		error?.status >= 500
	);
}

async function handleRetry(error: any, model: string, attempt: number): Promise<void> {
	const errorMsg = error?.message || String(error);
	const isRateLimit = error?.status === 429;

	if (isRateLimit) {
		const retryAfter = error?.headers?.["retry-after"];
		const waitMs = retryAfter ? parseInt(retryAfter) * 1000 + 1000 : RATE_LIMIT_DELAY_MS;
		log(`RATE_LIMIT ${attempt}/${MAX_RETRIES} [${model}]: waiting ${waitMs}ms`);
		await new Promise((r) => setTimeout(r, waitMs));
		return;
	}

	if (isRetryableError(error)) {
		log(`RETRY ${attempt}/${MAX_RETRIES} [${model}]: ${errorMsg}`);
		await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * attempt));
		return;
	}

	log(`FAIL [${model}]: ${errorMsg} (not retryable)`);
	throw error;
}

async function callAnthropicWithRetry(
	model: string,
	maxTokens: number,
	prompt: string
): Promise<string> {
	const client = getAnthropicClient();

	for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
		try {
			const response = await client.messages.create({
				model,
				max_tokens: maxTokens,
				messages: [{ role: "user", content: prompt }],
			});

			const textBlock = response.content.find((block) => block.type === "text");
			return textBlock ? textBlock.text : "";
		} catch (error: any) {
			if (attempt === MAX_RETRIES) {
				log(`FAIL [${model}] after ${MAX_RETRIES} attempts: ${error?.message || error}`);
				throw error;
			}
			await handleRetry(error, model, attempt);
		}
	}

	return "";
}

async function callOpenAIWithRetry(
	model: string,
	maxTokens: number,
	prompt: string,
	temperature: number = 0.3
): Promise<string> {
	const client = getOpenAIClient();

	// GPT-5 and reasoning models use different API params
	const isReasoningModel = model.startsWith("gpt-5") || model.startsWith("o1") || model.startsWith("o3");

	for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
		try {
			const params: ChatCompletionCreateParamsNonStreaming = isReasoningModel
				? {
					model,
					max_completion_tokens: maxTokens,
					messages: [{ role: "user", content: prompt }],
				}
				: {
					model,
					max_tokens: maxTokens,
					temperature,
					messages: [{ role: "user", content: prompt }],
				};

			const response = await client.chat.completions.create(params);
			return response.choices[0]?.message?.content || "";
		} catch (error: any) {
			if (attempt === MAX_RETRIES) {
				log(`FAIL [${model}] after ${MAX_RETRIES} attempts: ${error?.message || error}`);
				throw error;
			}
			await handleRetry(error, model, attempt);
		}
	}

	return "";
}

// Fast model for scoring
export async function callFast(prompt: string): Promise<string> {
	if (LLM_PROVIDER === "anthropic") {
		return callAnthropicWithRetry("claude-3-5-haiku-20241022", 256, prompt);
	}
	return callOpenAIWithRetry("gpt-4.1-mini", 256, prompt, 0.2);
}

// Stronger model for enrichment
export async function callStrong(prompt: string): Promise<string> {
	if (LLM_PROVIDER === "anthropic") {
		return callAnthropicWithRetry("claude-sonnet-4-20250514", 512, prompt);
	}
	return callOpenAIWithRetry("gpt-5-mini", 4096, prompt, 0.5);
}
