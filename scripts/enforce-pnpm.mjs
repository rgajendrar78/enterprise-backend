// Rejects npm/yarn/bun rather than requiring pnpm: pnpm's own install check runs
// this without a user agent. `engines` omits npm/yarn so this runs first — README.
const agent = process.env.npm_config_user_agent ?? "";
const [client] = agent.split("/");

if (client === "npm" || client === "yarn" || client === "bun") {
  console.error(
    `\n  ✖  This repo is pnpm-only. You ran ${client}.\n\n` +
      `     corepack enable\n     pnpm install\n\n` +
      `  Then delete any package-lock.json / yarn.lock / bun.lockb ${client} just\n` +
      `  wrote — a second lockfile is a second dependency tree, and CI installs\n` +
      `  from pnpm-lock.yaml with --frozen-lockfile.\n`,
  );
  process.exit(1);
}
