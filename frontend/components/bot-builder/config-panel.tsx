import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { Node } from "@xyflow/react";

interface ConfigPanelProps {
  selectedNode: Node | null;
  onChange: (id: string, newData: any) => void;
  onClose: () => void;
}

export function ConfigPanel({ selectedNode, onChange, onClose }: ConfigPanelProps) {
  const [data, setData] = useState<any>({});

  useEffect(() => {
    if (selectedNode) {
      setData(selectedNode.data || {});
    }
  }, [selectedNode]);

  if (!selectedNode) return null;

  const handleChange = (field: string, value: any) => {
    const newData = { ...data, [field]: value };
    setData(newData);
    onChange(selectedNode.id, newData);
  };

  const renderForm = () => {
    switch (selectedNode.type) {
      case "start":
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Trigger keywords</label>
              <input 
                type="text" 
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm outline-none focus:ring-1 focus:ring-blue-500" 
                placeholder="Comma separated"
                value={data.keywords || ""}
                onChange={e => handleChange("keywords", e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Keyword matching type</label>
              <select 
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                value={data.matchType || "String match"}
                onChange={e => handleChange("matchType", e.target.value)}
              >
                <option>Exact Match</option>
                <option>String Match</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Title / reference name</label>
              <input 
                type="text" 
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm outline-none focus:ring-1 focus:ring-blue-500" 
                value={data.label || ""}
                onChange={e => handleChange("label", e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Add Label(s)</label>
              <input 
                type="text" 
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm outline-none focus:ring-1 focus:ring-blue-500" 
                placeholder="Comma separated"
                value={data.labels || ""}
                onChange={e => handleChange("labels", e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Webhook URL</label>
              <input 
                type="text" 
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm outline-none focus:ring-1 focus:ring-blue-500" 
                placeholder="https://"
                value={data.webhook || ""}
                onChange={e => handleChange("webhook", e.target.value)}
              />
            </div>
          </div>
        );
      
      case "text":
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Message Body</label>
              <textarea 
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm outline-none focus:ring-1 focus:ring-blue-500 resize-y" 
                rows={6}
                placeholder="Enter text message..."
                value={data.text || ""}
                onChange={e => handleChange("text", e.target.value)}
              />
              <p className="text-xs text-gray-500 mt-1">Use {"{{name}}"} for variables.</p>
            </div>
            <div className="border-t border-gray-200 pt-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Smart Delay (Seconds)</label>
              <input 
                type="range" 
                min="0" max="60" 
                className="w-full accent-blue-600"
                value={data.delay || 0}
                onChange={e => handleChange("delay", parseInt(e.target.value))}
              />
              <div className="text-xs text-right text-gray-500">{data.delay || 0}s</div>
            </div>
          </div>
        );

      case "image":
      case "video":
      case "audio":
      case "file":
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">File Source</label>
              <select 
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                value={data.sourceType || "url"}
                onChange={e => handleChange("sourceType", e.target.value)}
              >
                <option value="upload">Upload New File</option>
                <option value="url">Resource URL</option>
              </select>
            </div>
            
            {data.sourceType === "upload" ? (
              <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer">
                <p className="text-sm text-gray-600 font-medium">Click to upload file</p>
                <p className="text-xs text-gray-400 mt-1">PNG, JPG, MP4, PDF up to 10MB</p>
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Resource URL</label>
                <input 
                  type="text" 
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm outline-none focus:ring-1 focus:ring-blue-500" 
                  placeholder="https://"
                  value={data.url || ""}
                  onChange={e => handleChange("url", e.target.value)}
                />
              </div>
            )}
            
            <div className="border-t border-gray-200 pt-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Smart Delay (Seconds)</label>
              <input 
                type="range" 
                min="0" max="60" 
                className="w-full accent-blue-600"
                value={data.delay || 0}
                onChange={e => handleChange("delay", parseInt(e.target.value))}
              />
              <div className="text-xs text-right text-gray-500">{data.delay || 0}s</div>
            </div>
          </div>
        );
        
      default:
        return (
          <div className="p-4 bg-gray-50 rounded-lg text-sm text-gray-500 border border-gray-200">
            Configuration for <strong>{selectedNode.type}</strong> nodes is under construction.
          </div>
        );
    }
  };

  return (
    <div className="absolute left-0 top-0 h-full w-[380px] bg-white shadow-[4px_0_24px_rgba(0,0,0,0.08)] z-40 flex flex-col border-r border-gray-200 transform transition-transform duration-300">
      <div className="flex justify-between items-center px-5 py-4 border-b border-gray-100">
        <div>
          <h3 className="font-semibold text-gray-900 capitalize">{selectedNode.type?.replace("_", " ")} Settings</h3>
          <p className="text-xs text-gray-500 mt-0.5">ID: {selectedNode.id}</p>
        </div>
        <button 
          onClick={onClose}
          className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <X size={18} />
        </button>
      </div>
      
      <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">
        {renderForm()}
      </div>
    </div>
  );
}
