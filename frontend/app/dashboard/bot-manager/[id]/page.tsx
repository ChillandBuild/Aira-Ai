"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { 
  ReactFlow, 
  MiniMap, 
  Controls, 
  Background, 
  useNodesState, 
  useEdgesState, 
  addEdge,
  Connection,
  Edge,
  Node,
  useReactFlow,
  ReactFlowProvider
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { 
  ArrowLeft, Save, MessageSquare, Image as ImageIcon, Video, Music, 
  FileText, List, MousePointerClick, MapPin, Globe, Hash, Table, 
  Workflow, Keyboard, GitBranch, LayoutTemplate, XCircle
} from "lucide-react";
import Link from "next/link";
import { customNodeTypes } from "@/components/bot-builder/nodes";
import { ConfigPanel } from "@/components/bot-builder/config-panel";

const initialNodes: Node[] = [
  { 
    id: "start", 
    position: { x: 250, y: 50 }, 
    data: { keywords: "hi, hello", matchType: "String match", labels: "sample, office, followup" },
    type: "start"
  }
];

const MENU_ITEMS = [
  { type: "text", label: "Text", icon: MessageSquare, color: "text-blue-500" },
  { type: "image", label: "Image", icon: ImageIcon, color: "text-blue-500" },
  { type: "video", label: "Video", icon: Video, color: "text-blue-500" },
  { type: "audio", label: "Audio", icon: Music, color: "text-blue-500" },
  { type: "file", label: "File", icon: FileText, color: "text-blue-500" },
  { type: "interactive", label: "Interactive", icon: List, color: "text-blue-500" },
  { type: "cta", label: "CTA URL Button", icon: MousePointerClick, color: "text-blue-500" },
  { type: "location", label: "Location", icon: MapPin, color: "text-blue-500" },
  { type: "http", label: "HTTP API", icon: Globe, color: "text-blue-500" },
  { type: "random", label: "Random Number Generator", icon: Hash, color: "text-blue-500" },
  { type: "sheets", label: "Google Sheet Data Fetch", icon: Table, color: "text-blue-500" },
  { type: "flows", label: "Whatsapp Flows", icon: Workflow, color: "text-blue-500" },
  { type: "input", label: "User Input Flow", icon: Keyboard, color: "text-blue-500" },
  { type: "condition", label: "Condition", icon: GitBranch, color: "text-blue-500" },
  { type: "template", label: "Template Message", icon: LayoutTemplate, color: "text-blue-500" },
];

