"use client";

import type {
  EdgeTypes,
  Node,
  NodeTypes,
  OnConnect,
  OnEdgesChange,
  OnMoveEnd,
  OnNodesChange,
  OnReconnect,
} from "@xyflow/react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import "./edges/edge-styles.css";
import { LabeledEdge } from "./edges/labeled-edge";
import type { NodePaletteType } from "./node-palette";
import { NodePalette, paletteItems } from "./node-palette";
import { CascadeNode } from "./nodes/cascade-node";
import { ConditionNode } from "./nodes/condition-node";
import { DelayNode } from "./nodes/delay-node";
import { ExitNode } from "./nodes/exit-node";
import { SendEmailNode } from "./nodes/send-email-node";
import { SendSmsNode } from "./nodes/send-sms-node";
import { TopicNode } from "./nodes/topic-node";
import { TriggerNode } from "./nodes/trigger-node";
import { UpdateContactNode } from "./nodes/update-contact-node";
import { WaitForEmailEngagementNode } from "./nodes/wait-for-email-engagement-node";
import { WaitForEventNode } from "./nodes/wait-for-event-node";
import { handleUndoRedo, useWorkflowStore } from "./use-workflow-store";
import { findEdgeAtPoint } from "./utils/find-edge-at-point";

const nodeTypes: NodeTypes = {
  trigger: TriggerNode,
  send_email: SendEmailNode,
  send_sms: SendSmsNode,
  delay: DelayNode,
  exit: ExitNode,
  condition: ConditionNode,
  update_contact: UpdateContactNode,
  // Webhook node disabled until delivery retry/verification is implemented
  // webhook: WebhookNode,
  // Slice 3
  wait_for_event: WaitForEventNode,
  wait_for_email_engagement: WaitForEmailEngagementNode,
  subscribe_topic: TopicNode,
  unsubscribe_topic: TopicNode,
  // Cascade (self-contained multi-channel node)
  cascade: CascadeNode,
};

const edgeTypes: EdgeTypes = {
  labeled: LabeledEdge,
};

// Lookup for ghost preview rendering during drag-over
const paletteItemsByType = Object.fromEntries(
  paletteItems.map((item) => [item.type, item])
);

type WorkflowCanvasProps = {
  smsEnabled?: boolean;
};

