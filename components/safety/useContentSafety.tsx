import React, { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { afterModalDismiss } from '../../lib/allergen-alerts';
import { blockAndRemember, hideCommentLocally } from '../../lib/member-blocks';
import {
  BLOCK_CONFIRM_MESSAGE, SafetyError, blockConfirmTitle, blockMenuLabel, canOfferBlock,
} from '../../lib/report-block-api';
import ContentActionsSheet, { type ContentAction } from './ContentActionsSheet';
import ReportSheet, { type ReportTarget } from './ReportSheet';

export interface SafetyAuthor {
  id: number | null;
  name: string;
  avatar?: string | null;
}

export interface SafetyTarget {
  type: 'recipe' | 'comment';
  id: number;
  author: SafetyAuthor;
  /** Second line of the menu: the recipe title, or the comment author's name. */
  title: string;
}

/**
 * "⋯" → Bildir / "<Ad>'ı engelle" for a recipe or a comment. Guests are sent
 * to sign in. Returns `open(target)`, `confirmBlock(author)` and the sheets
 * to render once on the screen.
 */
export function useContentSafety({ onToast }: { onToast: (message: string) => void }) {
  const router = useRouter();
  const { user, token } = useAuth();
  const memberToken = user && token ? token : null;
  const [menuTarget, setMenuTarget] = useState<SafetyTarget | null>(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);

  const open = useCallback((target: SafetyTarget) => {
    setMenuTarget(target);
    setMenuVisible(true);
  }, []);

  const runBlock = useCallback(async (author: SafetyAuthor) => {
    if (!memberToken || author.id === null) { router.push('/login'); return; }
    const name = author.name.trim() || 'Bu üye';
    try {
      await blockAndRemember(memberToken, { id: author.id, name: author.name, avatar: author.avatar });
      onToast(`${name} engellendi`);
    } catch (cause) {
      const error = cause instanceof SafetyError ? cause : null;
      if (error?.code === 'not_allowed') {
        Alert.alert('Bu hesap engellenemez', error.message);
      } else if (error?.code === 'auth') {
        Alert.alert('Oturum gerekli', error.message, [
          { text: 'Vazgeç', style: 'cancel' }, { text: 'Giriş yap', onPress: () => router.push('/login') },
        ]);
      } else {
        Alert.alert('Engellenemedi', error?.message || 'Birazdan tekrar dene.');
      }
    }
  }, [memberToken, onToast, router]);

  /** Contract confirmation: "<Ad> engellensin mi? Tariflerini ve yorumlarını artık görmeyeceksin. …" */
  const confirmBlock = useCallback((author: SafetyAuthor) => {
    Alert.alert(blockConfirmTitle(author.name), BLOCK_CONFIRM_MESSAGE, [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Engelle', style: 'destructive', onPress: () => { void runBlock(author); } },
    ]);
  }, [runBlock]);

  const closeMenu = () => setMenuVisible(false);

  const startReport = async () => {
    const target = menuTarget;
    setMenuVisible(false);
    await afterModalDismiss();
    if (!target) return;
    if (!memberToken) { router.push('/login'); return; }
    setReportTarget({ type: target.type, id: target.id });
  };

  const startBlock = async () => {
    const target = menuTarget;
    setMenuVisible(false);
    await afterModalDismiss();
    if (target) confirmBlock(target.author);
  };

  const actions: ContentAction[] = [];
  if (menuTarget) {
    actions.push({
      key: 'report', label: 'Bildir', icon: 'flag-outline',
      hint: memberToken ? 'Uygunsuz içeriği ekibimize ilet' : 'Bildirmek için giriş yap',
      onPress: () => { void startReport(); },
    });
    if (memberToken && canOfferBlock(menuTarget.author.id, menuTarget.author.name, user?.id ?? null)) {
      actions.push({
        key: 'block', label: blockMenuLabel(menuTarget.author.name), icon: 'hand-left-outline',
        hint: 'Tariflerini ve yorumlarını artık görmezsin',
        onPress: () => { void startBlock(); },
      });
    }
  }

  const finishReport = (message: string, target: ReportTarget) => {
    setReportTarget(null);
    // A reported (or vanished) comment disappears from this session's lists.
    if (target.type === 'comment') hideCommentLocally(target.id);
    onToast(message);
  };

  const element = (
    <>
      <ContentActionsSheet
        visible={menuVisible}
        kicker={menuTarget?.type === 'comment' ? 'Yorum' : 'Tarif'}
        title={menuTarget?.title ?? ''}
        actions={actions}
        onClose={closeMenu}
      />
      <ReportSheet
        visible={reportTarget !== null}
        target={reportTarget}
        onClose={() => setReportTarget(null)}
        onReported={(result, target) => finishReport(result.message, target)}
        onGone={(message, target) => finishReport(message, target)}
        onLogin={() => { setReportTarget(null); router.push('/login'); }}
      />
    </>
  );

  return { open, confirmBlock, element };
}
