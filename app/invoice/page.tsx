'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// ไม่มีหน้า list ใบแจ้งหนี้แยก — รายการใบแจ้งหนี้อยู่ในแท็บ "ใบแจ้งหนี้" ของหน้า /finance
// หน้านี้กัน 404 เมื่อมีคนพิมพ์ /invoice เปล่า ๆ แล้วพาไปที่ /finance
export default function InvoiceIndexPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/finance')
  }, [router])
  return (
    <div className="min-h-screen flex items-center justify-center text-slate-500 text-sm">
      กำลังไปที่หน้าการเงิน…
    </div>
  )
}
