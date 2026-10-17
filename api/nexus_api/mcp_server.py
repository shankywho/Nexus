"""NEXUS MCP Server exposing graph tools via Model Context Protocol (Track 01 & 02)."""

import logging
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException
from mcp.server.mcpserver import MCPServer

from nexus_api.agents.tools import (
    TOOL_DEFINITIONS,
    TOOLS_BY_NAME,
    blast_radius,
    criticality_rank,
    decision_trace,
    find_experts,
    find_implicated_decisions,
    flag_decision_for_review,
    open_ticket,
    page_owner,
    recall,
    remember,
    who_owns,
)
from nexus_api.config import get_settings

logger = logging.getLogger(__name__)

# Official MCPServer instance
mcp_server = MCPServer("nexus-mcp")

# Register tools with the official MCP server
mcp_server.tool(name="blast_radius", description="Calculate upstream affected services in dependency graph")(
    blast_radius
)
mcp_server.tool(
    name="find_implicated_decisions", description="Find live decisions affecting a service or its dependencies"
)(find_implicated_decisions)
mcp_server.tool(name="who_owns", description="Look up owner team, maintainers, and domain experts")(who_owns)
mcp_server.tool(name="decision_trace", description="Trace multi-hop decision causality and supersession chains")(
    decision_trace
)
mcp_server.tool(name="criticality_rank", description="Run PageRank and betweenness centrality over Service graph")(
    criticality_rank
)
mcp_server.tool(name="find_experts", description="Identify key maintainers and bus factor for a service")(find_experts)
mcp_server.tool(name="recall", description="Search episodic memory and procedural playbooks")(recall)
mcp_server.tool(name="remember", description="Store an incident episode and procedural playbook")(remember)
mcp_server.tool(name="open_ticket", description="Create an automated remediation ticket in the graph")(open_ticket)
mcp_server.tool(name="page_owner", description="Dispatch an urgent page to service maintainer")(page_owner)
mcp_server.tool(
    name="flag_decision_for_review", description="Flag an implicated or stale decision for review"
)(flag_decision_for_review)

# FastAPI Router for HTTP / SSE client access
router = APIRouter(prefix="/api/mcp", tags=["mcp"])


def verify_mcp_auth(authorization: str | None = Header(None)) -> bool:
    """Optional bearer token validation matching ADMIN_TOKEN."""
    settings = get_settings()
    if not settings.ADMIN_TOKEN or settings.ADMIN_TOKEN == "change-me":
        return True
    if not authorization:
        return True  # Allow local read-only discovery
    token = authorization.replace("Bearer ", "").strip()
    return token == settings.ADMIN_TOKEN


@router.get("/tools")
def list_mcp_tools(_: bool = Depends(verify_mcp_auth)) -> dict[str, Any]:
    """MCP Tool Discovery: list all registered graph tools and their input schemas."""
    return {
        "tools": TOOL_DEFINITIONS,
        "count": len(TOOL_DEFINITIONS),
        "server": "nexus-mcp",
    }


@router.post("/tools/call")
def call_mcp_tool(payload: dict[str, Any], _: bool = Depends(verify_mcp_auth)) -> dict[str, Any]:
    """Execute an MCP tool call."""
    tool_name = payload.get("tool") or payload.get("name")
    args = payload.get("args") or payload.get("parameters") or {}

    if not tool_name or tool_name not in TOOLS_BY_NAME:
        raise HTTPException(status_code=404, detail=f"Tool '{tool_name}' not found. Available: {list(TOOLS_BY_NAME.keys())}")

    fn = TOOLS_BY_NAME[tool_name]
    try:
        output = fn(**args)
        return {
            "tool": tool_name,
            "status": "success",
            "content": output,
        }
    except Exception as exc:
        logger.error("Error executing MCP tool %s: %s", tool_name, exc)
        raise HTTPException(status_code=500, detail=str(exc))
