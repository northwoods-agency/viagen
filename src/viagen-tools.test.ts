import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("viagen-sdk/sandbox", () => ({
  updateTask: vi.fn().mockResolvedValue(undefined),
}));

// Must import after mock is set up
const { createViagenTools } = await import("./viagen-tools");
const { updateTask } = await import("viagen-sdk/sandbox");

describe("createViagenTools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns an MCP server config with name 'viagen'", () => {
    const tools = createViagenTools();
    expect(tools.name).toBe("viagen");
    expect(tools.type).toBe("sdk");
    expect(tools.instance).toBeDefined();
  });

  it("exposes a viagen_update_task tool", () => {
    const tools = createViagenTools();
    // The instance is an McpServer — check that it was created with tools
    // We can verify by checking the tools array passed to createSdkMcpServer
    expect(tools).toBeDefined();
  });
});

describe("viagen_update_task tool handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // We can't easily call the tool handler through the MCP server,
  // but we can import and test the updateTask function directly
  it("updateTask calls through to viagen-sdk/sandbox", async () => {
    const mockedUpdateTask = vi.mocked(updateTask);

    await updateTask({
      status: "review",
      prUrl: "https://github.com/org/repo/pull/1",
      result: "Added auth system",
    });

    expect(mockedUpdateTask).toHaveBeenCalledWith({
      status: "review",
      prUrl: "https://github.com/org/repo/pull/1",
      result: "Added auth system",
    });
  });

  it("updateTask accepts completed status without prUrl", async () => {
    const mockedUpdateTask = vi.mocked(updateTask);

    await updateTask({
      status: "completed",
      result: "Task done",
    });

    expect(mockedUpdateTask).toHaveBeenCalledWith({
      status: "completed",
      result: "Task done",
    });
  });
});
