# cost-gate

Claude Code hook that tracks cumulative token spend across a session and blocks tool calls when a budget ceiling is hit.

## Install

```bash
npm install -g cost-gate
```

## Setup

Add to ~/.claude/settings.json as both PreToolUse and PostToolUse hooks with matcher ".*".

## Configuration

Create `.cost-gate.json` in your project root (optional):

```json
{
  "budget": 10.00,
  "costPerToken": 0.000003,
  "warningThreshold": 0.8
}
```

## How It Works

1. Every tool call input is estimated as tokens (payload size / 4)
2. Every tool response is estimated as tokens (PostToolUse, advisory)
3. Running total stored in `.cost-gate-session.json`
4. When total exceeds budget: all tool calls denied
5. At warning threshold (80%): allowed but warning injected

## CLI

```bash
cost-gate status    # show current session spend
cost-gate reset     # clear session, start fresh
```

## Requirements

- Node.js >= 22
- ESM only

## License

MIT
