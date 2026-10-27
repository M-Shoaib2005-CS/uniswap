import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert } from 'react-native';
import { AppBar } from '@/components/AppBar';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { PhotoStrip } from '@/components/PhotoStrip';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/features/auth/AuthProvider';
import { MAX_POST_PHOTOS, useCreatePost } from '@/features/feed/api';
import { PickedImage } from '@/lib/images';
import { friendlyError } from '@/lib/validation';

let seq = 0;

export default function NewPost() {
  const router = useRouter();
  const { session, profile } = useAuth();
  const create = useCreatePost();
  const [body, setBody] = useState('');
  const [photos, setPhotos] = useState<(PickedImage & { key: string })[]>([]);
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const text = body.trim();
    if (!text) return setError('Write something to share');
    if (text.length > 1000) return setError('Post is too long (1000 characters max)');
    if (!session) return;
    setError(null);
    create.mutate(
      { userId: session.user.id, body: text, photos },
      { onSuccess: () => router.back(), onError: (e) => Alert.alert('Could not post', friendlyError(e)) },
    );
  };

  return (
    <Screen
      scroll
      footer={<Button label="Post" onPress={submit} loading={create.isPending} disabled={!!profile?.is_suspended} />}
    >
      <AppBar title="New post" closeIcon />
      <Field
        label="What's happening on campus?"
        value={body}
        onChangeText={(t) => {
          setBody(t);
          setError(null);
        }}
        error={error}
        multiline
        maxLength={1000}
        placeholder="Looking for a lab coat, selling old notes, lost something…"
        style={{ minHeight: 120, textAlignVertical: 'top' }}
      />
      <AppText variant="smallStrong" style={{ marginBottom: 6 }}>
        Photos ({photos.length}/{MAX_POST_PHOTOS})
      </AppText>
      <PhotoStrip
        photos={photos.map((p) => ({ key: p.key, uri: p.uri }))}
        max={MAX_POST_PHOTOS}
        onAdd={(imgs) => setPhotos((c) => [...c, ...imgs.map((i) => ({ ...i, key: `n${++seq}` }))].slice(0, MAX_POST_PHOTOS))}
        onRemove={(k) => setPhotos((c) => c.filter((p) => p.key !== k))}
      />
    </Screen>
  );
}
