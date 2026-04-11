import { defineConfig } from "vitepress";

export default defineConfig({
  title: "AI Coding Assistant Docs",
  description: "Practical and theory-driven docs for the local-first agent system",
  cleanUrls: true,
  themeConfig: {
    nav: [
      { text: "Home", link: "/" },
      { text: "Use the App", link: "/use-the-application" },
      { text: "Packages", link: "/packages/" },
      { text: "Theory", link: "/theory/agent-loop" },
      { text: "Scenarios", link: "/scenarios" },
    ],
    sidebar: [
      {
        text: "Start Here",
        items: [
          { text: "Home", link: "/" },
          { text: "Use the Application", link: "/use-the-application" },
          { text: "Scenarios & Tests", link: "/scenarios" },
        ],
      },
      {
        text: "Packages",
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
        ],
      },
      {
        text: "Theory",
        items: [
          { text: "Agent Loop Mental Model", link: "/theory/agent-loop" },
          { text: "Prompt, Context, Memory", link: "/theory/prompt-context-memory" },
          { text: "Event-Driven Observability", link: "/theory/events-observability" },
        ],
      },
    ],
    search: {
      provider: "local",
    },
  },
});
