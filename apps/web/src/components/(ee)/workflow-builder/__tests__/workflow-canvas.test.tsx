import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { DragEvent, KeyboardEvent, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Position = {
  x: number;
  y: number;
};

type Viewport = {
  x: number;
  y: number;
  zoom: number;
};

type MockNode = {
  id: string;
  position: Position;
};

type MockEdge = {
  id: string;
  source: string;
  target: string;
};

type MockWorkflowStoreState = {
  nodes: MockNode[];
  edges: MockEdge[];
  onNodesChange: () => void;
  onEdgesChange: () => void;
  onConnect: () => void;
  onReconnect: () => void;
  addNode: (type: string, position: Position) => void;
  insertNodeBetweenEdge: (
    type: string,
    edgeId: string,
    position: Position
  ) => void;
  selectNode: (nodeId: string | null) => void;
  selectedNodeId: string | null;
  setCanvasViewport: (viewport: Viewport) => void;
};

type MockReactFlowInstance = {
  flowToScreenPosition: (position: Position) => Position;
  screenToFlowPosition: (position: Position) => Position;
  getViewport: () => Viewport;
};

type ReactFlowProps = {
  children?: ReactNode;
  onInit?: (instance: MockReactFlowInstance) => void;
  onDragOver?: (event: DragEvent<HTMLDivElement>) => void;
  onDrop?: (event: DragEvent<HTMLDivElement>) => void;
  onDragLeave?: (event: DragEvent<HTMLDivElement>) => void;
};

type MockNodePaletteProps = {
  onAddNode: (type: string) => void;
  onDragStart?: (type: "delay") => void;
  onDragEnd?: () => void;
  smsEnabled?: boolean;
};

type TestDataTransfer = {
  dropEffect: string;
  effectAllowed: string;
  types: string[];
  setData: (format: string, data: string) => void;
  getData: (format: string) => string;
};

let mockStoreState: MockWorkflowStoreState;

const mockFindEdgeAtPoint = vi.fn<
  (clientX: number, clientY: number) => string | null
>();
const mockHandleUndoRedo = vi.fn<(event: KeyboardEvent) => void>();
const mockUseWorkflowStore = Object.assign(
  vi.fn(<T,>(selector: (state: MockWorkflowStoreState) => T) =>
    selector(mockStoreState)
  ),
  {
    getState: vi.fn(() => mockStoreState),
  }
);
const mockReactFlowInstance = {
  flowToScreenPosition: vi.fn<(position: Position) => Position>(),
  screenToFlowPosition: vi.fn<(position: Position) => Position>(),
  getViewport: vi.fn<() => Viewport>(),
};

vi.mock("@xyflow/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@xyflow/react")>();

  return {
    ...actual,
    Background: () => null,
    BackgroundVariant: {
      Dots: "dots",
    },
    Controls: () => null,
    MiniMap: () => null,
    ReactFlow: ({
      children,
      onInit,
      onDragOver,
      onDrop,
      onDragLeave,
    }: ReactFlowProps) => (
      <div
        data-testid="react-flow"
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
        ref={(element) => {
          if (element) {
            onInit?.(mockReactFlowInstance);
          }
        }}
      >
        {children}
      </div>
    ),
  };
});

vi.mock("../use-workflow-store", () => ({
  handleUndoRedo: mockHandleUndoRedo,
  useWorkflowStore: mockUseWorkflowStore,
}));

vi.mock("../utils/find-edge-at-point", () => ({
  findEdgeAtPoint: mockFindEdgeAtPoint,
}));

vi.mock("../node-palette", () => ({
  NodePalette: ({ onDragStart, onDragEnd }: MockNodePaletteProps) => (
    <div>
      <button onClick={() => onDragStart?.("delay")} type="button">
        palette delay drag
      </button>
      <button onClick={() => onDragEnd?.()} type="button">
        palette drag end
      </button>
    </div>
  ),
  paletteItems: [
    {
      type: "send_email",
      label: "Send Email",
      description: "Send an email",
      icon: <span>email</span>,
      accentColor: "bg-blue-500",
    },
    {
      type: "delay",
      label: "Delay",
      description: "Wait before continuing",
      icon: <span>delay</span>,
      accentColor: "bg-purple-500",
    },
  ],
}));

import { WorkflowCanvas } from "../workflow-canvas";

function createDomRect(left: number, top: number): DOMRect {
  return {
    x: left,
    y: top,
    width: 600,
    height: 400,
    top,
    right: left + 600,
    bottom: top + 400,
    left,
    toJSON: () => ({}),
  };
}

