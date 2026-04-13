import { defineConfig } from "vitepress";
import { withMermaid } from "vitepress-plugin-mermaid";

export default withMermaid(defineConfig({
    title: "AI Coding Assistant Docs",
    description: "Practical and theory-driven docs for the local-first agent system",
    cleanUrls: true,
    themeConfig: {
        nav: [
            { text: "Home", link: "/" },
            { text: "Getting Started", link: "/use-the-application" },
            { text: "Endpoint Map", link: "/endpoint-map" },
            { text: "Model Selection", link: "/model-selection" },
            { text: "Ollama Models", link: "/infra/ollama-models" },
            { text: "Ollama Notes", link: "/infra/ollama-notes" },
            { text: "Packages", link: "/packages/" },
            { text: "Theory", link: "/theory/agent-loop" },
            { text: "Scenarios", link: "/scenarios" },
        ],
        sidebar: [
            {
                text: "Getting Started",
                items: [
                    { text: "Home", link: "/" },
                    { text: "Use the Application", link: "/use-the-application" },
                    { text: "Endpoint Map", link: "/endpoint-map" },
                    { text: "Scenarios & Tests", link: "/scenarios" },
                    { text: "Ollama Models", link: "/infra/ollama-models" },
                    { text: "Ollama Notes", link: "/infra/ollama-notes" },
                    { text: "Modelfile Example", link: "/infra/modelfile-example" },
                ],
            },
            {
                text: "Architecture",
                items: [
                    { text: "How It Works (Layered)", link: "/theory/how-it-works-layered" },
                    { text: "Agent Loop Mental Model", link: "/theory/agent-loop" },
                    { text: "Prompt, Context, Memory", link: "/theory/prompt-context-memory" },
                    { text: "Event-Driven Observability", link: "/theory/events-observability" },
                    { text: "Model Selection & Routing", link: "/model-selection" },
                ],
            },
            {
                text: "Package Reference",
                items: [
                    { text: "Overview", link: "/packages/" },
                    { text: "agent — The Brain", link: "/packages/agent" },
                    { text: "llm — Model Connection", link: "/packages/llm" },
                    { text: "memory — Short-term Storage", link: "/packages/memory" },
                    { text: "events — Notifications", link: "/packages/events" },
                    { text: "tools — Toolbox", link: "/packages/tools/" },
                    { text: "tools/read_file", link: "/packages/tools/read-file" },
                    { text: "tools/shell", link: "/packages/tools/shell" },
                    { text: "tools/mysql_query", link: "/packages/tools/mysql-query" },
                    { text: "tools/browser_fetch", link: "/packages/tools/browser-fetch" },
                    { text: "tools/image_classify", link: "/packages/tools/image-classify" },
                    { text: "tools/semantic_search", link: "/packages/tools/semantic-search" },
                    { text: "tools/speech_to_text", link: "/packages/tools/speech-to-text" },
                    { text: "tools/read_pdf", link: "/packages/tools/read-pdf" },
                    { text: "tools/code_autocomplete", link: "/packages/tools/code-autocomplete" },
                    { text: "tools/write_file", link: "/packages/tools/write-file" },
                    { text: "tools/scaffold_project", link: "/packages/tools/scaffold-project" },
                ],
            },
        ],
        search: {
            provider: "local",
        },
    },
}));
