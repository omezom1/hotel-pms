import { useEffect, useRef } from 'react'

// ตัวเลือก element ที่โฟกัสได้ภายใน dialog (กรอง [tabindex="-1"] ออก)
const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])'

// useFocusTrap: ขัง Tab/Shift+Tab ไว้ใน dialog + โฟกัส element แรกตอนเปิด + คืนโฟกัสเดิมตอนปิด
// วิธีใช้:
//   const ref = useFocusTrap<HTMLDivElement>(open, onClose)
//   <div ref={ref} role="dialog" aria-modal="true" tabIndex={-1}> ... </div>
// ส่ง onEscape ถ้าต้องการให้ Esc ปิด dialog (ถ้า dialog จัดการ Esc เองอยู่แล้วให้เว้นว่าง)
export function useFocusTrap<T extends HTMLElement = HTMLDivElement>(
  active: boolean = true,
  onEscape?: () => void,
) {
  const ref = useRef<T>(null)
  // เก็บ onEscape ใน ref เพื่อให้ effect ผูกแค่ active (ไม่ re-run/รีโฟกัสทุก render)
  const escRef = useRef(onEscape)
  escRef.current = onEscape

  useEffect(() => {
    if (!active) return
    const node = ref.current
    if (!node) return

    const prevFocused = document.activeElement as HTMLElement | null
    const focusables = () =>
      Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null)

    // โฟกัส element แรก (ถ้าไม่มีให้โฟกัสตัว dialog เอง — ต้องตั้ง tabIndex={-1})
    // เคารพ autoFocus เดิม: ถ้ามี element ใน dialog ถูกโฟกัสไว้แล้ว ไม่แย่งโฟกัส
    if (!node.contains(document.activeElement)) {
      const first = focusables()[0]
      ;(first ?? node).focus()
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        escRef.current?.()
        return
      }
      if (e.key !== 'Tab') return
      const items = focusables()
      if (items.length === 0) {
        e.preventDefault()
        node.focus()
        return
      }
      const firstEl = items[0]
      const lastEl = items[items.length - 1]
      const activeEl = document.activeElement
      if (e.shiftKey) {
        if (activeEl === firstEl || !node.contains(activeEl)) {
          e.preventDefault()
          lastEl.focus()
        }
      } else {
        if (activeEl === lastEl || !node.contains(activeEl)) {
          e.preventDefault()
          firstEl.focus()
        }
      }
    }

    node.addEventListener('keydown', onKey)
    return () => {
      node.removeEventListener('keydown', onKey)
      prevFocused?.focus?.()
    }
  }, [active])

  return ref
}
