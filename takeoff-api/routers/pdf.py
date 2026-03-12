"""
PDF endpoints — convert blueprint PDFs to page images.
"""

import base64
import os
import shutil
import tempfile

from fastapi import APIRouter, HTTPException, UploadFile, File

from pdf_to_images import pdf_to_images

router = APIRouter()


@router.post("/convert")
async def convert_pdf(file: UploadFile = File(...), dpi: int = 300):
    """
    Upload a PDF and convert it to PNG page images.

    Returns base64-encoded PNG images for each page.
    """
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="File must be a PDF")

    # Save uploaded file to a temp location
    tmp_dir = tempfile.mkdtemp()
    tmp_pdf = os.path.join(tmp_dir, file.filename)

    try:
        with open(tmp_pdf, "wb") as f:
            content = await file.read()
            f.write(content)

        # Convert PDF to images
        output_dir = os.path.join(tmp_dir, "pages")
        page_paths = pdf_to_images(tmp_pdf, output_dir=output_dir, dpi=dpi)

        # Encode each page as base64
        pages = []
        for i, page_path in enumerate(page_paths):
            with open(page_path, "rb") as img_file:
                b64 = base64.b64encode(img_file.read()).decode("utf-8")
                pages.append({
                    "page_number": i + 1,
                    "data": b64,
                    "mime_type": "image/png",
                    "filename": os.path.basename(page_path),
                })

        return {
            "filename": file.filename,
            "total_pages": len(pages),
            "dpi": dpi,
            "pages": pages,
        }

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"PDF conversion failed: {str(e)}",
        )
    finally:
        # Clean up temp files
        shutil.rmtree(tmp_dir, ignore_errors=True)


@router.post("/page-count")
async def get_page_count(file: UploadFile = File(...)):
    """Get the number of pages in a PDF without full conversion."""
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="File must be a PDF")

    tmp_dir = tempfile.mkdtemp()
    tmp_pdf = os.path.join(tmp_dir, file.filename)

    try:
        with open(tmp_pdf, "wb") as f:
            content = await file.read()
            f.write(content)

        import fitz
        doc = fitz.open(tmp_pdf)
        count = len(doc)
        doc.close()

        return {"filename": file.filename, "page_count": count}

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to read PDF: {str(e)}",
        )
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)
