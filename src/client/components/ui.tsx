import { useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Slot } from '@radix-ui/react-slot';
import * as Dialog from '@radix-ui/react-dialog';
import { cva } from 'class-variance-authority';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { AudioLines, ArrowUpRight, X, LoaderCircle, CircleAlert, Music2 } from 'lucide-react';
import { Link } from 'react-router-dom';
export const cn = (...values: Parameters<typeof clsx>) => twMerge(clsx(values));
const button = cva('button', {
  variants: {
    variant: {
      primary: 'button-primary',
      secondary: 'button-secondary',
      ghost: 'button-ghost',
      danger: 'button-danger',
    },
    size: { default: '', icon: 'button-icon' },
  },
  defaultVariants: { variant: 'secondary', size: 'default' },
});
export function Button({
  variant = 'secondary',
  size = 'default',
  asChild,
  className,
  type = 'button',
  loading = false,
  loadingLabel,
  disabled,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'default' | 'icon';
  asChild?: boolean;
  loading?: boolean;
  loadingLabel?: string;
}) {
  const Component = asChild ? Slot : 'button';
  return (
    <Component
      type={type}
      className={cn(button({ variant, size }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {asChild ? (
        children
      ) : loading ? (
        <>
          <LoaderCircle size={18} className="spin" aria-hidden="true" />
          {size !== 'icon' && (loadingLabel ?? children)}
        </>
      ) : (
        children
      )}
    </Component>
  );
}
/** Keep pending state at the actual control, including while a request retries. */
export function AsyncButton({
  onClick,
  ...props
}: Omit<Parameters<typeof Button>[0], 'onClick'> & {
  onClick: () => Promise<unknown>;
}) {
  const [pending, setPending] = useState(false);
  const running = useRef(false);
  return (
    <Button
      {...props}
      loading={pending || props.loading}
      onClick={async () => {
        if (running.current) return;
        running.current = true;
        setPending(true);
        try {
          await onClick();
        } catch {
          /* The operation reports its own error. */
        } finally {
          running.current = false;
          setPending(false);
        }
      }}
    />
  );
}
export function Brand() {
  return (
    <Link className="brand" to="/" aria-label="ROOMTUNE — Trang chủ">
      <span className="brand-icon">
        <AudioLines size={23} />
      </span>
      ROOMTUNE<span className="brand-period">®</span>
    </Link>
  );
}
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div className="eyebrow">
      <span />
      {children}
    </div>
  );
}
export function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Music2 size={28} />
      </span>
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function Loading({ children = 'Đang tải không gian của bạn…' }: { children?: ReactNode }) {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin" aria-hidden="true" /> {children}
    </div>
  );
}
export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <div className="error-state" role="alert">
      <CircleAlert />
      <h3>Chưa thể tiếp tục</h3>
      <p>{error instanceof Error ? error.message : 'Đã có lỗi xảy ra. Vui lòng thử lại.'}</p>
      {retry && (
        <Button onClick={retry}>
          Thử lại <ArrowUpRight size={16} />
        </Button>
      )}
      <Link to="/">Về trang chủ</Link>
    </div>
  );
}
export function Modal({
  title,
  description,
  trigger,
  children,
  open,
  onOpenChange,
  onCloseAutoFocus,
}: {
  title: string;
  description: string;
  trigger?: ReactNode;
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onCloseAutoFocus?: Dialog.DialogContentProps['onCloseAutoFocus'];
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      {trigger && <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>}
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content" onCloseAutoFocus={onCloseAutoFocus}>
          <Dialog.Title>{title}</Dialog.Title>
          <Dialog.Description>{description}</Dialog.Description>
          <Dialog.Close asChild>
            <Button variant="ghost" size="icon" className="dialog-close" aria-label="Đóng">
              <X size={20} />
            </Button>
          </Dialog.Close>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function Confirm({
  title,
  description = 'Thao tác này có hiệu lực ngay trong phòng. Vui lòng kiểm tra trước khi tiếp tục.',
  children,
  onConfirm,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  onConfirm: () => void | Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const running = useRef(false);
  return (
    <Modal
      title={title}
      description={description}
      trigger={children}
      open={open}
      onOpenChange={(value) => {
        if (!running.current) setOpen(value);
      }}
    >
      <div className="dialog-actions">
        <Dialog.Close asChild>
          <Button disabled={pending}>Hủy</Button>
        </Dialog.Close>
        <Button
          variant="danger"
          loading={pending}
          loadingLabel="Đang xử lý…"
          onClick={async () => {
            if (running.current) return;
            running.current = true;
            setPending(true);
            try {
              await onConfirm();
              setOpen(false);
            } catch {
              /* Keep the dialog open so the failed action can be retried. */
            } finally {
              running.current = false;
              setPending(false);
            }
          }}
        >
          Xác nhận
        </Button>
      </div>
    </Modal>
  );
}
