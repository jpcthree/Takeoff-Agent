import { useState, useCallback, useRef, useEffect } from 'react';

export interface CellPosition {
  row: number;
  col: number;
}

interface RowMeta {
  type: 'item' | 'header' | 'subtotal' | 'grandTotal';
  itemId?: string;
}

interface UseSpreadsheetKeyboardOptions {
  /** Flat list of row metadata in render order */
  rows: RowMeta[];
  /** Column definitions — need to know which are editable */
  columns: { key: string; editable?: boolean; type?: 'number' | 'text' }[];
  /** Callback when a cell should enter edit mode */
  onStartEdit: (itemId: string, colKey: string, initialChar?: string) => void;
  /** Callback when edit should be committed (Enter key while editing) */
  onCommitEdit: () => void;
  /** Callback when edit should be cancelled */
  onCancelEdit: () => void;
  /** Whether we're currently in edit mode */
  isEditing: boolean;
}

export function useSpreadsheetKeyboard({
  rows,
  columns,
  onStartEdit,
  onCommitEdit,
  onCancelEdit,
  isEditing,
}: UseSpreadsheetKeyboardOptions) {
  const [focusedCell, setFocusedCell] = useState<CellPosition | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  // Find all navigable (item) rows
  const getItemRows = useCallback(() => {
    return rows
      .map((r, i) => ({ ...r, index: i }))
      .filter((r) => r.type === 'item');
  }, [rows]);

  // Find next item row in a direction
  const findNextItemRow = useCallback(
    (currentRow: number, direction: 1 | -1): number | null => {
      let next = currentRow + direction;
      while (next >= 0 && next < rows.length) {
        if (rows[next].type === 'item') return next;
        next += direction;
      }
      return null;
    },
    [rows]
  );

  // Find next editable column
  const findNextEditableCol = useCallback(
    (currentCol: number, direction: 1 | -1): number | null => {
      let next = currentCol + direction;
      while (next >= 0 && next < columns.length) {
        if (columns[next].editable) return next;
        next += direction;
      }
      // Wrap to next/prev row
      return null;
    },
    [columns]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!focusedCell) return;

      const { row, col } = focusedCell;

      // If editing, only handle Enter, Escape, Tab
      if (isEditing) {
        if (e.key === 'Enter') {
          e.preventDefault();
          onCommitEdit();
          // Move focus down after commit
          const nextRow = findNextItemRow(row, 1);
          if (nextRow !== null) {
            setFocusedCell({ row: nextRow, col });
          }
        } else if (e.key === 'Escape') {
          e.preventDefault();
          onCancelEdit();
        } else if (e.key === 'Tab') {
          e.preventDefault();
          onCommitEdit();
          // Move to next editable cell
          const nextCol = findNextEditableCol(col, e.shiftKey ? -1 : 1);
          if (nextCol !== null) {
            setFocusedCell({ row, col: nextCol });
            const rowMeta = rows[row];
            if (rowMeta?.itemId) {
              setTimeout(() => onStartEdit(rowMeta.itemId!, columns[nextCol].key), 0);
            }
          } else {
            // Wrap to next row's first editable column
            const nextRow = findNextItemRow(row, e.shiftKey ? -1 : 1);
            if (nextRow !== null) {
              const firstEditable = e.shiftKey
                ? columns.length - 1 - [...columns].reverse().findIndex((c) => c.editable)
                : columns.findIndex((c) => c.editable);
              if (firstEditable >= 0) {
                setFocusedCell({ row: nextRow, col: firstEditable });
                const nextRowMeta = rows[nextRow];
                if (nextRowMeta?.itemId) {
                  setTimeout(() => onStartEdit(nextRowMeta.itemId!, columns[firstEditable].key), 0);
                }
              }
            }
          }
        }
        return;
      }

      // Navigation mode
      switch (e.key) {
        case 'ArrowUp': {
          e.preventDefault();
          const nextRow = findNextItemRow(row, -1);
          if (nextRow !== null) setFocusedCell({ row: nextRow, col });
          break;
        }
        case 'ArrowDown': {
          e.preventDefault();
          const nextRow = findNextItemRow(row, 1);
          if (nextRow !== null) setFocusedCell({ row: nextRow, col });
          break;
        }
        case 'ArrowLeft': {
          e.preventDefault();
          if (col > 0) setFocusedCell({ row, col: col - 1 });
          break;
        }
        case 'ArrowRight': {
          e.preventDefault();
          if (col < columns.length - 1) setFocusedCell({ row, col: col + 1 });
          break;
        }
        case 'Tab': {
          e.preventDefault();
          const nextCol = findNextEditableCol(col, e.shiftKey ? -1 : 1);
          if (nextCol !== null) {
            setFocusedCell({ row, col: nextCol });
          } else {
            const nextRow = findNextItemRow(row, e.shiftKey ? -1 : 1);
            if (nextRow !== null) {
              const firstEditable = e.shiftKey
                ? columns.length - 1 - [...columns].reverse().findIndex((c) => c.editable)
                : columns.findIndex((c) => c.editable);
              if (firstEditable >= 0) {
                setFocusedCell({ row: nextRow, col: firstEditable });
              }
            }
          }
          break;
        }
        case 'Enter': {
          e.preventDefault();
          const column = columns[col];
          const rowMeta = rows[row];
          if (column?.editable && rowMeta?.itemId) {
            onStartEdit(rowMeta.itemId, column.key);
          }
          break;
        }
        case 'Escape': {
          e.preventDefault();
          setFocusedCell(null);
          break;
        }
        default: {
          // Typing starts edit on editable cells
          // Digits/decimal for number columns, any printable char for text columns
          const column = columns[col];
          const rowMeta = rows[row];
          if (column?.editable && rowMeta?.itemId && e.key.length === 1) {
            const isNumber = column.type !== 'text';
            const isValidStart = isNumber
              ? /^[0-9.]$/.test(e.key)
              : /^[a-zA-Z0-9 .,\-/()#]$/.test(e.key);
            if (isValidStart) {
              e.preventDefault();
              onStartEdit(rowMeta.itemId, column.key, e.key);
            }
          }
          break;
        }
      }
    },
    [focusedCell, isEditing, rows, columns, findNextItemRow, findNextEditableCol, onStartEdit, onCommitEdit, onCancelEdit]
  );

  const handleCellClick = useCallback(
    (row: number, col: number) => {
      setFocusedCell({ row, col });
      // Focus the table container so keyboard events work
      tableRef.current?.focus();
    },
    []
  );

  // Re-focus table after edit commit
  useEffect(() => {
    if (!isEditing && focusedCell) {
      tableRef.current?.focus();
    }
  }, [isEditing, focusedCell]);

  return {
    focusedCell,
    setFocusedCell,
    handleKeyDown,
    handleCellClick,
    tableRef,
  };
}

export type { RowMeta };
