import { useCallback, useRef } from 'react'
import {
  ReactFlow, ReactFlowProvider, Background, Controls, MiniMap,
  addEdge, useNodesState, useEdgesState,
  type Connection, type NodeTypes, type OnConnect,
  BackgroundVariant,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import type { FlowNode, FlowEdge, FlowNodeData, FlowNodeType } from './flow-types'
import {
  TriggerNode, WhatsappNode, DelayNode, ConditionNode,
  SegmentNode, TaskNode, PipelineNode, ReferralNode, EndNode,
} from './nodes'

const NODE_TYPES: NodeTypes = {
  trigger:   TriggerNode as never,
  whatsapp:  WhatsappNode as never,
  delay:     DelayNode as never,
  condition: ConditionNode as never,
  segment:   SegmentNode as never,
  task:      TaskNode as never,
  pipeline:  PipelineNode as never,
  referral:  ReferralNode as never,
  end:       EndNode as never,
}

const EDGE_STYLE = {
  stroke: '#3df710',
  strokeWidth: 2,
}

interface FlowCanvasProps {
  initialNodes: FlowNode[]
  initialEdges: FlowEdge[]
  selectedNodeId: string | null
  onNodeSelect: (node: FlowNode | null) => void
  onNodeDataChange: (nodeId: string, data: Partial<FlowNodeData>) => void
  onFlowChange: (nodes: FlowNode[], edges: FlowEdge[]) => void
}

function FlowCanvasInner({
  initialNodes, initialEdges,
  selectedNodeId, onNodeSelect, onNodeDataChange, onFlowChange,
}: FlowCanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState<FlowEdge>(initialEdges)
  const rfWrapper = useRef<HTMLDivElement>(null)
  const rfInstance = useRef<{ screenToFlowPosition: (pos: { x: number; y: number }) => { x: number; y: number } } | null>(null)

  const onConnect: OnConnect = useCallback((connection: Connection) => {
    setEdges(eds => {
      const next = addEdge({
        ...connection,
        type: 'smoothstep',
        animated: true,
        style: EDGE_STYLE,
      }, eds) as FlowEdge[]
      onFlowChange(nodes, next)
      return next
    })
  }, [nodes, setEdges, onFlowChange])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const raw = e.dataTransfer.getData('application/reactflow')
    if (!raw || !rfInstance.current) return

    const { type, defaultData } = JSON.parse(raw) as { type: FlowNodeType; defaultData: FlowNodeData }
    const position = rfInstance.current.screenToFlowPosition({ x: e.clientX, y: e.clientY })

    const newNode: FlowNode = {
      id: `${type}-${Date.now()}`,
      type,
      position,
      data: defaultData,
      selected: false,
    }

    setNodes(nds => {
      const next = [...nds, newNode]
      onFlowChange(next, edges)
      return next
    })
  }, [edges, setNodes, onFlowChange])

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }, [])

  const handleNodesChange = useCallback((changes: Parameters<typeof onNodesChange>[0]) => {
    onNodesChange(changes)
    // Sync to parent after change
    setNodes(nds => {
      onFlowChange(nds, edges)
      return nds
    })
  }, [onNodesChange, setNodes, edges, onFlowChange])

  const handleEdgesChange = useCallback((changes: Parameters<typeof onEdgesChange>[0]) => {
    onEdgesChange(changes)
    setEdges(eds => {
      onFlowChange(nodes, eds)
      return eds
    })
  }, [onEdgesChange, setEdges, nodes, onFlowChange])

  // Expose handleNodeDataChange to parent by updating node data in state
  const applyNodeDataChange = useCallback((nodeId: string, data: Partial<FlowNodeData>) => {
    setNodes(nds => {
      const next = nds.map(n => n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n)
      onFlowChange(next, edges)
      return next
    })
    onNodeDataChange(nodeId, data)
  }, [setNodes, edges, onFlowChange, onNodeDataChange])

  // expose applyNodeDataChange via a ref trick on the parent through prop
  // We pass it as a side-effect: whenever selectedNodeId changes we also allow parent to call back
  // The parent (FlowBuilderPage) holds its own ref to the change fn
  void applyNodeDataChange

  return (
    <div ref={rfWrapper} style={{ flex: 1, position: 'relative' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={onConnect}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onInit={inst => { rfInstance.current = inst }}
        onNodeClick={(_, node) => onNodeSelect(node as FlowNode)}
        onPaneClick={() => onNodeSelect(null)}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        deleteKeyCode="Delete"
        multiSelectionKeyCode="Shift"
        style={{ background: 'var(--bg)' }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--bs)" />
        <Controls
          style={{
            background: 'var(--card)',
            border: '1px solid var(--bs)',
            borderRadius: 8,
          }}
        />
        <MiniMap
          style={{
            background: 'var(--surf)',
            border: '1px solid var(--bs)',
            borderRadius: 8,
          }}
          nodeColor={() => '#3df71033'}
          maskColor="rgba(0,0,0,.4)"
        />
      </ReactFlow>

      {nodes.length === 0 && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', pointerEvents: 'none',
        }}>
          <p style={{ fontSize: 32, marginBottom: 12 }}>🧩</p>
          <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--t2)', marginBottom: 4 }}>
            Canvas vazio
          </p>
          <p style={{ fontSize: 12, color: 'var(--t3)', textAlign: 'center', maxWidth: 260 }}>
            Arraste um gatilho da barra lateral esquerda para começar a montar o fluxo
          </p>
        </div>
      )}
    </div>
  )
}

export function FlowCanvas(props: FlowCanvasProps) {
  return (
    <ReactFlowProvider>
      <FlowCanvasInner {...props} />
    </ReactFlowProvider>
  )
}
