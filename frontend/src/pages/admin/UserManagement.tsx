import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Ban, CheckCircle2, Pencil, Search, Trash2 } from "lucide-react";
import { Card, FormError } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import AdminDialog, { DialogActions } from "@/components/admin/AdminDialog";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { getApiErrorMessage, getApiFieldErrors } from "@/lib/apiError";
import { toastStore } from "@/stores/toast.store";
import { useAuthStore } from "@/stores/auth.store";
import {
  useAdminUsers,
  useDeleteAdminUserMutation,
  useSuspendAdminUserMutation,
  useUnsuspendAdminUserMutation,
  useUpdateAdminUserMutation,
} from "@/queries/useAdminQueries";
import type { AdminUser } from "@/types/admin.types";
import type { UserRole } from "@/types/auth.types";

const editUserSchema = z.object({
  full_name: z.string().trim().min(1, "Name is required").max(150, "Keep the name under 150 characters"),
  email: z.string().trim().email("Enter a valid email"),
  mobile_number: z
    .string()
    .trim()
    .min(1, "Mobile number is required")
    .refine((v) => v.replace(/\D/g, "").length >= 10, "Enter a valid mobile number"),
  role: z.enum(["ADMIN", "ORGANIZER", "PHOTOGRAPHER", "GUEST"]),
  is_verified: z.boolean(),
});

type EditUserFormValues = z.infer<typeof editUserSchema>;

