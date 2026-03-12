"""
Calculate endpoints — run trade calculators against a BuildingModel.
"""

import json
import os
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from models import BuildingModel, LineItem

# Import all 9 trade calculators
from calc_framing import calculate_framing
from calc_insulation import calculate_insulation
from calc_drywall import calculate_drywall
from calc_roofing import calculate_roofing
from calc_hvac import calculate_hvac
from calc_electrical import calculate_electrical
from calc_plumbing import calculate_plumbing
from calc_exterior import calculate_exterior
from calc_interior import calculate_interior

router = APIRouter()

# Map trade names to calculator functions
CALCULATORS = {
    "framing": calculate_framing,
    "insulation": calculate_insulation,
    "drywall": calculate_drywall,
    "roofing": calculate_roofing,
    "hvac": calculate_hvac,
    "electrical": calculate_electrical,
    "plumbing": calculate_plumbing,
    "exterior": calculate_exterior,
    "interior": calculate_interior,
}

# Default costs loaded once at startup
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
COSTS_PATH = os.path.join(PROJECT_ROOT, "config", "default_costs.json")

with open(COSTS_PATH) as f:
    DEFAULT_COSTS = json.load(f)


class CalculateRequest(BaseModel):
    building_model: dict
    costs: Optional[dict] = None  # If None, use default costs


class CalculateResponse(BaseModel):
    trade: str
    items: list[dict]
    count: int


class CalculateAllResponse(BaseModel):
    items: list[dict]
    count: int
    trades: list[str]


def _run_calculator(trade: str, building: BuildingModel, costs: dict) -> list[dict]:
    """Run a single trade calculator and return serialized LineItems."""
    calc_fn = CALCULATORS.get(trade)
    if not calc_fn:
        raise HTTPException(status_code=400, detail=f"Unknown trade: {trade}")

    try:
        line_items: list[LineItem] = calc_fn(building, costs)
        return [item.to_dict() for item in line_items]
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Calculator error for {trade}: {str(e)}",
        )


@router.post("/all", response_model=CalculateAllResponse)
async def calculate_all(req: CalculateRequest):
    """Run ALL 9 trade calculators and return combined line items."""
    costs = req.costs or DEFAULT_COSTS

    try:
        building = BuildingModel.from_dict(req.building_model)
    except Exception as e:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid building model: {str(e)}",
        )

    all_items = []
    trades_run = []

    for trade, calc_fn in CALCULATORS.items():
        try:
            items = calc_fn(building, costs)
            all_items.extend([item.to_dict() for item in items])
            if items:
                trades_run.append(trade)
        except Exception as e:
            # Log but don't fail the whole request for one trade
            print(f"Warning: {trade} calculator failed: {e}")
            continue

    return CalculateAllResponse(
        items=all_items,
        count=len(all_items),
        trades=trades_run,
    )


@router.post("/{trade}", response_model=CalculateResponse)
async def calculate_trade(trade: str, req: CalculateRequest):
    """Run a single trade calculator."""
    if trade not in CALCULATORS:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown trade: {trade}. Available: {list(CALCULATORS.keys())}",
        )

    costs = req.costs or DEFAULT_COSTS

    try:
        building = BuildingModel.from_dict(req.building_model)
    except Exception as e:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid building model: {str(e)}",
        )

    items = _run_calculator(trade, building, costs)
    return CalculateResponse(trade=trade, items=items, count=len(items))


@router.get("/trades")
async def list_trades():
    """List all available trade calculators."""
    return {"trades": list(CALCULATORS.keys())}
