"use client";

import { Handle, Position, NodeProps } from "@xyflow/react";
import { 
  MessageSquare, Image as ImageIcon, Video, Music, FileText, 
  List, MousePointerClick, MapPin, Globe, Hash, Table, 
  Workflow, Keyboard, GitBranch, LayoutTemplate, Play, 
  Send, CheckCircle, Users, AlertCircle 
} from "lucide-react";

export function StartNode({ data, selected }: NodeProps) {
  return (
    <div className={`bg-white rounded-xl shadow-sm border ${selected ? 'border-[#2563EB] shadow-md ring-1 ring-[#2563EB]' : 'border-gray-200'} w-72 overflow-hidden`}>
      <div className="bg-gray-50/50 p-3 border-b border-gray-100 flex items-center gap-2">
        <Play size={16} className="text-[#2563EB]" />
        <span className="font-semibold text-gray-800 text-sm">Start Bot Flow</span>
      </div>
      
      <div className="p-4 space-y-3">
        <div className="bg-blue-50 text-[#2563EB] text-center py-1.5 rounded-md text-sm font-medium">
          {data.label || "Welcome"}
        </div>
        
        <div className="space-y-2 text-xs">
          <div>
            <p className="text-gray-400">Bot trigger keywords</p>
            <p className="text-gray-700 font-medium">{data.keywords || "hi, hello"}</p>
          </div>
          <div className="border-t border-dashed border-gray-100 pt-2">
            <p className="text-gray-400">Keyword matching type</p>
            <p className="text-gray-700 font-medium">{data.matchType || "String match"}</p>
          </div>
          <div className="border-t border-dashed border-gray-100 pt-2">
            <p className="text-gray-400">Add Label(s)</p>
            <p className="text-gray-700 font-medium">{data.labels || "None"}</p>
          </div>
        </div>
      </div>
      
      <div className="bg-gray-50 p-2 border-t border-gray-100 flex justify-end items-center relative h-10">
        <span className="text-[11px] text-gray-500 font-medium mr-4">Compose Next Message</span>
        <Handle type="source" position={Position.Right} id="next" className="w-3 h-3 bg-[#2563EB] border-2 border-white translate-x-1.5" />
      </div>
    </div>
  );
}

export function TextNode({ data, selected }: NodeProps) {
  return (
    <div className={`bg-white rounded-xl shadow-sm border ${selected ? 'border-[#2563EB] shadow-md ring-1 ring-[#2563EB]' : 'border-gray-200'} w-72 overflow-hidden`}>
      <div className="bg-gray-50/50 p-3 border-b border-gray-100 flex items-center gap-2">
        <MessageSquare size={16} className="text-[#2563EB]" />
        <span className="font-semibold text-gray-800 text-sm">Text Message</span>
      </div>
      
      {/* Metrics Row */}
      <div className="grid grid-cols-4 gap-1 p-2.5 border-b border-gray-100 text-center bg-white">
        <div>
          <div className="flex items-center justify-center gap-1 text-[10px] text-gray-400"><Send size={10} className="text-teal-500"/> Sent</div>
          <p className="text-sm font-semibold text-gray-700">{data.metrics?.sent || 0}</p>
        </div>
        <div>
          <div className="flex items-center justify-center gap-1 text-[10px] text-gray-400"><CheckCircle size={10} className="text-green-500"/> Delivered</div>
          <p className="text-sm font-semibold text-gray-700">{data.metrics?.delivered || 0}</p>
        </div>
        <div>
          <div className="flex items-center justify-center gap-1 text-[10px] text-gray-400"><Users size={10} className="text-[#2563EB]"/> Subs</div>
          <p className="text-sm font-semibold text-gray-700">{data.metrics?.subscribers || 0}</p>
        </div>
        <div>
          <div className="flex items-center justify-center gap-1 text-[10px] text-gray-400"><AlertCircle size={10} className="text-red-500"/> Errors</div>
          <p className="text-sm font-semibold text-gray-700">{data.metrics?.errors || 0}</p>
        </div>
      </div>
      
      <div className="p-4">
        <p className="text-sm text-gray-600 line-clamp-3">
          {data.text || "Double click to edit text message..."}
        </p>
      </div>
      
      <div className="bg-gray-50 p-2 border-t border-gray-100 flex justify-between items-center relative h-10 px-4">
        <Handle type="target" position={Position.Left} id="in" className="w-3 h-3 bg-gray-400 border-2 border-white -translate-x-3.5" />
        <span className="text-[11px] text-gray-500 font-medium">Message</span>
        <span className="text-[11px] text-gray-500 font-medium">Compose Next</span>
        <Handle type="source" position={Position.Right} id="next" className="w-3 h-3 bg-[#2563EB] border-2 border-white translate-x-3.5" />
      </div>
    </div>
  );
}

