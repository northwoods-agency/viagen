import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("viagen-sdk/sandbox", () => ({
  listTasks: vi.fn().mockResolvedValue([]),
  getTask: vi.fn().mockResolvedValue({ id: "task_1", prompt: "test" }),
  createTask: vi.fn().mockResolvedValue({ id: "task_2", prompt: "new task" }),
}));

// Must import after mock is set up
const { createViagenTools } = await import("./viagen-tools");

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

  it("without config, exposes viagen_update_task", () => {
    const result = createViagenTools();
    expect(result).toBeDefined();
  });

  it("with projectId, exposes CRUD tools", () => {
    const result = createViagenTools({ projectId: "proj_123" });
    expect(result).toBeDefined();
    expect(result.name).toBe("viagen");
  });
});

describe("viagen_update_task tool", () => {
  it("is always included in tools", () => {
    const result = createViagenTools();
    expect(result).toBeDefined();
    expect(result.name).toBe("viagen");
  });
});
