import { useRef } from 'react';
import { z } from 'zod';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { deleteResourceSchema } from '../../shared/contracts';
import { AppError } from '../../shared/domain';
import { api } from '../lib/api';
import { uncertainGameRequest, clearGameRequest, saveGameRequest } from '../lib/game-outbox';
import { Button, Confirm } from './ui';

const requestSchema = z.object({ key: z.uuid(), body: deleteResourceSchema });
export default function DeleteResource({
  path,
  actor,
  name,
  label,
  description,
  disabled,
  onDeleted,
}: {
  path: string;
  actor: string;
  name: string;
  label: string;
  description: string;
  disabled?: boolean;
  onDeleted: () => void;
}) {
  const busy = useRef(false);
  const scope = `roomtune:delete:${actor}:${path}`;
  async function remove() {
    if (busy.current) return;
    busy.current = true;
    let request: z.infer<typeof requestSchema> | null = null;
    try {
      // Persist before sending, and recover the exact same request after a network failure.
      const raw = sessionStorage.getItem(scope);
      if (raw) {
        try {
          const parsed = requestSchema.safeParse(JSON.parse(raw));
          if (parsed.success) request = parsed.data;
        } catch {
          // Invalid local metadata must not permanently block a new confirmed deletion.
        }
      }
      request ??= { key: crypto.randomUUID(), body: { name } };
      saveGameRequest(scope, request);
      const result = await api<{ deleted: true }>(path, request.body, request.key, actor);
      // A disabled feature or missing API also returns NOT_FOUND. Only a receipt proves deletion.
      if (result?.deleted !== true) throw new AppError('BACKEND_UNAVAILABLE', 503);
      clearGameRequest(scope, request.key);
      toast.success(`Đã ${label.toLocaleLowerCase('vi')}.`);
      onDeleted();
    } catch (error) {
      if (request && !uncertainGameRequest(error)) clearGameRequest(scope, request.key);
      toast.error(error instanceof Error ? error.message : 'Chưa thể xóa. Hãy thử lại.');
      throw error;
    } finally {
      busy.current = false;
    }
  }
  return (
    <Confirm
      title={`${label} “${name}”?`}
      description={description}
      confirmationText={name}
      onConfirm={remove}
    >
      <Button variant="danger" disabled={disabled}>
        <Trash2 size={16} /> {label}
      </Button>
    </Confirm>
  );
}
