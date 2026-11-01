export type Task = {
	readonly id: string;
	readonly goal: string;
	readonly files: Readonly<Record<string, string>>;
	readonly nudge: string;
};

const TSCONFIG = JSON.stringify({ compilerOptions: { strict: true, noEmit: true, target: "ES2022", module: "ES2022", moduleResolution: "bundler", lib: ["ES2022"], types: [], noUncheckedIndexedAccess: true, exactOptionalPropertyTypes: true }, include: ["src/**/*.ts"] });

export const TASKS: ReadonlyArray<Task> = [
	{
		id: "rename-field",
		goal: "The User type renamed `name` to `displayName`. Make the project type-check without changing src/types.ts.",
		nudge: "The only file to change is src/greet.ts and src/report.ts; every `.name` on a User must become `.displayName`.",
		files: {
			"tsconfig.json": TSCONFIG,
			"src/types.ts": "export type User = { readonly id: number; readonly displayName: string; readonly email?: string };\n",
			"src/greet.ts": 'import type { User } from "./types";\n\nexport const greet = (user: User): string => `Hello, ${user.name}`;\n',
			"src/report.ts": 'import type { User } from "./types";\n\nexport const names = (users: ReadonlyArray<User>): Array<string> => users.map((user) => user.name.toUpperCase());\n\nexport const byName = (users: ReadonlyArray<User>, name: string): User | undefined => users.find((user) => user.name === name);\n',
		},
	},
	{
		id: "optional-email",
		goal: "Make the project type-check. email is optional on purpose; do not make it required.",
		nudge: "exactOptionalPropertyTypes is on: you cannot assign `undefined` to `email`. Leave the key out instead, and guard reads of `user.email` with a check.",
		files: {
			"tsconfig.json": TSCONFIG,
			"src/types.ts": "export type User = { readonly id: number; readonly displayName: string; readonly email?: string };\n",
			"src/make.ts": 'import type { User } from "./types";\n\nexport const make = (id: number, displayName: string, email: string | undefined): User => ({ id, displayName, email });\n',
			"src/mail.ts": 'import type { User } from "./types";\n\nexport const domain = (user: User): string => user.email.split("@")[1];\n',
		},
	},
	{
		id: "index-access",
		goal: "Make the project type-check without turning off any compiler option.",
		nudge: "noUncheckedIndexedAccess is on, so `items[0]` and `parts[1]` can be undefined. Handle the undefined case with a default or an early return.",
		files: {
			"tsconfig.json": TSCONFIG,
			"src/first.ts": "export const first = (items: ReadonlyArray<number>): number => items[0] * 2;\n",
			"src/split.ts": 'export const extension = (path: string): string => {\n  const parts = path.split(".");\n  return parts[parts.length - 1].toLowerCase();\n};\n',
			"src/table.ts": "export const lookup = (table: Record<string, number>, key: string): number => table[key] + 1;\n",
		},
	},
	{
		id: "union-exhaustive",
		goal: "A new shape `triangle` was added. Make the project type-check and handle triangle correctly (area = base * height / 2).",
		nudge: "Add a `case \"triangle\"` to both switches in src/area.ts and src/label.ts; the triangle fields are `base` and `height`.",
		files: {
			"tsconfig.json": TSCONFIG,
			"src/shape.ts": 'export type Shape = { readonly kind: "circle"; readonly r: number } | { readonly kind: "square"; readonly side: number } | { readonly kind: "triangle"; readonly base: number; readonly height: number };\n\nexport const never = (value: never): never => {\n  throw new Error(`unhandled ${JSON.stringify(value)}`);\n};\n',
			"src/area.ts": 'import { never, type Shape } from "./shape";\n\nexport const area = (shape: Shape): number => {\n  switch (shape.kind) {\n    case "circle":\n      return Math.PI * shape.r * shape.r;\n    case "square":\n      return shape.side * shape.side;\n    default:\n      return never(shape);\n  }\n};\n',
			"src/label.ts": 'import { never, type Shape } from "./shape";\n\nexport const label = (shape: Shape): string => {\n  switch (shape.kind) {\n    case "circle":\n      return `circle r=${shape.r}`;\n    case "square":\n      return `square ${shape.side}`;\n    default:\n      return never(shape);\n  }\n};\n',
		},
	},
	{
		id: "async-return",
		goal: "loadUser became async. Make the project type-check; callers must await it.",
		nudge: "src/load.ts now returns Promise<User>. In src/profile.ts and src/admin.ts, make the callers async and await loadUser, and update their return types to Promise<...>.",
		files: {
			"tsconfig.json": TSCONFIG,
			"src/types.ts": "export type User = { readonly id: number; readonly displayName: string; readonly admin: boolean };\n",
			"src/load.ts": 'import type { User } from "./types";\n\nexport const loadUser = async (id: number): Promise<User> => ({ id, displayName: `user ${id}`, admin: id === 1 });\n',
			"src/profile.ts": 'import { loadUser } from "./load";\n\nexport const title = (id: number): string => loadUser(id).displayName;\n',
			"src/admin.ts": 'import { loadUser } from "./load";\n\nexport const isAdmin = (id: number): boolean => loadUser(id).admin;\n',
		},
	},
	{
		id: "generic-result",
		goal: "Make the project type-check. Keep the Result type generic.",
		nudge: "In src/parse.ts, return `{ ok: true, value }` and `{ ok: false, error }` objects that match Result<number>. In src/use.ts, check `result.ok` before reading `result.value`.",
		files: {
			"tsconfig.json": TSCONFIG,
			"src/result.ts": "export type Result<A> = { readonly ok: true; readonly value: A } | { readonly ok: false; readonly error: string };\n",
			"src/parse.ts": 'import type { Result } from "./result";\n\nexport const parseCount = (text: string): Result<number> => {\n  const value = Number(text);\n  if (Number.isNaN(value)) return { ok: false, value: 0 };\n  return value;\n};\n',
			"src/use.ts": 'import { parseCount } from "./parse";\n\nexport const doubled = (text: string): number => parseCount(text).value * 2;\n',
		},
	},
	{
		id: "readonly-mutation",
		goal: "Make the project type-check. Keep the input arrays readonly; return new arrays instead of changing them.",
		nudge: "Do not call push or sort on the readonly input. Use `[...items, item]` and `[...items].sort(...)`, and change the return types to Array<...>.",
		files: {
			"tsconfig.json": TSCONFIG,
			"src/list.ts": "export const append = (items: ReadonlyArray<string>, item: string): ReadonlyArray<string> => {\n  items.push(item);\n  return items;\n};\n\nexport const sorted = (items: ReadonlyArray<number>): ReadonlyArray<number> => items.sort((a, b) => a - b);\n",
			"src/use.ts": 'import { append, sorted } from "./list";\n\nexport const tags: Array<string> = append(["a"], "b");\nexport const ordered: Array<number> = sorted([3, 1, 2]);\n',
		},
	},
	{
		id: "config-shape",
		goal: "The config gained a required `retries` field and `timeout` became `timeoutMs`. Make the project type-check.",
		nudge: "Update both config objects in src/dev.ts and src/prod.ts: rename timeout to timeoutMs and add retries (use 0 for dev and 3 for prod). In src/client.ts read config.timeoutMs.",
		files: {
			"tsconfig.json": TSCONFIG,
			"src/config.ts": "export type Config = { readonly url: string; readonly timeoutMs: number; readonly retries: number };\n",
			"src/dev.ts": 'import type { Config } from "./config";\n\nexport const dev: Config = { url: "http://localhost:8787", timeout: 1000 };\n',
			"src/prod.ts": 'import type { Config } from "./config";\n\nexport const prod: Config = { url: "https://api.example.com", timeout: 5000 };\n',
			"src/client.ts": 'import type { Config } from "./config";\n\nexport const deadline = (config: Config, now: number): number => now + config.timeout;\n',
		},
	},
];
