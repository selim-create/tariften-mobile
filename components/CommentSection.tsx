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
import { useAuth } from '../context/AuthContext';
import { addComment, deleteComment, getComments, toggleCommentLike } from '../lib/api';
import { Comment } from '../lib/types';

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
            <Text style={styles.avatarInitial}>{item.author.name?.charAt(0)?.toUpperCase()}</Text>
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
      <TouchableOpacity style={styles.likeButton} onPress={() => handleLike(item.id)}>
        <Text style={styles.likeText}>👍 {item.likes || 0}</Text>
      </TouchableOpacity>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color="#e74c3c" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Yorumlar ({comments.length})</Text>
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
            placeholderTextColor="#999"
            multiline
            maxLength={500}
          />
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
        <Text style={styles.loginPrompt}>Yorum yapmak için giriş yapın.</Text>
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
  container: {
    paddingVertical: 16,
  },
  loadingContainer: {
    padding: 20,
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 16,
  },
  inputContainer: {
    marginBottom: 16,
    gap: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#1a1a1a',
    minHeight: 80,
    textAlignVertical: 'top',
  },
  submitButton: {
    backgroundColor: '#e74c3c',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 15,
  },
  loginPrompt: {
    fontSize: 14,
    color: '#666666',
    marginBottom: 16,
    fontStyle: 'italic',
  },
  commentItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  commentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 10,
  },
  avatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#e74c3c',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  avatarInitial: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 16,
  },
  commentMeta: {
    flex: 1,
  },
  commentAuthor: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  commentDate: {
    fontSize: 11,
    color: '#999999',
  },
  deleteButton: {
    padding: 4,
  },
  deleteText: {
    fontSize: 12,
    color: '#e74c3c',
  },
  commentContent: {
    fontSize: 14,
    color: '#1a1a1a',
    lineHeight: 20,
    marginBottom: 8,
  },
  likeButton: {
    alignSelf: 'flex-start',
  },
  likeText: {
    fontSize: 13,
    color: '#666666',
  },
  errorBox: {
    backgroundColor: '#fff7ed',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#fed7aa',
    padding: 14,
    marginBottom: 12,
    gap: 10,
  },
  errorText: {
    fontSize: 13,
    lineHeight: 19,
    color: '#92400e',
  },
  retryButton: {
    alignSelf: 'flex-start',
    paddingVertical: 9,
    paddingHorizontal: 15,
    borderRadius: 8,
    backgroundColor: '#292524',
  },
  retryText: {
    fontWeight: '700',
    fontSize: 13,
    color: '#ffffff',
  },
  emptyText: {
    fontSize: 14,
    color: '#999999',
    textAlign: 'center',
    paddingVertical: 20,
    fontStyle: 'italic',
  },
});