function createDataTransfer(nodeType: string): TestDataTransfer {
  const values = new Map<string, string>([["application/reactflow", nodeType]]);

  return {
    dropEffect: "none",
    effectAllowed: "move",
    types: ["application/reactflow"],
    setData: (format: string, data: string) => {
      values.set(format, data);
    },
    getData: (format: string) => values.get(format) ?? "",
  };
}

function appendEdgeElement(edgeId: string): HTMLDivElement {
  const edgeElement = document.createElement("div");
  edgeElement.classList.add("react-flow__edge");
  edgeElement.setAttribute("data-id", edgeId);
  document.body.append(edgeElement);
  return edgeElement;
}

describe("WorkflowCanvas", () => {
  beforeEach(() => {
    mockStoreState = {
      nodes: [
        { id: "source-1", position: { x: 20, y: 30 } },
        { id: "target-1", position: { x: 220, y: 230 } },
      ],
      edges: [{ id: "edge-1", source: "source-1", target: "target-1" }],
      onNodesChange: vi.fn(),
      onEdgesChange: vi.fn(),
      onConnect: vi.fn(),
      onReconnect: vi.fn(),
      addNode: vi.fn(),
      insertNodeBetweenEdge: vi.fn(),
      selectNode: vi.fn(),
      selectedNodeId: null,
      setCanvasViewport: vi.fn(),
    };

    mockFindEdgeAtPoint.mockReturnValue(null);
    mockHandleUndoRedo.mockReset();
    mockUseWorkflowStore.mockImplementation(<T,>(
      selector: (state: MockWorkflowStoreState) => T
    ) => selector(mockStoreState));
    mockUseWorkflowStore.getState.mockImplementation(() => mockStoreState);
    mockReactFlowInstance.flowToScreenPosition.mockImplementation(
      (position: Position) => position
    );
    mockReactFlowInstance.screenToFlowPosition.mockImplementation(
      (position: Position) => position
    );
    mockReactFlowInstance.getViewport.mockReturnValue({ x: 0, y: 0, zoom: 1 });

    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      createDomRect(25, 15)
    );
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("uses raw screen coordinates and centers dropped nodes horizontally", () => {
    mockReactFlowInstance.screenToFlowPosition.mockReturnValue({
      x: 510,
      y: 330,
    });

    render(<WorkflowCanvas />);

    fireEvent.drop(screen.getByTestId("react-flow"), {
      clientX: 150,
      clientY: 200,
      dataTransfer: createDataTransfer("delay"),
    });

    expect(mockReactFlowInstance.screenToFlowPosition).toHaveBeenCalledWith({
      x: 150,
      y: 200,
    });
    expect(mockStoreState.addNode).toHaveBeenCalledWith("delay", {
      x: 420,
      y: 330,
    });
    expect(mockStoreState.insertNodeBetweenEdge).not.toHaveBeenCalled();
  });

  it("shows a ghost preview over hovered edges and inserts into that edge on drop", () => {
    const edgeElement = appendEdgeElement("edge-1");

    mockFindEdgeAtPoint.mockReturnValue("edge-1");
    mockReactFlowInstance.flowToScreenPosition.mockReturnValue({
      x: 300,
      y: 220,
    });
    mockReactFlowInstance.screenToFlowPosition.mockReturnValue({
      x: 450,
      y: 270,
    });

    render(<WorkflowCanvas />);

    fireEvent.click(screen.getByRole("button", { name: "palette delay drag" }));
    fireEvent.dragOver(screen.getByTestId("react-flow"), {
      clientX: 100,
      clientY: 120,
      dataTransfer: createDataTransfer("delay"),
    });

    expect(edgeElement).toHaveClass("edge-drop-target");
    expect(screen.getByText("Delay")).toBeInTheDocument();

    fireEvent.drop(screen.getByTestId("react-flow"), {
      clientX: 200,
      clientY: 210,
      dataTransfer: createDataTransfer("delay"),
    });

    expect(mockStoreState.insertNodeBetweenEdge).toHaveBeenCalledWith(
      "delay",
      "edge-1",
      {
        x: 360,
        y: 270,
      }
    );
    expect(mockStoreState.addNode).not.toHaveBeenCalled();
    expect(edgeElement).not.toHaveClass("edge-drop-target");
    expect(screen.queryByText("Delay")).not.toBeInTheDocument();
  });
});
