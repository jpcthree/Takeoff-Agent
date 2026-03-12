"""
Spreadsheet Export for Construction Takeoff Agent

Writes a list of LineItem objects to a formatted .xlsx workbook
organized by trade, with summary totals.
"""

from __future__ import annotations

import os
from collections import defaultdict
from openpyxl import Workbook
from openpyxl.styles import Font, Alignment, Border, Side, PatternFill, numbers
from openpyxl.utils import get_column_letter

from models import LineItem


# ---------------------------------------------------------------------------
# Styles
# ---------------------------------------------------------------------------

_HEADER_FONT = Font(name="Calibri", bold=True, size=11, color="FFFFFF")
_HEADER_FILL = PatternFill(start_color="2F5496", end_color="2F5496", fill_type="solid")
_HEADER_ALIGN = Alignment(horizontal="center", vertical="center", wrap_text=True)

_TRADE_FONT = Font(name="Calibri", bold=True, size=12, color="1F3864")
_TRADE_FILL = PatternFill(start_color="D6E4F0", end_color="D6E4F0", fill_type="solid")

_SUBTOTAL_FONT = Font(name="Calibri", bold=True, size=11)
_SUBTOTAL_FILL = PatternFill(start_color="E2EFDA", end_color="E2EFDA", fill_type="solid")

_GRAND_TOTAL_FONT = Font(name="Calibri", bold=True, size=12, color="FFFFFF")
_GRAND_TOTAL_FILL = PatternFill(start_color="1F3864", end_color="1F3864", fill_type="solid")

_CURRENCY_FMT = '"$"#,##0.00'
_NUMBER_FMT = '#,##0.00'
_PERCENT_FMT = '0.0%'
_THIN_BORDER = Border(
    left=Side(style="thin", color="B4C6E7"),
    right=Side(style="thin", color="B4C6E7"),
    top=Side(style="thin", color="B4C6E7"),
    bottom=Side(style="thin", color="B4C6E7"),
)

_INPUT_FILL = PatternFill(start_color="FFF2CC", end_color="FFF2CC", fill_type="solid")  # light orange

# Manual-input columns (1-indexed): E=Unit Cost, H=Labor Rate, L=Unit Price
_INPUT_COLUMNS = {5, 8, 12}

