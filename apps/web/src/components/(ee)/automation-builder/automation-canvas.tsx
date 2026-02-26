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
import { LabeledEdge } from "./edges/labeled-edge";
import type { NodePaletteType } from "./node-palette";
import { NodePalette } from "./node-palette";
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
import { handleUndoRedo, useAutomationStore } from "./use-automation-store";

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

type AutomationCanvasProps = {
  smsEnabled?: boolean;
};

export function AutomationCanvas({
  smsEnabled = false,
}: AutomationCanvasProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [reactFlowInstance, setReactFlowInstance] =
    useState<ReactFlowInstance | null>(null);

  const nodes = useAutomationStore((state) => state.nodes);
  const edges = useAutomationStore((state) => state.edges);
  const onNodesChange = useAutomationStore(
    (state) => state.onNodesChange
  ) as OnNodesChange<Node>;
  const onEdgesChange = useAutomationStore(
    (state) => state.onEdgesChange
  ) as OnEdgesChange;
  const onConnect = useAutomationStore((state) => state.onConnect) as OnConnect;
  const onReconnect = useAutomationStore(
    (state) => state.onReconnect
  ) as OnReconnect;
  const addNode = useAutomationStore((state) => state.addNode);
  const selectNode = useAutomationStore((state) => state.selectNode);
  const selectedNodeId = useAutomationStore((state) => state.selectedNodeId);
  const setCanvasViewport = useAutomationStore(
    (state) => state.setCanvasViewport
  );

  const nodesWithSelection = useMemo(
    () =>
      nodes.map((node) => ({
        ...node,
        selected: node.id === selectedNodeId,
      })),
    [nodes, selectedNodeId]
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const type = event.dataTransfer.getData(
        "application/reactflow"
      ) as NodePaletteType;

      if (!(type && reactFlowInstance && reactFlowWrapper.current)) {
        return;
      }

      const reactFlowBounds = reactFlowWrapper.current.getBoundingClientRect();
      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX - reactFlowBounds.left,
        y: event.clientY - reactFlowBounds.top,
      });

      addNode(type, position);
    },
    [reactFlowInstance, addNode]
  );

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
        }}
        deleteKeyCode={["Backspace", "Delete"]}
        edges={edges}
        edgeTypes={edgeTypes}
        fitView
        nodes={nodesWithSelection}
        nodeTypes={nodeTypes}
        onConnect={onConnect}
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
      <NodePalette onAddNode={handleAddNode} smsEnabled={smsEnabled} />
    </div>
  );
}
