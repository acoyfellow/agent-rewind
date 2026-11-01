import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { BUDGET, type Run, rewindPoint, runFresh, runRewound } from "./harness.ts";
import { MODEL } from "./model.ts";
import { TASKS } from "./tasks.ts";

const WANTED_FAILURES = Number(process.env.WANTED_FAILURES ?? 20);

const MAX_FIRST_RUNS = Number(process.env.MAX_FIRST_RUNS ?? 80);

const CONCURRENCY = 4;

const SMALL = WANTED_FAILURES !== 20;

const OUT = fileURLToPath(new URL(SMALL ? "../bench/receipt-small.json" : "../bench/receipt.json", import.meta.url));

const COMMIT = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();

const DIRTY = execFileSync("git", ["status", "--porcelain", "--", "src", "evals", "package.json"], { encoding: "utf8" }).trim();

if (DIRTY !== "" && !SMALL) throw new Error(`commit src, evals and package.json first:\n${DIRTY}`);

type Summary = { readonly success: boolean; readonly finalErrors: number | null; readonly finished: boolean; readonly turns: number; readonly tokens: number; readonly modelMs: number; readonly wallMs: number; readonly tscCalls: number; readonly cheats: ReadonlyArray<string>; readonly failed: string | null };

const summary = (run: Run): Summary => ({
	success: run.success,
	finalErrors: run.result?.finalErrors ?? null,
	finished: run.result?.finished ?? false,
	turns: run.result?.turns.length ?? 0,
	tokens: run.tokens,
	modelMs: run.modelMs,
	wallMs: run.wallMs,
	tscCalls: run.tscCalls,
	cheats: run.cheats,
	failed: run.failed,
});

type Case = {
	readonly task: string;
	readonly first: Summary & { readonly snapshotBytes: ReadonlyArray<number> };
	readonly rewindTurn: number;
	readonly rewindErrors: number | null;
	readonly rewound: Summary;
	readonly restarted: Summary;
};

const firsts: Array<{ readonly task: string; readonly success: boolean; readonly error: string | null }> = [];

const cases: Array<Case> = [];

const jobs = Array.from({ length: MAX_FIRST_RUNS }, (_unused, index) => TASKS[index % TASKS.length]).filter((task) => task !== undefined);

const attempt = async <A>(work: () => Promise<A>): Promise<A | null> => {
	for (let tries = 1; tries <= 3; tries++) {
		const result = await work().catch((error: unknown) => {
			console.log(`retry ${tries}: ${String(error).slice(0, 120)}`);
			return null;
		});
		if (result !== null) return result;
	}
	return null;
};

const worker = async () => {
	for (let task = jobs.shift(); task !== undefined && cases.length < WANTED_FAILURES; task = jobs.shift()) {
		const current = task;
		const first = await attempt(() => runFresh(current, current.goal));
		firsts.push({ task: current.id, success: first?.success ?? false, error: first === null ? "harness error" : null });
		if (first === null || first.success) continue;
		const pause = rewindPoint(first);
		if (pause === null) continue;
		const nudged = `${current.goal}\nHint: ${current.nudge}`;
		const [rewound, restarted] = await Promise.all([attempt(() => runRewound(current, pause, current.nudge)), attempt(() => runFresh(current, nudged))]);
		if (rewound === null || restarted === null || cases.length >= WANTED_FAILURES) continue;
		cases.push({
			task: current.id,
			first: { ...summary(first), snapshotBytes: first.pauses.map((entry) => entry.snapshotBytes) },
			rewindTurn: pause.turn,
			rewindErrors: pause.errors,
			rewound: summary(rewound),
			restarted: summary(restarted),
		});
		console.log(`${cases.length} ${current.id} rewind@${pause.turn} rewound=${rewound.success} ${rewound.tokens}t restarted=${restarted.success} ${restarted.tokens}t`);
	}
};

await Promise.all(Array.from({ length: CONCURRENCY }, worker));

const sum = (pick: (entry: Case) => number) => cases.reduce((total, entry) => total + pick(entry), 0);

const median = (values: ReadonlyArray<number>) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? null;

const arm = (pick: (entry: Case) => Summary) => ({
	fixed: cases.filter((entry) => pick(entry).success).length,
	tokens: sum((entry) => pick(entry).tokens),
	medianTokens: median(cases.map((entry) => pick(entry).tokens)),
	wallMs: sum((entry) => pick(entry).wallMs),
	medianWallMs: median(cases.map((entry) => pick(entry).wallMs)),
	turns: sum((entry) => pick(entry).turns),
	tscCalls: sum((entry) => pick(entry).tscCalls),
	cheated: cases.filter((entry) => pick(entry).cheats.length > 0).length,
});

const sealed = {
	kind: "agent-rewind",
	at: new Date().toISOString(),
	commit: COMMIT,
	model: MODEL,
	temperature: 0.7,
	budget: BUDGET,
	tasks: TASKS.map((task) => ({ id: task.id, goal: task.goal, nudge: task.nudge })),
	firstRuns: { total: firsts.length, succeeded: firsts.filter((entry) => entry.success).length, harnessErrors: firsts.filter((entry) => entry.error !== null).length, rows: firsts },
	failures: cases.length,
	rewound: arm((entry) => entry.rewound),
	restarted: arm((entry) => entry.restarted),
	medianSnapshotBytes: median(cases.flatMap((entry) => entry.first.snapshotBytes)),
	cases,
};
const body = JSON.stringify(sealed, null, 2);
writeFileSync(OUT, `${JSON.stringify({ ...sealed, sha256: createHash("sha256").update(body).digest("hex") }, null, 2)}\n`);
console.log(`DONE failures=${cases.length} rewound=${JSON.stringify(sealed.rewound)} restarted=${JSON.stringify(sealed.restarted)}`);
