import { useState } from "react"
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table"
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react"

/**
 * DataTable — tabla reutilizable del POS sobre TanStack Table.
 *
 * Headless: TanStack pone la lógica (orden por columna, filtro global), el CSS
 * lo ponemos con Tailwind + estilo Ferremex. Pensada para módulos con tablas de
 * datos que necesiten ordenar/filtrar (inventario, compras, ventas…).
 *
 * Uso:
 *   <DataTable columns={cols} data={rows} globalFilter={q} emptyMessage="…" />
 *
 * Para columnas con celdas editables o acciones, define `cell` en la ColumnDef
 * (recibe row.original). Marca `enableSorting:false` en columnas no ordenables
 * (ej. la de acciones).
 */
export function DataTable<T>({
  columns,
  data,
  globalFilter,
  emptyMessage = "Sin datos.",
  rowClassName,
}: {
  columns: ColumnDef<T, any>[]
  data: T[]
  globalFilter?: string
  emptyMessage?: string
  /** Clase extra por fila según su dato (ej. resaltar filas con cambios). */
  rowClassName?: (row: T) => string
}) {
  const [sorting, setSorting] = useState<SortingState>([])

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter: globalFilter ?? "" },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  })

  const rows = table.getRowModel().rows

  return (
    <table className="w-full border-collapse">
      <thead className="sticky top-0 z-10 bg-gray-50">
        {table.getHeaderGroups().map((hg) => (
          <tr key={hg.id} className="border-b-2 border-gray-200">
            {hg.headers.map((header) => {
              const canSort = header.column.getCanSort()
              const sorted = header.column.getIsSorted()
              return (
                <th
                  key={header.id}
                  onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                  className={`py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide text-left
                    ${canSort ? "cursor-pointer select-none hover:text-gray-700" : ""}`}
                  style={{ width: header.getSize() !== 150 ? header.getSize() : undefined }}
                >
                  <span className="inline-flex items-center gap-1.5">
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {canSort && (
                      sorted === "asc" ? <ChevronUp size={13} />
                      : sorted === "desc" ? <ChevronDown size={13} />
                      : <ChevronsUpDown size={13} className="opacity-30" />
                    )}
                  </span>
                </th>
              )
            })}
          </tr>
        ))}
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={columns.length} className="py-8 text-center text-sm text-gray-400">
              {emptyMessage}
            </td>
          </tr>
        ) : (
          rows.map((row) => (
            <tr
              key={row.id}
              className={`border-b border-gray-100 hover:bg-gray-50 ${rowClassName?.(row.original) ?? ""}`}
            >
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className="py-3 px-4 text-sm text-gray-900">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))
        )}
      </tbody>
    </table>
  )
}
