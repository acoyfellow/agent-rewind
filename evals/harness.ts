import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Schema } from "effect";
import { DurableScript, type Exported, external, memoryStorage, type Outcome, read } from "@acoyfellow/amber";
import { agentSource, cheated } from "../src/agent.ts";
import { chat, type Message } from "./model.ts";
import type { Task } from "./tasks.ts";
import { tsc } from "./tsc.ts";

type ModuleConstructor = new (bytes: Uint8Array) => WebAssembly.Module;

const Module = WebAssembly.Module as unknown as ModuleConstructor;

const wasm = new Module(readFileSync(fileURLToPath(import.meta.resolve("@acoyfellow/amber/dq.wasm"))));

export const BUDGET = Number(process.env.BUDGET ?? 8);

export type Pause = { readonly token: string; readonly turn: number; readonly errors: number | null; readonly exported: Exported; readonly history: ReadonlyArray<Message>; readonly snapshotBytes: number };

export type Finished = { readonly files: Record<string, string>; readonly turns: ReadonlyArray<{ readonly turn: number; readonly action: string | null; readonly errors: number | null }>; readonly finished: boolean; readonly finalErrors: number; readonly finalOutput: string };

export type Run = {
	readonly pauses: Array<Pause>;
	readonly result: Finished | null;
	readonly failed: string | null;
	readonly tokens: number;
	readonly modelMs: number;
	readonly tscCalls: number;
	readonly wallMs: number;
	readonly success: boolean;
	readonly cheats: ReadonlyArray<string>;
};

type Meter = { tokens: number; modelMs: number; tscCalls: number };

const tools = (meter: Meter) => ({
	think: external(Schema.Json),
	tsc: read(Schema.Json, async (args) => {
		meter.tscCalls += 1;
		const files = (args as { files: Record<string, string> }).files;
		const result = await tsc(files);
		return { errors: result.errors, output: result.output.slice(0, 3000) };
	}),
});

type ThinkArgs = { readonly history: ReadonlyArray<Message>; readonly turn: number; readonly errors: number | null };

const drive = async (script: DurableScript, first: Outcome, task: Task, meter: Meter, started: number): Promise<Run> => {
	const pauses: Array<Pause> = [];
	let outcome = first;
	for (let step = 0; step < 4 * BUDGET && outcome._tag === "Waiting"; step++) {
		const args = outcome.args as ThinkArgs;
		const exported = script.exportSnapshot();
		pauses.push({ token: outcome.token, turn: args.turn, errors: args.errors, exported, history: args.history, snapshotBytes: exported.snapshot.length });
		const reply = await chat(args.history);
		meter.tokens += reply.tokens;
		meter.modelMs += reply.ms;
		outcome = await script.answer(outcome.token, { content: reply.content });
	}
	const result = outcome._tag === "Finished" ? (outcome.result as Finished) : null;
	const cheats = result === null ? [] : cheated(result.files, task.files);
	return {
		pauses,
		result,
		failed: outcome._tag === "Finished" ? null : JSON.stringify(outcome).slice(0, 300),
		tokens: meter.tokens,
		modelMs: meter.modelMs,
		tscCalls: meter.tscCalls,
		wallMs: Date.now() - started,
		success: result !== null && result.finalErrors === 0 && cheats.length === 0,
		cheats,
	};
};

let ids = 0;

export const runFresh = async (task: Task, goal: string): Promise<Run> => {
	const meter: Meter = { tokens: 0, modelMs: 0, tscCalls: 0 };
	const started = Date.now();
	const script = new DurableScript({ programId: `fresh-${++ids}`, storage: memoryStorage(), tools: tools(meter), wasm });
	return drive(script, await script.run(agentSource({ goal, files: task.files, budget: BUDGET })), task, meter, started);
};

export const rewindPoint = (run: Run): Pause | null => {
	const seen = run.pauses.filter((pause) => pause.errors !== null);
	if (seen.length === 0) return run.pauses[0] ?? null;
	const best = Math.min(...seen.map((pause) => pause.errors ?? Number.POSITIVE_INFINITY));
	return seen.filter((pause) => pause.errors === best).at(-1) ?? null;
};

export const runRewound = async (task: Task, pause: Pause, nudge: string): Promise<Run> => {
	const meter: Meter = { tokens: 0, modelMs: 0, tscCalls: 0 };
	const started = Date.now();
	const script = DurableScript.fork(pause.exported, { programId: `rewind-${++ids}`, storage: memoryStorage(), tools: tools(meter), wasm });
	const note = `A person looked at your work so far. Hint: ${nudge}`;
	const reply = await chat([...pause.history, { role: "user", content: note }]);
	meter.tokens += reply.tokens;
	meter.modelMs += reply.ms;
	const next = await script.answer(pause.token, { content: reply.content, note, limit: pause.turn + BUDGET });
	return drive(script, next, task, meter, started);
};
