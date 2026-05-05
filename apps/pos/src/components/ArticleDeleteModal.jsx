import { useEffect, useRef } from "react"

export default function ArticleDeleteModal({ article, onConfirm, onCancel }) {
  const cancelRef = useRef(null)
  const deleteRef = useRef(null)

  useEffect(() => {
    cancelRef.current?.focus()

    function onKey(e) {
      if (e.key === "Escape") { onCancel(); return }
      if (e.key === "Tab") {
        e.preventDefault()
        if (document.activeElement === cancelRef.current) {
          deleteRef.current?.focus()
        } else {
          cancelRef.current?.focus()
        }
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onCancel])

  return (
    <div className="ar-modal-overlay" onClick={onCancel}>
      <div
        className="ar-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ar-del-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ar-modal-body">
          <div className="ar-modal-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </div>
          <div>
            <p className="ar-modal-title" id="ar-del-title">Eliminar artículo</p>
            <p className="ar-modal-text">
              ¿Eliminar <strong>{article.descripcion}</strong>? Esta acción no se puede deshacer.
            </p>
          </div>
        </div>
        <div className="ar-modal-actions">
          <button ref={cancelRef} type="button" className="ar-btn-cancel" onClick={onCancel}>
            Cancelar
          </button>
          <button ref={deleteRef} type="button" className="ar-btn-delete" onClick={onConfirm}>
            Eliminar
          </button>
        </div>
      </div>
    </div>
  )
}
