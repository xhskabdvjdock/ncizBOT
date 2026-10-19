"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button, Card, Input, Select, Textarea, Toggle, EmptyState, Badge } from "@/components/ui";
import {
  ChevronLeft,
  ChevronRight,
  Trash2,
  Plus,
  MessageSquareText,
  CircleCheck,
  CircleAlert,
} from "lucide-react";
import type { EventDraftInput, QuestionInput } from "@/core/config";
import { DEFAULT_MESSAGES, optionsLine } from "@/core/messages";
import { graphemeLength } from "@/core/messages";
import type { EventType } from "@/core/states";

export type WizardChannel = {
  id: string;
  kind: "LOCAL" | "KICK";
  label: string;
  connected: boolean;
};

type Step = 1 | 2 | 3 | 4 | 5;

const STEPS: { n: Step; label: string }[] = [
  { n: 1, label: "التفاصيل" },
  { n: 2, label: "قواعد المشاركة" },
  { n: 3, label: "الأسئلة والقواعد" },
  { n: 4, label: "رسائل المحادثة" },
  { n: 5, label: "المراجعة" },
];

const emptyQuestion = (d: { points: number; time: number; bonus: number }): QuestionInput => ({
  prompt: "",
  options: null,
  correctAnswers: [],
  timeLimitSec: d.time,
  points: d.points,
  speedBonus: d.bonus,
  explanation: null,
});

