import type { ReactNode } from "react";

interface DataTableShellProps { ariaLabel: string; columns: ReactNode[]; children?: ReactNode; emptyState?: ReactNode; className?: string; }
interface DataTableRowProps { children: ReactNode; selected?: boolean; className?: string; }

export function DataTableShell({ ariaLabel, columns, children, emptyState = "No rows to show.", className = "" }: DataTableShellProps) {
  const hasRows = Boolean(children);
  return <div className={`ui-table-scroll ${className}`.trim()}><table className="ui-data-table" aria-label={ariaLabel}><thead><tr>{columns.map((column, index) => <th key={index} scope="col">{column}</th>)}</tr></thead><tbody>{hasRows ? children : <tr className="ui-table-empty"><td colSpan={columns.length}>{emptyState}</td></tr>}</tbody></table></div>;
}

export function DataTableRow({ children, selected = false, className = "" }: DataTableRowProps) {
  return <tr className={`ui-data-table-row ${className}`.trim()} data-state={selected ? "selected" : "default"}>{children}</tr>;
}
