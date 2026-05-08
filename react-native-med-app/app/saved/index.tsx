// ============================================================================
// Saved Questions Screen — Folder Navigation with Premium Animations
// Hierarchical view: Module → Sub-discipline → Year+ExamType → Questions
// ============================================================================

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Image,
  Animated,
  LayoutAnimation,
  Platform,
  UIManager,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useFocusEffect, useNavigation } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { getSavedQuestions, unsaveQuestion } from "@/lib/saved";
import { QuestionWithAnswers } from "@/types";
import { FadeInView, ListSkeleton } from "@/components/ui";
import { ChevronLeftIcon } from "@/components/icons";
import { ANIMATION_DURATION, ANIMATION_EASING } from "@/lib/animations";
import { shadowPresets } from "@/lib/shadows";
import { useWebVisibility } from "@/lib/useWebVisibility";
import { SecureTextElement } from "@/components/SecureTextElement";
import {
  groupSavedQuestions,
  resolveFolder,
  buildBreadcrumbs,
  getSortedChildren,
  FolderNode,
} from "@/lib/groupSavedQuestions";
import {
  getQuestionResults,
  getFilterCounts,
  AnswerFilter,
  QuestionResult,
} from "@/lib/answerHistory";

// Use native driver only on native platforms, not on web
const USE_NATIVE_DRIVER = Platform.OS !== "web";

// Enable LayoutAnimation on Android
if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ============================================================================
// Folder Icon Components
// ============================================================================

function FolderIcon({ size = 24, color = "#09B2AC" }: { size?: number; color?: string }) {
  return (
    <Text style={{ fontSize: size, lineHeight: size + 4 }}>📁</Text>
  );
}

function FolderOpenIcon({ size = 24 }: { size?: number }) {
  return (
    <Text style={{ fontSize: size, lineHeight: size + 4 }}>📂</Text>
  );
}

function ChevronRightIcon({ size = 16, color = "#9ca3af" }: { size?: number; color?: string }) {
  return (
    <Text style={{ fontSize: size, color, lineHeight: size + 2 }}>›</Text>
  );
}

// ============================================================================
// Answer Filter Bar
// ============================================================================

interface AnswerFilterBarProps {
  activeFilter: AnswerFilter;
  onFilterChange: (filter: AnswerFilter) => void;
  counts: Record<AnswerFilter, number>;
  colors: any;
  isDark: boolean;
}

const FILTER_CONFIG: {
  key: AnswerFilter;
  label: string;
  emoji: string;
  activeColor: string;
}[] = [
  { key: "all", label: "Tout", emoji: "📋", activeColor: "#09B2AC" },
  { key: "correct", label: "Correct", emoji: "✅", activeColor: "#27AE60" },
  { key: "wrong", label: "Faux", emoji: "❌", activeColor: "#E74C3C" },
  { key: "unanswered", label: "Non répondu", emoji: "⏳", activeColor: "#95A5A6" },
];

