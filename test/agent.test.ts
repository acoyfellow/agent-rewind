import assert from "node:assert/strict";
import { test } from "node:test";
import { agentSource, cheated } from "../src/agent.ts";

test("agent source embeds the goal, files and turn limit", () => {
	const source = agentSource({ goal: "fix it", files: { "src/a.ts": "x" }, budget: 5 });
	assert.match(source, /let limit = 5;/);
	assert.match(source, /"fix it"/);
	assert.match(source, /src\/a\.ts/);
});

test("cheated flags escape hatches and tsconfig edits", () => {
	const original = { "tsconfig.json": "{}", "src/a.ts": "" };
	assert.deepEqual(cheated({ "tsconfig.json": "{}", "src/a.ts": "const x = 1;" }, original), []);
	assert.equal(cheated({ "tsconfig.json": "{}", "src/a.ts": "@ts-ignore\nconst x = 1;" }, original).length, 1);
	assert.equal(cheated({ "tsconfig.json": "{}", "src/a.ts": "const x = y as any;" }, original).length, 1);
	assert.equal(cheated({ "tsconfig.json": "{\"strict\":false}", "src/a.ts": "" }, original).length, 1);
});