export function ImageNode({ data, selected }: NodeProps) {
  return (
    <div className={`bg-white rounded-xl shadow-sm border ${selected ? 'border-[#2563EB] shadow-md ring-1 ring-[#2563EB]' : 'border-gray-200'} w-80 overflow-hidden`}>
      <div className="p-3 border-b border-gray-100 flex items-center gap-2">
        <ImageIcon size={18} className="text-[#2563EB]" />
        <span className="font-semibold text-gray-800 text-sm">Image</span>
      </div>
      
      {/* Metrics Row */}
      <div className="grid grid-cols-4 gap-1 p-2.5 border-b border-gray-100 text-center bg-white">
        <div>
          <div className="flex items-center justify-center gap-1 text-[10px] text-gray-400"><Send size={10} className="text-teal-500"/> Sent</div>
          <p className="text-sm font-semibold text-gray-700">{data.metrics?.sent || 0}</p>
        </div>
        <div>
          <div className="flex items-center justify-center gap-1 text-[10px] text-gray-400"><CheckCircle size={10} className="text-green-500"/> Delivered</div>
          <p className="text-sm font-semibold text-gray-700">{data.metrics?.delivered || 0}</p>
        </div>
        <div>
          <div className="flex items-center justify-center gap-1 text-[10px] text-gray-400"><Users size={10} className="text-[#2563EB]"/> Subs</div>
          <p className="text-sm font-semibold text-gray-700">{data.metrics?.subscribers || 0}</p>
        </div>
        <div>
          <div className="flex items-center justify-center gap-1 text-[10px] text-gray-400"><AlertCircle size={10} className="text-red-500"/> Errors</div>
          <p className="text-sm font-semibold text-gray-700">{data.metrics?.errors || 0}</p>
        </div>
      </div>
      
      {/* Metrics Row */}
      <div className="grid grid-cols-4 gap-1 p-3 border-b border-gray-100 text-center">
        <div>
          <div className="flex items-center justify-center gap-1 text-[10px] text-gray-400"><Send size={10} className="text-blue-400"/> Sent</div>
          <p className="text-sm font-semibold text-gray-700">{data.metrics?.sent || 0}</p>
        </div>
        <div>
          <div className="flex items-center justify-center gap-1 text-[10px] text-gray-400"><CheckCircle size={10} className="text-green-500"/> Delivered</div>
          <p className="text-sm font-semibold text-gray-700">{data.metrics?.delivered || 0}</p>
        </div>
        <div>
          <div className="flex items-center justify-center gap-1 text-[10px] text-gray-400"><Users size={10} className="text-blue-400"/> Subscribers</div>
          <p className="text-sm font-semibold text-gray-700">{data.metrics?.subscribers || 0}</p>
        </div>
        <div>
          <div className="flex items-center justify-center gap-1 text-[10px] text-gray-400"><AlertCircle size={10} className="text-red-500"/> Errors</div>
          <p className="text-sm font-semibold text-gray-700">{data.metrics?.errors || 0}</p>
        </div>
      </div>
      
      {/* Image Preview Placeholder */}
      <div className="p-4">
        <div className="w-full h-40 bg-gray-100 rounded-lg flex items-center justify-center border border-gray-200 overflow-hidden">
           {data.url ? (
             <img src={data.url} alt="Preview" className="w-full h-full object-cover" />
           ) : (
             <span className="text-xs text-gray-400">No Image Selected</span>
           )}
        </div>
        {data.url && (
          <div className="mt-3">
             <p className="text-[10px] text-gray-400 uppercase font-semibold">Resource URL</p>
             <p className="text-xs text-[#2563EB] truncate">{data.url}</p>
          </div>
        )}
      </div>
      
      <div className="bg-gray-50/50 p-2 border-t border-gray-100 flex justify-between items-center relative h-10 px-4">
        <Handle type="target" position={Position.Left} id="in" className="w-3 h-3 bg-gray-400 border-2 border-white -translate-x-3.5" />
        <span className="text-[11px] text-gray-500 font-medium">Message</span>
        <span className="text-[11px] text-gray-500 font-medium">Compose Next</span>
        <Handle type="source" position={Position.Right} id="next" className="w-3 h-3 bg-[#2563EB] border-2 border-white translate-x-3.5" />
      </div>
    </div>
  );
}

export function InteractiveNode({ data, selected }: NodeProps) {
  return (
    <div className={`bg-white rounded-xl shadow-sm border ${selected ? 'border-[#2563EB] shadow-md ring-1 ring-[#2563EB]' : 'border-gray-200'} w-72 overflow-hidden`}>
      <div className="bg-gray-50/50 p-3 border-b border-gray-100 flex items-center gap-2">
        <List size={16} className="text-[#2563EB]" />
        <span className="font-semibold text-gray-800 text-sm">Interactive Message</span>
      </div>
      
      <div className="p-4">
        <p className="text-sm text-gray-600 line-clamp-3">
          {data.text || "Interactive message body..."}
        </p>
      </div>
      
      <div className="bg-gray-50 p-2 border-t border-gray-100 flex flex-col relative px-4 gap-2">
        <Handle type="target" position={Position.Left} id="in" className="w-3 h-3 bg-gray-400 border-2 border-white -translate-x-3.5" />
        
        <div className="flex justify-between items-center w-full">
          <span className="text-[11px] text-gray-500 font-medium">Message</span>
          <span className="text-[11px] text-gray-500 font-medium">Compose Next</span>
          <Handle type="source" position={Position.Right} id="next" className="w-3 h-3 bg-[#2563EB] border-2 border-white translate-x-3.5" />
        </div>
        
        {/* Render dynamic handles for lists/buttons */}
        {(data.buttons || []).map((btn: any, idx: number) => (
           <div key={idx} className="flex justify-between items-center w-full border-t border-gray-200 pt-2 mt-1 relative">
             <span className="text-[11px] text-gray-400"></span>
             <span className="text-[11px] text-[#2563EB] font-medium truncate">{btn.label || "Button"}</span>
             <Handle type="source" position={Position.Right} id={`btn-${idx}`} className="w-3 h-3 bg-[#2563EB] border-2 border-white translate-x-3.5" />
           </div>
        ))}
      </div>
    </div>
  );
}

// Map node types to React Flow
export const customNodeTypes = {
  start: StartNode,
  text: TextNode,
  image: ImageNode,
  interactive: InteractiveNode,
};
