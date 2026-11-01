import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SLUG = "agent-rewind";
const POST_URL = `https://coey.dev/${SLUG}`;
const POST_FILE = `${process.env.HOME}/cloudflare/coey.dev/src/routes/(blog)/${SLUG}/+page.svelte`;
const REPO = "acoyfellow/agent-rewind";
const INTERNAL = new RegExp(["cloudflare" + "-agent", "cf" + "data", "29db" + "7c74", "ji" + "ra\\.", "git" + "lab\\.", "CF" + "SA-", "/Us" + "ers/", "/priv" + "ate/tmp"].join("|"), "i");

const results = [];
const check = (name, pass, detail = "") => {
	results.push(pass);
	console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail ? ` · ${detail}` : ""}`);
};
const run = (command, args, options = {}) => {
	try {
		return { ok: true, out: execFileSync(command, args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...options }) };
	} catch (error) {
		return { ok: false, out: String(error.stdout ?? "") + String(error.stderr ?? "") };
	}
};

check("unit tests pass", run("npm", ["test", "--silent"]).ok);

const receiptPath = `${ROOT}bench/receipt.json`;
const receipt = existsSync(receiptPath) ? JSON.parse(readFileSync(receiptPath, "utf8")) : null;
check("receipt exists", receipt !== null);
if (receipt !== null) {
	const { sha256, ...sealed } = receipt;
	check("receipt hash matches its content", createHash("sha256").update(JSON.stringify(sealed, null, 2)).digest("hex") === sha256);
	check("receipt came from a real run of 20 failures", receipt.failures === 20 && typeof receipt.model === "string", `${receipt.failures} failures, ${receipt.model}`);
	check("no run cheated", receipt.rewound.cheated === 0 && receipt.restarted.cheated === 0);
	const evalChanged = run("git", ["diff", "--quiet", receipt.commit, "--", "src", "evals"]).ok;
	check("receipt matches the committed checker and eval code", evalChanged, receipt.commit.slice(0, 8));
}

const post = existsSync(POST_FILE) ? readFileSync(POST_FILE, "utf8") : "";
check("post source exists", post !== "");
if (receipt !== null && post !== "") {
	const midRun = receipt.cases.filter((entry) => entry.rewindTurn > 0);
	const numbers = {
		failures: receipt.failures,
		"rewound fixed": receipt.rewound.fixed,
		"restarted fixed": receipt.restarted.fixed,
		"rewound tokens": receipt.rewound.tokens.toLocaleString("en-US"),
		"restarted tokens": receipt.restarted.tokens.toLocaleString("en-US"),
		"mid-run cases": midRun.length,
		"mid-run rewound fixed": midRun.filter((entry) => entry.rewound.success).length,
		"snapshot bytes": receipt.medianSnapshotBytes.toLocaleString("en-US"),
		"first runs": receipt.firstRuns.total,
	};
	const missing = Object.entries(numbers).filter(([, value]) => !post.includes(`data-n="${value}"`) && !post.includes(`>${value}<`));
	check("post cites the receipt numbers", missing.length === 0, missing.map(([name, value]) => `${name}=${value}`).join(", "));
}

const live = run("curl", ["-s", "-L", "-o", "/dev/stdout", "-w", "\n%{http_code}", POST_URL]);
const code = live.out.trim().split("\n").at(-1);
check("live post returns 200", code === "200", `${POST_URL} ${code}`);
check("live post has its title", new RegExp("<title>[^<]*rewind", "i").test(live.out));

const remote = run("git", ["ls-remote", `https://github.com/${REPO}.git`, "HEAD"]);
const head = run("git", ["rev-parse", "HEAD"]).out.trim();
check("repo is pushed and public", remote.ok && remote.out.startsWith(head), REPO);

const tracked = run("git", ["ls-files"]).out.split("\n").filter((file) => file !== "" && !file.endsWith("package-lock.json"));
const leaks = tracked.filter((file) => INTERNAL.test(readFileSync(`${ROOT}${file}`, "utf8")));
check("no internal names in the repo", leaks.length === 0, leaks.join(", "));
check("no internal names in the post", !INTERNAL.test(post));

const failed = results.filter((pass) => !pass).length;
console.log(failed === 0 ? `GATE PASS ${SLUG}: ${results.length} checks` : `GATE FAIL ${SLUG}: ${failed} of ${results.length}`);
process.exit(failed === 0 ? 0 : 1);
