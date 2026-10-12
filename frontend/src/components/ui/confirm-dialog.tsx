import type { ReactNode } from "react";
import { AlertTriangle, HelpCircle, type LucideIcon } from "lucide-react";
import { Button } from "./button";
import { Modal, ModalActions } from "./modal";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  isLoading?: boolean;
  destructive?: boolean;
  /** Replaces the default warning / question icon. */
  icon?: LucideIcon;
  onConfirm: () => void;
  onCancel: () => void;
}

// "Are you sure?" popup. A red warning for destructive actions, a friendly
// question mark for everything else. While the action runs it can't be
// dismissed, so a double tap can never fire it twice.
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  isLoading,
  destructive,
  icon,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      description={description}
      icon={icon ?? (destructive ? AlertTriangle : HelpCircle)}
      tone={destructive ? "danger" : "default"}
      size="sm"
      align="center"
      busy={!!isLoading}
      footer={
        <ModalActions className="sm:justify-center sm:[&>*]:min-w-32">
          <Button variant="outline" onClick={onCancel} disabled={isLoading} data-autofocus={destructive ? true : undefined}>
            {cancelLabel}
          </Button>
          <Button
            onClick={onConfirm}
            isLoading={isLoading}
            className={destructive ? "bg-rose-600 hover:bg-rose-700 focus-visible:ring-rose-500" : undefined}
          >
            {confirmLabel}
          </Button>
        </ModalActions>
      }
    />
  );
}