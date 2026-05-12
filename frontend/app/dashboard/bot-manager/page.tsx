"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PlusCircle, Bot, Activity, MoreVertical, Edit2, Trash2, Copy, Eye, Folder, Search } from "lucide-react";

export default function BotManagerPage() {
  const [flows, setFlows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const savedFlows = JSON.parse(localStorage.getItem("bot_flows") || "[]");
    // Merge with the mock default if empty
    if (savedFlows.length === 0) {
      const mock = {
        id: "1098552",
        name: "zodiac",
        updatedAt: "2026-03-03T10:00:00Z",
        flow: { nodes: [], edges: [] }
      };
      savedFlows.push(mock);
      localStorage.setItem("bot_flows", JSON.stringify(savedFlows));
    }
    setFlows(savedFlows);
    setLoading(false);
  }, []);

  const handleDelete = (id: string) => {
    if (!confirm("Are you sure you want to delete this flow?")) return;
    const next = flows.filter(f => f.id !== id);
    setFlows(next);
    localStorage.setItem("bot_flows", JSON.stringify(next));
  };

  const handleDuplicate = (flow: any) => {
    const dupe = {
      ...flow,
      id: Math.random().toString(36).substr(2, 9),
      name: `${flow.name} (Copy)`,
      updatedAt: new Date().toISOString()
    };
    const next = [...flows, dupe];
    setFlows(next);
    localStorage.setItem("bot_flows", JSON.stringify(next));
  };

  const filtered = flows.filter(f => f.name?.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Bot className="w-6 h-6 text-[#2563EB]" />
            Bot Reply Settings
          </h1>
          <p className="text-gray-500 mt-1">Manage your WhatsApp bot flows and auto-replies</p>
        </div>
        <Link 
          href="/dashboard/bot-manager/create"
          className="flex items-center gap-2 bg-[#2563EB] text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
        >
          <PlusCircle className="w-5 h-5" />
          Create
        </Link>
      </div>
      
      {/* Toolbar */}
      <div className="flex gap-4 mb-6">
        <div className="relative">
          <select className="appearance-none pl-10 pr-8 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 outline-none focus:ring-2 focus:ring-[#2563EB]">
            <option>All Folders</option>
            <option>Marketing</option>
            <option>Support</option>
          </select>
          <Folder className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        </div>
        
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input 
            type="text" 
            placeholder="Search flows..." 
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#2563EB]"
          />
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-700 text-xs uppercase tracking-wider text-gray-500 font-semibold">
              <th className="py-4 px-6">#</th>
              <th className="py-4 px-6">Unique ID</th>
              <th className="py-4 px-6">Reference Name</th>
              <th className="py-4 px-6">Updated At</th>
              <th className="py-4 px-6 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="text-center py-8">Loading...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-8 text-gray-500">No bot flows found.</td></tr>
            ) : (
              filtered.map((flow, idx) => (
                <tr key={flow.id} className="border-b border-gray-50 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                  <td className="py-4 px-6 text-gray-500 font-medium">{idx + 1}</td>
                  <td className="py-4 px-6 font-mono text-xs text-gray-400">{flow.id}</td>
                  <td className="py-4 px-6 font-medium text-gray-900 dark:text-white">{flow.name}</td>
                  <td className="py-4 px-6 text-sm text-gray-500">
                    {new Date(flow.updatedAt).toLocaleString()}
                  </td>
                  <td className="py-4 px-6 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Link href={`/dashboard/bot-manager/${flow.id}`} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="View">
                        <Eye className="w-4 h-4" />
                      </Link>
                      <button onClick={() => handleDuplicate(flow)} className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors" title="Duplicate">
                        <Copy className="w-4 h-4" />
                      </button>
                      <Link href={`/dashboard/bot-manager/${flow.id}`} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Edit">
                        <Edit2 className="w-4 h-4" />
                      </Link>
                      <button onClick={() => handleDelete(flow.id)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Delete">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
