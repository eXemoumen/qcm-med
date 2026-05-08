import { Platform, Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Calculator, ChevronLeft, ClipboardCheck } from "lucide-react-native";
import { WebHeader } from "@/components/ui/WebHeader";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";

export default function OutilsScreen() {
  const { isAuthenticated } = useAuth();
  const { colors, isDark } = useTheme();
  const { width } = useWindowDimensions();
  const isWeb = Platform.OS === "web";
  const showWebHeader = isWeb && width >= 768;
  const isDesktop = width >= 900;
  const contentMaxWidth = 1100;

  const handleBack = () => {
    if (isAuthenticated) {
      router.replace("/(tabs)" as any);
      return;
    }
    router.replace(isWeb ? "/landing" : "/(auth)/welcome" as any);
  };

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.background }}
      edges={showWebHeader ? ["bottom"] : ["top", "bottom"]}
    >
      {showWebHeader && <WebHeader />}

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          alignItems: "center",
          paddingBottom: isDesktop ? 64 : 36,
          paddingTop: showWebHeader ? 40 : 24,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={{
            width: "100%",
            maxWidth: contentMaxWidth,
            paddingHorizontal: isDesktop ? 32 : 22,
          }}
        >
          {/* Header Area */}
          <View style={{ marginBottom: 32 }}>
            <Pressable
              onPress={handleBack}
              accessibilityRole="button"
              accessibilityLabel="Retourner à la page précédente"
              accessibilityHint="Navigue vers la page précédente"
              style={{
                flexDirection: "row",
                alignItems: "center",
                alignSelf: "flex-start",
                paddingVertical: 8,
                paddingRight: 12,
                marginBottom: 16,
              }}
            >
              <ChevronLeft size={20} color={colors.text} />
              <Text
                style={{
                  color: colors.text,
                  fontSize: 14,
                  fontWeight: "700",
                  marginLeft: 4,
                }}
              >
                Retour
              </Text>
            </Pressable>

            <Text
              style={{
                fontSize: isDesktop ? 32 : 28,
                fontWeight: "900",
                color: colors.text,
                letterSpacing: -0.5,
                marginBottom: 8,
              }}
            >
              Outils
            </Text>
            <Text
              style={{
                color: colors.textMuted,
                fontSize: 16,
                lineHeight: 24,
              }}
            >
              Des outils pratiques pour vous accompagner tout au long de l'année.
            </Text>
          </View>

          {/* Cards Grid */}
          <View style={{ gap: 16 }}>
            <Pressable 
              onPress={() => router.push("/moyen-calc" as any)}
              accessibilityRole="button"
              accessibilityLabel="Ouvrir le calculateur de moyenne"
              accessibilityHint="Ouvre l'outil Moyen Calc pour calculer votre moyenne"
            >
              <View
                style={{
                  backgroundColor: colors.card,
                  borderRadius: isDesktop ? 20 : 18,
                  borderWidth: 1,
                  borderColor: colors.border,
                  overflow: "hidden",
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: isDark ? 0.24 : 0.08,
                  shadowRadius: 8,
                  elevation: 3,
                }}
              >
                <View
                  style={{
                    height: 4,
                    backgroundColor: "#9941ff",
                    width: "100%",
                  }}
                />
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: isDesktop ? 18 : 14,
                    gap: 14,
                  }}
                >
                  <View
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 16,
                      backgroundColor: isDark
                        ? "rgba(153, 65, 255, 0.18)"
                        : "rgba(153, 65, 255, 0.1)",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Calculator size={25} color="#9941ff" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        color: colors.text,
                        fontSize: isDesktop ? 17 : 15,
                        fontWeight: "800",
                        marginBottom: 4,
                      }}
                    >
                      Moyen Calc
                    </Text>
                    <Text
                      style={{
                        color: colors.textMuted,
                        fontSize: isDesktop ? 14 : 13,
                        lineHeight: isDesktop ? 20 : 18,
                      }}
                      numberOfLines={2}
                    >
                      Calculez votre moyenne annuelle avec les coefficients de votre année.
                    </Text>
                  </View>
                  <View
                    style={{
                      backgroundColor: colors.primaryMuted,
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderRadius: 10,
                    }}
                  >
                    <Text
                      style={{
                        color: colors.primary,
                        fontSize: 12,
                        fontWeight: "800",
                      }}
                    >
                      Ouvrir
                    </Text>
                  </View>
                </View>
              </View>
            </Pressable>

            <Pressable 
              onPress={() => router.push("/qcm-calc" as any)}
              accessibilityRole="button"
              accessibilityLabel="Ouvrir le calculateur QCM"
              accessibilityHint="Ouvre l'outil QCM Calc pour calculer votre note d'examen"
            >
              <View
                style={{
                  backgroundColor: colors.card,
                  borderRadius: isDesktop ? 20 : 18,
                  borderWidth: 1,
                  borderColor: colors.border,
                  overflow: "hidden",
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: isDark ? 0.24 : 0.08,
                  shadowRadius: 8,
                  elevation: 3,
                }}
              >
                <View
                  style={{
                    height: 4,
                    backgroundColor: "#09b2ac",
                    width: "100%",
                  }}
                />
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: isDesktop ? 18 : 14,
                    gap: 14,
                  }}
                >
                  <View
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 16,
                      backgroundColor: isDark
                        ? "rgba(9, 178, 172, 0.18)"
                        : "rgba(9, 178, 172, 0.1)",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <ClipboardCheck size={25} color="#09b2ac" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        color: colors.text,
                        fontSize: isDesktop ? 17 : 15,
                        fontWeight: "800",
                        marginBottom: 4,
                      }}
                    >
                      QCM Calc
                    </Text>
                    <Text
                      style={{
                        color: colors.textMuted,
                        fontSize: isDesktop ? 14 : 13,
                        lineHeight: isDesktop ? 20 : 18,
                      }}
                      numberOfLines={2}
                    >
                      Calculez votre note d'examen QCM avec les réponses correctes.
                    </Text>
                  </View>
                  <View
                    style={{
                      backgroundColor: colors.primaryMuted,
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderRadius: 10,
                    }}
                  >
                    <Text
                      style={{
                        color: colors.primary,
                        fontSize: 12,
                        fontWeight: "800",
                      }}
                    >
                      Ouvrir
                    </Text>
                  </View>
                </View>
              </View>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