function EditUserDialog({ user, isSelf, onClose }: { user: AdminUser; isSelf: boolean; onClose: () => void }) {
  const updateMutation = useUpdateAdminUserMutation();

  const {
    register,
    handleSubmit,
    formState: { errors },
    setError,
  } = useForm<EditUserFormValues>({
    resolver: zodResolver(editUserSchema),
    defaultValues: {
      full_name: user.full_name,
      email: user.email,
      mobile_number: user.mobile_number,
      role: user.role,
      is_verified: user.is_verified,
    },
  });

  const onSubmit = (values: EditUserFormValues) => {
    // Only send what changed so an untouched field never trips a validation rule.
    const payload: Partial<EditUserFormValues> = {};
    (Object.keys(values) as (keyof EditUserFormValues)[]).forEach((key) => {
      if (values[key] !== user[key]) (payload as Record<string, unknown>)[key] = values[key];
    });

    if (Object.keys(payload).length === 0) {
      onClose();
      return;
    }

    updateMutation.mutate(
      { userId: user.id, payload },
      {
        onSuccess: () => {
          toastStore.show("User updated successfully.");
          onClose();
        },
        onError: (error) => {
          for (const [field, message] of Object.entries(getApiFieldErrors(error))) {
            setError(field as keyof EditUserFormValues, { message });
          }
          toastStore.show(getApiErrorMessage(error, "Could not update user."), "error");
        },
      }
    );
  };

  return (
    <AdminDialog title="Edit user" onClose={onClose}>
      <form onSubmit={handleSubmit(onSubmit)} className="mt-3 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="full_name">Full name</Label>
          <Input id="full_name" hasError={!!errors.full_name} {...register("full_name")} />
          <FormError message={errors.full_name?.message} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" hasError={!!errors.email} {...register("email")} />
          <FormError message={errors.email?.message} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="mobile_number">Mobile number</Label>
          <Input id="mobile_number" type="tel" inputMode="tel" hasError={!!errors.mobile_number} {...register("mobile_number")} />
          <FormError message={errors.mobile_number?.message} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="role">Role</Label>
          <Select id="role" hasError={!!errors.role} disabled={isSelf} {...register("role")}>
            <option value="ADMIN">Admin</option>
            <option value="ORGANIZER">Organizer</option>
            <option value="PHOTOGRAPHER">Photographer</option>
            <option value="GUEST">Guest</option>
          </Select>
          {isSelf && <p className="text-xs text-slate-400">You can't change your own role.</p>}
          <FormError message={errors.role?.message} />
        </div>
        <label className="flex items-center gap-2 text-sm text-[var(--brand-navy)]">
          <input type="checkbox" className="h-4 w-4 rounded" {...register("is_verified")} />
          Account verified
        </label>

        <DialogActions>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={updateMutation.isPending}>
            Save changes
          </Button>
        </DialogActions>
      </form>
    </AdminDialog>
  );
}

function roleBadgeClass(role: UserRole): string {
  switch (role) {
    case "ADMIN":
      return "bg-[var(--brand-navy)]/8 text-[var(--brand-navy)]";
    case "ORGANIZER":
      return "bg-[var(--brand-pink)]/8 text-[var(--brand-pink)]";
    case "PHOTOGRAPHER":
      return "bg-emerald-50 text-emerald-700";
    default:
      return "bg-slate-100 text-slate-600";
  }
}

function StatusBadge({ user }: { user: AdminUser }) {
  return user.is_suspended ? (
    <span className="rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-600">Suspended</span>
  ) : (
    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">Active</span>
  );
}

function UserActions({
  user,
  isSelf,
  busy,
  onEdit,
  onToggleSuspend,
  onDelete,
}: {
  user: AdminUser;
  isSelf: boolean;
  busy: boolean;
  onEdit: () => void;
  onToggleSuspend: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center justify-end gap-1.5">
      <Button variant="ghost" size="icon" className="h-10 w-10" onClick={onEdit} aria-label="Edit user">
        <Pencil className="h-4 w-4" />
      </Button>
      {!isSelf && (
        <>
          <Button variant="ghost" size="icon" className="h-10 w-10" disabled={busy} onClick={onToggleSuspend} aria-label={user.is_suspended ? "Unsuspend user" : "Suspend user"}>
            {user.is_suspended ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Ban className="h-4 w-4 text-amber-600" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-10 w-10" onClick={onDelete} aria-label="Delete user">
            <Trash2 className="h-4 w-4 text-rose-600" />
          </Button>
        </>
      )}
    </div>
  );
}

export default function UserManagement() {
  const { user: currentUser } = useAuthStore();
  const currentUserId = currentUser?.id;

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<UserRole | "">("");
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebouncedValue(search, 400);

  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [deletingUser, setDeletingUser] = useState<AdminUser | null>(null);
  const [suspendingUser, setSuspendingUser] = useState<AdminUser | null>(null);

  const { data, isLoading, isError } = useAdminUsers({
    page,
    search: debouncedSearch || undefined,
    role: roleFilter || undefined,
  });

  const suspendMutation = useSuspendAdminUserMutation();
  const unsuspendMutation = useUnsuspendAdminUserMutation();
  const deleteMutation = useDeleteAdminUserMutation();
  const statusBusy = suspendMutation.isPending || unsuspendMutation.isPending;

  const runToggleSuspend = (user: AdminUser) => {
    const mutation = user.is_suspended ? unsuspendMutation : suspendMutation;
    mutation.mutate(user.id, {
      onSuccess: () => {
        toastStore.show(user.is_suspended ? "User unsuspended." : "User suspended.");
        setSuspendingUser(null);
      },
      onError: (error) => {
        toastStore.show(getApiErrorMessage(error, "Could not update user status."), "error");
        setSuspendingUser(null);
      },
    });
  };

  // Suspending locks someone out immediately, so it asks first. Unsuspending is
  // harmless and goes straight through.
  const handleToggleSuspend = (user: AdminUser) => {
    if (user.is_suspended) runToggleSuspend(user);
    else setSuspendingUser(user);
  };

  const handleDelete = () => {
    if (!deletingUser) return;
    deleteMutation.mutate(deletingUser.id, {
      onSuccess: () => {
        toastStore.show("User deleted.");
        setDeletingUser(null);
      },
      onError: (error) => {
        toastStore.show(getApiErrorMessage(error, "Could not delete user. Try suspending them instead."), "error");
        setDeletingUser(null);
      },
    });
  };

  const users = data?.users ?? [];

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--brand-navy)]">User Management</h1>
        <p className="mt-1 text-sm text-slate-500">Search, filter, suspend, or remove any user on the platform.</p>
      </div>

      <Card className="mb-4 p-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              aria-label="Search users"
              placeholder="Search by name, email, or mobile number"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="pl-11"
            />
          </div>
          <Select
            aria-label="Filter by role"
            value={roleFilter}
            onChange={(e) => {
              setRoleFilter(e.target.value as UserRole | "");
              setPage(1);
            }}
            className="sm:w-48"
          >
            <option value="">All roles</option>
            <option value="ADMIN">Admin</option>
            <option value="ORGANIZER">Organizer</option>
            <option value="PHOTOGRAPHER">Photographer</option>
            <option value="GUEST">Guest</option>
          </Select>
        </div>
      </Card>

      <Card className="overflow-hidden">
        {isError ? (
          <div className="p-8 text-center text-sm text-slate-500">We couldn't load users right now. Please refresh the page.</div>
        ) : isLoading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : users.length > 0 ? (
          <>
            {/* Phones: stacked cards, no horizontal scrolling. */}
            <ul className="divide-y divide-slate-100 md:hidden">
              {users.map((user) => {
                const isSelf = user.id === currentUserId;
                return (
                  <li key={user.id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-[var(--brand-navy)]">
                          {user.full_name}
                          {isSelf && <span className="ml-1.5 text-xs font-medium text-slate-400">(you)</span>}
                        </p>
                        <p className="truncate text-sm text-slate-500">{user.email}</p>
                        <p className="text-xs text-slate-400">{user.mobile_number}</p>
                      </div>
                      <StatusBadge user={user} />
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${roleBadgeClass(user.role)}`}>{user.role}</span>
                      <UserActions
                        user={user}
                        isSelf={isSelf}
                        busy={statusBusy}
                        onEdit={() => setEditingUser(user)}
                        onToggleSuspend={() => handleToggleSuspend(user)}
                        onDelete={() => setDeletingUser(user)}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>

            {/* Tablet and up: table. */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium">Contact</th>
                    <th className="px-4 py-3 font-medium">Role</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {users.map((user) => {
                    const isSelf = user.id === currentUserId;
                    return (
                      <tr key={user.id}>
                        <td className="px-4 py-3 font-medium text-[var(--brand-navy)]">
                          {user.full_name}
                          {isSelf && <span className="ml-1.5 text-xs font-medium text-slate-400">(you)</span>}
                        </td>
                        <td className="px-4 py-3 text-slate-500">
                          <div>{user.email}</div>
                          <div className="text-xs text-slate-400">{user.mobile_number}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${roleBadgeClass(user.role)}`}>{user.role}</span>
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge user={user} />
                        </td>
                        <td className="px-4 py-3">
                          <UserActions
                            user={user}
                            isSelf={isSelf}
                            busy={statusBusy}
                            onEdit={() => setEditingUser(user)}
                            onToggleSuspend={() => handleToggleSuspend(user)}
                            onDelete={() => setDeletingUser(user)}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="p-8 text-center text-sm text-slate-500">No users found.</div>
        )}
      </Card>

      {data && data.pagination.total_pages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="text-sm text-slate-500">
            Page {data.pagination.current_page} of {data.pagination.total_pages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= data.pagination.total_pages} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      )}

      {editingUser && <EditUserDialog user={editingUser} isSelf={editingUser.id === currentUserId} onClose={() => setEditingUser(null)} />}

      <ConfirmDialog
        open={!!suspendingUser}
        title="Suspend this user?"
        description={`"${suspendingUser?.full_name}" will be signed out and blocked from logging in until you unsuspend them. Their data is kept.`}
        confirmLabel="Suspend"
        destructive
        isLoading={suspendMutation.isPending}
        onConfirm={() => suspendingUser && runToggleSuspend(suspendingUser)}
        onCancel={() => setSuspendingUser(null)}
      />

      <ConfirmDialog
        open={!!deletingUser}
        title="Delete this user?"
        description={`This permanently deletes "${deletingUser?.full_name}" and everything they own - events, guests, gallery photos - and cannot be undone. To block access but keep the data, suspend them instead.`}
        confirmLabel="Delete"
        destructive
        isLoading={deleteMutation.isPending}
        onConfirm={handleDelete}
        onCancel={() => setDeletingUser(null)}
      />
    </div>
  );
}