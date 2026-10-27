import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import type { ReportTarget } from '@/components/ReportSheet';
import { friendlyError } from '@/lib/validation';
import { useBlock, useBlockedUsers, useUnblock } from './api';
import type { ReportType } from './api';

export interface MenuOptions {
  reportType: ReportType;
  reportId: string;
  label: string; // "post", "listing", "comment", "user", "chat"
  userId: string; // the person who owns it
  userName: string;
  isMine?: boolean;
  onDelete?: () => void; // shown to the owner instead of report/block
  onBlocked?: () => void;
}

/** Report / block / delete action list. Render <ReportSheet target={target} onClose={close} /> next to it. */
export function useSafetyMenu(myId: string | null) {
  const block = useBlock(myId);
  const unblock = useUnblock(myId);
  const blocked = useBlockedUsers(myId);
  const [target, setTarget] = useState<ReportTarget | null>(null);
  const close = useCallback(() => setTarget(null), []);

  const open = useCallback(
    (o: MenuOptions) => {
      if (o.isMine) {
        if (!o.onDelete) return;
        Alert.alert(`Delete this ${o.label}?`, 'This cannot be undone.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: o.onDelete },
        ]);
        return;
      }
      const isBlocked = (blocked.data ?? []).some((b) => b.blocked_id === o.userId);
      const report = { text: `Report ${o.label}`, onPress: () => setTarget({ type: o.reportType, id: o.reportId, label: o.label }) };
      if (isBlocked) {
        Alert.alert(o.userName, 'You have blocked this person.', [
          {
            text: `Unblock ${o.userName}`,
            onPress: () => unblock.mutate(o.userId, { onError: (e) => Alert.alert('Could not unblock', friendlyError(e)) }),
          },
          report,
          { text: 'Cancel', style: 'cancel' },
        ]);
        return;
      }
      Alert.alert(o.userName, undefined, [
        report,
        {
          text: `Block ${o.userName}`,
          style: 'destructive',
          onPress: () =>
            Alert.alert(`Block ${o.userName}?`, 'You will no longer see each other’s listings, posts or messages. You can unblock in Settings.', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Block',
                style: 'destructive',
                onPress: () =>
                  block.mutate(o.userId, {
                    onSuccess: () => o.onBlocked?.(),
                    onError: (e) => Alert.alert('Could not block', friendlyError(e)),
                  }),
              },
            ]),
        },
        { text: 'Cancel', style: 'cancel' },
      ]);
    },
    [block, unblock, blocked.data],
  );

  return { open, target, close };
}
