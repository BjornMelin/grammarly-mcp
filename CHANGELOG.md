# Changelog

## 1.0.0 (2026-01-14)


### ⚠ BREAKING CHANGES

* **config:** STAGEHAND_MODEL is deprecated in favor of STAGEHAND_LLM_PROVIDER + provider-specific model settings

### Features

* add interactive setup script for MCP clients and update environment variable handling ([1f84cfe](https://github.com/BjornMelin/grammarly-mcp/commit/1f84cfe4b9150ea9a5584cac87f4918179c15164))
* add interactive setup script for MCP clients and update environment variable handling ([fe38a02](https://github.com/BjornMelin/grammarly-mcp/commit/fe38a027e973bd3bbc89be912df7f066869cb224))
* **browser:** add Browser Use client for Grammarly scoring ([0ff897e](https://github.com/BjornMelin/grammarly-mcp/commit/0ff897e510a2f4bd5a4307fdccb7306c3ec99aec))
* **browser:** add stagehand provider and dual pipeline ([f1fc9ff](https://github.com/BjornMelin/grammarly-mcp/commit/f1fc9ff08811957ac0a9a34424df42bcfce58623))
* **config:** add environment isolation and multi-provider LLM controls ([f690f35](https://github.com/BjornMelin/grammarly-mcp/commit/f690f353a867b06e5ecea4fdb9b158c3fd5c1570))
* **config:** add environment validation and logging utilities ([74fa785](https://github.com/BjornMelin/grammarly-mcp/commit/74fa7851aaec5808c794715bbcf3c5d5333a6379))
* enhance tool descriptions for clarity and accuracy ([d0fc11d](https://github.com/BjornMelin/grammarly-mcp/commit/d0fc11db79c0bff0709dc10d46c9851704d28d29))
* implement Grammarly MCP server with Browser Use and Claude integration ([07d89be](https://github.com/BjornMelin/grammarly-mcp/commit/07d89be2780c7193e21256365faedc2893175fd7))
* improve tool descriptions for clarity and user guidance ([e522794](https://github.com/BjornMelin/grammarly-mcp/commit/e52279426a5d55aa98c94dce59269cccd261f394))
* improve tool descriptions for clarity and user guidance ([058ff3b](https://github.com/BjornMelin/grammarly-mcp/commit/058ff3b0b9420669f1b195aa6fa05bbb3bad1816))
* **llm:** add Claude client for text analysis and rewriting ([6576395](https://github.com/BjornMelin/grammarly-mcp/commit/657639534127d5cebcae0ec733bec04ed335ae86))
* **llm:** add timeout handling for Claude API requests and fix Browser Use session cleanup ([e5af765](https://github.com/BjornMelin/grammarly-mcp/commit/e5af7659a138ea90602627c07d99daf8d0515ad6))
* **optimizer:** add orchestration with MCP 2025-11-25 output schema ([9201baa](https://github.com/BjornMelin/grammarly-mcp/commit/9201baae40977d55fe9f5a7d584680092508c3e1))
* **providers:** optimize models and configuration options, add new env var flags + overrides ([455e6de](https://github.com/BjornMelin/grammarly-mcp/commit/455e6def21d1ad7eeafbc60fb9fd6d90fd1162af))
* Sanitize user input for Grammarly task, improve Browser Use integration, and update build configuration ([223fe9f](https://github.com/BjornMelin/grammarly-mcp/commit/223fe9f1ef5c430ae9179c41885a51987ba5f7e2))
* **server:** implement MCP server with registerTool API ([126d311](https://github.com/BjornMelin/grammarly-mcp/commit/126d311e78494a963f68860be1d51a0a274f8fb8))
* **setup-clients:** add minimal logging and improve client selection prompts ([02ee3c9](https://github.com/BjornMelin/grammarly-mcp/commit/02ee3c9f07e68ffc13c7c474a267350ff174b27f))
* **stagehand:** implement stagehand + browserbase agents for grammarly interactions ([5415f2e](https://github.com/BjornMelin/grammarly-mcp/commit/5415f2e934a275b97e2190794e96d2ef8f6c565d))
* update stagehand model to gemini-2.5-flash and enhance model selection logic ([2fb18a8](https://github.com/BjornMelin/grammarly-mcp/commit/2fb18a89b13b9a42890fa43821a7ceeae6a48415))


### Bug Fixes

* **ci:** commit pnpm-lock.yaml for reproducible CI builds ([ede562b](https://github.com/BjornMelin/grammarly-mcp/commit/ede562bec0fd092d1e9a45163c6599a429682eec))
* **ci:** remove test sharding for correct coverage thresholds ([3b0a703](https://github.com/BjornMelin/grammarly-mcp/commit/3b0a70385cca0bcdc138464afeed14faa7347f14))
* **docs:** update LLM model references and add Google API key requirement ([1de909e](https://github.com/BjornMelin/grammarly-mcp/commit/1de909ef60f2152c37fc82aba1a11d7fa6b4a4b6))
* merge .env values into config when not ignoring ([f1dbd99](https://github.com/BjornMelin/grammarly-mcp/commit/f1dbd993771d503949b60a565073af953d7ee996))
* **optimizer:** harden retries and typings ([b97f916](https://github.com/BjornMelin/grammarly-mcp/commit/b97f916987a64b3fcea1dadb06548be9cc474b3a))
* **pr-review:** address all PR [#3](https://github.com/BjornMelin/grammarly-mcp/issues/3) code review findings ([421442a](https://github.com/BjornMelin/grammarly-mcp/commit/421442aa8a618302a34b5b5b6fcb99c2118cdf69))
* **remaining-pr-comments:** resolve 9 additional PR [#3](https://github.com/BjornMelin/grammarly-mcp/issues/3) issues ([8550efc](https://github.com/BjornMelin/grammarly-mcp/commit/8550efcca1c4bc9a691caebfc3f7c5b63b617b6a))
* resolve PR review comments ([#3](https://github.com/BjornMelin/grammarly-mcp/issues/3)) ([5a839cc](https://github.com/BjornMelin/grammarly-mcp/commit/5a839ccd3f6236681b636135c3b0f0c05fe2ef54))
* resolve type errors and finalize PR review fixes ([8d0f88e](https://github.com/BjornMelin/grammarly-mcp/commit/8d0f88e047019c66b3fad001b188d35301e84500))
* **stagehand:** replace clipboard API with Playwright locator.fill() for long text ([9ee9010](https://github.com/BjornMelin/grammarly-mcp/commit/9ee9010d8171c74206fde05f35aed6a65c8c6317))
* **tests:** improve test assertions for session management and text handling ([1949b64](https://github.com/BjornMelin/grammarly-mcp/commit/1949b64f2927a7ed55e721d3f159d114c4628b47))
