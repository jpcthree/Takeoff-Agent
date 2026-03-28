"""
Export endpoints — generate .xlsx spreadsheets from line items.
"""

import base64
import os
import tempfile
from typing import Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from models import LineItem
from export_xlsx import export_estimate

router = APIRouter()


class NoteSection(BaseModel):
    title: str
    lines: list[str]


class ExportRequest(BaseModel):
    line_items: list[dict]
    project_name: str = ""
    project_address: str = ""
    notes: Optional[list[NoteSection]] = None
    insulation_notes: Optional[list[NoteSection]] = None
    images: Optional[dict[str, Optional[str]]] = None  # base64-encoded data URLs


def _decode_image(data_url: str, output_path: str) -> Optional[str]:
    """Decode a base64 data URL to a file. Returns the path or None."""
    if not data_url or not data_url.startswith("data:"):
        return None
    try:
        # data:image/jpeg;base64,/9j/4A...
        header, b64data = data_url.split(",", 1)
        raw = base64.b64decode(b64data)
        with open(output_path, "wb") as f:
            f.write(raw)
        return output_path
    except Exception:
        return None


def _notes_to_tuples(sections: list[NoteSection]) -> list[tuple[str, list[str]]]:
    """Convert NoteSection models to the tuple format export_estimate expects."""
    return [(s.title, s.lines) for s in sections]


@router.post("/xlsx")
async def export_xlsx(req: ExportRequest):
    """
    Convert line items to a formatted .xlsx file and return it as a download.
    Optionally includes notes sections and property images.
    """
    try:
        # Deserialize line items
        items = []
        for item_dict in req.line_items:
            item = LineItem.from_dict(item_dict)
            items.append(item)

        if not items:
            raise HTTPException(status_code=400, detail="No line items provided")

        # Generate the spreadsheet in a temp file
        tmp_dir = tempfile.mkdtemp()
        output_path = os.path.join(tmp_dir, f"{req.project_name or 'Estimate'}.xlsx")

        # Convert notes if provided
        notes_tuples = _notes_to_tuples(req.notes) if req.notes else None
        ins_notes_tuples = _notes_to_tuples(req.insulation_notes) if req.insulation_notes else None

        # Decode images if provided
        image_paths: Optional[dict[str, str]] = None
        if req.images:
            img_dir = os.path.join(tmp_dir, "images")
            os.makedirs(img_dir, exist_ok=True)
            image_paths = {}
            for key, data_url in req.images.items():
                if data_url:
                    ext = ".png" if "image/png" in (data_url[:30] if data_url else "") else ".jpg"
                    path = _decode_image(data_url, os.path.join(img_dir, f"{key}{ext}"))
                    if path:
                        image_paths[key] = path

        export_estimate(
            items,
            output_path,
            project_name=req.project_name,
            project_address=req.project_address,
            notes=notes_tuples,
            insulation_notes=ins_notes_tuples,
            images=image_paths if image_paths else None,
        )

        # Return as downloadable file
        filename = os.path.basename(output_path)
        return FileResponse(
            path=output_path,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            filename=filename,
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Export failed: {str(e)}",
        )
