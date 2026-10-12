import { Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormError } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useIsDesktop } from "@/hooks/useMediaQuery";
import type { ContactImportRow } from "@/types/guest.types";
import type { GuestCategory } from "@/types/guest.types";

export interface RowErrors {
  name?: string;
  mobile?: string;
}

interface ContactImportReviewTableProps {
  rows: ContactImportRow[];
  rowErrors?: Record<string, RowErrors>;
  categories: GuestCategory[];
  onChange: (localId: string, field: keyof ContactImportRow, value: string | number | null) => void;
  onRemove: (localId: string) => void;
}

/**
 * Editable review of contacts before the bulk import. A table from md: up,
 * stacked cards on phones (a 720px-wide table forces sideways scrolling
 * there). Every field maps 1:1 to ContactImportRowSerializer on the backend.
 * Only ONE layout is mounted at a time.
 */
export default function ContactImportReviewTable({
  rows,
  rowErrors = {},
  categories,
  onChange,
  onRemove,
}: ContactImportReviewTableProps) {
  const isDesktop = useIsDesktop();

  if (rows.length === 0) {
    return <p className="rounded-2xl border border-dashed border-slate-200 py-8 text-center text-sm text-slate-500">
        No contacts selected yet.
      </p>;
  }

  const categoryValue = (row: ContactImportRow) => row.category ?? "";

  const categoryChange = (localId: string, value: string) =>
    onChange(localId, "category", value === "" ? null : Number(value));

  const categoryOptions = (
    <>
      <option value="">Uncategorized</option>
      {categories.map((category) => (
        <option key={category.id} value={category.id}>
          {category.name}
        </option>
      ))}
    </>
  );

  if (!isDesktop) {
    return (
      <div className="space-y-3">
        {rows.map((row, index) => {
          const errors = rowErrors[row.localId] ?? {};

          return (
            <div key={row.localId} className="rounded-2xl border border-slate-100 bg-white p-3.5 shadow-sm">
              <p className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--brand-pink)]/10 px-1.5 text-[10px] text-[var(--brand-pink)]">
                  {index + 1}
                </span>
                Contact
              </p>
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label htmlFor={`${row.localId}-name`}>Name</Label>
                  <Input
                    id={`${row.localId}-name`}
                    value={row.name}
                    hasError={!!errors.name}
                    onChange={(e) => onChange(row.localId, "name", e.target.value)}
                    placeholder="Name"
                  />
                  <FormError message={errors.name} />
                </div>

                <div className="space-y-1">
                  <Label htmlFor={`${row.localId}-mobile`}>Mobile number</Label>
                  <Input
                    id={`${row.localId}-mobile`}
                    type="tel"
                    inputMode="tel"
                    value={row.mobile_number}
                    hasError={!!errors.mobile}
                    onChange={(e) => onChange(row.localId, "mobile_number", e.target.value)}
                    placeholder="9876543210"
                  />
                  <FormError message={errors.mobile} />
                </div>

                <div className="space-y-1">
                  <Label htmlFor={`${row.localId}-email`}>Email (optional)</Label>
                  <Input
                    id={`${row.localId}-email`}
                    type="email"
                    value={row.email}
                    onChange={(e) => onChange(row.localId, "email", e.target.value)}
                    placeholder="Optional"
                  />
                </div>

                <div className="grid grid-cols-[1fr_6rem] gap-3">
                  <div className="space-y-1">
                    <Label htmlFor={`${row.localId}-category`}>Category</Label>
                    <Select
                      id={`${row.localId}-category`}
                      value={categoryValue(row)}
                      onChange={(e) => categoryChange(row.localId, e.target.value)}
                    >
                      {categoryOptions}
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`${row.localId}-party`}>Party of</Label>
                    <Input
                      id={`${row.localId}-party`}
                      type="number"
                      min={0}
                      max={50}
                      value={row.family_member_count}
                      onChange={(e) =>
                        onChange(row.localId, "family_member_count", Number(e.target.value))
                      }
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onRemove(row.localId)}
                  className="inline-flex h-10 items-center gap-1.5 rounded-full bg-rose-50/70 px-4 text-sm font-medium text-rose-600 transition-colors hover:bg-rose-100"
                >
                  <Trash2 className="h-4 w-4" />
                  Remove
                </button>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white shadow-sm">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50/80 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            <th className="px-3 py-2.5">Name</th>
            <th className="px-3 py-2.5">Mobile number</th>
            <th className="px-3 py-2.5">Email</th>
            <th className="px-3 py-2.5">Category</th>
            <th className="px-3 py-2.5">Guests</th>
            <th className="px-3 py-2.5" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const errors = rowErrors[row.localId] ?? {};

            return (
              <tr key={row.localId} className="border-b border-slate-50 align-top transition-colors last:border-0 hover:bg-slate-50/50">
                <td className="px-3 py-2">
                  <Input
                    value={row.name}
                    hasError={!!errors.name}
                    onChange={(e) => onChange(row.localId, "name", e.target.value)}
                    placeholder="Name"
                    aria-label="Name"
                    className="h-10"
                  />
                  <FormError message={errors.name} />
                </td>
                <td className="px-3 py-2">
                  <Input
                    value={row.mobile_number}
                    hasError={!!errors.mobile}
                    onChange={(e) => onChange(row.localId, "mobile_number", e.target.value)}
                    placeholder="9876543210"
                    aria-label="Mobile number"
                    className="h-10"
                  />
                  <FormError message={errors.mobile} />
                </td>
                <td className="px-3 py-2">
                  <Input
                    value={row.email}
                    onChange={(e) => onChange(row.localId, "email", e.target.value)}
                    placeholder="Optional"
                    aria-label="Email"
                    type="email"
                    className="h-10"
                  />
                </td>
                <td className="px-3 py-2">
                  <Select
                    value={categoryValue(row)}
                    onChange={(e) => categoryChange(row.localId, e.target.value)}
                    aria-label="Category"
                    className="h-10"
                  >
                    {categoryOptions}
                  </Select>
                </td>
                <td className="px-3 py-2">
                  <Input
                    type="number"
                    min={0}
                    max={50}
                    value={row.family_member_count}
                    onChange={(e) =>
                      onChange(row.localId, "family_member_count", Number(e.target.value))
                    }
                    aria-label="Party size"
                    className="h-10 w-20"
                  />
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => onRemove(row.localId)}
                    className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 hover:bg-rose-50 hover:text-rose-500"
                    aria-label={`Remove ${row.name || "row"}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}