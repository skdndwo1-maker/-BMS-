import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LEGAL_DOCUMENTS, type LegalDocumentKind } from "@/constants/legalDocuments";

type LegalDocumentModalProps = {
  kind: LegalDocumentKind | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function LegalDocumentModal({ kind, open, onOpenChange }: LegalDocumentModalProps) {
  if (!kind) return null;
  const doc = LEGAL_DOCUMENTS[kind];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(85vh,720px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[520px]">
        <DialogHeader className="shrink-0 border-b border-gray-100 px-6 pb-4 pt-6 pr-12 text-left">
          <DialogTitle className="text-[#0F1115] text-xl font-bold tracking-tight">
            {doc.title}
          </DialogTitle>
          {doc.subtitle ? (
            <p className="text-sm font-medium text-[#6B7280]">{doc.subtitle}</p>
          ) : null}
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 text-[#0F1115]">
          <div className="space-y-5 text-[13px] leading-relaxed">
            {doc.sections.map((section, idx) => (
              <section key={idx}>
                {section.heading ? (
                  <h3 className="mb-2 text-sm font-bold text-[#0F1115]">{section.heading}</h3>
                ) : null}
                {section.paragraphs.map((p, pIdx) => (
                  <p key={pIdx} className={pIdx > 0 ? "mt-2" : undefined}>
                    {p}
                  </p>
                ))}
                {section.bullets?.length ? (
                  <ul className="mt-2 list-disc space-y-1.5 pl-5">
                    {section.bullets.map((item, bIdx) => (
                      <li key={bIdx}>{item}</li>
                    ))}
                  </ul>
                ) : null}
              </section>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
