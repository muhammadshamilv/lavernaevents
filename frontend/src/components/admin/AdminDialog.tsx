import { useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Modal, ModalActions, type ModalSize } from "@/components/ui/modal";

// The dialog every admin form opens in (add / edit plan, template, pack...).
// A thin wrapper over the shared Modal: closing animates out first, then the
// parent is told, so the popup never just vanishes.
export default function AdminDialog({
  title,
  description,
  icon,
  size = "md",
  busy,
  onClose,
  children,
}: {
  title: string;
  description?: ReactNode;
  icon?: LucideIcon;
  size?: ModalSize;
  busy?: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(true);

  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      onExited={onClose}
      title={title}
      description={description}
      icon={icon}
      size={size}
      busy={busy}
    >
      {children}
    </Modal>
  );
}

// The Cancel / Save button row at the bottom of an admin form.
export function DialogActions({ children }: { children: ReactNode }) {
  return <ModalActions className="mt-6">{children}</ModalActions>;
}