function AnswerFilterBar({
  activeFilter,
  onFilterChange,
  counts,
  colors,
  isDark,
}: AnswerFilterBarProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ marginBottom: 16 }}
      contentContainerStyle={{ gap: 8, paddingRight: 4 }}
    >
      {FILTER_CONFIG.map((filter) => {
        const isActive = activeFilter === filter.key;
        const count = counts[filter.key];
        return (
          <TouchableOpacity
            key={filter.key}
            onPress={() => onFilterChange(filter.key)}
            activeOpacity={0.7}
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 14,
              paddingVertical: 10,
              borderRadius: 12,
              borderWidth: 1.5,
              backgroundColor: isActive
                ? filter.activeColor + (isDark ? "25" : "15")
                : colors.card,
              borderColor: isActive ? filter.activeColor : colors.border,
              gap: 6,
            }}
          >
            <Text style={{ fontSize: 14 }}>{filter.emoji}</Text>
            <Text
              style={{
                fontSize: 13,
                fontWeight: isActive ? "700" : "500",
                color: isActive ? filter.activeColor : colors.textSecondary,
              }}
            >
              {filter.label}
            </Text>
            <View
              style={{
                backgroundColor: isActive
                  ? filter.activeColor + (isDark ? "40" : "25")
                  : isDark
                    ? "rgba(255,255,255,0.08)"
                    : "rgba(0,0,0,0.06)",
                paddingHorizontal: 7,
                paddingVertical: 2,
                borderRadius: 8,
                minWidth: 24,
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: "700",
                  color: isActive ? filter.activeColor : colors.textSecondary,
                }}
              >
                {count}
              </Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

// ============================================================================
// Main Screen
// ============================================================================

export default function SavedQuestionsScreen() {
  const navigation = useNavigation();
  const { user, isLoading: authLoading } = useAuth();
  const { colors, isDark } = useTheme();

  const [questions, setQuestions] = useState<QuestionWithAnswers[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);

  // Navigation path — e.g. ["Anatomie", "Ostéologie", "2024 EMD1"]
  const [path, setPath] = useState<string[]>([]);

  // Answer history filter
  const [activeFilter, setActiveFilter] = useState<AnswerFilter>("all");
  const [answerHistory, setAnswerHistory] = useState<Record<string, QuestionResult>>({});

  // Track last load time to prevent rapid reloads
  const lastLoadTime = useRef<number>(0);
  const LOAD_COOLDOWN = 5000;

  // Filter questions based on answer history
  const filteredQuestions = useMemo(() => {
    if (activeFilter === "all") return questions;
    return questions.filter((q) => {
      const result = answerHistory[q.id];
      switch (activeFilter) {
        case "correct":
          return result?.isCorrect === true;
        case "wrong":
          return result?.isCorrect === false;
        case "unanswered":
          return !result;
        default:
          return true;
      }
    });
  }, [questions, activeFilter, answerHistory]);

  // Filter counts for the badge UI
  const filterCounts = useMemo(() => {
    const ids = questions.map((q) => q.id);
    return getFilterCounts(ids, answerHistory);
  }, [questions, answerHistory]);

  // Build folder tree from FILTERED questions
  const folderTree = useMemo(
    () => groupSavedQuestions(filteredQuestions),
    [filteredQuestions],
  );

  // Current folder based on navigation path
  const currentFolder = useMemo(
    () => resolveFolder(folderTree, path),
    [folderTree, path],
  );

  // Breadcrumbs for navigation
  const breadcrumbs = useMemo(() => buildBreadcrumbs(path), [path]);

  // Determine if we're at a leaf level (showing questions)
  const isLeafLevel = useMemo(() => {
    if (!currentFolder) return false;
    return currentFolder.children.size === 0 && currentFolder.questions.length > 0;
  }, [currentFolder]);

  // Children folders at current level
  const childFolders = useMemo(() => {
    if (!currentFolder) return [];
    return getSortedChildren(currentFolder);
  }, [currentFolder]);

  const loadQuestions = useCallback(
    async (force = false) => {
      if (!user) {
        setIsLoading(false);
        return;
      }

      // Prevent rapid reloads unless forced
      const now = Date.now();
      if (!force && hasLoaded && now - lastLoadTime.current < LOAD_COOLDOWN) {
        setRefreshing(false);
        return;
      }

      try {
        lastLoadTime.current = now;
        const { questions: data } = await getSavedQuestions(user.id);
        setQuestions(data);
        setHasLoaded(true);

        // Load answer history for all fetched questions
        const ids = data.map((q) => q.id);
        if (ids.length > 0) {
          const history = await getQuestionResults(ids);
          setAnswerHistory(history);
        }
      } catch (error) {
        if (__DEV__) {
          console.error("Error loading saved questions:", error);
        }
      } finally {
        setIsLoading(false);
        setRefreshing(false);
      }
    },
    [user, hasLoaded],
  );

  // Handle visibility changes on web
  useWebVisibility({
    debounceMs: 200,
    onVisibilityChange: useCallback(
      (isVisible: boolean, hiddenDuration: number) => {
        if (isVisible && hiddenDuration > 60000 && hasLoaded && user) {
          loadQuestions(true);
        }
      },
      [loadQuestions, hasLoaded, user],
    ),
  });

  // Load on focus (native) or initial mount (web)
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS === "web" && hasLoaded) {
        return;
      }
      loadQuestions(true);
    }, [loadQuestions, hasLoaded]),
  );

  // Also load when user changes
  useEffect(() => {
    if (user && !authLoading) {
      loadQuestions(true);
    }
  }, [user?.id, authLoading]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadQuestions(true);
  }, [loadQuestions]);

  const handleUnsave = async (questionId: string) => {
    if (!user) return;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    await unsaveQuestion(user.id, questionId);
    setQuestions((prev) => prev.filter((q) => q.id !== questionId));
  };

  const toggleExpand = (id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedId(expandedId === id ? null : id);
  };

  // Navigate into a folder
  const navigateInto = (folderName: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedId(null);
    setPath((prev) => [...prev, folderName]);
  };

  // Navigate to a breadcrumb level
  const navigateToBreadcrumb = (pathIndex: number) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedId(null);
    if (pathIndex < 0) {
      setPath([]);
    } else {
      setPath((prev) => prev.slice(0, pathIndex + 1));
    }
  };

  // Handle back: go up one level instead of leaving the screen
  const handleBack = () => {
    if (path.length > 0) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setExpandedId(null);
      setPath((prev) => prev.slice(0, -1));
    } else {
      navigation.goBack();
    }
  };

  // ========================================================================
  // Render
  // ========================================================================

  if (isLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <Stack.Screen options={{ title: "Questions sauvegardées" }} />
        <View style={{ padding: 24 }}>
          <ListSkeleton count={5} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: "Questions sauvegardées",
          headerStyle: { backgroundColor: colors.card },
          headerTintColor: colors.text,
          headerLeft: () => (
            <TouchableOpacity
              onPress={handleBack}
              style={{ marginRight: 16 }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <ChevronLeftIcon size={24} color={colors.text} />
            </TouchableOpacity>
          ),
        }}
      />

      <SafeAreaView
        style={{ flex: 1, backgroundColor: colors.background }}
        edges={["bottom"]}
      >
        <ScrollView
          style={{ flex: 1 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
        >
          <View style={{ paddingHorizontal: 20, paddingVertical: 16 }}>
            {/* Global Answer Filter */}
            {questions.length > 0 && path.length === 0 && (
              <FadeInView animation="slideUp" delay={0}>
                <AnswerFilterBar
                  activeFilter={activeFilter}
                  onFilterChange={(f) => {
                    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                    setActiveFilter(f);
                    setPath([]);
                  }}
                  counts={filterCounts}
                  colors={colors}
                  isDark={isDark}
                />
              </FadeInView>
            )}

            {/* Breadcrumb Navigation */}
            {path.length > 0 && (
              <FadeInView animation="slideUp" delay={0}>
                <BreadcrumbBar
                  breadcrumbs={breadcrumbs}
                  onNavigate={navigateToBreadcrumb}
                  colors={colors}
                  isDark={isDark}
                />
              </FadeInView>
            )}

            {questions.length === 0 ? (
              /* Global Empty State */
              <FadeInView animation="scale" delay={100}>
                <View
                  style={{
                    backgroundColor: colors.card,
                    borderRadius: 16,
                    padding: 32,
                    alignItems: "center",
                    marginTop: 32,
                    borderWidth: 1,
                    borderColor: colors.border,
                    ...shadowPresets.md(isDark),
                  }}
                >
                  <Text style={{ fontSize: 48, marginBottom: 16 }}>💾</Text>
                  <Text
                    style={{
                      fontSize: 20,
                      fontWeight: "bold",
                      color: colors.text,
                      marginBottom: 8,
                    }}
                  >
                    Aucune question sauvegardée
                  </Text>
                  <Text
                    style={{
                      color: colors.textMuted,
                      textAlign: "center",
                      lineHeight: 22,
                    }}
                  >
                    Sauvegardez des questions pendant vos sessions de pratique
                    pour les revoir plus tard
                  </Text>
                </View>
              </FadeInView>
            ) : filteredQuestions.length === 0 && activeFilter !== "all" ? (
              /* Filter Empty State */
              <FadeInView animation="scale" delay={100}>
                <View
                  style={{
                    backgroundColor: colors.card,
                    borderRadius: 16,
                    padding: 32,
                    alignItems: "center",
                    marginTop: 8,
                    borderWidth: 1,
                    borderColor: colors.border,
                    ...shadowPresets.md(isDark),
                  }}
                >
                  <Text style={{ fontSize: 40, marginBottom: 12 }}>
                    {activeFilter === "correct"
                      ? "🎯"
                      : activeFilter === "wrong"
                        ? "💡"
                        : "📝"}
                  </Text>
                  <Text
                    style={{
                      fontSize: 17,
                      fontWeight: "600",
                      color: colors.text,
                      marginBottom: 6,
                    }}
                  >
                    {activeFilter === "correct"
                      ? "Aucune bonne réponse"
                      : activeFilter === "wrong"
                        ? "Aucune mauvaise réponse"
                        : "Toutes les questions ont été répondues"}
                  </Text>
                  <Text
                    style={{
                      color: colors.textMuted,
                      textAlign: "center",
                      lineHeight: 20,
                      fontSize: 14,
                    }}
                  >
                    {activeFilter === "correct"
                      ? "Continuez à pratiquer pour obtenir vos premières bonnes réponses !"
                      : activeFilter === "wrong"
                        ? "Bravo ! Vous n'avez aucune mauvaise réponse enregistrée."
                        : "Pratiquez les questions pour voir vos résultats ici."}
                  </Text>
                </View>
              </FadeInView>
            ) : isLeafLevel && currentFolder ? (
              /* Leaf Level — Show Questions */
              <>
                <FadeInView animation="slideUp" delay={0}>
                  <Text
                    style={{
                      color: colors.textMuted,
                      marginBottom: 16,
                      fontSize: 14,
                    }}
                  >
                    {currentFolder.questions.length} question
                    {currentFolder.questions.length > 1 ? "s" : ""}
                  </Text>
                </FadeInView>

                <View style={{ gap: 12 }}>
                  {currentFolder.questions.map((question, index) => (
                    <FadeInView
                      key={question.id}
                      animation="slideUp"
                      delay={index * 60}
                    >
                      <SavedQuestionCard
                        question={question}
                        isExpanded={expandedId === question.id}
                        onToggle={() => toggleExpand(question.id)}
                        onUnsave={() => handleUnsave(question.id)}
                        answerResult={answerHistory[question.id] || null}
                        colors={colors}
                        isDark={isDark}
                      />
                    </FadeInView>
                  ))}
                </View>
              </>
            ) : childFolders.length > 0 ? (
              /* Folder Level — Show Folders */
              <>
                <FadeInView animation="slideUp" delay={0}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: 16,
                    }}
                  >
                    <Text
                      style={{
                        color: colors.textMuted,
                        fontSize: 14,
                      }}
                    >
                      {childFolders.length} dossier
                      {childFolders.length > 1 ? "s" : ""} •{" "}
                      {currentFolder?.count || 0} question
                      {(currentFolder?.count || 0) > 1 ? "s" : ""}
                    </Text>
                  </View>
                </FadeInView>

                <View style={{ gap: 8 }}>
                  {childFolders.map((folder, index) => (
                    <FadeInView
                      key={folder.name}
                      animation="slideUp"
                      delay={index * 50}
                    >
                      <FolderCard
                        folder={folder}
                        onPress={() => navigateInto(folder.name)}
                        depth={path.length}
                        colors={colors}
                        isDark={isDark}
                      />
                    </FadeInView>
                  ))}
                </View>
              </>
            ) : (
              /* Edge case: folder with no children and no questions */
              <FadeInView animation="scale" delay={100}>
                <View
                  style={{
                    backgroundColor: colors.card,
                    borderRadius: 16,
                    padding: 32,
                    alignItems: "center",
                    marginTop: 16,
                    borderWidth: 1,
                    borderColor: colors.border,
                    ...shadowPresets.md(isDark),
                  }}
                >
                  <Text style={{ fontSize: 40, marginBottom: 12 }}>📭</Text>
                  <Text
                    style={{
                      fontSize: 17,
                      fontWeight: "600",
                      color: colors.text,
                      marginBottom: 6,
                    }}
                  >
                    Dossier vide
                  </Text>
                  <Text
                    style={{
                      color: colors.textMuted,
                      textAlign: "center",
                      lineHeight: 20,
                      fontSize: 14,
                    }}
                  >
                    Aucune question sauvegardée dans ce dossier
                  </Text>
                </View>
              </FadeInView>
            )}
          </View>

          {/* Bottom Spacing */}
          <View style={{ height: 32 }} />
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

