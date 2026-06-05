'use client'
import { useState } from 'react'
import { useHotelStore } from '@/lib/store'
import Header from '@/components/layout/Header'
import { formatCurrency } from '@/lib/utils'
import { useFocusTrap } from '@/lib/useFocusTrap'
import { Search, UserPlus, X, Pencil } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import type { Guest } from '@/types'

const emptyGuestForm = { name: '', phone: '', email: '', idNumber: '' }

export default function GuestsPage() {
  const { guests, addGuest, updateGuest, logAudit } = useHotelStore()
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyGuestForm)
  const trapRef = useFocusTrap<HTMLDivElement>(showForm, () => setShowForm(false))

  const filtered = guests.filter((g) =>
    !search ||
    g.name.toLowerCase().includes(search.toLowerCase()) ||
    g.email?.toLowerCase().includes(search.toLowerCase()) ||
    g.phone.includes(search)
  )

  function openAdd() {
    setEditId(null)
    setForm(emptyGuestForm)
    setShowForm(true)
  }
  function openEdit(g: Guest) {
    setEditId(g.id)
    setForm({ name: g.name, phone: g.phone, email: g.email, idNumber: g.idNumber })
    setShowForm(true)
  }

  function handleSave() {
    const name = form.name.trim()
    if (!name) return
    if (editId) {
      updateGuest(editId, { name, email: form.email.trim(), phone: form.phone.trim(), idNumber: form.idNumber.trim() })
      logAudit({ category: 'guest', action: 'edit', summary: `แก้ไขข้อมูลลูกค้า "${name}"`, entityId: editId })
      toast.success(`บันทึกข้อมูล "${name}" แล้ว`)
    } else {
      addGuest({
        name,
        email: form.email.trim(),
        phone: form.phone.trim(),
        nationality: 'ไทย',
        idNumber: form.idNumber.trim(),
        preferences: { pillow: null, floor: null, foodAllergies: [], specialRequests: [], smokingRoom: false, bedType: null },
        totalStays: 0,
        totalSpend: 0,
        joinedAt: new Date().toISOString(),
      })
      logAudit({ category: 'guest', action: 'add', summary: `เพิ่มลูกค้า "${name}"` })
      toast.success(`เพิ่มลูกค้า "${name}" แล้ว`)
    }
    setForm(emptyGuestForm)
    setEditId(null)
    setShowForm(false)
  }

  return (
    <div className="flex flex-col h-screen">
      <Header title="ข้อมูลลูกค้า (CRM)" subtitle="จัดการโปรไฟล์และประวัติของแขก" />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="no-print flex items-center justify-between gap-3 mb-5">
          <div className="relative flex-1 max-w-sm">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหาชื่อ, อีเมล, โทรศัพท์..."
              className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            />
          </div>
          <button
            onClick={openAdd}
            className="shrink-0 flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
          >
            <UserPlus size={16} /> เพิ่มข้อมูลลูกค้า
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((guest) => {
            return (
              <Link key={guest.id} href={`/guests/${guest.id}`}>
                <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5 hover:border-amber-300 hover:shadow-md transition-all cursor-pointer">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-11 h-11 rounded-full bg-slate-200 flex items-center justify-center font-bold text-slate-600 text-lg">
                      {guest.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-slate-800">{guest.name}</div>
                      <div className="text-xs text-slate-500">{guest.nationality}</div>
                    </div>
                    <button
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); openEdit(guest) }}
                      title="แก้ไขข้อมูล"
                      className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-amber-600 transition-colors"
                    >
                      <Pencil size={15} />
                    </button>
                  </div>
                  <div className="space-y-1.5 text-sm text-slate-600 mb-3">
                    <div>{guest.email}</div>
                    <div>{guest.phone}</div>
                  </div>
                  <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-sm">
                    <div className="text-slate-500">
                      <span className="font-semibold text-slate-800">{guest.totalStays}</span> ครั้ง
                    </div>
                    <div className="text-slate-500">
                      รวม <span className="font-semibold text-slate-800">{formatCurrency(guest.totalSpend)}</span>
                    </div>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>

        {filtered.length === 0 && (
          <div className="text-center py-16 text-slate-400 text-sm">
            {search ? 'ไม่พบลูกค้าที่ค้นหา' : 'ยังไม่มีข้อมูลลูกค้า'}
          </div>
        )}
      </div>

      {/* Add guest dialog */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
          <div ref={trapRef} role="dialog" aria-modal="true" tabIndex={-1} className="bg-white rounded-xl shadow-xl w-full max-w-md focus:outline-none" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h2 className="font-semibold text-slate-800">{editId ? 'แก้ไขข้อมูลลูกค้า' : 'เพิ่มข้อมูลลูกค้า'}</h2>
              <button onClick={() => setShowForm(false)} className="p-2 rounded-lg hover:bg-slate-100"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label htmlFor="guest-name" className="block text-sm font-medium text-slate-700 mb-1.5">ชื่อ-นามสกุล *</label>
                <input id="guest-name"
                  value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="เช่น สมชาย ใจดี" autoFocus
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="guest-phone" className="block text-sm font-medium text-slate-700 mb-1.5">เบอร์โทร</label>
                  <input id="guest-phone"
                    value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="08x-xxx-xxxx"
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label htmlFor="guest-id" className="block text-sm font-medium text-slate-700 mb-1.5">เลขบัตรประชาชน</label>
                  <input id="guest-id"
                    value={form.idNumber} onChange={(e) => setForm({ ...form, idNumber: e.target.value })}
                    placeholder="x-xxxx-xxxxx-xx-x"
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="guest-email" className="block text-sm font-medium text-slate-700 mb-1.5">อีเมล</label>
                <input id="guest-email"
                  value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="name@email.com"
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 px-5 py-4 border-t border-slate-100">
              <button onClick={() => setShowForm(false)} className="px-5 py-2.5 border border-slate-200 rounded-lg text-sm hover:bg-slate-50">ยกเลิก</button>
              <button
                onClick={handleSave}
                disabled={!form.name.trim()}
                className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white rounded-lg text-sm font-medium transition-colors"
              >
                บันทึก
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
