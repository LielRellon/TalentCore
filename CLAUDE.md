# TalentCore Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-05-27

## Active Technologies
- JavaScript (ES2022), React 19, Vite 8 (existing app, ESM) + React 19 + react-dom (existing); browser `EventSource` + `fetch` (built-in). (002-run-console-ui)
- None added in the browser. Run history/replay comes from the backend's stored logs. (002-run-console-ui)

- Node.js ≥ 20 (ESM; `package.json` already `"type": "module"`) + Groq Chat Completions API (tool-calling); Node built-ins (`node:child_process`, (001-agent-runtime-core)

## Project Structure

```text
src/
tests/
```

## Commands

# Add commands for Node.js ≥ 20 (ESM; `package.json` already `"type": "module"`)

## Code Style

Node.js ≥ 20 (ESM; `package.json` already `"type": "module"`): Follow standard conventions

## Recent Changes
- 002-run-console-ui: Added JavaScript (ES2022), React 19, Vite 8 (existing app, ESM) + React 19 + react-dom (existing); browser `EventSource` + `fetch` (built-in).

- 001-agent-runtime-core: Added Node.js ≥ 20 (ESM; `package.json` already `"type": "module"`) + Groq Chat Completions API (tool-calling); Node built-ins (`node:child_process`,

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
