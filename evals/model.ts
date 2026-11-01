import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const MODEL = process.env.AGENT_MODEL ?? "@cf/zai-org/glm-5.3-flash";

export type Message = { readonly role: "system" | "user" | "assistant"; readonly content: string };

export type Reply = { readonly content: string; readonly tokens: number; readonly ms: number };

const config = (): { readonly accountId: string; readonly gateway: string; readonly token: string } => {
	const file = JSON.parse(readFileSync(join(homedir(), ".config/odds/config.json"), "utf8")) as { accountId?: string; gateway?: string };
	if (file.accountId === undefined) throw new Error("no accountId in ~/.config/odds/config.json");
	const token = process.env.ODDS_TOKEN ?? execFileSync("security", ["find-generic-password", "-a", process.env.USER ?? "", "-s", "odds-gateway", "-w"], { encoding: "utf8" }).trim();
	return { accountId: file.accountId, gateway: file.gateway ?? "default", token };
};

const settings = config();

type Body = { result?: { choices?: ReadonlyArray<{ message?: { content?: string } }>; usage?: { total_tokens?: number } } };

export const chat = async (messages: ReadonlyArray<Message>): Promise<Reply> => {
	for (let attempt = 1; ; attempt++) {
		const started = Date.now();
		const response = await fetch(`https://gateway.ai.cloudflare.com/v1/${settings.accountId}/${settings.gateway}/workers-ai/${MODEL}`, {
			method: "POST",
			headers: { authorization: `Bearer ${settings.token}`, "content-type": "application/json", "cf-aig-skip-cache": "true" },
			body: JSON.stringify({ messages, max_tokens: 2000, temperature: 0.7, chat_template_kwargs: { enable_thinking: false } }),
			signal: AbortSignal.timeout(180_000),
		}).catch(() => null);
		if (response?.ok) {
			const body = (await response.json()) as Body;
			return { content: body.result?.choices?.[0]?.message?.content ?? "", tokens: body.result?.usage?.total_tokens ?? 0, ms: Date.now() - started };
		}
		if (attempt >= 6) throw new Error(`model failed: ${response?.status ?? "network"}`);
		await new Promise((resume) => setTimeout(resume, 2 ** attempt * 1000));
	}
};
