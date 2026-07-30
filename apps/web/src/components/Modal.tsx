'use client';

import {useEffect, useRef, type ReactNode} from 'react';
import {Icon} from './Icon';

/**
 * Modal dialog, built on the native <dialog> element.
 *
 * Using the platform element rather than a div-with-overlay buys the whole
 * accessibility contract for free and correctly: focus moves into the dialog and
 * is trapped there, the rest of the page is inert to both pointer and screen
 * reader, Escape closes, and focus returns to whatever opened it. A hand-rolled
 * focus trap gets one of those wrong sooner or later.
 */
export function Modal({
  open,
  onClose,
  title,
  sub,
  children,
  footer,
  width = 560,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  sub?: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    if (open && !el.open) {
      el.showModal();
    } else if (!open && el.open) {
      el.close();
    }
  }, [open]);

  // Keep the page behind from scrolling while the dialog is up.
  useEffect(() => {
    if (!open) {
      return;
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="modal"
      // Fires for Escape and for form method="dialog" — both must sync state
      // back up, or the dialog closes visually while `open` stays true and it
      // can never be reopened.
      onClose={onClose}
      // The dialog element fills the viewport, so a click landing on the element
      // itself (rather than on the panel inside it) is a backdrop click.
      onClick={e => {
        if (e.target === ref.current) {
          onClose();
        }
      }}
      aria-labelledby="modal-title">
      <div className="modal-panel" style={{maxWidth: width}}>
        <header className="modal-head">
          <div className="min-w-0">
            <h2 id="modal-title" className="modal-title">
              {title}
            </h2>
            {sub && <p className="modal-sub">{sub}</p>}
          </div>
          <button type="button" className="modal-x" onClick={onClose} aria-label="Close">
            <Icon name="x" size={16} sw={2.2} />
          </button>
        </header>

        <div className="modal-body">{children}</div>

        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </dialog>
  );
}
