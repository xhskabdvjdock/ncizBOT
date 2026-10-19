/**
 * حالات الفعالية وقوانين الانتقال بينها — منطق نقي قابل للاختبار مستقلًا.
 */

export const EVENT_STATUSES = [
  "DRAFT",
  "READY",
  "REG_OPEN",
  "REG_CLOSED",
  "RUNNING",
  "COMPLETED",
  "CANCELLED",
] as const;

export type EventStatus = (typeof EVENT_STATUSES)[number];

export const EVENT_TYPES = ["QUIZ", "SPEED", "TEAM_BATTLE"] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  QUIZ: "أسئلة مباشرة",
  SPEED: "تحدي سرعة",
  TEAM_BATTLE: "مواجهة فرق",
};

/** الانتقالات المسموحة فقط — أي انتقال آخر يُرفض على الخادم. */
export const ALLOWED_TRANSITIONS: Record<
  EventStatus,
  Partial<Record<EventStatus, true>>
> = {
  DRAFT: { DRAFT: true, READY: true, CANCELLED: true },
  READY: {
    READY: true,
    DRAFT: true,
    REG_OPEN: true,
    RUNNING: true,
    CANCELLED: true,
  },
  REG_OPEN: { REG_OPEN: true, REG_CLOSED: true, CANCELLED: true },
  REG_CLOSED: { REG_CLOSED: true, REG_OPEN: true, RUNNING: true, CANCELLED: true },
  RUNNING: { RUNNING: true, COMPLETED: true, CANCELLED: true },
  COMPLETED: { COMPLETED: true },
  CANCELLED: { CANCELLED: true },
};

export type EventAction =
  | "PREPARE"
  | "PREPARE_EDIT"
  | "OPEN_REGISTRATION"
  | "CLOSE_REGISTRATION"
  | "START"
  | "FINISH"
  | "CANCEL";

/** لكل فعل إداري: من أي حالة إلى أي حالة. */
export const ACTION_TRANSITIONS: Record<
  EventAction,
  Partial<Record<EventStatus, EventStatus>>
> = {
  PREPARE: { DRAFT: "READY" },
  PREPARE_EDIT: { READY: "DRAFT" },
  OPEN_REGISTRATION: { READY: "REG_OPEN", REG_CLOSED: "REG_OPEN" },
  CLOSE_REGISTRATION: { REG_OPEN: "REG_CLOSED" },
  START: {
    READY: "RUNNING",
    REG_OPEN: "RUNNING", // البدء من تسجيل مفتوح = إغلاق ضمني + بث (سلوك المحرك الفعلي)
    REG_CLOSED: "RUNNING",
  },
  FINISH: { RUNNING: "COMPLETED" },
  CANCEL: {
    DRAFT: "CANCELLED",
    READY: "CANCELLED",
    REG_OPEN: "CANCELLED",
    REG_CLOSED: "CANCELLED",
    RUNNING: "CANCELLED",
  },
};

export class DomainError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "INVALID_TRANSITION"
      | "INVALID_STATE"
      | "VALIDATION"
      | "NOT_FOUND"
      | "CONFLICT",
    public readonly status = 400,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export function isTransitionAllowed(
  from: EventStatus,
  to: EventStatus,
): boolean {
  return Boolean(ALLOWED_TRANSITIONS[from][to]);
}

/** يتحقق أن الانتقال مسموح، وإلا يرمي خطأ مجال واضح. */
export function assertTransition(from: EventStatus, to: EventStatus): void {
  if (!isTransitionAllowed(from, to)) {
    throw new DomainError(
      `انتقال حالة غير مسموح: ${from} ← ${to}`,
      "INVALID_TRANSITION",
    );
  }
}

export function targetForAction(
  status: EventStatus,
  action: EventAction,
): EventStatus | undefined {
  return ACTION_TRANSITIONS[action][status];
}

export function canPerform(status: EventStatus, action: EventAction): boolean {
  const target = targetForAction(status, action);
  return target !== undefined && target !== status;
}

/**
 * يحسم الحالة الهدف لفعل إداري؛ يُستخدم مع قفل الحالة عند التحديث في قاعدة البيانات
 * لمنع الأفعال المتزامنة أو غير الصحيحة.
 */
export function resolveTransition(
  status: EventStatus,
  action: EventAction,
): EventStatus {
  const target = targetForAction(status, action);
  if (target === undefined) {
    throw new DomainError(
      `الفعل «${EVENT_ACTION_LABELS[action]}» غير متاح للحالة الحالية (${STATUS_LABELS[status]})`,
      "INVALID_TRANSITION",
    );
  }
  return target;
}

export const STATUS_LABELS: Record<EventStatus, string> = {
  DRAFT: "مسودة",
  READY: "جاهزة",
  REG_OPEN: "التسجيل مفتوح",
  REG_CLOSED: "التسجيل مغلق",
  RUNNING: "جارية الآن",
  COMPLETED: "مكتملة",
  CANCELLED: "ملغاة",
};

export const EVENT_ACTION_LABELS: Record<EventAction, string> = {
  PREPARE: "الحالة جاهزة",
  PREPARE_EDIT: "العودة إلى مسودة",
  OPEN_REGISTRATION: "فتح التسجيل",
  CLOSE_REGISTRATION: "إغلاق التسجيل",
  START: "البدء",
  FINISH: "إنهاء الفعالية",
  CANCEL: "إلغاء الفعالية",
};
