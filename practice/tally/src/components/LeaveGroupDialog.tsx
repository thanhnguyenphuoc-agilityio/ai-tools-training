import { useState } from 'react';
import type { GroupDto } from '../../shared/types';
import { api, ApiError } from '../api';
import { useI18n, type UiMessage } from '../i18n';
import { useToast } from '../toast';
import { ConfirmDialog } from './ConfirmDialog';

// Confirms that this device leaves the group (leave_group). A member who still owes or is owed money is told to
// settle up first, in the leave wording rather than the remove wording.
export function LeaveGroupDialog({
  group,
  onClose,
  onChanged,
}: {
  group: GroupDto;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { t } = useI18n();
  const notify = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<UiMessage | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await api.leaveGroup(group.code);
    } catch (err) {
      setBusy(false);
      const hasBalance = err instanceof ApiError && err.code === 'MEMBER_HAS_BALANCE';
      setError(hasBalance ? { key: 'leaveGroup.hasBalance' } : { error: err });
      return;
    }
    onClose();
    notify('toast.leftGroup');
    onChanged();
  }

  return (
    <ConfirmDialog
      title={t('leaveGroup.title', { group: group.name })}
      message={t('leaveGroup.message')}
      confirmLabel={t('leaveGroup.confirm')}
      busy={busy}
      error={error}
      onConfirm={confirm}
      onCancel={onClose}
    />
  );
}
