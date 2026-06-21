import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useLanguage, type Language } from '@/contexts/LanguageContext';
import { useColors } from '@/hooks/useColors';

const LANGUAGES: { code: Language; nativeLabel: string; label: string; flag: string }[] = [
  { code: 'en', nativeLabel: 'English', label: 'English', flag: '🇬🇧' },
  { code: 'hi', nativeLabel: 'हिंदी', label: 'Hindi', flag: '🇮🇳' },
];

export default function LanguageSettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { language, setLanguage, t } = useLanguage();
  const [saving, setSaving] = useState(false);

  async function handleSelect(lang: Language) {
    if (lang === language || saving) return;
    setSaving(true);
    await Haptics.selectionAsync();
    await setLanguage(lang);
    setSaving(false);
    Alert.alert('', t('language.languageChanged'), [{ text: t('common.ok') }]);
  }

  const styles = makeStyles(colors);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.navbar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.navTitle}>{t('language.settingsTitle')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <Text style={styles.subtitle}>{t('language.settingsSubtitle')}</Text>

      <View style={styles.options}>
        {LANGUAGES.map((lang) => {
          const isSelected = language === lang.code;
          return (
            <TouchableOpacity
              key={lang.code}
              style={[styles.option, isSelected && styles.optionSelected]}
              onPress={() => handleSelect(lang.code)}
              activeOpacity={0.7}
            >
              <View style={styles.optionLeft}>
                <Text style={styles.flag}>{lang.flag}</Text>
                <View>
                  <Text style={[styles.optionLabel, isSelected && { color: colors.primary }]}>
                    {lang.nativeLabel}
                  </Text>
                  {lang.nativeLabel !== lang.label && (
                    <Text style={styles.optionSub}>{lang.label}</Text>
                  )}
                </View>
              </View>
              <View style={[styles.radio, isSelected && { borderColor: colors.primary }]}>
                {isSelected && <View style={[styles.radioDot, { backgroundColor: colors.primary }]} />}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof import('@/hooks/useColors').useColors>) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    navbar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    backBtn: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    navTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.text,
    },
    subtitle: {
      fontSize: 14,
      color: colors.mutedForeground,
      paddingHorizontal: 20,
      paddingTop: 20,
      paddingBottom: 12,
    },
    options: {
      gap: 10,
      paddingHorizontal: 16,
    },
    option: {
      backgroundColor: colors.card,
      borderRadius: 14,
      padding: 18,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderWidth: 1.5,
      borderColor: colors.border,
    },
    optionSelected: {
      borderColor: colors.primary,
    },
    optionLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    flag: {
      fontSize: 28,
    },
    optionLabel: {
      fontSize: 17,
      fontWeight: '600',
      color: colors.text,
    },
    optionSub: {
      fontSize: 12,
      color: colors.mutedForeground,
      marginTop: 2,
    },
    radio: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 2,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    radioDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
    },
  });
}
