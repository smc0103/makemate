import { useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { Trash2 } from 'lucide-react';
import Modal from './Modal';

interface ConfirmRequest {
  message: string;
  confirmLabel: string;
  resolve: (ok: boolean) => void;
}

/**
 * 앱 안에서 그리는 확인 창.
 * 브라우저의 window.confirm은 환경에 따라 창도 없이 바로 "취소"가 되어 쓰지 않는다.
 */
export function useConfirm() {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);

  const confirm = useCallback(
    (message: string, confirmLabel = '지우기') =>
      new Promise<boolean>((resolve) => {
        setRequest({ message, confirmLabel, resolve });
      }),
    [],
  );

  const answer = (ok: boolean) => {
    request?.resolve(ok);
    setRequest(null);
  };

  // 다른 창 안에서 열려도 화면 전체를 덮도록 body에 그린다
  const dialog = request
    ? createPortal(
        <Modal open onClose={() => answer(false)} title="정말 지울까요?" icon={<Trash2 className="h-6 w-6" />}>
          <p className="text-center leading-relaxed">{request.message}</p>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <button type="button" onClick={() => answer(false)} className="btn-storybook bg-white px-4 py-3 text-lg">
              그대로 둘래요
            </button>
            <button type="button" onClick={() => answer(true)} className="btn-storybook bg-blush px-4 py-3 text-lg">
              {request.confirmLabel}
            </button>
          </div>
        </Modal>,
        document.body,
      )
    : null;

  return { confirm, dialog };
}
