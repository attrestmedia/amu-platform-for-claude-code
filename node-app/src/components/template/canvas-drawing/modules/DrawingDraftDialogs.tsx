import type { RefObject } from "react";
import { Button } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";

export function DrawingDraftDialogs({
  commentOpen,
  commentValue,
  commentTextareaRef,
  onCommentChange,
  onCommentClose,
  onCommentSubmit,
  textOpen,
  textValue,
  textTextareaRef,
  onTextChange,
  onTextClose,
  onTextSubmit,
  labelFontSize,
  penColor,
}: {
  commentOpen: boolean;
  commentValue: string;
  commentTextareaRef: RefObject<HTMLTextAreaElement | null>;
  onCommentChange: (value: string) => void;
  onCommentClose: () => void;
  onCommentSubmit: () => void;
  textOpen: boolean;
  textValue: string;
  textTextareaRef: RefObject<HTMLTextAreaElement | null>;
  onTextChange: (value: string) => void;
  onTextClose: () => void;
  onTextSubmit: () => void;
  labelFontSize: number;
  penColor: string;
}) {
  return (
    <>
      {commentOpen ? (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="drawing-comment-title">
          <div className="w-full max-w-md rounded-2xl border bg-background p-4 shadow-xl">
            <div id="drawing-comment-title" className="mb-2 text-sm font-semibold"><Lang text={{ ko: "코멘트 추가", en: "Add comment" }} /></div>
            <textarea ref={commentTextareaRef} value={commentValue} onChange={(event) => onCommentChange(event.target.value)} rows={4} className="w-full resize-none rounded-xl border bg-background px-3 py-2 text-sm focus-visible-ring" placeholder={lang({ ko: "내용을 입력하세요…", en: "Type your note…" })} />
            <div className="mt-3 flex items-center justify-end gap-2">
              <Button variant="outline" onClick={onCommentClose}><Lang text={{ ko: "취소", en: "Cancel" }} /></Button>
              <Button disabled={!commentValue.trim()} onClick={onCommentSubmit}><Lang text={{ ko: "추가", en: "Add" }} /></Button>
            </div>
          </div>
        </div>
      ) : null}
      {textOpen ? (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="drawing-text-title">
          <div className="w-full max-w-md rounded-2xl border bg-background p-4 shadow-xl">
            <div id="drawing-text-title" className="mb-2 text-sm font-semibold"><Lang text={{ ko: "텍스트 추가", en: "Add text" }} /></div>
            <p className="mb-3 text-xs text-secondary-text"><Lang text={{ ko: `현재 텍스트 크기 ${labelFontSize}px, 컬러 ${penColor.toUpperCase()}로 적용됩니다.`, en: `Text will use ${labelFontSize}px and color ${penColor.toUpperCase()}.` }} /></p>
            <textarea ref={textTextareaRef} value={textValue} onChange={(event) => onTextChange(event.target.value)} rows={3} className="w-full resize-none rounded-xl border bg-background px-3 py-2 text-sm focus-visible-ring" placeholder={lang({ ko: "이미지 위에 올릴 문구를 입력하세요…", en: "Type the text to place on the image..." })} />
            <div className="mt-3 flex items-center justify-end gap-2">
              <Button variant="outline" onClick={onTextClose}><Lang text={{ ko: "취소", en: "Cancel" }} /></Button>
              <Button disabled={!textValue.trim()} onClick={onTextSubmit}><Lang text={{ ko: "텍스트 배치", en: "Place text" }} /></Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
