import { z } from "zod/v4";
import {
  createSdkMcpServer,
  tool,
  type McpSdkServerConfigWithInstance,
  type CanUseTool,
} from "@anthropic-ai/claude-agent-sdk";
import { updateTask } from "viagen-sdk/sandbox";

/**
 * Creates an in-process MCP tool server that exposes platform reporting tools.
 * Used when running inside a viagen sandbox (VIAGEN_CALLBACK_URL etc. are set).
 */
export function createViagenTools(): McpSdkServerConfigWithInstance {
  return createSdkMcpServer({
    name: "viagen",
    tools: [
      tool(
        "viagen_update_task",
        "Report task status back to the viagen platform. Use status 'review' after creating a PR (ready for human review) or 'completed' when the task is fully done.",
        {
          status: z.enum(["review", "completed"]).describe(
            "'review' = PR created, ready for review. 'completed' = task fully done.",
          ),
          prUrl: z
            .string()
            .optional()
            .describe("Full URL of the pull request, if one was created."),
          result: z
            .string()
            .describe("Brief one-line summary of what was done."),
        },
        async (args) => {
          await updateTask({
            status: args.status,
            prUrl: args.prUrl,
            result: args.result,
          });
          return {
            content: [
              {
                type: "text" as const,
                text: `Task status updated to '${args.status}'.`,
              },
            ],
          };
        },
      ),
    ],
  });
}

/**
 * Plan mode tool restrictions.
 * Blocks Edit/NotebookEdit via disallowedTools; restricts Write to plans/ only.
 */
export const PLAN_MODE_DISALLOWED_TOOLS = ["Edit", "NotebookEdit"];

export const planModeCanUseTool: CanUseTool = async (toolName, input) => {
  if (toolName === "Write") {
    const filePath = (input as { file_path?: string }).file_path ?? "";
    if (!filePath.includes("/plans/") && !filePath.startsWith("plans/")) {
      return {
        behavior: "deny" as const,
        message:
          "In plan mode, you can only write files inside the plans/ directory.",
      };
    }
  }
  return { behavior: "allow" as const };
};

/**
 * System prompt for plan-mode tasks.
 * The agent explores the codebase and produces a markdown plan without
 * modifying existing code.
 */
export const PLAN_SYSTEM_PROMPT = `
You are running in PLAN mode. Your job is to explore the codebase and produce a detailed implementation plan — you must NOT modify any existing code.

Steps:
1. Use Read, Glob, and Grep to explore the codebase and understand the relevant architecture.
2. Write your plan as a markdown file to plans/<slug>.md (create the plans/ directory if needed). The slug should be a short kebab-case name derived from the task prompt.
3. Commit the plan file, push the branch, and create a pull request using the GitHub REST API (GITHUB_TOKEN is available in your environment).
4. Report back using the viagen_update_task tool with status "review" and include the PR URL.

Constraints:
- Do NOT edit, delete, or overwrite any existing files.
- Only create new files inside the plans/ directory.
- Your plan should include: context, proposed changes (with file paths and descriptions), implementation order, and potential risks.
`;
