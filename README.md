# agent-rewind

Undo for a coding agent. When a run fails, go back to its best step, add one hint, and continue, instead of starting over.

The agent loop runs inside [amber](https://github.com/acoyfellow/amber). Every model call is a pause, so amber saves the whole agent (history, files it edited, turn counter) at every step. To rewind, fork the saved step and answer its model call with a hint. Type checks run through [accrete](https://github.com/acoyfellow/accrete)'s kept `tsc` tool.

## Result

Post: <https://coey.dev/agent-rewind>. Receipt: [`bench/receipt.json`](bench/receipt.json).

Gemma 4 26B, 8 small TypeScript repair tasks, 5 turns per run. 26 first runs; 3 succeeded. For the first 20 failures:

| | Fixed | Tokens |
|---|---|---|
| Rewind to the best step, add the hint, 5 more turns | 15 of 20 | 68,559 |
| Start over with the hint in the task, 5 turns | 4 of 20 | 42,405 |

Rewinding costs more tokens per run, because it carries the earlier history. It costs fewer tokens per fix: about 4,600 against about 10,600.

In 4 of the 20 failures the agent had not run a check yet, so its best step was turn 0. Those rewinds are a restart with a hint, and they fixed 0 of 4. On the other 16, rewinding fixed 15 and starting over fixed 3.

## How it works

- `src/agent.ts` is the agent: a small JavaScript loop that runs in amber. Each turn it calls `tool("think", { history })`, which pauses the program. The host answers with the model's reply.
- `evals/harness.ts` runs the loop, saves `exportSnapshot()` at every pause, and picks the rewind point: the last step with the fewest type errors.
- A rewind is `DurableScript.fork(snapshot)` and `answer(token, { content, note, limit })`. The model sees the history up to that step, then the hint, and gets 5 more turns.
- A run succeeds if `tsc` reports 0 errors and the agent did not edit `tsconfig.json` or use `any`, `@ts-ignore` or `@ts-expect-error`.

## Run it

```sh
npm install
npm test
AGENT_MODEL=@cf/google/gemma-4-26b-a4b-it BUDGET=5 npx tsx evals/eval.ts
npm run gate
```

The eval needs a Workers AI gateway in `~/.config/odds/config.json` and an accrete token in `~/.accrete/token`.

## Limits

- One model, 8 synthetic tasks, a fixed hint per task written by me. A real person writes a different hint each time.
- The turn budget is tight on purpose. With 8 turns this model fixed 11 of 12 runs, and glm-5.3-flash fixed every run that finished, so there was little to rewind.
- The rewind point is picked by a rule, not by a person.
