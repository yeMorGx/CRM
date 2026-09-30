<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Frontend design workflow

- Before designing or changing UI, read the root `DESIGN.md` and preserve the Prospecta product facts: one fixed workspace, real Supabase data, and honest empty states. Never invent leads, people, metrics, tasks, or activity.
- Use the project skills `design-taste-frontend` and `frontend-design` for implementation; use `redesign-existing-projects` only for redesign requests and `minimalist-ui` when it suits the brief. Keep new UI in the existing restrained charcoal, lime, and border-led visual system; avoid generic purple gradients, blanket glass effects, and gratuitous equal-card layouts.
- After a visual change, run the `hallmark` audit and the relevant `avoid-ai-design` / `antislop-ui` checks. Use `antislop-copywriting` for copy and `antislop-code` for code comments; assess findings against the real product rather than applying mechanical edits blindly.
- Prefer reviewing configured shadcn-compatible registries in `components.json` before hand-building a suitable component. Inspect registry code and dependencies; add UI components only when the task calls for them. Do not add paid registries or credentials without the required license/key.
- The project MCP configuration is in `.codex/config.toml`; global ReUI remains available. Restart Codex after MCP configuration changes. 21st.dev MCP requires a user-owned API key and is not configured until one is available.
- For a requested reference style, consult VoltAgent/getdesign.md, iFurySt, or MarcBender collections, then use only the requested source as guidance. Use meliwat's collection for native iOS/Expo work. For extracting a visual system from a URL, use `design-md-creator` or the documented `sunil-dsb/design.md` engine; do not replace Prospecta's design system unless asked.
