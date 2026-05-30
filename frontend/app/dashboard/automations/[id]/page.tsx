"use client";
import { useParams } from "next/navigation";
import FlowEditor from "./flow/FlowEditor";

export default function BotFlowEditorPage() {
  const { id } = useParams<{ id: string }>();
  return <FlowEditor flowId={id} />;
}