function BotFlowEditorInternal() {
  const params = useParams();
  const router = useRouter();
  const flowId = params.id as string;
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();
  
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [name, setName] = useState("New Flow");
  const [saving, setSaving] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  
  const [menuPos, setMenuPos] = useState<{ x: number, y: number, screenX: number, screenY: number, sourceHandle?: string, sourceNode?: string } | null>(null);

  useEffect(() => {
    if (flowId === "create") return;
    
    // LocalStorage loading
    const savedFlows = JSON.parse(localStorage.getItem("bot_flows") || "[]");
    const flow = savedFlows.find((f: any) => f.id === flowId);
    
    if (flow) {
      setName(flow.name || "Untitled Flow");
      if (flow.flow?.nodes?.length) setNodes(flow.flow.nodes);
      if (flow.flow?.edges?.length) setEdges(flow.flow.edges);
    } else if (flowId === "1098552") {
      // Fallback mock
    }
  }, [flowId]);

  const onConnect = useCallback(
    (params: Connection | Edge) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  const onConnectEnd = useCallback(
    (event: any, connectionState: any) => {
      if (!connectionState.isValid) {
        const id = Math.random().toString(36).substr(2, 9);
        const { clientX, clientY } = 'changedTouches' in event ? event.changedTouches[0] : event;
        
        const position = screenToFlowPosition({
          x: clientX,
          y: clientY,
        });
        
        setMenuPos({
          x: position.x,
          y: position.y,
          screenX: clientX,
          screenY: clientY,
          sourceNode: connectionState.fromNode?.id,
          sourceHandle: connectionState.fromHandle?.id
        });
      }
    },
    [screenToFlowPosition]
  );

  const addNode = (type: string) => {
    if (!menuPos) return;
    
    const newNodeId = `${type}_${Math.random().toString(36).substr(2, 6)}`;
    const newNode = {
      id: newNodeId,
      type,
      position: { x: menuPos.x, y: menuPos.y },
      data: { label: `New ${type}` },
    };
    
    setNodes((nds) => nds.concat(newNode));
    
    if (menuPos.sourceNode) {
      setEdges((eds) => eds.concat({
        id: `e-${menuPos.sourceNode}-${newNodeId}`,
        source: menuPos.sourceNode!,
        sourceHandle: menuPos.sourceHandle,
        target: newNodeId,
        targetHandle: "in"
      }));
    }
    
    setMenuPos(null);
  };
  
  const handleSave = () => {
    setSaving(true);
    const savedFlows = JSON.parse(localStorage.getItem("bot_flows") || "[]");
    
    const targetId = flowId === "create" ? Math.random().toString(36).substr(2, 9) : flowId;
    const existingIdx = savedFlows.findIndex((f: any) => f.id === targetId);
    
    const flowData = {
      id: targetId,
      name,
      updatedAt: new Date().toISOString(),
      flow: { nodes, edges }
    };
    
    if (existingIdx >= 0) {
      savedFlows[existingIdx] = flowData;
    } else {
      savedFlows.push(flowData);
    }
    
    localStorage.setItem("bot_flows", JSON.stringify(savedFlows));
    
    setTimeout(() => {
      setSaving(false);
      if (flowId === "create") {
        router.push(`/dashboard/bot-manager/${targetId}`);
      }
    }, 500);
  };

  const handleNodeDataChange = (id: string, newData: any) => {
    setNodes((nds) => 
      nds.map(node => node.id === id ? { ...node, data: newData } : node)
    );
  };

  const selectedNode = nodes.find(n => n.id === selectedNodeId) || null;

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] w-full relative" ref={reactFlowWrapper}>
      <div className="flex justify-between items-center p-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 z-10">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/bot-manager" className="p-2 text-gray-500 hover:bg-gray-100 rounded-full transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <input 
            type="text" 
            value={name} 
            onChange={(e) => setName(e.target.value)}
            className="text-xl font-bold bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-green-500 rounded px-2 py-1"
            placeholder="Flow Name"
          />
        </div>
        <button 
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 bg-[#2563EB] text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          <Save className="w-4 h-4" />
          {saving ? "Saving..." : "Save Flow"}
        </button>
      </div>

      <div className="flex-1 w-full bg-[#F1F5F9] dark:bg-gray-900 relative overflow-hidden flex">
        
        <ConfigPanel 
          selectedNode={selectedNode}
          onChange={handleNodeDataChange}
          onClose={() => setSelectedNodeId(null)}
        />
        
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onConnectEnd={onConnectEnd}
          onNodeClick={(_, node) => setSelectedNodeId(node.id)}
          onPaneClick={() => { setMenuPos(null); setSelectedNodeId(null); }}
          nodeTypes={customNodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
        >
          <Controls />
          <MiniMap />
          <Background variant="dots" gap={16} size={1} />
        </ReactFlow>

        {/* Dropdown Menu */}
        {menuPos && (
          <div 
            className="absolute bg-white rounded-xl shadow-xl border border-gray-100 w-64 overflow-hidden z-50 flex flex-col max-h-[400px]"
            style={{ 
              top: Math.min(menuPos.screenY - 100, window.innerHeight - 420), 
              left: menuPos.screenX 
            }}
          >
            <div className="overflow-y-auto py-1 custom-scrollbar">
              {MENU_ITEMS.map((item) => (
                <button
                  key={item.type}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-blue-50 text-left border-b border-gray-50 last:border-0"
                  onClick={() => addNode(item.type)}
                >
                  <item.icon size={16} className={item.color} />
                  <span className="text-sm font-medium text-gray-700">{item.label}</span>
                </button>
              ))}
            </div>
            <button 
              className="w-full flex items-center gap-2 px-4 py-3 bg-gray-50 hover:bg-red-50 text-red-500 border-t border-gray-100 text-sm font-medium transition-colors"
              onClick={() => setMenuPos(null)}
            >
              <XCircle size={16} />
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function BotFlowEditor() {
  return (
    <ReactFlowProvider>
      <BotFlowEditorInternal />
    </ReactFlowProvider>
  );
}
