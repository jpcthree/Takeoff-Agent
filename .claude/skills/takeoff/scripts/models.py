"""
Minimal LineItem dataclass for the export pipeline.

The full v1 BuildingModel + 30 sibling dataclasses were removed in the v2
restructure because the conversation-driven flow uses TypeScript types
instead. The Python side now only handles XLSX export, which depends on
this single LineItem shape.

Keep this in sync with the LineItemDict TypeScript interface in
takeoff-web/src/lib/api/python-service.ts.
"""

from __future__ import annotations
from dataclasses import dataclass, field, asdict
from typing import Any


@dataclass
class LineItem:
    trade: str
    category: str = ""
    description: str = ""
    quantity: float = 0.0
    unit: str = ""
    material_unit_cost: float = 0.0
    material_total: float = 0.0
    labor_hours: float = 0.0
    labor_rate: float = 0.0
    labor_total: float = 0.0
    line_total: float = 0.0
    code_requirement: str = ""
    sheets: int = 0

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "LineItem":
        """Build a LineItem from the LineItemDict shape sent by the frontend."""
        return cls(
            trade=data.get("trade", ""),
            category=data.get("category", ""),
            description=data.get("description", ""),
            quantity=float(data.get("quantity", 0) or 0),
            unit=data.get("unit", ""),
            material_unit_cost=float(data.get("material_unit_cost", 0) or 0),
            material_total=float(data.get("material_total", 0) or 0),
            labor_hours=float(data.get("labor_hours", 0) or 0),
            labor_rate=float(data.get("labor_rate", 0) or 0),
            labor_total=float(data.get("labor_total", 0) or 0),
            line_total=float(data.get("line_total", 0) or 0),
            code_requirement=data.get("code_requirement", "") or "",
            sheets=int(data.get("sheets", 0) or 0),
        )

    def calculate_totals(self) -> None:
        """Recompute material_total, labor_total, line_total from inputs.

        The frontend already sends pre-computed totals, but legacy callers
        construct LineItems field-by-field and rely on this. Cheap to call.
        """
        self.material_total = round(self.quantity * self.material_unit_cost, 2)
        self.labor_total = round(self.labor_hours * self.labor_rate, 2)
        self.line_total = round(self.material_total + self.labor_total, 2)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)