_COLUMNS = [
    ("Category", 20),                   # A  (1)
    ("Description", 40),                # B  (2)
    ("Qty", 10),                        # C  (3)
    ("Unit", 8),                        # D  (4)
    ("Unit Cost", 14),                  # E  (5)  ← manual input
    ("Material Total", 14),             # F  (6)
    ("Material %", 12),                 # G  (7)
    ("Labor Rate", 12),                 # H  (8)  ← manual input (%)
    ("Labor Total", 14),                # I  (9)
    ("Labor %", 12),                    # J  (10)
    ("Labor + Materials Cost", 22),     # K  (11)
    ("Unit Price", 14),                 # L  (12) ← manual input
    ("Amount", 14),                     # M  (13)
    ("Gross Profit", 14),               # N  (14)
    ("GPM", 10),                        # O  (15)
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _apply_cell_style(cell, font=None, fill=None, alignment=None, fmt=None, border=None):
    if font:
        cell.font = font
    if fill:
        cell.fill = fill
    if alignment:
        cell.alignment = alignment
    if fmt:
        cell.number_format = fmt
    if border:
        cell.border = border


def _write_header_row(ws, row: int):
    for col_idx, (title, width) in enumerate(_COLUMNS, start=1):
        cell = ws.cell(row=row, column=col_idx, value=title)
        _apply_cell_style(cell, _HEADER_FONT, _HEADER_FILL, _HEADER_ALIGN, border=_THIN_BORDER)
        ws.column_dimensions[get_column_letter(col_idx)].width = width


def _write_line_item(ws, row: int, item: LineItem):
    # A=Category, B=Description, C=Qty, D=Unit, E=Unit Cost, F=Material Total,
    # G=Material %, H=Labor Rate (%), I=Labor Total, J=Labor %, K=L+M Cost,
    # L=Unit Price, M=Amount, N=Gross Profit, O=GPM
    r = row
    values = [
        item.category,                          # A (1)
        item.description,                       # B (2)
        item.quantity,                          # C (3)
        item.unit,                              # D (4)
        0,                                      # E (5) Unit Cost — manual input
        f"=C{r}*E{r}",                         # F (6) Material Total
        f'=IF(M{r}=0,"",F{r}/M{r})',           # G (7) Material %
        0,                                      # H (8) Labor Rate — manual input (%)
        f"=H{r}*M{r}",                         # I (9) Labor Total = Labor Rate × Amount
        f'=IF(M{r}=0,"",I{r}/M{r})',           # J (10) Labor %
        f"=F{r}+I{r}",                         # K (11) Labor + Materials Cost
        0,                                      # L (12) Unit Price — manual input
        f"=C{r}*L{r}",                         # M (13) Amount
        f"=M{r}-K{r}",                         # N (14) Gross Profit
        f'=IF(M{r}=0,"",N{r}/M{r})',           # O (15) GPM
    ]
    for col_idx, val in enumerate(values, start=1):
        cell = ws.cell(row=row, column=col_idx, value=val)
        cell.border = _THIN_BORDER
        cell.alignment = Alignment(vertical="center")
        # Orange fill for manual-input columns
        if col_idx in _INPUT_COLUMNS:
            cell.fill = _INPUT_FILL
        # Number formats
        if col_idx in (5, 6, 9, 11, 12, 13, 14):
            cell.number_format = _CURRENCY_FMT
        elif col_idx == 3:
            cell.number_format = _NUMBER_FMT
        elif col_idx in (7, 8, 10, 15):
            cell.number_format = _PERCENT_FMT


def _write_subtotal_row(ws, row: int, trade: str, mat_total: float, lab_total: float,
                        grand: float, first_data_row: int = 0, last_data_row: int = 0):
    # New layout: F=MatTotal, I=LabTotal, K=L+MCost, M=Amount, N=GrossProfit
    cell = ws.cell(row=row, column=1, value=f"{trade} Subtotal")
    _apply_cell_style(cell, _SUBTOTAL_FONT, _SUBTOTAL_FILL, border=_THIN_BORDER)
    for col_idx in range(2, 6):
        c = ws.cell(row=row, column=col_idx)
        _apply_cell_style(c, fill=_SUBTOTAL_FILL, border=_THIN_BORDER)

    if first_data_row > 0 and last_data_row > 0:
        fr, lr = first_data_row, last_data_row
        formulas = [
            (6,  f"=SUM(F{fr}:F{lr})"),     # Material Total
            (9,  f"=SUM(I{fr}:I{lr})"),     # Labor Total
            (11, f"=SUM(K{fr}:K{lr})"),     # Labor + Materials Cost
            (13, f"=SUM(M{fr}:M{lr})"),     # Amount
            (14, f"=SUM(N{fr}:N{lr})"),     # Gross Profit
        ]
    else:
        formulas = [
            (6, mat_total), (9, lab_total), (11, grand),
            (13, grand), (14, 0),
        ]
    for col_idx, val in formulas:
        c = ws.cell(row=row, column=col_idx, value=val)
        _apply_cell_style(c, _SUBTOTAL_FONT, _SUBTOTAL_FILL, fmt=_CURRENCY_FMT, border=_THIN_BORDER)

    # Material % = Material Total / Amount
    c = ws.cell(row=row, column=7, value=f'=IF(M{row}=0,"",F{row}/M{row})')
    _apply_cell_style(c, _SUBTOTAL_FONT, _SUBTOTAL_FILL, fmt=_PERCENT_FMT, border=_THIN_BORDER)

    # Labor % = Labor Total / Amount
    c = ws.cell(row=row, column=10, value=f'=IF(M{row}=0,"",I{row}/M{row})')
    _apply_cell_style(c, _SUBTOTAL_FONT, _SUBTOTAL_FILL, fmt=_PERCENT_FMT, border=_THIN_BORDER)

    # GPM = Gross Profit / Amount
    c = ws.cell(row=row, column=15, value=f'=IF(M{row}=0,"",N{row}/M{row})')
    _apply_cell_style(c, _SUBTOTAL_FONT, _SUBTOTAL_FILL, fmt=_PERCENT_FMT, border=_THIN_BORDER)

    # Fill remaining cells (no formula, just styled)
    for col_idx in (8, 12):
        c = ws.cell(row=row, column=col_idx)
        _apply_cell_style(c, fill=_SUBTOTAL_FILL, border=_THIN_BORDER)


# ---------------------------------------------------------------------------
# Main export
# ---------------------------------------------------------------------------

def export_estimate(
    line_items: list[LineItem],
    output_path: str,
    project_name: str = "",
    project_address: str = "",
) -> str:
    """
    Export line items to a formatted .xlsx workbook.

    Args:
        line_items: All LineItem objects from all trade calculators.
        output_path: Path for the output .xlsx file.
        project_name: Optional project name for the title sheet.
        project_address: Optional address for the title sheet.

    Returns:
        The output file path.
    """
    wb = Workbook()

    # Remove the default blank sheet created by Workbook()
    wb.remove(wb.active)

    # ---- Per-trade sheets (first) ----
    by_trade = _group_by_trade(line_items)
    for trade, items in by_trade.items():
        safe_name = trade.replace("/", "-")[:31]  # Excel sheet name limit
        ws_trade = wb.create_sheet(safe_name)
        _build_trade_sheet(ws_trade, trade, items)

    # ---- Detail sheet (last) ----
    ws_detail = wb.create_sheet("Detail")
    _build_detail_sheet(ws_detail, line_items)

    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    wb.save(output_path)
    return output_path


def _group_by_trade(items: list[LineItem]) -> dict[str, list[LineItem]]:
    groups: dict[str, list[LineItem]] = defaultdict(list)
    for item in items:
        groups[item.trade].append(item)
    return dict(groups)


def _build_summary_sheet(ws, items: list[LineItem], project_name: str, address: str):
    """High-level summary: one row per trade with totals."""
    # Title
    ws.merge_cells("A1:D1")
    title_cell = ws.cell(row=1, column=1, value="Construction Cost Estimate")
    _apply_cell_style(title_cell, Font(name="Calibri", bold=True, size=16, color="1F3864"))

    row = 2
    if project_name:
        ws.cell(row=row, column=1, value="Project:").font = Font(bold=True)
        ws.cell(row=row, column=2, value=project_name)
        row += 1
    if address:
        ws.cell(row=row, column=1, value="Address:").font = Font(bold=True)
        ws.cell(row=row, column=2, value=address)
        row += 1

    row += 1

    # Summary table header
    headers = ["Trade", "Material Cost", "Labor Cost", "Trade Total"]
    widths = [25, 18, 18, 18]
    for col_idx, (h, w) in enumerate(zip(headers, widths), start=1):
        cell = ws.cell(row=row, column=col_idx, value=h)
        _apply_cell_style(cell, _HEADER_FONT, _HEADER_FILL, _HEADER_ALIGN, border=_THIN_BORDER)
        ws.column_dimensions[get_column_letter(col_idx)].width = w

    row += 1
    by_trade = _group_by_trade(items)
    grand_mat = 0.0
    grand_lab = 0.0
    grand_total = 0.0

    for trade, trade_items in by_trade.items():
        mat = sum(i.material_total for i in trade_items)
        lab = sum(i.labor_total for i in trade_items)
        total = sum(i.line_total for i in trade_items)
        grand_mat += mat
        grand_lab += lab
        grand_total += total

        ws.cell(row=row, column=1, value=trade.title()).border = _THIN_BORDER
        for col_idx, val in [(2, mat), (3, lab), (4, total)]:
            c = ws.cell(row=row, column=col_idx, value=val)
            _apply_cell_style(c, fmt=_CURRENCY_FMT, border=_THIN_BORDER)
        row += 1

    # Grand total row
    ws.cell(row=row, column=1, value="GRAND TOTAL")
    _apply_cell_style(ws.cell(row=row, column=1), _GRAND_TOTAL_FONT, _GRAND_TOTAL_FILL, border=_THIN_BORDER)
    for col_idx, val in [(2, grand_mat), (3, grand_lab), (4, grand_total)]:
        c = ws.cell(row=row, column=col_idx, value=val)
        _apply_cell_style(c, _GRAND_TOTAL_FONT, _GRAND_TOTAL_FILL, fmt=_CURRENCY_FMT, border=_THIN_BORDER)


def _build_detail_sheet(ws, items: list[LineItem]):
    """All line items grouped by trade on one sheet."""
    _write_header_row(ws, 1)
    row = 2
    by_trade = _group_by_trade(items)

    subtotal_rows = []  # track subtotal row numbers for grand total Amount formula

    for trade, trade_items in by_trade.items():
        # Trade header row
        cell = ws.cell(row=row, column=1, value=trade.upper())
        _apply_cell_style(cell, _TRADE_FONT, _TRADE_FILL, border=_THIN_BORDER)
        for col_idx in range(2, len(_COLUMNS) + 1):
            _apply_cell_style(ws.cell(row=row, column=col_idx), fill=_TRADE_FILL, border=_THIN_BORDER)
        row += 1

        first_data_row = row
        mat_total = 0.0
        lab_total = 0.0
        line_total = 0.0
        for item in trade_items:
            _write_line_item(ws, row, item)
            mat_total += item.material_total
            lab_total += item.labor_total
            line_total += item.line_total
            row += 1
        last_data_row = row - 1

        _write_subtotal_row(ws, row, trade.title(), mat_total, lab_total, line_total,
                            first_data_row, last_data_row)
        subtotal_rows.append(row)
        row += 2  # blank row between trades

    # Grand total
    grand_mat = sum(i.material_total for i in items)
    grand_lab = sum(i.labor_total for i in items)
    grand_total = sum(i.line_total for i in items)

    cell = ws.cell(row=row, column=1, value="GRAND TOTAL")
    _apply_cell_style(cell, _GRAND_TOTAL_FONT, _GRAND_TOTAL_FILL, border=_THIN_BORDER)
    for col_idx in range(2, 6):
        _apply_cell_style(ws.cell(row=row, column=col_idx), fill=_GRAND_TOTAL_FILL, border=_THIN_BORDER)
    # Grand total formulas — sum subtotal rows: F=MatTotal, I=LabTotal, K=L+MCost, M=Amount, N=GP
    for col_idx, col_letter in [(6, "F"), (9, "I"), (11, "K"), (13, "M"), (14, "N")]:
        refs = "+".join(f"{col_letter}{r}" for r in subtotal_rows)
        c = ws.cell(row=row, column=col_idx, value=f"={refs}")
        _apply_cell_style(c, _GRAND_TOTAL_FONT, _GRAND_TOTAL_FILL, fmt=_CURRENCY_FMT, border=_THIN_BORDER)
    # Material % grand total
    c = ws.cell(row=row, column=7, value=f'=IF(M{row}=0,"",F{row}/M{row})')
    _apply_cell_style(c, _GRAND_TOTAL_FONT, _GRAND_TOTAL_FILL, fmt=_PERCENT_FMT, border=_THIN_BORDER)
    # Labor % grand total
    c = ws.cell(row=row, column=10, value=f'=IF(M{row}=0,"",I{row}/M{row})')
    _apply_cell_style(c, _GRAND_TOTAL_FONT, _GRAND_TOTAL_FILL, fmt=_PERCENT_FMT, border=_THIN_BORDER)
    # GPM grand total
    c = ws.cell(row=row, column=15, value=f'=IF(M{row}=0,"",N{row}/M{row})')
    _apply_cell_style(c, _GRAND_TOTAL_FONT, _GRAND_TOTAL_FILL, fmt=_PERCENT_FMT, border=_THIN_BORDER)
    # Fill remaining cells
    for col_idx in (8, 12):
        _apply_cell_style(ws.cell(row=row, column=col_idx), fill=_GRAND_TOTAL_FILL, border=_THIN_BORDER)


def _build_trade_sheet(ws, trade: str, items: list[LineItem]):
    """Individual trade sheet with just that trade's items."""
    # Trade title
    ws.merge_cells("A1:D1")
    title = ws.cell(row=1, column=1, value=f"{trade.title()} Estimate")
    _apply_cell_style(title, Font(name="Calibri", bold=True, size=14, color="1F3864"))

    _write_header_row(ws, 3)
    row = 4
    first_data_row = row

    mat_total = 0.0
    lab_total = 0.0
    line_total = 0.0
    for item in items:
        _write_line_item(ws, row, item)
        mat_total += item.material_total
        lab_total += item.labor_total
        line_total += item.line_total
        row += 1
    last_data_row = row - 1

    row += 1
    _write_subtotal_row(ws, row, trade.title(), mat_total, lab_total, line_total,
                        first_data_row, last_data_row)