export default function EventWizard({
  channels,
  draftId,
}: {
  channels: WizardChannel[];
  draftId: string | null;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [draft, setDraft] = useState<EventDraftInput>({
    name: "",
    description: null,
    type: "QUIZ",
    commands: {
      registration: "!join",
      leave: "!leave",
      answer: "!answer",
      team: "!team",
      score: "!score",
      help: "!help",
      eventInfo: "!event",
    },
    config: {
      participation: {
        joinOnce: true,
        lateRegistration: false,
        maxParticipants: null,
        minParticipants: null,
        allowManualRemoval: true,
      },
      rules: {
        revealAnswer: true,
        awardAllCorrect: true,
        tieBreak: "EARLIEST_REGISTRATION",
        defaultPoints: 100,
        defaultSpeedBonus: 25,
        defaultTimeLimitSec: 30,
        maxAttemptsPerRound: 1,
        caseSensitive: false,
        normalizeArabic: true,
      },
      team: {
        selection: "CHOOSE",
        joinAfterStart: false,
        teams: [
          { key: "red", label: "الأحمر", aliases: ["red", "احمر", "أحمر"] },
          { key: "blue", label: "الأزرق", aliases: ["blue", "ازرق", "أزرق"] },
        ],
      },
      autoCloseRegistrationSec: null,
      messages: { ...Object.fromEntries(Object.keys(DEFAULT_MESSAGES).map((k) => [k, null])) } as never,
    },
    simulation: !channels.some((c) => c.kind === "KICK"),
    questions: [],
  });
  const [channelId, setChannelId] = useState<string>(
    channels.find((c) => c.kind === "KICK")?.id ?? channels[0]?.id ?? "",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingDraft, setLoadingDraft] = useState(draftId != null);

  // تحميل مسودة للتعديل
  useEffect(() => {
    if (!draftId) return;
    (async () => {
      try {
        const res = await fetch(`/api/events/${draftId}`);
        const body = (await res.json()) as {
          event?: { name: string; type: string; channelId: string; config: unknown; commands: Record<string, string>; simulation: boolean; description?: string | null };
          questions?: QuestionInput[];
          error?: string;
        };
        if (body.event) {
          setDraft({
            name: body.event.name,
            description: body.event.description ?? null,
            type: body.event.type as EventType,
            commands: body.event.commands as EventDraftInput["commands"],
            config: body.event.config as EventDraftInput["config"],
            simulation: body.event.simulation,
            questions: body.questions ?? [],
          });
          setChannelId(body.event.channelId);
        } else {
          setError(body.error ?? "تعذر تحميل المسودة");
        }
      } finally {
        setLoadingDraft(false);
      }
    })();
  }, [draftId]);

  const rules = draft.config.rules;
  const setRules = (r: Partial<typeof rules>) =>
    setDraft((d) => ({ ...d, config: { ...d.config, rules: { ...d.config.rules, ...r } } }));

  const issues = useMemo(() => computeIssues(draft), [draft]);
  const unblocked = issues.length === 0;

  const save = async (action: "SAVE_DRAFT" | "PREPARE" | "START") => {
    setBusy(true);
    setError(null);
    try {
      const payload = { channelId, action, draft };
      const method = draftId ? "PATCH" : "POST";
      const url = draftId ? `/api/events/${draftId}` : "/api/events";
      const res = await fetch(url, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await res.json()) as { event?: { id: string; status: string }; error?: string };
      if (!res.ok || !body.event) {
        setError(body.error ?? "فشل الحفظ");
        return;
      }
      router.push(`/events/${body.event.id}`);
    } finally {
      setBusy(false);
    }
  };

  if (loadingDraft) {
    return <Card title="جارٍ تحميل المسودة…">…</Card>;
  }

  const qD = { points: rules.defaultPoints, time: rules.defaultTimeLimitSec, bonus: rules.defaultSpeedBonus };

  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <header>
        <h1 className="text-[16px] font-medium">{draftId ? "تعديل مسودة فعالية" : "إنشاء فعالية جديدة"}</h1>
        <p className="text-[12px] text-muted">خمس خطوات واضحة — لا شيء يُبدأ تلقائيًا دون فعل صريح منك.</p>
      </header>

      {/* المؤشر */}
      <ol className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[11.5px]">
        {STEPS.map((s) => (
          <li key={s.n} className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setStep(s.n)}
              className={cn(
                "flex items-center gap-1.5 rounded-sm border px-2 py-1",
                step === s.n
                  ? "border-accent-soft bg-[#132a08] text-accent-ink"
                  : "border-sep bg-surface text-muted hover:text-ink",
              )}
            >
              <span className="num">{s.n}</span>
              {s.label}
            </button>
            {s.n < 5 && <ChevronLeft className="size-3 text-faint" />}
          </li>
        ))}
      </ol>

      {step === 1 && (
        <Card title="تفاصيل الفعالية">
          <div className="grid gap-3">
            <Input
              label="الاسم"
              name="name"
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              placeholder="مثال: مسابقة السبت السريعة"
              hint="يظهر في إعلانات المحادثة"
            />
            <Textarea
              label="وصف مختصر (اختياري)"
              name="description"
              value={draft.description ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value || null }))}
              maxLength={300}
            />
            <div>
              <span className="mb-1 block text-[12px] text-muted">نوع الفعالية</span>
              <div className="grid gap-2 sm:grid-cols-3">
                {(
                  [
                    { key: "QUIZ", label: "أسئلة مباشرة", desc: "أسئلة متعددة أو حرة تحلل بإجابة" },
                    { key: "SPEED", label: "تحدي سرعة", desc: "اكتب الإجابة الصحيحة قبل الموعد" },
                    { key: "TEAM_BATTLE", label: "مواجهة فرق", desc: "فريقان يتنافسان بالنقاط" },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setDraft((d) => ({ ...d, type: t.key }))}
                    className={cn(
                      "rounded-sm border p-2.5 text-start text-[12px]",
                      draft.type === t.key
                        ? "border-accent-soft bg-[#132a08]"
                        : "border-sep-strong bg-elevation hover:border-faint",
                    )}
                  >
                    <div className="mb-0.5 font-medium">{t.label}</div>
                    <div className="text-[11px] text-muted">{t.desc}</div>
                  </button>
                ))}
              </div>
            </div>
            <Select label="القناة" name="channelId" value={channelId} onChange={(e) => setChannelId(e.target.value)}>
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.kind === "LOCAL" ? "قناة الاختبار المحلية" : c.label}
                  {c.kind === "KICK" ? (c.connected ? " — متصلة" : " — غير متصلة") : " (بلا إرسال حقيقي)"}
                </option>
              ))}
            </Select>
            <div className="rounded-sm border border-sep-strong bg-elevation p-3">
              <Toggle
                checked={draft.simulation}
                onChange={(v) => setDraft((d) => ({ ...d, simulation: v }))}
                label="تفعيل وضع الاختبار لهذه الفعالية"
                hint="يضيف لوحة محاكاة أوامر في غرفة التحكم — معزولة عن القناة الحقيقية وموسومة بوضوح."
              />
            </div>
          </div>
        </Card>
      )}

      {step === 2 && (
        <Card title="قواعد المشاركة">
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="أمر التسجيل"
                name="registration"
                dir="ltr"
                value={draft.commands.registration}
                onChange={(e) => setDraft((d) => ({ ...d, commands: { ...d.commands, registration: sanitizeCommand(e.target.value) } }))}
              />
              <Input
                label="أمر الانسحاب"
                name="leave"
                dir="ltr"
                value={draft.commands.leave}
                onChange={(e) => setDraft((d) => ({ ...d, commands: { ...d.commands, leave: sanitizeCommand(e.target.value) } }))}
              />
              <Input
                label="أمر الإجابة"
                name="answer"
                dir="ltr"
                value={draft.commands.answer}
                onChange={(e) => setDraft((d) => ({ ...d, commands: { ...d.commands, answer: sanitizeCommand(e.target.value) } }))}
                hint="يليه محتوى الإجابة: !answer ب"
              />
              <Input
                label="أمر الفرق"
                name="team"
                dir="ltr"
                value={draft.commands.team}
                onChange={(e) => setDraft((d) => ({ ...d, commands: { ...d.commands, team: sanitizeCommand(e.target.value) } }))}
                hint={draft.type === "TEAM_BATTLE" ? "يليه الفريق: !team أحمر" : "غير مستخدم في هذا النوع"}
                disabled={draft.type !== "TEAM_BATTLE"}
              />
              <Input
                label="أمر الترتيب"
                name="score"
                dir="ltr"
                value={draft.commands.score}
                onChange={(e) => setDraft((d) => ({ ...d, commands: { ...d.commands, score: sanitizeCommand(e.target.value) } }))}
              />
              <Input
                label="أمر المساعدة"
                name="help"
                dir="ltr"
                value={draft.commands.help}
                onChange={(e) => setDraft((d) => ({ ...d, commands: { ...d.commands, help: sanitizeCommand(e.target.value) } }))}
              />
            </div>
            <div className="rounded-sm border border-sep-strong bg-elevation p-3">
              <Toggle
                checked={draft.config.participation.joinOnce}
                onChange={(v) => setDraft((d) => ({ ...d, config: { ...d.config, participation: { ...d.config.participation, joinOnce: v } } }))}
                label="تسجيل مرة واحدة فقط"
                hint="من انسحب لا يستطيع العودة لهذه الفعالية."
              />
              <Toggle
                checked={draft.config.participation.lateRegistration}
                onChange={(v) => setDraft((d) => ({ ...d, config: { ...d.config, participation: { ...d.config.participation, lateRegistration: v } } }))}
                label="السماح بالانضمام بعد البدء"
                hint="المتأخر يبدأ من صفر نقاط ولا يسلم جوائز جوائز مضت."
              />
              <Toggle
                checked={draft.config.participation.allowManualRemoval}
                onChange={(v) => setDraft((d) => ({ ...d, config: { ...d.config, participation: { ...d.config.participation, allowManualRemoval: v } } }))}
                label="إمكانية إزالة مشارك يدويًا من اللوحة"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="حد أقصى للمشاركين (اختياري)"
                name="maxParticipants"
                type="number"
                min={2}
                value={draft.config.participation.maxParticipants ?? ""}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    config: {
                      ...d.config,
                      participation: {
                        ...d.config.participation,
                        maxParticipants: e.target.value ? Number(e.target.value) : null,
                      },
                    },
                  }))
                }
              />
              <Input
                label="حد أدنى لبدء الفعالية (اختياري)"
                name="minParticipants"
                type="number"
                min={1}
                value={draft.config.participation.minParticipants ?? ""}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    config: {
                      ...d.config,
                      participation: {
                        ...d.config.participation,
                        minParticipants: e.target.value ? Number(e.target.value) : null,
                      },
                    },
                  }))
                }
              />
            </div>
          </div>
        </Card>
      )}

      {step === 3 && (
        <Card
          title="الأسئلة والقواعد"
          actions={
            <Button size="sm" variant="default" onClick={() => setDraft((d) => ({ ...d, questions: [...d.questions, emptyQuestion(qD)] }))}>
              <Plus className="size-3.5" /> سؤال جديد
            </Button>
          }
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Input label="نقاط الجواب الصحيح" name="defaultPoints" type="number" min={1} value={rules.defaultPoints} onChange={(e) => setRules({ defaultPoints: Number(e.target.value) || 1 })} />
            <Input label="مكافأة الأسرع" name="defaultSpeedBonus" type="number" min={0} value={rules.defaultSpeedBonus} onChange={(e) => setRules({ defaultSpeedBonus: Number(e.target.value) || 0 })} hint="0 لإلغائها" />
            <Input label="الزمن لكل سؤال (ث)" name="defaultTimeLimitSec" type="number" min={5} max={600} value={rules.defaultTimeLimitSec} onChange={(e) => setRules({ defaultTimeLimitSec: Number(e.target.value) || 5 })} />
            <Input label="محاولات لكل جولة" name="maxAttemptsPerRound" type="number" min={1} max={5} value={rules.maxAttemptsPerRound} onChange={(e) => setRules({ maxAttemptsPerRound: Number(e.target.value) || 1 })} />
            <Select
              label="فك التعادل"
              name="tieBreak"
              value={rules.tieBreak}
              onChange={(e) => setRules({ tieBreak: e.target.value as typeof rules.tieBreak })}
            >
              <option value="EARLIEST_REGISTRATION">الأسبق تسجيلًا</option>
              <option value="MOST_ROUND_WINS">الأكثر فوزًا بالجولات</option>
              <option value="DRAW">تعادل — بلا فائز مفرد</option>
            </Select>
            {draft.type === "SPEED" && (
              <>
                <Select label="حساسية الحروف" name="caseSensitive" value={rules.caseSensitive ? "1" : "0"} onChange={(e) => setRules({ caseSensitive: e.target.value === "1" })}>
                  <option value="0">غير حساسة</option>
                  <option value="1">حساسة</option>
                </Select>
              </>
            )}
          </div>
          <div className="mt-1 grid gap-1 rounded-sm border border-sep-strong bg-elevation p-3">
            <Toggle
              checked={rules.revealAnswer}
              onChange={(v) => setRules({ revealAnswer: v })}
              label="كشف الإجابة الصحيحة بعد كل جولة"
              hint="يظهر في إعلان نتيجة الجولة إن فُعّل."
            />
            <Toggle
              checked={rules.awardAllCorrect}
              onChange={(v) => setRules({ awardAllCorrect: v })}
              label="منح نقاط كل الإجابات الصحيحة"
              hint="الأسرع فقط يأخذ المكافأة الإضافية."
            />
            {draft.type === "SPEED" && (
              <Toggle
                checked={rules.normalizeArabic}
                onChange={(v) => setRules({ normalizeArabic: v })}
                label="توحيد الألف/الهمزة/التاء المربوطة في الإجابات"
              />
            )}
          </div>

          {draft.questions.length === 0 ? (
            <EmptyState
              icon={<Plus className="size-5" />}
              title="لا أسئلة بعد"
              body="أضف أسئلتك يدويًا — المنصة لا تُنشئ أسئلة بالوكالة، وكل حفظ يمر بمراجعتك في الخطوة الخامسة."
              actions={
                <Button size="sm" onClick={() => setDraft((d) => ({ ...d, questions: [emptyQuestion(qD)] }))}>
                  أضف أول سؤال
                </Button>
              }
            />
          ) : (
            <ul className="mt-3 space-y-3">
              {draft.questions.map((q, i) => (
                <li key={i} className="rounded-sm border border-sep-strong bg-elevation p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-[12px] text-muted">سؤال <span className="num">{i + 1}</span></span>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => setDraft((d) => ({ ...d, questions: d.questions.filter((_, j) => j !== i) }))}
                      aria-label={`حذف السؤال ${i + 1}`}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                  <Textarea
                    name={`q-prompt-${i}`}
                    label="نص السؤال"
                    value={q.prompt}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        questions: upd(d.questions, i, { prompt: e.target.value }),
                      }))
                    }
                    maxLength={280}
                  />
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <Input
                      label="الزمن (ث)"
                      name={`q-time-${i}`}
                      type="number"
                      min={5}
                      max={600}
                      value={q.timeLimitSec}
                      onChange={(e) => setDraft((d) => ({ ...d, questions: upd(d.questions, i, { timeLimitSec: Number(e.target.value) || 5 }) }))}
                    />
                    <Input
                      label="النقاط"
                      name={`q-points-${i}`}
                      type="number"
                      min={1}
                      value={q.points}
                      onChange={(e) => setDraft((d) => ({ ...d, questions: upd(d.questions, i, { points: Number(e.target.value) || 1 }) }))}
                    />
                    <Input
                      label="مكافأة الأسرع"
                      name={`q-bonus-${i}`}
                      type="number"
                      min={0}
                      value={q.speedBonus}
                      onChange={(e) => setDraft((d) => ({ ...d, questions: upd(d.questions, i, { speedBonus: Number(e.target.value) || 0 }) }))}
                    />
                  </div>
                  <div className="mt-2">
                    <Toggle
                      checked={q.options !== null}
                      onChange={(v) =>
                        setDraft((d) => ({
                          ...d,
                          questions: upd(d.questions, i, {
                            options: v ? ["", "", "", ""] : null,
                            correctAnswers: v ? ["أ"] : [],
                          }),
                        }))
                      }
                      label="خيارات متعددة"
                    />
                  </div>
                  {q.options && (
                    <div className="mt-2 space-y-2">
                      {q.options.map((opt, j) => (
                        <div key={j} className="flex items-end gap-2">
                          <span className="pb-2 num text-[12px] text-faint">{letter(j)})</span>
                          <Input
                            name={`q-opt-${i}-${j}`}
                            value={opt}
                            onChange={(e) => {
                              const next = [...q.options!];
                              next[j] = e.target.value;
                              setDraft((d) => ({ ...d, questions: upd(d.questions, i, { options: next }) }));
                            }}
                            placeholder={`نص الخيار ${letter(j)}`}
                          />
                          <Button
                            size="sm"
                            variant={q.correctAnswers.includes(letter(j)) ? "primary" : "default"}
                            onClick={() =>
                              setDraft((d) => {
                                const cur = q.correctAnswers.includes(letter(j));
                                const next = cur
                                  ? d.questions[i]!.correctAnswers.filter((c) => c !== letter(j))
                                  : [...d.questions[i]!.correctAnswers.filter((c) => /^[A-F]$/.test(c)), letter(j)];
                                return { ...d, questions: upd(d.questions, i, { correctAnswers: next }) };
                              })
                            }
                            title="تعيين كإجابة صحيحة"
                          >
                            <CircleCheck className="size-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                  {!q.options && (
                    <div className="mt-2">
                      <Input
                        name={`q-answers-${i}`}
                        label="الإجابات المقبولة (مفصولة بفاصلة)"
                        value={q.correctAnswers.join("، ")}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            questions: upd(d.questions, i, {
                              correctAnswers: e.target.value.split(/[،,]/).map((s) => s.trim()).filter(Boolean),
                            }),
                          }))
                        }
                        hint="الإجابات تُطابق بعد تطبيع الأحرف العربية ولوحات الأوفيت: مثال «القاهرة, قاهرة»"
                      />
                    </div>
                  )}
                  <div className="mt-2">
                    <Input
                      name={`q-expl-${i}`}
                      label="شرح بعد كشف الإجابة (اختياري)"
                      value={q.explanation ?? ""}
                      onChange={(e) => setDraft((d) => ({ ...d, questions: upd(d.questions, i, { explanation: e.target.value || null }) }))}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {step === 4 && (
        <Card title="رسائل المحادثة">
          <MessageTemplates formState={draft} setFormState={setDraft} />
        </Card>
      )}

      {step === 5 && (
        <Card title="المراجعة النهائية">
          <Review draft={draft} issues={issues} />
          {error && (
            <div className="mt-3 rounded-xs border border-[#5c2b28] bg-bad-bg px-2.5 py-2 text-[12px] text-bad">
              {error}
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="primary" loading={busy} onClick={() => save("START")} disabled={!unblocked}>
              حفظ وفتح التسجيل الآن
            </Button>
            <Button loading={busy} onClick={() => save("PREPARE")} disabled={!unblocked}>
              حفظ وجاهزية (بلا فتح التسجيل)
            </Button>
            <Button variant="default" loading={busy} onClick={() => save("SAVE_DRAFT")}>
              حفظ كمسودة
            </Button>
          </div>
          <p className="mt-2 text-[11.5px] text-faint">
            «فتح التسجيل الآن» يعلن أمر التسجيل في صندوق الإعلانات ويسمح للمشاهدين بالانضمام؛
            البدء الفعلي للبث يبقى فعلًا من غرفة التحكم — لا بدء تلقائي مطلقًا.
          </p>
        </Card>
      )}

      <div className="flex justify-between">
        <Button
          variant="ghost"
          onClick={() => setStep((s) => Math.min(5, s + 1) as Step)}
          disabled={step === 5}
        >
          التالي <ChevronRight className="hidden" />
          <ChevronLeft className="size-3.5" />
        </Button>
        <Button variant="ghost" onClick={() => setStep((s) => Math.max(1, s - 1) as Step)} disabled={step === 1}>
          <ChevronRight className="size-3.5" /> السابق
        </Button>
      </div>
    </div>
  );
}

