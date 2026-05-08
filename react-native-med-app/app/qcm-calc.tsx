import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import {
  ChevronLeft,
  ChevronDown,
  Check,
  X,
  ClipboardCheck,
  Info,
} from "lucide-react-native";

import { WebHeader } from "@/components/ui/WebHeader";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { supabase } from "@/lib/supabase";
import {
  calculateQcmGrade,
  TEST_TYPE_LABELS,
  TEST_TYPE_DESCRIPTIONS,
  type TestType,
  type CorrectAnswersMap,
  type GradeResult,
  type ExamSection,
} from "@/lib/qcmCalc";

// ── Types ──────────────────────────────────────────────────────
interface QcmExam {
  id: string;
  name: string;
  subject: string;
  grade: string;
  year: string;
  session: string;
  rotation: string | null;
  num_questions: number;
  test_type: TestType;
  correct_answers: CorrectAnswersMap;
  speciality: string;
  exam_type: string;
  sections: ExamSection[];
}

const ANSWER_LABELS = ["A", "B", "C", "D", "E"] as const;

// ── Main Screen ────────────────────────────────────────────────
export default function QcmCalcScreen() {
  const { isAuthenticated } = useAuth();
  const { colors, isDark } = useTheme();
  const { width } = useWindowDimensions();
  const isWeb = Platform.OS === "web";
  const showWebHeader = isWeb && width >= 768;
  const isDesktop = width >= 900;
  const contentMaxWidth = 1100;

  // State
  const [exams, setExams] = useState<QcmExam[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedExam, setSelectedExam] = useState<QcmExam | null>(null);
  const [userAnswers, setUserAnswers] = useState<Record<number, string[]>>({});
  const [showResult, setShowResult] = useState(false);
  const [showPicker, setShowPicker] = useState(false);

  // Filters
  const [filterSubject, setFilterSubject] = useState("");
  const [filterYear, setFilterYear] = useState("");

  // Load exams
  useEffect(() => {
    loadExams();
  }, []);

  const loadExams = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("qcm_exams")
      .select("*")
      .order("created_at", { ascending: false });

    if (!error && data) {
      setExams(data as QcmExam[]);
    }
    setLoading(false);
  };

  // Filter values
  const subjects = useMemo(
    () => [...new Set(exams.map((e) => e.subject))].sort(),
    [exams]
  );
  const years = useMemo(
    () => [...new Set(exams.map((e) => e.year))].sort().reverse(),
    [exams]
  );

  const filteredExams = useMemo(() => {
    return exams.filter((e) => {
      if (filterSubject && e.subject !== filterSubject) return false;
      if (filterYear && e.year !== filterYear) return false;
      return true;
    });
  }, [exams, filterSubject, filterYear]);

  // Toggle answer
  const toggleAnswer = (qNum: number, label: string) => {
    setUserAnswers((prev) => {
      const current = prev[qNum] || [];
      const updated = current.includes(label)
        ? current.filter((l) => l !== label)
        : [...current, label];
      return { ...prev, [qNum]: updated };
    });
    setShowResult(false);
  };

  // Calculate
  const result: GradeResult | null = useMemo(() => {
    if (!selectedExam || !showResult) return null;
    return calculateQcmGrade(
      selectedExam.num_questions,
      selectedExam.test_type,
      selectedExam.correct_answers,
      userAnswers,
      selectedExam.sections,
    );
  }, [selectedExam, userAnswers, showResult]);

  const handleBack = () => {
    if (selectedExam) {
      setSelectedExam(null);
      setUserAnswers({});
      setShowResult(false);
      return;
    }
    if (isAuthenticated) {
      router.replace("/(tabs)" as any);
      return;
    }
    router.replace(isWeb ? "/landing" : ("/(auth)/welcome" as any));
  };

  const selectExam = (exam: QcmExam) => {
    setSelectedExam(exam);
    setUserAnswers({});
    setShowResult(false);
    setShowPicker(false);
  };

  const resetAnswers = () => {
    setUserAnswers({});
    setShowResult(false);
  };

  // ── Render helpers ───────────────────────────────────────────
  const cardStyle = {
    backgroundColor: colors.card,
    borderRadius: isDesktop ? 20 : 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: isDesktop ? 20 : 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: isDark ? 0.2 : 0.06,
    shadowRadius: 8,
    elevation: 2,
  };

  // ── EXAM LIST VIEW ───────────────────────────────────────────
  const renderExamList = () => (
    <View style={{ gap: 20 }}>
      {/* Filters */}
      <View style={{ ...cardStyle, gap: 12 }}>
        <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 1.5 }}>
          Filtres
        </Text>
        <View style={{ flexDirection: isDesktop ? "row" : "column", gap: 10 }}>
          {/* Subject Filter */}
          <Pressable
            onPress={() => {
              const next = subjects[(subjects.indexOf(filterSubject) + 1) % (subjects.length + 1)];
              setFilterSubject(next || "");
            }}
            style={{
              flex: 1,
              backgroundColor: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.03)",
              borderRadius: 12,
              paddingHorizontal: 14,
              paddingVertical: 12,
              borderWidth: 1,
              borderColor: filterSubject ? "#09b2ac" : colors.border,
            }}
          >
            <Text style={{ color: filterSubject ? "#09b2ac" : colors.textMuted, fontSize: 13, fontWeight: "700" }}>
              {filterSubject || "Toutes matières"}
            </Text>
          </Pressable>
          {/* Year Filter */}
          <Pressable
            onPress={() => {
              const next = years[(years.indexOf(filterYear) + 1) % (years.length + 1)];
              setFilterYear(next || "");
            }}
            style={{
              flex: 1,
              backgroundColor: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.03)",
              borderRadius: 12,
              paddingHorizontal: 14,
              paddingVertical: 12,
              borderWidth: 1,
              borderColor: filterYear ? "#09b2ac" : colors.border,
            }}
          >
            <Text style={{ color: filterYear ? "#09b2ac" : colors.textMuted, fontSize: 13, fontWeight: "700" }}>
              {filterYear || "Toutes années"}
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Exam cards */}
      {loading ? (
        <View style={{ paddingVertical: 48, alignItems: "center" }}>
          <ActivityIndicator size="large" color="#09b2ac" />
          <Text style={{ color: colors.textMuted, marginTop: 12, fontSize: 14 }}>
            Chargement des examens...
          </Text>
        </View>
      ) : filteredExams.length === 0 ? (
        <View style={{ ...cardStyle, alignItems: "center", paddingVertical: 40 }}>
          <Text style={{ fontSize: 40, marginBottom: 12 }}>📝</Text>
          <Text style={{ color: colors.text, fontSize: 16, fontWeight: "700" }}>
            Aucun examen trouvé
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 4 }}>
            Ajustez vos filtres ou attendez que l'admin ajoute des examens.
          </Text>
        </View>
      ) : (
        filteredExams.map((exam) => (
          <Pressable key={exam.id} onPress={() => selectExam(exam)}>
            <View style={{ ...cardStyle, overflow: "hidden" }}>
              <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontSize: isDesktop ? 16 : 15, fontWeight: "800", marginBottom: 6 }}>
                    {exam.name}
                  </Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    <Text style={{ color: colors.textMuted, fontSize: 12 }}>📚 {exam.subject}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 12 }}>📅 {exam.year}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 12 }}>❓ {exam.num_questions}Q</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 12 }}>🏷️ {exam.session}</Text>
                  </View>
                </View>
                <View
                  style={{
                    backgroundColor: isDark ? "rgba(9,178,172,0.15)" : "rgba(9,178,172,0.1)",
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    borderRadius: 8,
                  }}
                >
                  <Text style={{ color: "#09b2ac", fontSize: 11, fontWeight: "800" }}>
                    Calculer
                  </Text>
                </View>
              </View>
            </View>
          </Pressable>
        ))
      )}
    </View>
  );

  // ── CALCULATOR VIEW ──────────────────────────────────────────
  const renderCalculator = () => {
    if (!selectedExam) return null;

    const answeredCount = Object.values(userAnswers).filter((a) => a.length > 0).length;
    const progress = selectedExam.num_questions > 0 ? answeredCount / selectedExam.num_questions : 0;

    return (
      <View style={{ gap: 16 }}>
        {/* Exam info card */}
        <View style={{ ...cardStyle }}>
          <Text style={{ color: colors.text, fontSize: isDesktop ? 18 : 16, fontWeight: "800", marginBottom: 8 }}>
            {selectedExam.name}
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
            <View style={{ backgroundColor: isDark ? "rgba(9,178,172,0.15)" : "rgba(9,178,172,0.08)", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}>
              <Text style={{ color: "#09b2ac", fontSize: 11, fontWeight: "700" }}>
                {TEST_TYPE_LABELS[selectedExam.test_type]}
              </Text>
            </View>
            <View style={{ backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.04)", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}>
              <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "700" }}>
                {selectedExam.num_questions} questions
              </Text>
            </View>
          </View>
          {/* Info box */}
          <View style={{
            flexDirection: "row",
            alignItems: "flex-start",
            gap: 8,
            backgroundColor: isDark ? "rgba(9,178,172,0.08)" : "rgba(9,178,172,0.05)",
            borderRadius: 10,
            padding: 12,
          }}>
            <Info size={16} color="#09b2ac" style={{ marginTop: 2 }} />
            <Text style={{ color: colors.textMuted, fontSize: 12, lineHeight: 18, flex: 1 }}>
              {TEST_TYPE_DESCRIPTIONS[selectedExam.test_type]}
            </Text>
          </View>
        </View>

        {/* Progress bar */}
        <View style={{ ...cardStyle, paddingVertical: 12 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
            <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "700" }}>
              Progression
            </Text>
            <Text style={{ color: colors.text, fontSize: 11, fontWeight: "800" }}>
              {answeredCount}/{selectedExam.num_questions}
            </Text>
          </View>
          <View style={{ height: 6, backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)", borderRadius: 3 }}>
            <View style={{ height: 6, width: `${progress * 100}%`, backgroundColor: "#09b2ac", borderRadius: 3 }} />
          </View>
        </View>

        {/* Answer grid */}
        <View style={{ gap: 8 }}>
          {Array.from({ length: selectedExam.num_questions }, (_, i) => i + 1).map((qNum) => {
            const selected = userAnswers[qNum] || [];
            return (
              <View
                key={qNum}
                style={{
                  ...cardStyle,
                  flexDirection: "row",
                  alignItems: "center",
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  gap: 12,
                }}
              >
                <View style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  backgroundColor: selected.length > 0
                    ? (isDark ? "rgba(9,178,172,0.15)" : "rgba(9,178,172,0.1)")
                    : (isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)"),
                  alignItems: "center",
                  justifyContent: "center",
                }}>
                  <Text style={{
                    color: selected.length > 0 ? "#09b2ac" : colors.textMuted,
                    fontSize: 13,
                    fontWeight: "800",
                  }}>
                    {qNum}
                  </Text>
                </View>
                <View style={{ flex: 1, flexDirection: "row", gap: 6 }}>
                  {ANSWER_LABELS.map((label) => {
                    const isSelected = selected.includes(label);
                    return (
                      <Pressable
                        key={label}
                        onPress={() => toggleAnswer(qNum, label)}
                        style={{
                          width: isDesktop ? 42 : 38,
                          height: isDesktop ? 42 : 38,
                          borderRadius: 10,
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: isSelected
                            ? "#09b2ac"
                            : isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
                          borderWidth: 1,
                          borderColor: isSelected ? "#09b2ac" : "transparent",
                        }}
                      >
                        <Text style={{
                          color: isSelected ? "#fff" : colors.textMuted,
                          fontSize: 13,
                          fontWeight: "800",
                        }}>
                          {label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            );
          })}
        </View>

        {/* Action buttons */}
        <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
          <Pressable
            onPress={resetAnswers}
            style={{
              flex: 1,
              backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
              borderRadius: 14,
              paddingVertical: 14,
              alignItems: "center",
            }}
          >
            <Text style={{ color: colors.textMuted, fontSize: 14, fontWeight: "700" }}>
              Réinitialiser
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setShowResult(true)}
            style={{
              flex: 2,
              backgroundColor: "#09b2ac",
              borderRadius: 14,
              paddingVertical: 14,
              alignItems: "center",
              shadowColor: "#09b2ac",
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.3,
              shadowRadius: 8,
              elevation: 4,
            }}
          >
            <Text style={{ color: "#fff", fontSize: 14, fontWeight: "800" }}>
              Calculer ma note
            </Text>
          </Pressable>
        </View>

        {/* Result */}
        {result && (
          <View style={{
            backgroundColor: isDark ? "rgba(9,178,172,0.1)" : "rgba(9,178,172,0.06)",
            borderRadius: isDesktop ? 24 : 20,
            borderWidth: 1,
            borderColor: isDark ? "rgba(9,178,172,0.2)" : "rgba(9,178,172,0.15)",
            padding: isDesktop ? 28 : 24,
            alignItems: "center",
            gap: 16,
          }}>
            <Text style={{ fontSize: 14, fontWeight: "800", color: "#09b2ac", textTransform: "uppercase", letterSpacing: 1.5 }}>
              Votre Résultat
            </Text>

            {/* ── Years 4-6 (with sections): show each section separately, no combined average ── */}
            {result.sectionScores.length > 0 ? (
              <View style={{ width: "100%", gap: 12 }}>
                {result.sectionScores.map((ss, idx) => {
                  const sectionColor = ss.type === "théorique" ? "#3B82F6" : "#F59E0B";
                  const bgColor = ss.type === "théorique"
                    ? (isDark ? "rgba(59,130,246,0.1)" : "rgba(59,130,246,0.06)")
                    : (isDark ? "rgba(245,158,11,0.1)" : "rgba(245,158,11,0.06)");
                  const borderColorSection = ss.type === "théorique"
                    ? (isDark ? "rgba(59,130,246,0.2)" : "rgba(59,130,246,0.15)")
                    : (isDark ? "rgba(245,158,11,0.2)" : "rgba(245,158,11,0.15)");

                  return (
                    <View
                      key={idx}
                      style={{
                        backgroundColor: bgColor,
                        borderRadius: 16,
                        borderWidth: 1,
                        borderColor: borderColorSection,
                        padding: isDesktop ? 20 : 16,
                        alignItems: "center",
                        gap: 10,
                      }}
                    >
                      {/* Section label */}
                      <Text style={{ color: sectionColor, fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 1.5 }}>
                        {ss.label}
                      </Text>
                      <Text style={{ color: colors.textMuted, fontSize: 10 }}>
                        Q{ss.from} → Q{ss.to}
                      </Text>

                      {/* Section grade */}
                      <Text style={{ fontSize: isDesktop ? 44 : 36, fontWeight: "900", color: colors.text }}>
                        {ss.grade.toFixed(2)}
                      </Text>
                      <Text style={{ fontSize: 14, fontWeight: "600", color: colors.textMuted }}>/ 20</Text>

                      {/* Section stats */}
                      <View style={{ flexDirection: "row", gap: 16, marginTop: 2 }}>
                        <View style={{ alignItems: "center" }}>
                          <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: "700" }}>Score</Text>
                          <Text style={{ color: colors.text, fontSize: 14, fontWeight: "800" }}>
                            {ss.totalScore}/{ss.countedQuestions}
                          </Text>
                        </View>
                        <View style={{ width: 1, backgroundColor: colors.border }} />
                        <View style={{ alignItems: "center" }}>
                          <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: "700" }}>Pourcentage</Text>
                          <Text style={{ color: colors.text, fontSize: 14, fontWeight: "800" }}>
                            {ss.percentage.toFixed(1)}%
                          </Text>
                        </View>
                      </View>

                      {/* Section pass/fail */}
                      <View style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 6,
                        backgroundColor: ss.grade >= 10 ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                        borderRadius: 8,
                        marginTop: 2,
                      }}>
                        {ss.grade >= 10
                          ? <Check size={14} color="#22c55e" />
                          : <X size={14} color="#ef4444" />}
                        <Text style={{
                          color: ss.grade >= 10 ? "#22c55e" : "#ef4444",
                          fontSize: 12,
                          fontWeight: "800",
                        }}>
                          {ss.grade >= 10 ? "Validé ✨" : "Non validé"}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : (
              /* ── Years 1-3 (no sections): show single overall grade ── */
              <>
                <Text style={{ fontSize: isDesktop ? 56 : 48, fontWeight: "900", color: colors.text }}>
                  {result.grade.toFixed(2)}
                </Text>
                <Text style={{ fontSize: 16, fontWeight: "600", color: colors.textMuted }}>/ 20</Text>
                <View style={{ flexDirection: "row", gap: 20, marginTop: 4 }}>
                  <View style={{ alignItems: "center" }}>
                    <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "700" }}>Score</Text>
                    <Text style={{ color: colors.text, fontSize: 16, fontWeight: "800" }}>
                      {result.totalScore}/{result.countedQuestions}
                    </Text>
                  </View>
                  <View style={{ width: 1, backgroundColor: colors.border }} />
                  <View style={{ alignItems: "center" }}>
                    <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "700" }}>Pourcentage</Text>
                    <Text style={{ color: colors.text, fontSize: 16, fontWeight: "800" }}>
                      {result.percentage.toFixed(1)}%
                    </Text>
                  </View>
                </View>
                {/* Pass/fail indicator */}
                <View style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  backgroundColor: result.grade >= 10 ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: 10,
                  marginTop: 4,
                }}>
                  {result.grade >= 10
                    ? <Check size={16} color="#22c55e" />
                    : <X size={16} color="#ef4444" />}
                  <Text style={{
                    color: result.grade >= 10 ? "#22c55e" : "#ef4444",
                    fontSize: 13,
                    fontWeight: "800",
                  }}>
                    {result.grade >= 10 ? "Validé ✨" : "Non validé"}
                  </Text>
                </View>
              </>
            )}
          </View>
        )}
      </View>
    );
  };

  // ── MAIN RENDER ──────────────────────────────────────────────
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
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header gradient */}
        <LinearGradient
          colors={isDark ? ["#115E59", "#0D9488"] : ["#0D9488", "#09B2AD"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            width: "100%",
            alignItems: "center",
            paddingTop: showWebHeader ? 44 : 24,
            paddingBottom: isDesktop ? 72 : 56,
            borderBottomLeftRadius: isDesktop ? 44 : 32,
            borderBottomRightRadius: isDesktop ? 44 : 32,
          }}
        >
          <View style={{ width: "100%", maxWidth: contentMaxWidth, paddingHorizontal: isDesktop ? 32 : 22 }}>
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
              <Text style={{ color: "#ffffff", fontSize: 14, fontWeight: "700", marginLeft: 4 }}>
                {selectedExam ? "Examens" : "Retour"}
              </Text>
            </Pressable>

            <Text style={{
              color: "#ffffff",
              fontSize: isDesktop ? 32 : 26,
              fontWeight: "900",
              letterSpacing: -0.5,
              marginBottom: 6,
            }}>
              {selectedExam ? selectedExam.name : "QCM Calc"}
            </Text>
            <Text style={{
              color: "rgba(255,255,255,0.8)",
              fontSize: isDesktop ? 16 : 14,
              fontWeight: "500",
              lineHeight: 22,
            }}>
              {selectedExam
                ? `${selectedExam.subject} • ${selectedExam.year} • ${selectedExam.session}`
                : "Sélectionnez un examen pour calculer votre note."}
            </Text>
          </View>
        </LinearGradient>

        {/* Content */}
        <View style={{
          width: "100%",
          maxWidth: contentMaxWidth,
          paddingHorizontal: isDesktop ? 32 : 16,
          marginTop: isDesktop ? -40 : -28,
        }}>
          {selectedExam ? renderCalculator() : renderExamList()}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
