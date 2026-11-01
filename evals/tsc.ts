import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const ACCRETE_URL = process.env.ACCRETE_URL ?? "https://accrete.customer0.dev";

const TOKEN = process.env.ACCRETE_TOKEN ?? readFileSync(join(homedir(), ".accrete/token"), "utf8").trim();

export type TscResult = { readonly errors: number; readonly output: string; readonly ms: number; readonly containerSeconds: number };

const ERROR = new RegExp("error TS\\d+", "g");

export const tsc = async (files: Readonly<Record<string, string>>): Promise<TscResult> => {
	for (let attempt = 1; ; attempt++) {
		const started = Date.now();
		const response = await fetch(`${ACCRETE_URL}/task`, {
			method: "POST",
			headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
			body: JSON.stringify({ workspace: `rewind-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, seed: files, steps: [{ op: "tool", name: "tsc", args: ["-p", "tsconfig.json"], inputs: Object.keys(files), stdoutTo: "tsc.out" }] }),
		}).catch(() => null);
		const body = response?.ok ? ((await response.json()) as { logs?: ReadonlyArray<{ ok: boolean; containerSeconds: number }>; files?: Record<string, string> }) : null;
		const log = body?.logs?.[0];
		if (body !== null && log?.ok === true) {
			const output = (body.files?.["tsc.out"] ?? "").trim();
			return { errors: (output.match(ERROR) ?? []).length, output, ms: Date.now() - started, containerSeconds: log.containerSeconds };
		}
		if (attempt >= 5) throw new Error(`accrete tsc failed: ${response?.status ?? "network"}`);
		await new Promise((resume) => setTimeout(resume, 2 ** attempt * 500));
	}
};
