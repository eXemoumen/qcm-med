// ============================================================================
// Outils Tab - Redirects to the standalone Outils page
// ============================================================================

import { useEffect } from 'react';
import { View, Text, Pressable, Platform, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Calculator, ClipboardCheck, ChevronRight } from 'lucide-react-native';
import { useTheme } from '@/context/ThemeContext';
import { WebHeader } from '@/components/ui/WebHeader';

export default function OutilsTab() {
  const { colors, isDark } = useTheme();
  const { width } = useWindowDimensions();
  const isWeb = Platform.OS === 'web';
  const showWebHeader = isWeb && width >= 768;
  const isDesktop = width >= 900;

  const tools = [
    {
      title: 'Moyen Calc',
      description: 'Calculez votre moyenne annuelle avec les coefficients de votre année.',
      icon: Calculator,
      color: '#9941ff',
      route: '/moyen-calc',
    },
    {
      title: 'QCM Calc',
      description: "Calculez votre note d'examen QCM avec les réponses correctes.",
      icon: ClipboardCheck,
      color: '#09b2ac',
      route: '/qcm-calc',
    },
  ];

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.background }}
      edges={showWebHeader ? ['bottom'] : ['top', 'bottom']}
    >
      {showWebHeader && <WebHeader />}

      <View
        style={{
          flex: 1,
          paddingHorizontal: isDesktop ? 32 : 20,
          paddingTop: showWebHeader ? 40 : 24,
        }}
      >
        <Text
          style={{
            fontSize: isDesktop ? 30 : 26,
            fontWeight: '900',
            color: colors.text,
            letterSpacing: -0.5,
            marginBottom: 6,
          }}
        >
          Outils
        </Text>
        <Text
          style={{
            color: colors.textMuted,
            fontSize: 15,
            lineHeight: 22,
            marginBottom: 28,
          }}
        >
          Des outils pratiques pour vous accompagner.
        </Text>

        <View style={{ gap: 14 }}>
          {tools.map((tool) => (
            <Pressable
              key={tool.route}
              onPress={() => router.push(tool.route as any)}
            >
              <View
                style={{
                  backgroundColor: colors.card,
                  borderRadius: 18,
                  borderWidth: 1,
                  borderColor: colors.border,
                  overflow: 'hidden',
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: isDark ? 0.24 : 0.08,
                  shadowRadius: 8,
                  elevation: 3,
                }}
              >
                <View style={{ height: 3, backgroundColor: tool.color, width: '100%' }} />
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    padding: isDesktop ? 18 : 14,
                    gap: 14,
                  }}
                >
                  <View
                    style={{
                      width: 46,
                      height: 46,
                      borderRadius: 15,
                      backgroundColor: isDark
                        ? `${tool.color}25`
                        : `${tool.color}15`,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <tool.icon size={24} color={tool.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        color: colors.text,
                        fontSize: 16,
                        fontWeight: '800',
                        marginBottom: 3,
                      }}
                    >
                      {tool.title}
                    </Text>
                    <Text
                      style={{
                        color: colors.textMuted,
                        fontSize: 13,
                        lineHeight: 18,
                      }}
                      numberOfLines={2}
                    >
                      {tool.description}
                    </Text>
                  </View>
                  <ChevronRight size={18} color={colors.textMuted} />
                </View>
              </View>
            </Pressable>
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}
