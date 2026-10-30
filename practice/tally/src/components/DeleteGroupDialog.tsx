import { useState } from 'react';
import type { GroupDto } from '../../shared/types';
import { api } from '../api';
import { useI18n, type UiMessage } from '../i18n';
import { useToast } from '../toast';
import { ConfirmDialog } from './ConfirmDialog';

// Confirms the deletion of the whole group (leave_group). The owner is alone in the group; the server checks that again.
// On success the page forgets the group and goes home (onDeleted), so the dialog does not reset its state afterwards.
export function DeleteGroupDialog({
  group,
  onClose,
  onDeleted,
}: {
  group: GroupDto;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const { t } = useI18n();
  const notify = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<UiMessage | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await api.deleteGroup(group.code);
    } catch (err) {
      setBusy(false);
      setError({ error: err });
      return;
    }
    notify('toast.groupDeleted');
    onDeleted();
  }

  return (
    <ConfirmDialog
      title={t('deleteGroup.title', { group: group.name })}
      message={t('deleteGroup.message')}
      confirmLabel={t('deleteGroup.confirm')}
      busy={busy}
      error={error}
      onConfirm={confirm}
      onCancel={onClose}
    />
  );
}