function upd<T>(arr: T[], i: number, patch: Partial<T>): T[] {
  return arr.map((x, j) => (j === i ? { ...x, ...patch } : x));
}

function letter(i: number): string {
  return String.fromCharCode(65 + i);
}

function sanitizeCommand(v: string): string {
  const trimmed = v.trim().startsWith("!") ? v.trim() : "!" + v.trim().replace(/^!+/, "");
  return trimmed.replace(/\s+/g, "").slice(0, 21);
}

function computeIssues(d: EventDraftInput): string[] {
  const issues: string[] = [];
  if (d.name.trim().length < 3) issues.push("الاسم قصير جدًا (3 محارف على الأقل).");
  if (d.questions.length === 0) issues.push("لا أسئلة — أضف سؤالًا واحدًا على الأقل.");
  const cmds = Object.values(d.commands);
  if (new Set(cmds).size !== cmds.length) issues.push("تكرار في الأوامر — كل أمر يجب أن يكون مميزًا.");
  d.questions.forEach((q, i) => {
    if (!q.prompt.trim()) issues.push(`السؤال ${i + 1}: النص فارغ.`);
    if (q.options) {
      if (q.options.filter((o) => o.trim()).length < 2) issues.push(`السؤال ${i + 1}: املأ خياريْن على الأقل.`);
      if (q.correctAnswers.filter((c) => /^[A-F]$/.test(c)).length === 0)
        issues.push(`السؤال ${i + 1}: اختر إجابة صحيحة من الخيارات.`);
    } else if (q.correctAnswers.length === 0) {
      issues.push(`السؤال ${i + 1}: عرّف إجابة مقبولة واحدة على الأقل.`);
    }
  });
  const p = d.config.participation;
  if (p.maxParticipants != null && p.minParticipants != null && p.maxParticipants < p.minParticipants) {
    issues.push("الحد الأقصى أصغر من الحد الأدنى للمشاركين.");
  }
  if (d.type === "TEAM_BATTLE") {
    if (d.config.team.teams.length < 2) issues.push("مواجهة الفرق تحتاج فريقين.");
  }
  return issues;
}

