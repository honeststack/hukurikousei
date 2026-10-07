"use client";

import { ActionForm, SubmitButton } from "@/components/action-form";
import { Countdown } from "@/components/live-clock";
import { selfCancelAction } from "../../actions";

/** 入館直後の数分だけ表示する「入館を取り消す」 */
export function SelfCancel({ checkinId, until, serverNow }: { checkinId: string; until: number; serverNow: number }) {
  return (
    <Countdown until={until} serverNow={serverNow}>
      {(sec) => (
        <details className="fold" style={{ marginTop: 16 }}>
          <summary>
            コースを選び間違えたとき（あと{Math.floor(sec / 60)}分{String(sec % 60).padStart(2, "0")}秒）
          </summary>
          <div>
            <p className="small">取り消すとポイントが戻り、選び直せます。受付でお見せした後は取り消さないでください。</p>
            <ActionForm action={selfCancelAction} confirm="この入館を取り消します。よろしいですか？">
              <input type="hidden" name="checkinId" value={checkinId} />
              <SubmitButton className="btn btn-danger btn-block">入館を取り消す</SubmitButton>
            </ActionForm>
          </div>
        </details>
      )}
    </Countdown>
  );
}