export function WorkflowCanvas({ smsEnabled = false }: WorkflowCanvasProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [reactFlowInstance, setReactFlowInstance] =
    useState<ReactFlowInstance | null>(null);

  const nodes = useWorkflowStore((state) => state.nodes);
  const edges = useWorkflowStore((state) => state.edges);
  const onNodesChange = useWorkflowStore(
    (state) => state.onNodesChange
  ) as OnNodesChange<Node>;
  const onEdgesChange = useWorkflowStore(
    (state) => state.onEdgesChange
  ) as OnEdgesChange;
  const onConnect = useWorkflowStore((state) => state.onConnect) as OnConnect;
  const onReconnect = useWorkflowStore(
    (state) => state.onReconnect
  ) as OnReconnect;
  const addNode = useWorkflowStore((state) => state.addNode);
  const insertNodeBetweenEdge = useWorkflowStore(
    (state) => state.insertNodeBetweenEdge
  );
  const selectNode = useWorkflowStore((state) => state.selectNode);
  const selectedNodeId = useWorkflowStore((state) => state.selectedNodeId);
  const setCanvasViewport = useWorkflowStore(
    (state) => state.setCanvasViewport
  );

  // Transient drag state -- NOT in Zustand to avoid re-renders during drag (~60fps)
  const hoveredEdgeRef = useRef<string | null>(null);
  const dragTypeRef = useRef<NodePaletteType | null>(null);

  // Ghost preview shown on the edge midpoint during drag-over
  const [ghostPreview, setGhostPreview] = useState<{
    type: NodePaletteType;
    x: number;
    y: number;
  } | null>(null);

  const nodesWithSelection = useMemo(
    () =>
      nodes.map((node) => ({
        ...node,
        selected: node.id === selectedNodeId,
      })),
    [nodes, selectedNodeId]
  );

  const onDragOver = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";

      const type = event.dataTransfer.types.includes("application/reactflow");
      if (!type) {
        return;
      }

      // Detect if cursor is over an edge
      const edgeId = findEdgeAtPoint(event.clientX, event.clientY);

      // Update visual feedback only when hovered edge changes
      if (edgeId !== hoveredEdgeRef.current) {
        // Remove highlight from previous edge
        if (hoveredEdgeRef.current) {
          const prevEdge = document.querySelector(
            `.react-flow__edge[data-id="${hoveredEdgeRef.current}"]`
          );
          prevEdge?.classList.remove("edge-drop-target");
        }

        // Add highlight to new edge
        if (edgeId) {
          const edgeElement = document.querySelector(
            `.react-flow__edge[data-id="${edgeId}"]`
          );
          edgeElement?.classList.add("edge-drop-target");
        }

        hoveredEdgeRef.current = edgeId;

        // Show/hide ghost preview at edge midpoint
        if (edgeId && reactFlowInstance && reactFlowWrapper.current) {
          const state = useWorkflowStore.getState();
          const edge = state.edges.find((e) => e.id === edgeId);
          if (edge) {
            const srcNode = state.nodes.find((n) => n.id === edge.source);
            const tgtNode = state.nodes.find((n) => n.id === edge.target);
            if (srcNode && tgtNode) {
              const midFlow = {
                x: (srcNode.position.x + tgtNode.position.x) / 2 + 90,
                y: (srcNode.position.y + tgtNode.position.y) / 2 + 40,
              };
              const screenPos = reactFlowInstance.flowToScreenPosition(midFlow);
              const rect = reactFlowWrapper.current.getBoundingClientRect();
              setGhostPreview({
                type: dragTypeRef.current ?? "send_email",
                x: screenPos.x - rect.left,
                y: screenPos.y - rect.top,
              });
            }
          }
        } else {
          setGhostPreview(null);
        }
      }
    },
    [reactFlowInstance]
  );

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const type = event.dataTransfer.getData(
        "application/reactflow"
      ) as NodePaletteType;

      if (!(type && reactFlowInstance && reactFlowWrapper.current)) {
        return;
      }

      const cursorFlow = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      // Center horizontally on cursor, align top edge to cursor
      const position = {
        x: cursorFlow.x - 90,
        y: cursorFlow.y,
      };

      // Clean up visual feedback
      const edgeId = hoveredEdgeRef.current;
      if (edgeId) {
        const edgeElement = document.querySelector(
          `.react-flow__edge[data-id="${edgeId}"]`
        );
        edgeElement?.classList.remove("edge-drop-target");
        hoveredEdgeRef.current = null;
      }
      setGhostPreview(null);
      dragTypeRef.current = null;

      // Insert between edge or add to canvas
      if (edgeId) {
        insertNodeBetweenEdge(type, edgeId, position);
      } else {
        addNode(type, position);
      }
    },
    [reactFlowInstance, addNode, insertNodeBetweenEdge]
  );

  const onDragLeave = useCallback((event: React.DragEvent) => {
    // Only handle if leaving the canvas entirely (not entering a child element)
    if (event.currentTarget.contains(event.relatedTarget as globalThis.Node)) {
      return;
    }

    if (hoveredEdgeRef.current) {
      const prevEdge = document.querySelector(
        `.react-flow__edge[data-id="${hoveredEdgeRef.current}"]`
      );
      prevEdge?.classList.remove("edge-drop-target");
      hoveredEdgeRef.current = null;
    }
    setGhostPreview(null);
    dragTypeRef.current = null;
  }, []);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: { id: string }) => {
      selectNode(node.id);
    },
    [selectNode]
  );

  const onPaneClick = useCallback(() => {
    selectNode(null);
  }, [selectNode]);

  const onMoveEnd: OnMoveEnd = useCallback(
    (_event, viewport) => {
      setCanvasViewport({ x: viewport.x, y: viewport.y, zoom: viewport.zoom });
    },
    [setCanvasViewport]
  );

  const handleAddNode = useCallback(
    (type: NodePaletteType) => {
      // Add node at center of viewport
      if (reactFlowInstance) {
        const { x, y, zoom } = reactFlowInstance.getViewport();
        const centerX = (-x + window.innerWidth / 2) / zoom;
        const centerY = (-y + window.innerHeight / 2) / zoom;
        addNode(type, { x: centerX - 90, y: centerY - 40 });
      } else {
        addNode(type, { x: 250, y: 100 });
      }
    },
    [reactFlowInstance, addNode]
  );

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    handleUndoRedo(e);
  }, []);

  return (
    <div
      className="relative h-full flex-1"
      onKeyDown={onKeyDown}
      ref={reactFlowWrapper}
    >
      <ReactFlow
        defaultEdgeOptions={{
          type: "labeled",
          animated: true,
          interactionWidth: 40,
        }}
        deleteKeyCode={["Backspace", "Delete"]}
        edges={edges}
        edgeTypes={edgeTypes}
        fitView
        nodes={nodesWithSelection}
        nodeTypes={nodeTypes}
        onConnect={onConnect}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onEdgesChange={onEdgesChange}
        onInit={setReactFlowInstance}
        onMoveEnd={onMoveEnd}
        onNodeClick={onNodeClick}
        onNodesChange={onNodesChange}
        onPaneClick={onPaneClick}
        onReconnect={onReconnect}
        snapGrid={[15, 15]}
        snapToGrid
      >
        <Background gap={15} size={1} variant={BackgroundVariant.Dots} />
        <Controls />
        <MiniMap
          className="!border !bg-background !shadow-sm"
          nodeStrokeWidth={3}
        />
      </ReactFlow>
      <NodePalette
        onAddNode={handleAddNode}
        onDragEnd={() => {
          dragTypeRef.current = null;
        }}
        onDragStart={(type) => {
          dragTypeRef.current = type;
        }}
        smsEnabled={smsEnabled}
      />
      {ghostPreview &&
        (() => {
          const meta = paletteItemsByType[ghostPreview.type];
          if (!meta) {
            return null;
          }
          return (
            <div
              className="pointer-events-none absolute z-50 flex items-center gap-2 rounded-lg border-2 border-dashed border-warning/50 bg-background/80 px-3 py-2 shadow-lg backdrop-blur-sm ghost-preview-enter"
              style={{
                left: ghostPreview.x,
                top: ghostPreview.y,
                transform: "translate(-50%, -50%)",
              }}
            >
              <div
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded text-white",
                  meta.accentColor
                )}
              >
                {meta.icon}
              </div>
              <span className="font-medium text-foreground text-sm">
                {meta.label}
              </span>
            </div>
          );
        })()}
    </div>
  );
}