/* ─── الرسائل ──────────────────────────────── */

const TEMPLATE_KEYS: { key: string; label: string }[] = [
  { key: "regOpen", label: "إعلان فتح التسجيل" },
  { key: "eventStart", label: "إعلان بدء الفعالية" },
  { key: "question", label: "إعلان السؤال" },
  { key: "roundResult", label: "نتيجة الجولة (الإجابة الصحيحة)" },
  { key: "winner", label: "إعلان الفائز" },
  { key: "cancelled", label: "إعلان الإلغاء" },
  { key: "registered", label: "تأكيد التسجيل" },
  { key: "alreadyRegistered", label: "رسالة المسجل مسبقًا" },
  { key: "registrationClosed", label: "إغلاق التسجيل" },
  { key: "notRegistered", label: "غير مسجل" },
  { key: "wrongAnswer", label: "رد إجابة خاطئة" },
  { key: "help", label: "ردة أمر المساعدة" },
  { key: "score", label: "رد أمر الترتيب" },
];

function MessageTemplates({
  formState,
  setFormState,
}: {
  formState: EventDraftInput;
  setFormState: React.Dispatch<React.SetStateAction<EventDraftInput>>;
}) {
  const [preview, setPreview] = useState<Record<string, string>>({});
  const messages = formState.config.messages;

  const updateOne = (key: string, value: string) => {
    setFormState((d) => ({
      ...d,
      config: { ...d.config, messages: { ...d.config.messages, [key]: value || null } },
    }));
    setPreview({});
  };

  return (
    <div className="space-y-3">
      <p className="text-[12px] text-muted">
        تتوفر متغيرات مثل:{" "}
        {["{event}", "{round}", "{rounds}", "{question}", "{options}", "{answerCmd}", "{time}", "{answer}", "{winner}", "{username}", "{count}", "{join}", "{slots}", "{score}"]
          .map((v) => <code key={v} className="ltr-tech mx-0.5 rounded-xs bg-elevation px-1 text-[11px]">{v}</code>)}
      </p>
      <div className="grid gap-3">
        {TEMPLATE_KEYS.map((t) => {
          const value = (messages as Record<string, string | null>)[t.key] ?? "";
          const rendered = renderSample(t.key, value, formState);
          return (
            <div key={t.key} className="rounded-sm border border-sep-strong bg-elevation p-3">
              <Textarea
                label={t.label}
                name={`msg-${t.key}`}
                value={value}
                onChange={(e) => updateOne(t.key, e.target.value)}
                placeholder={`الافتراضي: ${DEFAULT_MESSAGES[t.key as keyof typeof DEFAULT_MESSAGES] ?? ""}`}
              />
              {value !== "" && (
                <div className="mt-1 flex items-center justify-between text-[11px]">
                  <span className={cn(graphemeLength(rendered) > 500 ? "text-bad" : "text-faint num")}>
                    {graphemeLength(rendered)}/500
                  </span>
                  {graphemeLength(rendered) > 500 && <span className="text-bad">يتجاوز حد كت (500)</span>}
                </div>
              )}
              <div className="mt-2 rounded-xs border border-sep bg-surface px-2.5 py-2 text-[12.5px] leading-6">
                <div className="mb-0.5 flex items-center gap-1 text-[10.5px] text-faint">
                  <MessageSquareText className="size-3" /> معاينة
                </div>
                {rendered}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function renderSample(key: string, value: string, draft: EventDraftInput): string {
  const q1 = draft.questions[0];
  return (value || DEFAULT_MESSAGES[key as keyof typeof DEFAULT_MESSAGES] || "")
    .replaceAll("{event}", draft.name || "اسم الفعالية")
    .replaceAll("{round}", "2")
    .replaceAll("{rounds}", String(Math.max(1, draft.questions.length)))
    .replaceAll("{question}", q1?.prompt || "نص السؤال الأول")
    .replaceAll("{options}", q1?.options ? optionsLine(q1.options) : "")
    .replaceAll("{answerCmd}", draft.commands.answer)
    .replaceAll("{time}", String(q1?.timeLimitSec ?? 30))
    .replaceAll("{answer}", "ب — إجابة")
    .replaceAll("{winner}", "username")
    .replaceAll("{score}", "150")
    .replaceAll("{username}", "viewer_123")
    .replaceAll("{count}", "12 مشارك.")
    .replaceAll("{join}", draft.commands.registration)
    .replaceAll("{slots}", "تبقّى 3 مكانًا.")
    .replaceAll("{rank}", "4")
    .replaceAll("{correct}", "3 صحيحة")
    .replaceAll("{max}", "1")
    .replaceAll("{status}", "جارية الآن")
    .replaceAll("{extra}", "");
}

/* ─── مراجعة ───────────────────────────────── */

function Review({ draft, issues }: { draft: EventDraftInput; issues: string[] }) {
  const typeNames: Record<EventType, string> = {
    QUIZ: "أسئلة مباشرة",
    SPEED: "تحدي سرعة",
    TEAM_BATTLE: "مواجهة فرق",
  };
  return (
    <div className="space-y-2 text-[12.5px]">
      <Row k="الاسم" v={draft.name} />
      <Row k="النوع" v={typeNames[draft.type]} />
      <Row k="أسئلة" v={<span className="num">{draft.questions.length}</span>} />
      <Row k="أمر التسجيل" v={<code className="ltr-tech">{draft.commands.registration}</code>} />
      <Row
        k="حدود المشاركين"
        v={
          <span className="num">
            {draft.config.participation.maxParticipants ?? "بلا حد"} أقصى ·{" "}
            {draft.config.participation.minParticipants ?? "بلا حد"} أدنى
          </span>
        }
      />
      <Row k="فك التعادل" v={tieBreakLabel(draft.config.rules.tieBreak)} />
      <Row k="وضع الاختبار" v={draft.simulation ? "مفعّل — معزول عن القناة الحقيقية" : "غير مفعّل"} />

      {issues.length > 0 ? (
        <ul className="mt-3 space-y-1.5">
          {issues.map((iss, i) => (
            <li key={i} className="flex items-start gap-1.5 rounded-xs border border-[#5a4520] bg-warn-bg px-2 py-1.5 text-[12px] text-warn">
              <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
              {iss}
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-3 flex items-center gap-1.5 rounded-xs border border-[#28513a] bg-ok-bg px-2 py-1.5 text-[12px] text-ok">
          <CircleCheck className="size-3.5" /> الإعداد مكتمل — يمكنك الحفظ أو البدء.
        </div>
      )}
    </div>
  );
}

function tieBreakLabel(t: string): string {
  switch (t) {
    case "EARLIEST_REGISTRATION": return "الأسبق تسجيلًا";
    case "MOST_ROUND_WINS": return "الأكثر جولات فائزة";
    case "DRAW": return "تعادل بدون فائز مفرد";
    default: return t;
  }
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-sep/60 py-1.5 last:border-0">
      <span className="text-muted">{k}</span>
      <span className="text-ink">{v}</span>
    </div>
  );
}

export function BadgeNote() {
  return <Badge tone="warn">وضع اختبار</Badge>;
}
