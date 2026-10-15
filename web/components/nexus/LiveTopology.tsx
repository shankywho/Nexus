"use client";

import React, { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import { TopologyData, TopologyNode, TopologyLink } from "@/lib/nexus/api";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-[#0a0a0a] text-zinc-500 font-mono text-xs">
      <Loader2 size={18} className="animate-spin mr-2 text-[#10b981]" />
      INITIALIZING TOPOLOGY ENGINE...
    </div>
  ),
});

export interface LiveTopologyProps {
  data: TopologyData;
  highlightIds?: string[];
  onNodeClick?: (node: TopologyNode) => void;
}

export function LiveTopology({ data, highlightIds = [], onNodeClick }: LiveTopologyProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<any>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth || 800,
          height: containerRef.current.clientHeight || 600,
        });
      }
    };
    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  const highlightSet = new Set(highlightIds);

  const isSuperseded = (link: any) => {
    return (
      link.status === "superseded" ||
      link.label === "SUPERSEDES" ||
      link.properties?.status === "superseded"
    );
  };

  const getNodeColor = (node: TopologyNode) => {
    if (highlightSet.has(node.id)) {
      return "#f59e0b"; // Highlighted gold/amber
    }
    const group = node.group || node.label || "";
    const status = node.properties?.status;
    if (group === "Decision") {
      return status === "superseded" ? "#ef4444" : "#10b981";
    }
    if (group === "Person") return "#3b82f6";
    if (group === "Service") return "#8b5cf6";
    if (group === "Ticket") return "#06b6d4";
    if (group === "Document") return "#ec4899";
    return "#71717a";
  };

  return (
    <div
      ref={containerRef}
      data-testid="live-topology-canvas"
      className="w-full h-full relative bg-[#0a0a0a] overflow-hidden select-none"
    >
      <ForceGraph2D
        ref={fgRef}
        width={dimensions.width}
        height={dimensions.height}
        graphData={data}
        backgroundColor="#0a0a0a"
        nodeId="id"
        nodeLabel={(node: any) => `${node.group || "Node"}: ${node.name || node.id}`}
        nodeColor={(node: any) => getNodeColor(node)}
        nodeRelSize={7}
        nodeCanvasObject={(node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
          const label = node.name || node.id;
          const fontSize = 11 / globalScale;
          ctx.font = `${fontSize}px JetBrains Mono, monospace`;

          const isHighlighted = highlightSet.has(node.id);
          const color = getNodeColor(node);

          // Node circle
          ctx.beginPath();
          ctx.arc(node.x, node.y, isHighlighted ? 8 : 6, 0, 2 * Math.PI, false);
          ctx.fillStyle = color;
          ctx.fill();

          if (isHighlighted) {
            ctx.lineWidth = 2 / globalScale;
            ctx.strokeStyle = "#ffffff";
            ctx.stroke();
          }

          // Node text label
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillStyle = isHighlighted ? "#f59e0b" : "#d4d4d8";
          ctx.fillText(label, node.x, node.y + (isHighlighted ? 13 : 11));
        }}
        linkColor={(link: any) => (isSuperseded(link) ? "#ef4444" : "#10b981")}
        linkLineDash={(link: any) => (isSuperseded(link) ? [4, 4] : null)}
        linkWidth={(link: any) => (isSuperseded(link) ? 2 : 1.5)}
        linkDirectionalArrowLength={4}
        linkDirectionalArrowRelPos={0.8}
        linkDirectionalArrowColor={(link: any) => (isSuperseded(link) ? "#ef4444" : "#10b981")}
        onNodeClick={(node: any) => onNodeClick && onNodeClick(node)}
        cooldownTicks={100}
      />
    </div>
  );
}
