/**
 * TanStack Table stays headless and this renders what it hands back;
 * columns, filters and copy belong to the screen. Manual mode throughout:
 * the server filters, sorts and pages, so the table is told the row count.
 */
import {
  columnVisibilityFeature,
  rowPaginationFeature,
  tableFeatures,
  useTable,
  type ColumnDef,
  type RowData,
} from "@tanstack/react-table";
import type * as React from "react";

import { Skeleton } from "./skeleton.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./table.tsx";

// v9 tree-shakes anything unregistered, including the APIs that read cells:
// `getVisibleCells` comes from the visibility feature.
const features = tableFeatures({ columnVisibilityFeature, rowPaginationFeature });

export type DataTableFeatures = typeof features;

const DEFAULT_SKELETON_ROWS = [
  "row-1",
  "row-2",
  "row-3",
  "row-4",
  "row-5",
  "row-6",
  "row-7",
  "row-8",
] as const;

export interface DataTableProps<TData extends RowData> {
  columns: ColumnDef<DataTableFeatures, TData>[];
  data: TData[];
  empty: React.ReactNode;
  loading?: boolean;
  skeletonRows?: number;
  /** The screen decides what opening a row means. */
  onRowClick?: (row: TData) => void;
}

export function DataTable<TData extends RowData>({
  columns,
  data,
  empty,
  loading = false,
  skeletonRows = 8,
  onRowClick,
}: DataTableProps<TData>) {
  const table = useTable({ features, data, columns, manualPagination: true });
  const visibleColumns = table.getVisibleLeafColumns();
  const firstColumn = visibleColumns[0]?.id;
  const skeletonRowIds =
    skeletonRows === DEFAULT_SKELETON_ROWS.length
      ? DEFAULT_SKELETON_ROWS
      : Array.from({ length: skeletonRows }, (_, row) => `row-${row + 1}`);

  return (
    // `shrink-0` is load-bearing: this wrapper clips for its rounded border,
    // so shrinking slices the last row instead of scrolling.
    <div className="shrink-0 overflow-hidden rounded-md border">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id}>
                  {!header.isPlaceholder && <table.FlexRender header={header} />}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {/* Three bodies, one at a time: skeletons while loading, the
              empty sentence when a finished query has no rows, and the
              rows themselves. Each condition names its own case. */}
          {loading &&
            skeletonRowIds.map((row) => (
              <TableRow key={row}>
                {visibleColumns.map((column) => (
                  <TableCell key={column.id}>
                    <Skeleton
                      className={column.id === firstColumn ? "h-5 w-3/4" : "h-5 w-full"}
                    />
                  </TableCell>
                ))}
              </TableRow>
            ))}

          {!loading && table.getRowModel().rows.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="h-24 text-center text-muted-foreground"
              >
                {empty}
              </TableCell>
            </TableRow>
          )}

          {!loading &&
            table.getRowModel().rows.length > 0 &&
            table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                className={onRowClick ? "cursor-pointer" : undefined}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    <table.FlexRender cell={cell} />
                  </TableCell>
                ))}
              </TableRow>
            ))}
        </TableBody>
      </Table>
    </div>
  );
}
