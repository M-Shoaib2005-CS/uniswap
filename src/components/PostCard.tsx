import { Image } from 'expo-image';
import React from 'react';
import { FlatList, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { likedByMe, Post, postImages } from '@/features/feed/api';
import { timeAgo } from '@/lib/format';
import { publicImageUrl } from '@/lib/supabase';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, TAP } from '@/theme/tokens';
import { AppText } from './AppText';
import { Avatar } from './Avatar';
import { Icon } from './Icon';

export function PostCard({
  post,
  onOpen,
  onLike,
  onMenu,
  onAuthor,
  full,
}: {
  post: Post;
  onOpen?: () => void; // open the comments screen
  onLike: () => void;
  onMenu: () => void;
  onAuthor: () => void;
  full?: boolean; // on the post screen: whole text, no tap-to-open
}) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const liked = likedByMe(post);
  const imgs = postImages(post);
  const imgW = width - 40;
  const name = post.author?.display_name ?? 'Student';

  return (
    <View style={[styles.card, { borderBottomColor: colors.border }]}>
      <View style={styles.head}>
        <Pressable accessibilityRole="button" accessibilityLabel={`${name}'s profile`} onPress={onAuthor} style={styles.who}>
          <Avatar name={name} path={post.author?.avatar_path} size={40} />
          <View style={{ flex: 1 }}>
            <AppText variant="smallStrong" numberOfLines={1}>
              {name}
            </AppText>
            <AppText variant="caption" color="muted" numberOfLines={1}>
              {post.author?.department ? `${post.author.department} · ` : ''}
              {timeAgo(post.created_at)}
            </AppText>
          </View>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="More options" hitSlop={8} onPress={onMenu} style={styles.more}>
          <Icon name="more-horizontal" size={20} color="muted" />
        </Pressable>
      </View>

      <Pressable accessibilityRole={full ? 'text' : 'button'} disabled={full || !onOpen} onPress={onOpen}>
        <AppText numberOfLines={full ? undefined : 6} style={{ marginTop: 10 }}>
          {post.body}
        </AppText>
      </Pressable>

      {imgs.length > 0 ? (
        <FlatList
          data={imgs}
          horizontal
          pagingEnabled
          snapToInterval={imgW + 8}
          decelerationRate="fast"
          showsHorizontalScrollIndicator={false}
          keyExtractor={(p) => p}
          style={{ marginTop: 10 }}
          ItemSeparatorComponent={() => <View style={{ width: 8 }} />}
          renderItem={({ item: path }) => (
            <Image
              source={{ uri: publicImageUrl('post-images', path) ?? undefined }}
              style={{ width: imgs.length === 1 ? imgW : imgW - 24, height: (imgs.length === 1 ? imgW : imgW - 24) * 0.75, borderRadius: radius.md, backgroundColor: colors.fill }}
              contentFit="cover"
            />
          )}
        />
      ) : null}

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={liked ? 'Unlike' : 'Like'}
          accessibilityState={{ selected: liked }}
          onPress={onLike}
          style={styles.act}
        >
          <Icon name="heart" size={20} color={liked ? 'danger' : 'muted'} />
          <AppText variant="small" color={liked ? 'danger' : 'muted'}>
            {post.like_count}
          </AppText>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Comments" onPress={onOpen} disabled={!onOpen} style={styles.act}>
          <Icon name="message-circle" size={20} color="muted" />
          <AppText variant="small" color="muted">
            {post.comment_count}
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  head: { flexDirection: 'row', alignItems: 'center' },
  who: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: TAP },
  more: { width: TAP, height: TAP, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', gap: 8, marginTop: 6 },
  act: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: TAP, paddingRight: 16 },
});
