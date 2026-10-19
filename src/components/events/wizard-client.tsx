"use client";

// غلاف عميل يحمل معالج إنشاء الفعالية حصريًا في المتصفح (بدون SSR)
// لضمان بقاء حالة النموذج عبر انتقالات الخطوات دون أي إعادة ترطيب من الخادم.
import dynamic from "next/dynamic";

const EventWizardInner = dynamic(() => import("./wizard"), {
  loading: () => (
    <div className="mx-auto max-w-3xl space-y-3">
      <div className="rounded-sm border border-sep bg-surface px-4 py-8 text-center text-[12.5px] text-muted">
        جارٍ تحميل المعالج…
      </div>
    </div>
  ),
});

export default function EventWizardClient(
  props: React.ComponentProps<typeof import("./wizard").default>,
) {
  return <EventWizardInner {...props} />;
}