// ============================================================================
// Breadcrumb Bar Component
// ============================================================================

function BreadcrumbBar({
  breadcrumbs,
  onNavigate,
  colors,
  isDark,
}: {
  breadcrumbs: { label: string; pathIndex: number }[];
  onNavigate: (pathIndex: number) => void;
  colors: any;
  isDark: boolean;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        flexWrap: "wrap",
        marginBottom: 16,
        paddingVertical: 10,
        paddingHorizontal: 14,
        backgroundColor: colors.card,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.border,
        ...shadowPresets.sm(isDark),
      }}
    >
      {breadcrumbs.map((crumb, index) => {
        const isLast = index === breadcrumbs.length - 1;
        return (
          <View
            key={`${crumb.pathIndex}-${index}`}
            style={{ flexDirection: "row", alignItems: "center" }}
          >
            {index > 0 && (
              <Text
                style={{
                  color: colors.textMuted,
                  marginHorizontal: 6,
                  fontSize: 12,
                }}
              >
                ›
              </Text>
            )}
            <TouchableOpacity
              onPress={() => !isLast && onNavigate(crumb.pathIndex)}
              disabled={isLast}
              hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
            >
              <Text
                style={{
                  color: isLast ? colors.text : "#09b2ac", // FMC Primary
                  fontWeight: isLast ? "700" : "600",
                  fontSize: 13,
                }}
                numberOfLines={1}
              >
                {crumb.label}
              </Text>
            </TouchableOpacity>
          </View>
        );
      })}
    </View>
  );
}

