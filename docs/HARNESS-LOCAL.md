# Running DeepSeek Harness Locally

[Documentation](README.md) · [Development rules](../AGENTS.md)

Historical installation/environment record. Use the current [README](README.md) for RSI startup, installation, and limits; [G1-REPORT.md](G1-REPORT.md) records the subsequent integration.

Installed 2026-09-07. On 2026-09-08, the G0 local package was installed in an isolated Web profile and OrbStack 2.2.3 initialized; see [G0-REPORT.md](G0-REPORT.md). That stage used Node 25.8.1 and native plugin management resolved pnpm 11.19.0. Do not load the development overlay and installed plugin together.

- Source: `/Users/black/Documents/VSCodeProject/deepseek-harness`
- Repository: [B1ackB/deepseek-harness](https://github.com/B1ackB/deepseek-harness)
- Verified version: 0.1.3-alpha.1, commit d347e70390
- Original installation environment: Node 25.8.1, pnpm 11.7.0
- Local address: `http://127.0.0.1:3080/`
- Dedicated configuration/sessions: `/Users/black/.dsh-rsi-dev`

## Start and stop

```sh
cd /Users/black/Documents/VSCodeProject/deepseek-harness
env -u DEEPSEEK_API_KEY DSH_HOME=/Users/black/.dsh-rsi-dev DSH_TELEMETRY_MODE=DISABLED corepack pnpm dsh web
```

Keep the terminal open; stop with Ctrl+C. Do not start a duplicate host. The default command opens an authenticated browser link. If another browser needs authentication, use the terminal's launch link without sharing its token.

`env -u DEEPSEEK_API_KEY` only removes that variable from this process so UI-saved credentials can take effect; it does not delete the system variable. Telemetry is disabled for this invocation.

## Model configuration

Use Settings → Models → DeepSeek in the Web UI to save an authorized API key. Harness stores it in the isolated configuration directory. Never commit it or paste it into chat.

## Historical verification

- corepack pnpm install --frozen-lockfile and corepack pnpm run build passed.
- Web startup, settings, and sessions worked.
- The inherited environment key returned an AUTH/invalid-key error; configuration moved to the local UI.
- After the user saved valid credentials, DeepSeek-V4-Flash / High succeeded.
- The model called Bash pwd, which completed with `/Users/black/Documents/DeepseekWorkZone`, and answered `HARNESS_OK /Users/black/Documents/DeepseekWorkZone`.
- UI usage was about 16.6K tokens: 16.4K input and 116 output, including standard-mode context/tool round trips, not merely the short reply.

That test workspace was `/Users/black/Documents/DeepseekWorkZone`. To work on RSI, add `/Users/black/Documents/ChatGPT/DeepSeek-RSI` through the workspace UI.

Harness source was unchanged at installation. Daily startup does not require reinstall/build; recheck dependencies/native modules after source or major Node changes. RSI itself was still being planned at that initial snapshot; this record establishes host operation only.

## Environment recheck, 2026-09-08

The terminal default had changed to Node 24.14.0, while `/opt/homebrew/bin/node` remained 25.8.1. Harness commit and clean working tree were unchanged; port 3080 had no listener. No service restart or credential validation occurred during this recheck.

The pnpm command uses the active environment's Node. Its explicit equivalent for the original installation binary is:

```sh
cd /Users/black/Documents/VSCodeProject/deepseek-harness
env -u DEEPSEEK_API_KEY DSH_HOME=/Users/black/.dsh-rsi-dev DSH_TELEMETRY_MODE=DISABLED /opt/homebrew/bin/node --import tsx/esm apps/cli/src/bin.ts web
```

This was derived from package.json, not executed during that inspection. It does not alter global Node configuration. A declared Node 24 requirement does not prove native modules installed under Node 25 can be reused. Close test-owned processes unless explicitly asked to retain them.
