import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius } from '../constants/theme';
import { useAuth } from '../context/AuthContext';
import { addComment, deleteComment, getComments, toggleCommentLike } from '../lib/api';
import { Comment } from '../lib/types';
import { LOKMA_REACTIONS } from '../lib/lokma-emoji';

interface CommentSectionProps {
  recipeId: number;
}

export default function CommentSection({ recipeId }: CommentSectionProps) {
  const { user, token } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadError, setLoadError] = useState('');

  const loadComments = useCallback(
    async (pageNum: number = 1) => {
      if (pageNum === 1) setLoading(true);
      setLoadError('');
      try {
        const data = await getComments(recipeId, pageNum, 10);
        if (pageNum === 1) {
          setComments(data.comments || []);
          setPage(1);
        } else {
          setComments((prev) => [...prev, ...(data.comments || [])]);
        }
        setHasMore(pageNum < (data.pages || 1));
      } catch (error) {
        // A comment service failure must never cover the recipe with a
        // React Native LogBox. Surface it in the section, with a retry.
        setLoadError(error instanceof Error ? error.message : 'Yorumlar yüklenemedi.');
        setHasMore(false);
      } finally {
        setLoading(false);
      }
    },
    [recipeId]
  );

  useEffect(() => {
    loadComments(1);
  }, [loadComments]);

  const handleSubmit = async () => {
    if (!token || !newComment.trim()) return;
    setSubmitting(true);
    try {
      const result = await addComment(token, recipeId, newComment.trim());
      setNewComment('');
      setPage(1);
      await loadComments(1);
      if (result && result.approved === false) {
        Alert.alert('Yorum onay bekliyor', 'Yorumunuz moderasyon kontrolünden sonra yayımlanacak.');
      }
    } catch (error: unknown) {
      Alert.alert('Hata', error instanceof Error ? error.message : 'Yorum eklenemedi');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = (commentId: number) => {
    if (!token) return;
    Alert.alert('Yorumu Sil', 'Bu yorumu silmek istiyor musunuz?', [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteComment(token, commentId);
            setComments((prev) => prev.filter((c) => c.id !== commentId));
          } catch (error: unknown) {
            Alert.alert('Hata', error instanceof Error ? error.message : 'Yorum silinemedi');
          }
        },
      },
    ]);
  };

  const handleLike = async (commentId: number) => {
    if (!token) return;
    try {
      const result = await toggleCommentLike(token, commentId);
      setComments((prev) =>
        prev.map((c) => (c.id === commentId ? { ...c, likes: result.likes } : c))
      );
    } catch (error) {
      Alert.alert('Beğeni kaydedilemedi', error instanceof Error ? error.message : 'Lütfen yeniden deneyin.');
    }
  };

  const loadMore = () => {
    if (!hasMore || loading) return;
    const nextPage = page + 1;
    setPage(nextPage);
    loadComments(nextPage);
  };

  const renderComment = ({ item }: { item: Comment }) => (
    <View style={styles.commentItem}>
      <View style={styles.commentHeader}>
        {item.author.avatar ? (
          <Image source={{ uri: item.author.avatar }} style={styles.avatar} contentFit="cover" />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarInitial}>{item.author.name?.charAt(0)?.toLocaleUpperCase('tr-TR')}</Text>
          </View>
        )}
        <View style={styles.commentMeta}>
          <Text style={styles.commentAuthor}>{item.author.name}</Text>
          <Text style={styles.commentDate}>
            {new Date(item.created_at).toLocaleDateString('tr-TR')}
          </Text>
        </View>
        {user && user.id === item.author.id && (
          <TouchableOpacity onPress={() => handleDelete(item.id)} style={styles.deleteButton}>
            <Text style={styles.deleteText}>Sil</Text>
          </TouchableOpacity>
        )}
      </View>
      <Text style={styles.commentContent}>{item.content}</Text>
      <TouchableOpacity style={styles.likeButton} onPress={() => handleLike(item.id)}
        accessibilityRole="button" accessibilityLabel={`Yorumu beğen, ${item.likes || 0} beğeni`}>
        <Ionicons name="heart-outline" size={14} color={colors.brand} />
        <Text style={styles.likeText}>{item.likes || 0}</Text>
      </TouchableOpacity>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color={colors.brand} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.kicker}>Pişirenler ne diyor</Text>
      <View style={styles.titleRow}>
        <Text style={styles.sectionTitle}>Yorumlar</Text>
        <View style={styles.countPill}><Text style={styles.countText}>{comments.length}</Text></View>
      </View>
      {!!loadError && (
        <View style={styles.errorBox} accessibilityRole="alert">
          <Text style={styles.errorText}>{loadError}</Text>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Yorumları yeniden yükle"
            style={styles.retryButton}
            onPress={() => { void loadComments(1); }}
          >
            <Text style={styles.retryText}>Yeniden Dene</Text>
          </TouchableOpacity>
        </View>
      )}


      {token ? (
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            value={newComment}
            onChangeText={setNewComment}
            placeholder="Yorumunuzu yazın..."
            placeholderTextColor={colors.textFaint}
            multiline
            maxLength={500}
          />
          <View style={styles.lokmaReactionRow}>
            {LOKMA_REACTIONS.map(({ id, emoji, label }) => (
              <TouchableOpacity key={id} accessibilityRole="button"
                accessibilityLabel={`Yoruma ${label} emojisi ekle`}
                style={styles.lokmaReactionButton}
                onPress={() => setNewComment(current => current.length < 490
                  ? current + (current && !current.endsWith(' ') ? ' ' : '') + emoji : current)}>
                <Text style={styles.lokmaReactionEmoji}>{emoji}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity
            style={[styles.submitButton, (!newComment.trim() || submitting) && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={!newComment.trim() || submitting}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Text style={styles.submitButtonText}>Gönder</Text>
            )}
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.loginBox}>
          <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.textMuted} />
          <Text style={styles.loginPrompt}>Yorum yapmak için giriş yapın.</Text>
        </View>
      )}

      <FlatList
        data={comments}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderComment}
        scrollEnabled={false}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        ListEmptyComponent={
          loadError ? null : <Text style={styles.emptyText}>Henüz yorum yok. İlk yorumu siz yapın!</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingVertical: 16 },
  loadingContainer: { padding: 20, alignItems: 'center' },
  kicker: { fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 2.2, textTransform: 'uppercase', color: colors.brand },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6, marginBottom: 16 },
  sectionTitle: { fontFamily: fonts.headingBold, fontSize: 24, letterSpacing: -0.5, color: colors.ink },
  countPill: { minWidth: 28, height: 28, paddingHorizontal: 9, borderRadius: radius.pill, backgroundColor: colors.cream, alignItems: 'center', justifyContent: 'center' },
  countText: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.ink },
  lokmaReactionRow: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center',
    alignItems: 'center', alignContent: 'center', gap: 8,
    width: '100%', paddingVertical: 4, marginTop: 2,
  },
  lokmaReactionButton: {
    width: 42, height: 42, borderRadius: 21,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.brandSoft, borderWidth: 1, borderColor: '#f6ddd2',
  },
  lokmaReactionEmoji: {
    fontSize: 21, lineHeight: 28, width: 32, textAlign: 'center',
    textAlignVertical: 'center', includeFontPadding: false,
  },
  inputContainer: {
    marginBottom: 18, gap: 10, padding: 14, borderRadius: radius.lg,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line,
  },
  input: {
    borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, backgroundColor: colors.canvas,
    paddingHorizontal: 14, paddingVertical: 12, fontFamily: fonts.body, fontSize: 15, color: colors.ink,
    minHeight: 84, textAlignVertical: 'top',
  },
  submitButton: { backgroundColor: colors.brand, borderRadius: radius.pill, height: 48, alignItems: 'center', justifyContent: 'center' },
  submitButtonDisabled: { opacity: 0.45 },
  submitButtonText: { fontFamily: fonts.bodySemi, color: '#ffffff', fontSize: 15 },
  loginBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14, marginBottom: 16,
    borderRadius: radius.lg, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.lineStrong,
  },
  loginPrompt: { flex: 1, fontFamily: fonts.body, fontSize: 14, color: colors.textMuted },
  commentItem: { paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.line },
  commentHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  avatar: { width: 38, height: 38, borderRadius: 19, marginRight: 10 },
  avatarPlaceholder: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: colors.brand,
    justifyContent: 'center', alignItems: 'center', marginRight: 10,
  },
  avatarInitial: { fontFamily: fonts.headingBold, color: '#ffffff', fontSize: 16 },
  commentMeta: { flex: 1 },
  commentAuthor: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.ink },
  commentDate: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint, marginTop: 1 },
  deleteButton: { paddingVertical: 6, paddingHorizontal: 10 },
  deleteText: { fontFamily: fonts.bodySemi, fontSize: 12, color: colors.brand },
  commentContent: { fontFamily: fonts.body, fontSize: 15, color: colors.text, lineHeight: 22, marginBottom: 10 },
  likeButton: {
    alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5,
    height: 30, paddingHorizontal: 11, borderRadius: radius.pill, backgroundColor: colors.brandSoft,
  },
  likeText: { fontFamily: fonts.bodySemi, fontSize: 12, color: colors.ink },
  errorBox: {
    backgroundColor: colors.warningSoft, borderRadius: radius.lg, borderWidth: 1, borderColor: '#fed7aa',
    padding: 14, marginBottom: 12, gap: 10,
  },
  errorText: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: '#92400e' },
  retryButton: { alignSelf: 'flex-start', height: 38, justifyContent: 'center', paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: colors.ink },
  retryText: { fontFamily: fonts.bodySemi, fontSize: 13, color: '#ffffff' },
  emptyText: { fontFamily: fonts.body, fontSize: 14, color: colors.textMuted, textAlign: 'center', paddingVertical: 20 },
});
