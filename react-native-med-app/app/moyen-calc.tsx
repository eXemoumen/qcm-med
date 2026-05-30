import { useEffect, useMemo, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import {
  AlertCircle,
  Calculator,
  CheckCircle2,
  ChevronLeft,
} from "lucide-react-native";

import { WebHeader } from "@/components/ui/WebHeader";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import type { YearLevel } from "@/types";
import {
  YEAR_CONFIGS,
  calculateMoyenne,
  createInitialMoyenValues,
  parseNoteInput,
  type MoyenInputItem,
} from "@/lib/moyenCalc";

const YEAR_KEYS: YearLevel[] = ["1", "2", "3"];

type ValuesByYear = Record<YearLevel, Record<string, string>>;

interface ItemGroup {
  id: string;
  title: string;
  subtitle: string;
  items: MoyenInputItem[];
}

function buildInitialValues(): ValuesByYear {
  return {
    "1": createInitialMoyenValues("1"),
    "2": createInitialMoyenValues("2"),
    "3": createInitialMoyenValues("3"),
  };
}

function getGroups(year: YearLevel): ItemGroup[] {
  const config = YEAR_CONFIGS[year];

  if (year === "1") {
    return [
      {
        id: "s1",
        title: "Semestre 1",
        subtitle: "Notes coefficient 1",
        items: config.items.filter((item) => item.semester === "S1"),
      },
      {
        id: "s2",
        title: "Semestre 2",
        subtitle: "Notes coefficient 1",
        items: config.items.filter((item) => item.semester === "S2"),
      },
    ];
  }

  return [
    {
      id: "uei",
      title: "U.E.I",
      subtitle: "Chaque note compte coefficient 2",
      items: config.items.filter((item) => item.type === "uei"),
    },
    {
      id: "modules",
      title: "Modules",
      subtitle: "Chaque note compte coefficient 1",
      items: config.items.filter((item) => item.type === "module"),
    },
  ];
}

export default function MoyenCalcScreen() {
  const { user, isAuthenticated } = useAuth();
  const { colors, isDark } = useTheme();
  const { width } = useWindowDimensions();
  const isWeb = Platform.OS === "web";
  const showWebHeader = isWeb && width >= 768;
  const isDesktop = width >= 900;
  const canUseTwoColumns = width >= 760;
  const contentMaxWidth = 1100;
  const userYearApplied = useRef(false);

  const [selectedYear, setSelectedYear] = useState<YearLevel>(
    user?.year_of_study || "2",
  );
  const [valuesByYear, setValuesByYear] = useState<ValuesByYear>(() =>
    buildInitialValues(),
  );

  useEffect(() => {
    if (userYearApplied.current || !user?.year_of_study) return;
    userYearApplied.current = true;
    setSelectedYear(user.year_of_study);
  }, [user?.year_of_study]);

  const config = YEAR_CONFIGS[selectedYear];
  const values = valuesByYear[selectedYear];
  const result = useMemo(
    () => calculateMoyenne(selectedYear, values),
    [selectedYear, values],
  );
  const groups = useMemo(() => getGroups(selectedYear), [selectedYear]);

  const handleBack = () => {
    if (isAuthenticated) {
      router.replace("/(tabs)" as any);
      return;
    }

    router.replace(isWeb ? "/landing" : "/(auth)/welcome" as any);
  };

  const updateValue = (itemId: string, nextValue: string) => {
    setValuesByYear((current) => ({
      ...current,
      [selectedYear]: {
        ...current[selectedYear],
        [itemId]: nextValue,
      },
    }));
  };

  const progress =
    config.items.length === 0 ? 0 : result.completedCount / config.items.length;

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.background }}
      edges={showWebHeader ? ["bottom"] : ["top", "bottom"]}
    >
      {showWebHeader && <WebHeader />}

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            alignItems: "center",
            paddingBottom: isDesktop ? 64 : 36,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <LinearGradient
            colors={isDark ? ["#115E59", "#0D9488"] : ["#0D9488", "#09B2AD"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              width: "100%",
              alignItems: "center",
              paddingTop: showWebHeader ? 44 : 24,
              paddingBottom: isDesktop ? 92 : 72,
              borderBottomLeftRadius: isDesktop ? 44 : 32,
              borderBottomRightRadius: isDesktop ? 44 : 32,
            }}
          >
            <View
              style={{
                width: "100%",
                maxWidth: contentMaxWidth,
                paddingHorizontal: isDesktop ? 32 : 22,
              }}
            >
              <Pressable
                onPress={handleBack}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  alignSelf: "flex-start",
                  paddingVertical: 8,
                  paddingRight: 12,
                  marginBottom: 24,
                }}
              >
                <ChevronLeft size={20} color="#ffffff" />
                <Text
                  style={{
                    color: "#ffffff",
                    fontSize: 14,
                    fontWeight: "700",
                    marginLeft: 4,
                  }}
                >
                  Retour
                </Text>
              </Pressable>

              <View
                style={{
                  flexDirection: isDesktop ? "row" : "column",
                  alignItems: isDesktop ? "center" : "flex-start",
                  justifyContent: "space-between",
                  gap: 24,
                }}
              >
                <View style={{ flex: 1 }}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      marginBottom: 14,
                    }}
                  >
                    <View
                      style={{
                        width: 46,
                        height: 46,
                        borderRadius: 16,
                        backgroundColor: "rgba(255,255,255,0.18)",
                        alignItems: "center",
                        justifyContent: "center",
                        marginRight: 12,
                      }}
                    >
                      <Calculator size={26} color="#ffffff" />
                    </View>
                    <Text
                      style={{
                        color: "rgba(255,255,255,0.8)",
                        fontSize: 13,
                        fontWeight: "800",
                        letterSpacing: 1.2,
                        textTransform: "uppercase",
                      }}
                    >
                      Médecine
                    </Text>
                  </View>

                  <Text
                    style={{
                      color: "#ffffff",
                      fontSize: isDesktop ? 46 : 34,
                      fontWeight: "900",
                      letterSpacing: -0.8,
                      marginBottom: 12,
                    }}
                  >
                    Moyen Calc
                  </Text>
                  <Text
                    style={{
                      color: "rgba(255,255,255,0.82)",
                      fontSize: isDesktop ? 18 : 15,
                      lineHeight: isDesktop ? 28 : 23,
                      maxWidth: 620,
                    }}
                  >
                    Calculez votre moyenne annuelle avec les coefficients officiels
                    de chaque année.
                  </Text>
                </View>

                <View
                  style={{
                    backgroundColor: "rgba(255,255,255,0.14)",
                    borderRadius: 20,
                    padding: 16,
                    minWidth: isDesktop ? 250 : "100%",
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.18)",
                  }}
                >
                  <Text
                    style={{
                      color: "rgba(255,255,255,0.72)",
                      fontSize: 12,
                      fontWeight: "700",
                      marginBottom: 6,
                    }}
                  >
                    Moyenne actuelle
                  </Text>
                  <Text
                    style={{
                      color: "#ffffff",
                      fontSize: 38,
                      fontWeight: "900",
                      letterSpacing: -0.6,
                    }}
                  >
                    {result.moyenne === null ? "—" : result.moyenne.toFixed(2)}
                    <Text style={{ fontSize: 18, fontWeight: "800" }}>/20</Text>
                  </Text>
                  <View
                    style={{
                      height: 7,
                      backgroundColor: "rgba(255,255,255,0.18)",
                      borderRadius: 999,
                      overflow: "hidden",
                      marginTop: 12,
                    }}
                  >
                    <View
                      style={{
                        width: `${Math.round(progress * 100)}%`,
                        height: "100%",
                        backgroundColor: "#ffffff",
                        borderRadius: 999,
                      }}
                    />
                  </View>
                </View>
              </View>
            </View>
          </LinearGradient>

          <View
            style={{
              width: "100%",
              maxWidth: contentMaxWidth,
              paddingHorizontal: isDesktop ? 32 : 18,
              marginTop: isDesktop ? -52 : -42,
            }}
          >
            <View
              style={{
                backgroundColor: colors.card,
                borderRadius: 22,
                borderWidth: 1,
                borderColor: colors.border,
                padding: isDesktop ? 22 : 16,
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: isDark ? 0.28 : 0.12,
                shadowRadius: 20,
                elevation: 8,
              }}
            >
              <Text
                style={{
                  color: colors.text,
                  fontSize: 15,
                  fontWeight: "800",
                  marginBottom: 12,
                }}
              >
                Année d'étude
              </Text>
              <View
                style={{
                  flexDirection: canUseTwoColumns ? "row" : "column",
                  gap: 10,
                }}
              >
                {YEAR_KEYS.map((year) => {
                  const isSelected = selectedYear === year;
                  return (
                    <Pressable
                      key={year}
                      onPress={() => setSelectedYear(year)}
                      style={{
                        flex: 1,
                        minHeight: 52,
                        borderRadius: 14,
                        borderWidth: 1,
                        borderColor: isSelected ? colors.primary : colors.border,
                        backgroundColor: isSelected
                          ? colors.primaryMuted
                          : colors.backgroundSecondary,
                        alignItems: "center",
                        justifyContent: "center",
                        paddingHorizontal: 12,
                      }}
                    >
                      <Text
                        style={{
                          color: isSelected ? colors.primary : colors.text,
                          fontWeight: "800",
                          fontSize: 15,
                        }}
                      >
                        {YEAR_CONFIGS[year].label}
                      </Text>
                      <Text
                        style={{
                          color: colors.textMuted,
                          fontSize: 12,
                          marginTop: 2,
                        }}
                      >
                        Coef {YEAR_CONFIGS[year].totalCoefficients}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={{ marginTop: 20 }}>
              {groups.map((group) => (
                <View key={group.id} style={{ marginBottom: 18 }}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "flex-end",
                      justifyContent: "space-between",
                      marginBottom: 12,
                      paddingHorizontal: 2,
                      gap: 12,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          color: colors.text,
                          fontSize: 19,
                          fontWeight: "900",
                          letterSpacing: -0.3,
                        }}
                      >
                        {group.title}
                      </Text>
                      <Text
                        style={{
                          color: colors.textMuted,
                          fontSize: 13,
                          marginTop: 3,
                        }}
                      >
                        {group.subtitle}
                      </Text>
                    </View>
                  </View>

                  <View
                    style={{
                      flexDirection: "row",
                      flexWrap: "wrap",
                      marginHorizontal: canUseTwoColumns ? -7 : 0,
                    }}
                  >
                    {group.items.map((item) => {
                      const rawValue = values[item.id] || "";
                      const hasValue = rawValue.trim().length > 0;
                      const isInvalid =
                        hasValue && parseNoteInput(rawValue) === null;

                      return (
                        <View
                          key={item.id}
                          style={{
                            width: canUseTwoColumns ? "50%" : "100%",
                            paddingHorizontal: canUseTwoColumns ? 7 : 0,
                            marginBottom: 12,
                          }}
                        >
                          <View
                            style={{
                              backgroundColor: colors.card,
                              borderRadius: 16,
                              borderWidth: 1,
                              borderColor: isInvalid
                                ? colors.error
                                : colors.border,
                              padding: 14,
                            }}
                          >
                            <View
                              style={{
                                flexDirection: "row",
                                alignItems: "center",
                                gap: 10,
                              }}
                            >
                              <Text
                                style={{
                                  flex: 1,
                                  color: colors.text,
                                  fontSize: 14,
                                  fontWeight: "800",
                                  lineHeight: 19,
                                }}
                                numberOfLines={2}
                              >
                                {item.label}
                              </Text>
                              <View
                                style={{
                                  backgroundColor: colors.primaryMuted,
                                  borderRadius: 999,
                                  paddingHorizontal: 9,
                                  paddingVertical: 5,
                                }}
                              >
                                <Text
                                  style={{
                                    color: colors.primary,
                                    fontSize: 12,
                                    fontWeight: "800",
                                  }}
                                >
                                  coef {item.coefficient}
                                </Text>
                              </View>
                              <TextInput
                                value={rawValue}
                                onChangeText={(nextValue) =>
                                  updateValue(item.id, nextValue)
                                }
                                placeholder="/ 20"
                                placeholderTextColor={colors.textMuted}
                                keyboardType="decimal-pad"
                                maxLength={5}
                                style={{
                                  width: 72,
                                  minHeight: 42,
                                  borderRadius: 12,
                                  borderWidth: 1,
                                  borderColor: isInvalid
                                    ? colors.error
                                    : colors.border,
                                  backgroundColor: colors.backgroundSecondary,
                                  color: colors.text,
                                  fontSize: 18,
                                  fontWeight: "800",
                                  paddingHorizontal: 10,
                                  textAlign: "center",
                                  outlineStyle: "none" as any,
                                }}
                              />
                            </View>

                            {isInvalid && (
                              <View
                                style={{
                                  flexDirection: "row",
                                  alignItems: "center",
                                  marginTop: 8,
                                }}
                              >
                                <AlertCircle size={14} color={colors.error} />
                                <Text
                                  style={{
                                    color: colors.error,
                                    fontSize: 12,
                                    fontWeight: "600",
                                    marginLeft: 6,
                                  }}
                                >
                                  Entrez une note entre 0 et 20.
                                </Text>
                              </View>
                            )}
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </View>
              ))}
            </View>

            <View
              style={{
                backgroundColor: colors.cardElevated,
                borderRadius: 22,
                borderWidth: 1,
                borderColor: colors.border,
                padding: isDesktop ? 22 : 16,
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: isDark ? 0.24 : 0.08,
                shadowRadius: 14,
                elevation: 4,
              }}
            >
              <View
                style={{
                  flexDirection: canUseTwoColumns ? "row" : "column",
                  alignItems: canUseTwoColumns ? "center" : "stretch",
                  justifyContent: "space-between",
                  gap: 16,
                }}
              >
                <View style={{ flex: 1 }}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      marginBottom: 8,
                    }}
                  >
                    {result.isComplete ? (
                      <CheckCircle2 size={20} color={colors.success} />
                    ) : (
                      <AlertCircle
                        size={20}
                        color={result.invalidCount > 0 ? colors.error : colors.warning}
                      />
                    )}
                    <Text
                      style={{
                        color: colors.text,
                        fontSize: 17,
                        fontWeight: "900",
                        marginLeft: 8,
                      }}
                    >
                      Résultat
                    </Text>
                  </View>
                  <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                    {result.isComplete
                      ? "Toutes les notes sont complétées."
                      : result.invalidCount > 0
                        ? "Corrigez les notes en rouge pour les inclure dans la moyenne."
                        : `${result.missingCount} note${result.missingCount > 1 ? "s" : ""} restante${result.missingCount > 1 ? "s" : ""} — la moyenne se met à jour en temps réel.`}
                  </Text>
                </View>

                <View
                  style={{
                    alignItems: canUseTwoColumns ? "flex-end" : "flex-start",
                  }}
                >
                  <Text
                    style={{
                      color: colors.text,
                      fontSize: 36,
                      fontWeight: "900",
                      letterSpacing: -0.6,
                    }}
                  >
                    {result.moyenne === null ? "—" : result.moyenne.toFixed(2)}
                    <Text
                      style={{
                        color: colors.textMuted,
                        fontSize: 16,
                        fontWeight: "800",
                      }}
                    >
                      /20
                    </Text>
                  </Text>
                </View>
              </View>

              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  marginTop: 18,
                  marginHorizontal: -5,
                }}
              >
                <ResultMetric
                  label="Champs"
                  value={`${result.completedCount}/${config.items.length}`}
                  colors={colors}
                />
                <ResultMetric
                  label="Manquants"
                  value={String(result.missingCount)}
                  colors={colors}
                />
                <ResultMetric
                  label="Somme"
                  value={result.weightedSum.toFixed(2)}
                  colors={colors}
                />
                <ResultMetric
                  label="Total coef"
                  value={String(result.totalCoefficients)}
                  colors={colors}
                />
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ResultMetric({
  label,
  value,
  colors,
}: {
  label: string;
  value: string;
  colors: any;
}) {
  return (
    <View style={{ width: "50%", padding: 5 }}>
      <View
        style={{
          backgroundColor: colors.backgroundSecondary,
          borderRadius: 14,
          paddingHorizontal: 12,
          paddingVertical: 11,
          borderWidth: 1,
          borderColor: colors.border,
        }}
      >
        <Text
          style={{
            color: colors.textMuted,
            fontSize: 11,
            fontWeight: "700",
            marginBottom: 3,
          }}
        >
          {label}
        </Text>
        <Text
          style={{
            color: colors.text,
            fontSize: 17,
            fontWeight: "900",
          }}
        >
          {value}
        </Text>
      </View>
    </View>
  );
}
