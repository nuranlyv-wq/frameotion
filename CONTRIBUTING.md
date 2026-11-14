# Contributing to Frameotion

Start with a small issue describing the user problem and expected result.
For changes, include reproduction steps, focused offline tests and before/after
frames when rendering changes. Never use paid APIs in automated checks.

```sh
npm ci
npm run test:offline -- test/frameotion-mcp.test.js
```

Useful contributions: MCP client setup, portable rendering, typography, causal
scene examples, accessibility and reproducible bug reports. Keep third-party
licenses and include only media you have permission to redistribute.
