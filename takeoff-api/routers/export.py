"""
Export endpoints — generate .xlsx spreadsheets from line items.
"""

import os
import tempfile

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from models import LineItem
from export_xlsx import export_estimate

router = APIRouter()


class ExportRequest(BaseModel):
    line_items: list[dict]
    project_name: str = ""
    project_address: str = ""


@router.post("/xlsx")
async def export_xlsx(req: ExportRequest):
    """
    Convert line items to a formatted .xlsx file and return it as a download.
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

        export_estimate(
            items,
            output_path,
            project_name=req.project_name,
            project_address=req.project_address,
        )

        # Return as downloadable file
        filename = os.path.basename(output_path)
        return FileResponse(
            path=output_path,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            filename=filename,
            # Note: temp file cleanup happens when the response is sent
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Export failed: {str(e)}",
        )
