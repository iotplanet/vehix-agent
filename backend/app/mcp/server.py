"""MCP tool registry with decorator-based registration.

Tools are registered with name, async function, JSON Schema.
The registry is callable by both the LangGraph executor (in-process)
and exposable via SSE for external MCP clients.
"""

import inspect
from typing import Any, Callable, Optional

from pydantic import BaseModel


class ToolDef(BaseModel):
    name: str
    description: str
    parameters: dict
    approval_required: bool = False
    fn: Optional[Callable] = None

    model_config = {"arbitrary_types_allowed": True}


class ToolRegistry:
    """Registry for MCP-compatible tools."""

    def __init__(self):
        self._tools: dict[str, ToolDef] = {}

    def register(self, name: str, fn: Callable, description: str,
                 parameters: dict, approval_required: bool = False):
        self._tools[name] = ToolDef(
            name=name, description=description, parameters=parameters,
            approval_required=approval_required, fn=fn,
        )

    def tool(self, name: str | None = None, description: str = "",
             approval_required: bool = False):
        """Decorator to register a tool function with auto-generated schema."""

        def decorator(fn: Callable):
            sig = inspect.signature(fn)
            props = {}
            required = []
            for pname, param in sig.parameters.items():
                type_map = {int: "integer", float: "number", bool: "boolean",
                            list: "array", dict: "object", str: "string"}
                ptype = "string"
                if param.annotation in type_map:
                    ptype = type_map[param.annotation]
                props[pname] = {"type": ptype}
                if param.default is inspect.Parameter.empty:
                    required.append(pname)

            tool_name = name or fn.__name__
            self.register(
                name=tool_name, fn=fn,
                description=description or (fn.__doc__ or "").strip(),
                parameters={"type": "object", "properties": props, "required": required},
                approval_required=approval_required,
            )
            return fn

        return decorator

    def get(self, name: str) -> ToolDef | None:
        return self._tools.get(name)

    async def call(self, name: str, **kwargs) -> Any:
        """Call a registered tool by name."""
        tool = self._tools.get(name)
        if not tool or not tool.fn:
            return {"error": f"Unknown tool: {name}"}
        try:
            return await tool.fn(**kwargs)
        except Exception as e:
            return {"error": str(e)}

    def to_openai_tools(self) -> list[dict]:
        """Export tools as OpenAI-compatible function definitions."""
        return [
            {"type": "function", "function": {
                "name": t.name, "description": t.description,
                "parameters": t.parameters,
            }}
            for t in self._tools.values()
        ]

    def list_tools(self) -> list[dict]:
        return [
            {"name": t.name, "description": t.description,
             "approval_required": t.approval_required}
            for t in self._tools.values()
        ]


# Global registry
tool_registry = ToolRegistry()
