"""
PDF to Images Converter for Construction Takeoff Agent

Converts construction blueprint PDFs into high-resolution PNG images
for analysis. Uses PyMuPDF (fitz) for rendering.
"""

import sys
import os
from typing import List, Optional
import fitz  # PyMuPDF


def pdf_to_images(
    pdf_path: str,
    output_dir: Optional[str] = None,
    dpi: int = 300,
    pages: Optional[List[int]] = None,
) -> List[str]:
    """
    Convert a PDF file to PNG images.

    Args:
        pdf_path: Path to the PDF file.
        output_dir: Directory for output images. Defaults to a folder
                    next to the PDF named '<stem>_pages/'.
        dpi: Resolution for rendering. 300 is good for blueprints.
        pages: Optional list of 0-based page indices. None = all pages.

    Returns:
        List of output image file paths.
    """
    if not os.path.isfile(pdf_path):
        raise FileNotFoundError(f"PDF not found: {pdf_path}")

    stem = os.path.splitext(os.path.basename(pdf_path))[0]

    if output_dir is None:
        output_dir = os.path.join(os.path.dirname(pdf_path), f"{stem}_pages")

    os.makedirs(output_dir, exist_ok=True)

    doc = fitz.open(pdf_path)
    zoom = dpi / 72.0
    matrix = fitz.Matrix(zoom, zoom)

    if pages is None:
        page_indices = range(len(doc))
    else:
        page_indices = [p for p in pages if 0 <= p < len(doc)]

    output_paths: List[str] = []

    for i in page_indices:
        page = doc[i]
        pix = page.get_pixmap(matrix=matrix, alpha=False)
        filename = f"{stem}_page_{i + 1:03d}.png"
        filepath = os.path.join(output_dir, filename)
        pix.save(filepath)
        output_paths.append(filepath)
        print(f"  Saved: {filepath} ({pix.width}x{pix.height})")

    doc.close()
    print(f"Converted {len(output_paths)} page(s) from {pdf_path}")
    return output_paths


def main():
    if len(sys.argv) < 2:
        print("Usage: python pdf_to_images.py <pdf_path> [output_dir] [dpi]")
        sys.exit(1)

    pdf_path = sys.argv[1]
    output_dir = sys.argv[2] if len(sys.argv) > 2 else None
    dpi = int(sys.argv[3]) if len(sys.argv) > 3 else 300

    pdf_to_images(pdf_path, output_dir=output_dir, dpi=dpi)


if __name__ == "__main__":
    main()