// ============================================================================
// Folder Card Component
// ============================================================================

function FolderCard({
  folder,
  onPress,
  depth,
  colors,
  isDark,
}: {
  folder: FolderNode;
  onPress: () => void;
  depth: number;
  colors: any;
  isDark: boolean;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.timing(scale, {
      toValue: 0.97,
      duration: 100,
      useNativeDriver: USE_NATIVE_DRIVER,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      friction: 3,
      tension: 200,
      useNativeDriver: USE_NATIVE_DRIVER,
    }).start();
  };

  // Folder icon based on depth
  const folderEmoji = depth === 0 ? "📚" : depth === 1 ? "📂" : "📋";

  // Accent color based on depth for visual hierarchy matching brand identity
  const accentColor =
    depth === 0
      ? "#09b2ac" // FMC Primary (Light Green Sea)
      : depth === 1
        ? "#9941ff" // FMC Secondary (Veronica)
        : colors.text; // Default to text color for deeper levels

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={1}
        style={{
          backgroundColor: colors.card,
          borderRadius: 16, // Brand large radius
          padding: 16,
          flexDirection: "row",
          alignItems: "center",
          borderWidth: 1,
          borderColor: colors.border,
          ...shadowPresets.sm(isDark),
        }}
      >
        {/* Folder Icon */}
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            backgroundColor: isDark
              ? `${accentColor}20`
              : `${accentColor}12`,
            alignItems: "center",
            justifyContent: "center",
            marginRight: 14,
          }}
        >
          <Text style={{ fontSize: 22 }}>{folderEmoji}</Text>
        </View>

        {/* Folder Info */}
        <View style={{ flex: 1 }}>
          <Text
            style={{
              color: colors.text,
              fontSize: 15,
              fontWeight: "600",
              marginBottom: 3,
            }}
            numberOfLines={2}
          >
            {folder.name}
          </Text>
          <Text
            style={{
              color: colors.textMuted,
              fontSize: 13,
            }}
          >
            {folder.count} question{folder.count > 1 ? "s" : ""}
            {folder.children.size > 0
              ? ` • ${folder.children.size} sous-dossier${folder.children.size > 1 ? "s" : ""}`
              : ""}
          </Text>
        </View>

        {/* Count Badge + Chevron */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View
            style={{
              backgroundColor: isDark
                ? `${accentColor}25`
                : `${accentColor}15`,
              paddingHorizontal: 10,
              paddingVertical: 4,
              borderRadius: 10,
            }}
          >
            <Text
              style={{
                color: accentColor,
                fontSize: 13,
                fontWeight: "700",
              }}
            >
              {folder.count}
            </Text>
          </View>
          <Text
            style={{
              color: colors.textMuted,
              fontSize: 20,
              fontWeight: "300",
            }}
          >
            ›
          </Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ============================================================================
// Saved Question Card Component (preserved from original)
// ============================================================================

function SavedQuestionCard({
  question,
  isExpanded,
  onToggle,
  onUnsave,
  answerResult,
  colors,
  isDark,
}: {
  question: QuestionWithAnswers;
  isExpanded: boolean;
  onToggle: () => void;
  onUnsave: () => void;
  answerResult: QuestionResult | null;
  colors: any;
  isDark: boolean;
}) {
  const correctAnswers = question.answers.filter((a) => a.is_correct);
  const scale = useRef(new Animated.Value(1)).current;
  const deleteScale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.timing(scale, {
      toValue: 0.98,
      duration: 100,
      useNativeDriver: USE_NATIVE_DRIVER,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      friction: 3,
      tension: 200,
      useNativeDriver: USE_NATIVE_DRIVER,
    }).start();
  };

  const handleDeletePress = () => {
    Animated.sequence([
      Animated.timing(deleteScale, {
        toValue: 0.8,
        duration: 100,
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
      Animated.spring(deleteScale, {
        toValue: 1,
        friction: 3,
        tension: 200,
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
    ]).start(() => onUnsave());
  };

  return (
    <Animated.View
      style={{
        transform: [{ scale }],
        backgroundColor: colors.card,
        borderRadius: 16,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: colors.border,
        ...shadowPresets.sm(isDark),
      }}
    >
      {/* Header */}
      <TouchableOpacity
        style={{ padding: 16 }}
        onPress={onToggle}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={1}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-start",
            justifyContent: "space-between",
            marginBottom: 8,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              flex: 1,
              marginRight: 8,
            }}
          >
            <View
              style={{
                backgroundColor: colors.primaryMuted,
                paddingHorizontal: 8,
                paddingVertical: 4,
                borderRadius: 6,
                marginRight: 8,
              }}
            >
              <Text
                style={{
                  color: colors.primary,
                  fontSize: 12,
                  fontWeight: "500",
                }}
              >
                Q{question.number}
              </Text>
            </View>
            {/* Answer status badge */}
            {answerResult && (
              <View
                style={{
                  backgroundColor: answerResult.isCorrect
                    ? (isDark ? "rgba(39,174,96,0.2)" : "rgba(39,174,96,0.12)")
                    : (isDark ? "rgba(231,76,60,0.2)" : "rgba(231,76,60,0.12)"),
                  paddingHorizontal: 6,
                  paddingVertical: 3,
                  borderRadius: 6,
                  marginRight: 8,
                }}
              >
                <Text style={{ fontSize: 10, fontWeight: "700", color: answerResult.isCorrect ? "#27AE60" : "#E74C3C" }}>
                  {answerResult.isCorrect ? "✓" : "✗"}
                </Text>
              </View>
            )}
            <View
              style={{
                backgroundColor: colors.backgroundSecondary,
                paddingHorizontal: 8,
                paddingVertical: 4,
                borderRadius: 6,
              }}
            >
              <Text
                style={{
                  color: colors.textSecondary,
                  fontSize: 12,
                }}
              >
                {question.exam_type}
              </Text>
            </View>
          </View>
          <Animated.View style={{ transform: [{ scale: deleteScale }] }}>
            <TouchableOpacity onPress={handleDeletePress} activeOpacity={0.7}>
              <Text style={{ fontSize: 18 }}>🗑️</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>

        <SecureTextElement
          style={{
            color: colors.text,
            fontSize: 15,
            lineHeight: 22,
          }}
          numberOfLines={isExpanded ? undefined : 2}
        >
          {question.question_text}
        </SecureTextElement>

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: 12,
          }}
        >
          <Text
            style={{
              color: colors.textMuted,
              fontSize: 13,
            }}
          >
            {question.module_name}
          </Text>
          <Text
            style={{
              color: colors.primary,
              fontSize: 13,
              fontWeight: "500",
            }}
          >
            {isExpanded ? "Masquer ▲" : "Voir réponses ▼"}
          </Text>
        </View>
      </TouchableOpacity>

      {/* Expanded Content */}
      {isExpanded && (
        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: colors.border,
            padding: 16,
          }}
        >
          {/* Question Image */}
          {question.image_url && (
            <Image
              source={{ uri: question.image_url }}
              style={{
                width: "100%",
                height: 192,
                marginBottom: 16,
                borderRadius: 12,
              }}
              resizeMode="contain"
            />
          )}

          <Text
            style={{
              color: colors.textMuted,
              fontSize: 13,
              marginBottom: 12,
            }}
          >
            Réponses:
          </Text>
          <View style={{ gap: 8 }}>
            {question.answers.map((answer, index) => (
              <FadeInView
                key={answer.id}
                animation="slideUp"
                delay={index * 50}
                replayOnFocus={false}
              >
                <View
                  style={{
                    padding: 12,
                    borderRadius: 12,
                    backgroundColor: answer.is_correct
                      ? colors.successLight
                      : colors.backgroundSecondary,
                  }}
                >
                  <View
                    style={{ flexDirection: "row", alignItems: "flex-start" }}
                  >
                    <View
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 12,
                        alignItems: "center",
                        justifyContent: "center",
                        marginRight: 8,
                        backgroundColor: answer.is_correct
                          ? colors.success
                          : colors.border,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 11,
                          fontWeight: "bold",
                          color: answer.is_correct
                            ? "#ffffff"
                            : colors.textMuted,
                        }}
                      >
                        {answer.option_label}
                      </Text>
                    </View>
                    <SecureTextElement
                      style={{
                        flex: 1,
                        fontSize: 14,
                        lineHeight: 20,
                        color: answer.is_correct
                          ? colors.success
                          : colors.textSecondary,
                      }}
                    >
                      {answer.answer_text}
                    </SecureTextElement>
                    {answer.is_correct && (
                      <Text
                        style={{
                          color: colors.success,
                          marginLeft: 8,
                        }}
                      >
                        ✓
                      </Text>
                    )}
                  </View>
                </View>
              </FadeInView>
            ))}
          </View>
        </View>
      )}
    </Animated.View>
  );
}
