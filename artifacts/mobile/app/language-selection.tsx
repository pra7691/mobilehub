import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useLanguage, type Language } from '@/contexts/LanguageContext';

const LANGUAGES: { code: Language; label: string; nativeLabel: string; flag: string }[] = [
  { code: 'en', label: 'English', nativeLabel: 'English', flag: 'EN' },
  { code: 'hi', label: 'Hindi', nativeLabel: 'हिंदी', flag: 'HI' },
];

export default function LanguageSelectionScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { setLanguage } = useLanguage();
  const [selected, setSelected] = useState<Language | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSelect(lang: Language) {
    setSelected(lang);
    await Haptics.selectionAsync();
  }

  async function handleContinue() {
    if (!selected || saving) return;
    setSaving(true);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await setLanguage(selected);
    router.replace('/(auth)/login');
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <StatusBar barStyle="light-content" />

      <View style={styles.header}>
        <Text style={styles.logo}>Capto</Text>
        <Text style={styles.title}>Choose your language</Text>
        <Text style={styles.subtitle}>भाषा चुनें</Text>
      </View>

      <View style={styles.options}>
        {LANGUAGES.map((lang) => {
          const isSelected = selected === lang.code;
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
                  <Text style={[styles.optionLabel, isSelected && styles.optionLabelSelected]}>
                    {lang.nativeLabel}
                  </Text>
                  {lang.nativeLabel !== lang.label && (
                    <Text style={[styles.optionSub, isSelected && styles.optionSubSelected]}>
                      {lang.label}
                    </Text>
                  )}
                </View>
              </View>
              <View style={[styles.radio, isSelected && styles.radioSelected]}>
                {isSelected && <View style={styles.radioDot} />}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.continueBtn, !selected && styles.continueBtnDisabled]}
          onPress={handleContinue}
          disabled={!selected || saving}
          activeOpacity={0.8}
        >
          {saving ? (
            <ActivityIndicator color="#0a0a0a" />
          ) : (
            <Text style={[styles.continueBtnText, !selected && styles.continueBtnTextDisabled]}>
              {selected === 'hi' ? 'जारी रखें' : 'Continue'}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const CYAN = '#00e5ff';
const BG = '#0a0a0a';
const CARD = '#1a1a1a';
const BORDER = '#2a2a2a';
const TEXT = '#ffffff';
const MUTED = '#888888';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
    paddingHorizontal: 24,
  },
  header: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 32,
  },
  logo: {
    fontSize: 36,
    fontWeight: '800',
    color: CYAN,
    letterSpacing: -1,
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: TEXT,
    textAlign: 'center',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 16,
    color: MUTED,
    textAlign: 'center',
  },
  options: {
    gap: 12,
    marginBottom: 32,
  },
  option: {
    backgroundColor: CARD,
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1.5,
    borderColor: BORDER,
  },
  optionSelected: {
    borderColor: CYAN,
    backgroundColor: '#001a1e',
  },
  optionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  flag: {
    fontSize: 32,
  },
  optionLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: TEXT,
  },
  optionLabelSelected: {
    color: CYAN,
  },
  optionSub: {
    fontSize: 13,
    color: MUTED,
    marginTop: 2,
  },
  optionSubSelected: {
    color: '#00b8cc',
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: CYAN,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: CYAN,
  },
  footer: {
    paddingBottom: 8,
  },
  continueBtn: {
    backgroundColor: CYAN,
    borderRadius: 14,
    paddingVertical: 17,
    alignItems: 'center',
  },
  continueBtnDisabled: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: BORDER,
  },
  continueBtnText: {
    fontSize: 17,
    fontWeight: '700',
    color: BG,
  },
  continueBtnTextDisabled: {
    color: MUTED,
  },
});
