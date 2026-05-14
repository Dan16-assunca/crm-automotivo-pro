import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Save, Play, Pause, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useStore } from '@/hooks/useStore'
import type { FlowNode, FlowEdge, FlowNodeData, AutomationFlow } from './flow-types'
import { NodePalette } from './NodePalette'
import { PropertiesPanel } from './PropertiesPanel'
import { FlowCanvas } from './FlowCanvas'

const DEFAULT_VIEWPORT = { x: 0, y: 0, zoom: 1 }

export default function FlowBuilderPage() {
  const { flowId } = useParams<{ flowId: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { store } = useStore()

  const [nodes, setNodes] = useState<FlowNode[]>([])
  const [edges, setEdges] = useState<FlowEdge[]>([])
  const [selectedNode, setSelectedNode] = useState<FlowNode | null>(null)
  const [isDirty, setIsDirty] = useState(false)
  const [saveOk, setSaveOk] = useState(false)

  const nodesRef = useRef<FlowNode[]>([])
  const edgesRef = useRef<FlowEdge[]>([])

  const { data: flow, isLoading } = useQuery<AutomationFlow>({
    queryKey: ['flow', flowId],
    enabled: !!flowId && !!store?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('automation_flows')
        .select('*')
        .eq('id', flowId)
        .eq('store_id', store!.id)
        .single()
      if (error) throw error
      return data as AutomationFlow
    },
  })

  useEffect(() => {
    if (flow) {
      const n = (flow.nodes ?? []) as FlowNode[]
      const e = (flow.edges ?? []) as FlowEdge[]
      setNodes(n)
      setEdges(e)
      nodesRef.current = n
      edgesRef.current = e
    }
  }, [flow])

  const saveMutation = useMutation({
    mutationFn: async ({ activate }: { activate?: boolean }) => {
      const updates: Partial<AutomationFlow> = {
        nodes: nodesRef.current as never,
        edges: edgesRef.current as never,
      }
      if (activate !== undefined) updates.is_active = activate

      const { error } = await supabase
        .from('automation_flows')
        .update(updates)
        .eq('id', flowId)
      if (error) throw error
    },
    onSuccess: (_, vars) => {
      setIsDirty(false)
      setSaveOk(true)
      setTimeout(() => setSaveOk(false), 2000)
      qc.invalidateQueries({ queryKey: ['automation-flows'] })
      qc.invalidateQueries({ queryKey: ['flow', flowId] })
      if (vars.activate !== undefined) {
        qc.invalidateQueries({ queryKey: ['automation-flows'] })
      }
    },
  })

  const handleFlowChange = useCallback((n: FlowNode[], e: FlowEdge[]) => {
    nodesRef.current = n
    edgesRef.current = e
    setIsDirty(true)
  }, [])

  const handleNodeDataChange = useCallback((nodeId: string, data: Partial<FlowNodeData>) => {
    setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n))
    setSelectedNode(prev => prev?.id === nodeId ? { ...prev, data: { ...prev.data, ...data } } : prev)
    nodesRef.current = nodesRef.current.map(n =>
      n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n
    )
    setIsDirty(true)
  }, [])

  const handleNodeSelect = useCallback((node: FlowNode | null) => {
    setSelectedNode(node)
  }, [])

  if (isLoading) {
    return (
      <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', zIndex: 9999 }}>
        <Loader2 size={28} style={{ color: 'var(--neon)', animation: 'spin 1s linear infinite' }} />
      </div>
    )
  }

  if (!flow) {
    return (
      <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', zIndex: 9999 }}>
        <p style={{ fontSize: 16, color: 'var(--t)', marginBottom: 12 }}>Fluxo não encontrado</p>
        <button onClick={() => navigate('/automacoes')} style={{ padding: '8px 18px', background: 'var(--neon)', color: '#000', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700 }}>
          Voltar
        </button>
      </div>
    )
  }

  const isSaving = saveMutation.isPending
  const isActive = flow.is_active

  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', background: 'var(--bg)', zIndex: 9999 }}>
      {/* Top bar */}
      <div style={{
        height: 52, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10,
        padding: '0 12px', background: 'var(--surf)', borderBottom: '1px solid var(--bs)',
      }}>
        <button
          onClick={() => navigate('/automacoes')}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 8, border: '1px solid var(--bs)', background: 'transparent', cursor: 'pointer', color: 'var(--t2)' }}
        >
          <ArrowLeft size={16} />
        </button>

        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--t)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {flow.name}
          </p>
          {flow.description && (
            <p style={{ fontSize: 10, color: 'var(--t3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {flow.description}
            </p>
          )}
        </div>

        {isDirty && (
          <span style={{ fontSize: 10, color: 'var(--t3)', flexShrink: 0 }}>Alterações não salvas</span>
        )}

        {saveOk && (
          <span style={{ fontSize: 10, color: 'var(--neon)', flexShrink: 0 }}>✓ Salvo</span>
        )}

        <button
          onClick={() => saveMutation.mutate({ activate: !isActive })}
          disabled={isSaving}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 12, border: 'none',
            background: isActive ? 'rgba(248,113,113,.12)' : 'rgba(61,247,16,.1)',
            color: isActive ? '#f87171' : 'var(--neon)',
            flexShrink: 0,
          }}
        >
          {isActive ? <Pause size={13} /> : <Play size={13} />}
          {isActive ? 'Pausar' : 'Ativar'}
        </button>

        <button
          onClick={() => saveMutation.mutate({})}
          disabled={isSaving || !isDirty}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 14px', borderRadius: 8, cursor: isDirty ? 'pointer' : 'not-allowed',
            fontWeight: 700, fontSize: 12, border: 'none',
            background: isDirty ? 'var(--neon)' : 'var(--el)', color: isDirty ? '#000' : 'var(--t3)',
            opacity: isSaving ? .6 : 1, flexShrink: 0,
            transition: 'background .15s',
          }}
        >
          {isSaving ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={13} />}
          Salvar
        </button>
      </div>

      {/* Main area */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <NodePalette />

        <FlowCanvas
          initialNodes={nodes}
          initialEdges={edges}
          selectedNodeId={selectedNode?.id ?? null}
          onNodeSelect={handleNodeSelect}
          onNodeDataChange={handleNodeDataChange}
          onFlowChange={handleFlowChange}
        />

        <PropertiesPanel
          node={selectedNode}
          onChange={handleNodeDataChange}
        />
      </div>
    </div>
  )
}
