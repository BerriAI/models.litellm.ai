/**
 * The Quick Start box's commands and agent prompts, copied from the docs site
 * (BerriAI/litellm-docs src/components/Conversion/content.js, QUICKSTART and
 * PROMPTS) so both sites tell people to run the same thing. Keep them in sync.
 */

export const QUICKSTART = {
  gateway: {
    mac: "curl -fsSL https://raw.githubusercontent.com/BerriAI/litellm/main/scripts/quickstart.sh | sh",
    windows: "irm https://raw.githubusercontent.com/BerriAI/litellm/main/scripts/quickstart.ps1 | iex",
  },
  sdk: "uv add litellm",
} as const;

export const AGENT_PROMPTS = {
  gateway: "Help me run the LiteLLM Gateway locally. First read https://docs.litellm.ai/docs/proxy/docker_quick_start.md. Then:\n1. Check that Docker Compose v2 is installed and running, and that port 4000 is free.\n2. In a new litellm-gateway directory, download https://github.com/BerriAI/litellm/raw/main/docker/docker-compose.quickstart.yml and create .env with LITELLM_MASTER_KEY and LITELLM_SALT_KEY, each \"sk-\" followed by the output of openssl rand -hex 32, and POSTGRES_PASSWORD set to the output of openssl rand -hex 24. Add .env to .gitignore and never print any of these values.\n3. Run docker compose -f docker-compose.quickstart.yml up -d and poll http://localhost:4000/health/readiness until the database shows as connected.\n4. Ask me which provider and model to add. Add it with POST /model/new using the master key, reading my provider API key from my shell environment without echoing it.\n5. Verify: GET /v1/models lists the model and POST /v1/chat/completions returns a reply.\n6. Tell me to open http://localhost:4000/ui and sign in as admin with the master key from .env.",
  sdk: "Help me add the LiteLLM Python SDK to this project. First read https://docs.litellm.ai/llms.txt and https://docs.litellm.ai/docs/index.md. Then:\n1. Detect the language, package manager, and framework. The SDK is Python only. If this is not a Python project, stop and tell me to run the LiteLLM Gateway and keep my existing OpenAI SDK instead (https://docs.litellm.ai/docs/proxy/docker_quick_start.md).\n2. Install litellm with the project's own tool (uv add litellm, poetry add litellm, or pin it in requirements.txt).\n3. Replace direct OpenAI or Anthropic client calls with litellm.completion or litellm.acompletion, keeping the same model with a provider prefix (openai/..., anthropic/...). LiteLLM returns the OpenAI response shape, so update any Anthropic-style parsing to choices[0].message.content. Keep streaming and tool calls working.\n4. Add the provider key names to .env.example and read them from the environment. Never write real keys to files.\n5. Verify: run one real completion and print the reply, then run the existing tests. Show me the diff and both outputs.",
} as const;
