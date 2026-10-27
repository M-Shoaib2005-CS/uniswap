import React from 'react';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/States';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/features/auth/AuthProvider';

export default function Suspended() {
  const { signOut } = useAuth();
  return (
    <Screen>
      <EmptyState
        icon="slash"
        title="Your account is suspended"
        message="A moderator is reviewing reports about your account. You can still read the app but cannot post, request or chat. Contact the UniSwap team if you think this is a mistake."
      />
      <AppText variant="caption" color="muted" center>
        {' '}
      </AppText>
      <Button label="Log out" variant="secondary" onPress={() => signOut()} />
    </Screen>
  );
}
