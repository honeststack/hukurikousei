import { STATUS_LABEL, type Statement } from "@/lib/statements";

/** 精算の状態を印影風に表示する。確定は朱の丸印。 */
export function StatusHanko({ status }: { status: Statement["status"] }) {
  if (status === "closed") return <span className="hanko hanko-closed">確定</span>;
  if (status === "review") return <span className="hanko hanko-ai">{STATUS_LABEL.review}</span>;
  return <span className="hanko hanko-mute">{STATUS_LABEL.draft}</span>;
}
