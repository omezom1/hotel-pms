'use client'
import { useState } from 'react'
import { useHotelStore } from '@/lib/store'
import { useAuthStore } from '@/lib/auth-store'
import { useConfirm } from '@/components/ConfirmProvider'
import { useFocusTrap } from '@/lib/useFocusTrap'
import Header from '@/components/layout/Header'
import { formatCurrency, formatDateTime, getRoomStatusLabel, getRoomTypeLabel, todayLocal } from '@/lib/utils'
import { ShoppingBag, X, Plus, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { RoomStatus, RoomType, RoomWing, DynamicPricing } from '@/types'

const statusColors: Record<RoomStatus, string> = {
  available: 'text-emerald-700 bg-emerald-100',
  occupied: 'text-blue-700 bg-blue-100',
  cleaning: 'text-amber-700 bg-amber-100',
  maintenance: 'text-red-700 bg-red-100',
}

const roomTypeStats = (rooms: ReturnType<typeof useHotelStore.getState>['rooms']) => {
  const types: RoomType[] = ['single', 'double', 'triple']
  return types.map((type) => {
    const typeRooms = rooms.filter((r) => r.type === type)
    return {
      type,
      total: typeRooms.length,
      available: typeRooms.filter((r) => r.status === 'available').length,
      basePrice: typeRooms[0]?.pricePerNight ?? 0,
    }
  }).filter((t) => t.total > 0)
}

export default function RoomsPage() {
  const { rooms, updateRoomStatus, bookingAddOns, addOnItems, bookings, dynamicPricing, fulfillAddOn, cancelAddOn, addPricingRule, updatePricingRule, deletePricingRule, logAudit } = useHotelStore()
  const { user } = useAuthStore()
  // ยกเลิก add-on ที่จ่ายเงินแล้ว = คืนเงิน → ต้องมีสิทธิ์การเงิน (เหมือน booking detail)
  const canRefund = user?.staff.permissions.canManageFinance ?? false
  // จัดการราคา = revenue decision → สิทธิ์การเงิน
  const canManagePricing = canRefund
  const confirm = useConfirm()
  const [activeTab, setActiveTab] = useState<'rooms' | 'pricing' | 'addon'>('rooms')
  const pendingAddOns = bookingAddOns.filter((a) => a.status === 'requested')
  const [filterType, setFilterType] = useState<RoomType | 'all'>('all')
  const [filterStatus, setFilterStatus] = useState<RoomStatus | 'all'>('all')
  const [filterWing, setFilterWing] = useState<RoomWing | 'all'>('all')
  // ปิดห้องปรับปรุง = ห้องหายจากการขาย → เก็บเหตุผล + audit ก่อนปิด
  const [closeRoom, setCloseRoom] = useState<{ id: string; number: string } | null>(null)
  const [closeReason, setCloseReason] = useState<'repair' | 'deep_clean' | 'renovation' | 'other'>('repair')
  const closeTrapRef = useFocusTrap<HTMLDivElement>(!!closeRoom, () => setCloseRoom(null))

  const CLOSE_REASON_LABEL: Record<'repair' | 'deep_clean' | 'renovation' | 'other', string> = {
    repair: 'ซ่อมบำรุง', deep_clean: 'ทำความสะอาดใหญ่', renovation: 'ปรับปรุง/รีโนเวท', other: 'อื่นๆ',
  }

  function confirmCloseRoom() {
    if (!closeRoom) return
    updateRoomStatus(closeRoom.id, 'maintenance')
    logAudit({ category: 'room', action: 'status_change', summary: `ปิดปรับปรุงห้อง ${closeRoom.number} (${CLOSE_REASON_LABEL[closeReason]})`, entityId: closeRoom.id })
    toast.success(`ปิดปรับปรุงห้อง ${closeRoom.number} แล้ว`)
    setCloseRoom(null)
  }

  // ===== Seasonal pricing (จัดการช่วงราคา) =====
  const blankRate = { roomType: 'single' as RoomType, name: '', startDate: '', endDate: '', price: '', description: '' }
  const [rateModal, setRateModal] = useState<{ mode: 'new' } | { mode: 'edit'; id: string } | null>(null)
  const [rateForm, setRateForm] = useState(blankRate)
  const rateTrapRef = useFocusTrap<HTMLDivElement>(!!rateModal, () => setRateModal(null))
  const today = todayLocal()

  function openNewRate() {
    setRateForm({ ...blankRate, startDate: today, endDate: today })
    setRateModal({ mode: 'new' })
  }
  function openEditRate(rule: DynamicPricing) {
    setRateForm({ roomType: rule.roomType, name: rule.name, startDate: rule.startDate, endDate: rule.endDate, price: String(rule.price), description: rule.description ?? '' })
    setRateModal({ mode: 'edit', id: rule.id })
  }
  function submitRate() {
    const payload = {
      roomType: rateForm.roomType, name: rateForm.name,
      startDate: rateForm.startDate, endDate: rateForm.endDate,
      price: Number(rateForm.price), description: rateForm.description,
    }
    const res = rateModal?.mode === 'edit'
      ? updatePricingRule(rateModal.id, payload)
      : addPricingRule(payload)
    if (!res.ok) { toast.error(res.error ?? 'บันทึกไม่สำเร็จ'); return }
    toast.success(rateModal?.mode === 'edit' ? 'แก้ช่วงราคาแล้ว' : 'เพิ่มช่วงราคาแล้ว')
    setRateModal(null)
  }
  async function removeRate(rule: DynamicPricing) {
    if (!(await confirm({ title: 'ลบช่วงราคา?', message: `ลบช่วงราคา "${rule.name}" (${getRoomTypeLabel(rule.roomType)})?`, danger: true }))) return
    deletePricingRule(rule.id)
    toast.info('ลบช่วงราคาแล้ว')
  }
  const rateAppliesToday = (r: DynamicPricing) => r.startDate <= today && r.endDate >= today

  const filtered = rooms.filter((r) =>
    (filterType === 'all' || r.type === filterType) &&
    (filterStatus === 'all' || r.status === filterStatus) &&
    (filterWing === 'all' || r.wing === filterWing)
  )
  const typeStats = roomTypeStats(rooms)

  return (
    <div className="flex flex-col h-screen">
      <Header title="จัดการห้องพัก" subtitle="สต็อกห้องพักและการตั้งราคา" />
      <div className="flex-1 overflow-y-auto p-6 space-y-5">

        {/* Type summary */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {typeStats.map((t) => (
            <div key={t.type} className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
              <div className="text-sm font-medium text-slate-700">{getRoomTypeLabel(t.type)}</div>
              <div className="text-2xl font-bold text-slate-800 mt-1">{t.total}</div>
              <div className="text-xs text-slate-500">ว่าง {t.available} ห้อง</div>
              <div className="text-xs text-amber-600 font-medium mt-1">{formatCurrency(t.basePrice)}/คืน</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="no-print flex gap-1 bg-slate-100 p-1 rounded-lg w-fit">
          <button onClick={() => setActiveTab('rooms')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'rooms' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}>
            รายการห้อง
          </button>
          <button onClick={() => setActiveTab('pricing')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'pricing' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}>
            Dynamic Pricing
          </button>
          <button onClick={() => setActiveTab('addon')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'addon' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}>
            <ShoppingBag size={14} />
            คำขอ Add-on
            {pendingAddOns.length > 0 && (
              <span className="bg-red-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center font-bold">
                {pendingAddOns.length}
              </span>
            )}
          </button>
        </div>

        {activeTab === 'rooms' && (
          <>
            {/* Filters */}
            <div className="no-print flex gap-3 flex-wrap">
              <select value={filterWing} onChange={(e) => setFilterWing(e.target.value as RoomWing | 'all')}
                className="px-4 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none">
                <option value="all">ทุกฝั่ง</option>
                <option value="front">ด้านหน้า (A)</option>
                <option value="back">ด้านหลัง (B)</option>
              </select>
              <select value={filterType} onChange={(e) => setFilterType(e.target.value as RoomType | 'all')}
                className="px-4 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none">
                <option value="all">ประเภทห้องทั้งหมด</option>
                {(['single', 'double', 'triple'] as RoomType[]).map((t) => (
                  <option key={t} value={t}>{getRoomTypeLabel(t)}</option>
                ))}
              </select>
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as RoomStatus | 'all')}
                className="px-4 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none">
                <option value="all">สถานะทั้งหมด</option>
                {(['available', 'occupied', 'cleaning', 'maintenance'] as RoomStatus[]).map((s) => (
                  <option key={s} value={s}>{getRoomStatusLabel(s)}</option>
                ))}
              </select>
              <div className="ml-auto text-sm text-slate-500 self-center">แสดง {filtered.length} จาก {rooms.length} ห้อง</div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-100">
                    <tr>
                      {['ห้อง', 'ฝั่ง', 'ชั้น', 'ประเภท', 'ราคา/คืน', 'รองรับ', 'สิ่งอำนวยความสะดวก', 'สถานะ', 'เปลี่ยนสถานะ'].map((h) => (
                        <th key={h} className="text-left px-4 py-3 font-medium text-slate-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filtered.map((room) => (
                      <tr key={room.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-bold text-slate-800">{room.number}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${room.wing === 'front' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                            {room.wing === 'front' ? 'ด้านหน้า' : 'ด้านหลัง'}
                          </span>
                        </td>
                        <td className="px-4 py-3">{room.floor}</td>
                        <td className="px-4 py-3">{getRoomTypeLabel(room.type)}</td>
                        <td className="px-4 py-3 font-semibold">{formatCurrency(room.pricePerNight)}</td>
                        <td className="px-4 py-3">{room.maxGuests} ท่าน</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {room.amenities.slice(0, 3).map((a) => (
                              <span key={a} className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{a}</span>
                            ))}
                            {room.amenities.length > 3 && <span className="text-[10px] text-slate-400">+{room.amenities.length - 3}</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${statusColors[room.status]}`}>
                            {getRoomStatusLabel(room.status)}
                          </span>
                        </td>
                        <td className="no-print px-4 py-3">
                          <select
                            value={room.status === 'occupied' ? '' : room.status}
                            disabled={room.status === 'occupied'}
                            onChange={async (e) => {
                              const next = e.target.value as RoomStatus
                              // ปิดปรับปรุง = กระทบการขาย → เก็บเหตุผล + audit ผ่าน dialog
                              if (next === 'maintenance') {
                                setCloseReason('repair')
                                setCloseRoom({ id: room.id, number: room.number })
                                return
                              }
                              if (next === 'available' && room.status === 'cleaning') {
                                if (!(await confirm({ message: `ยืนยันว่าห้อง ${room.number} ทำความสะอาดเสร็จและพร้อมรับแขกแล้วใช่หรือไม่?`, confirmText: 'พร้อมรับแขก' }))) return
                              }
                              // เปิดห้องกลับจากปิดปรับปรุง → บันทึก audit ว่ากลับมาขายได้ (next ไม่ใช่ maintenance แล้วจาก guard ด้านบน)
                              if (room.status === 'maintenance') {
                                logAudit({ category: 'room', action: 'status_change', summary: `เปิดห้อง ${room.number} กลับมาใช้งาน (${getRoomStatusLabel(next)})`, entityId: room.id })
                              }
                              updateRoomStatus(room.id, next)
                            }}
                            className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none bg-white disabled:bg-slate-100 disabled:text-slate-400"
                            title={room.status === 'occupied' ? 'ห้องมีผู้พักอยู่ — เปลี่ยนสถานะอัตโนมัติเมื่อเช็คเอาต์' : ''}
                          >
                            {room.status === 'occupied' && <option value="">มีผู้เข้าพัก (อัตโนมัติ)</option>}
                            <option value="available">ว่าง</option>
                            <option value="cleaning">ทำความสะอาด</option>
                            <option value="maintenance">ปิดปรับปรุง</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {activeTab === 'pricing' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-slate-500">
                ตั้งราคาต่อคืนตามช่วงวัน/ฤดูกาล — ระบบเลือก <span className="font-medium text-slate-600">ช่วงที่สั้นที่สุด</span> ที่ครอบวันนั้น (เฉพาะเจาะจงสุด); ถ้าไม่มีช่วงครอบ ใช้ราคาตั้งต้นของห้อง
              </p>
              {canManagePricing && (
                <button onClick={openNewRate}
                  className="no-print flex items-center gap-1.5 shrink-0 px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium transition-colors">
                  <Plus size={16} /> เพิ่มช่วงราคา
                </button>
              )}
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-100">
                    <tr>
                      {['ประเภทห้อง', 'ชื่อช่วงราคา', 'วันเริ่ม', 'วันสิ้นสุด', 'ราคา/คืน', 'หมายเหตุ'].map((h) => (
                        <th key={h} className="text-left px-4 py-3 font-medium text-slate-500 whitespace-nowrap">{h}</th>
                      ))}
                      {canManagePricing && <th className="no-print px-4 py-3"></th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {[...dynamicPricing].sort((a, b) => a.startDate.localeCompare(b.startDate)).map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium whitespace-nowrap">{getRoomTypeLabel(p.roomType)}</td>
                        <td className="px-4 py-3">
                          <span className="font-medium text-slate-800">{p.name}</span>
                          {rateAppliesToday(p) && (
                            <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium align-middle">ใช้วันนี้</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{p.startDate}</td>
                        <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{p.endDate}</td>
                        <td className="px-4 py-3 font-semibold text-amber-600 whitespace-nowrap">{formatCurrency(p.price)}</td>
                        <td className="px-4 py-3 text-slate-500">{p.description || '–'}</td>
                        {canManagePricing && (
                          <td className="no-print px-4 py-3">
                            <div className="flex items-center justify-end gap-1">
                              <button onClick={() => openEditRate(p)} title="แก้ไข"
                                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700"><Pencil size={15} /></button>
                              <button onClick={() => removeRate(p)} title="ลบ"
                                className="p-1.5 rounded-lg text-red-500 hover:bg-red-50"><Trash2 size={15} /></button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                    {dynamicPricing.length === 0 && (
                      <tr><td colSpan={canManagePricing ? 7 : 6} className="text-center py-12 text-slate-400">ยังไม่มีช่วงราคา — ใช้ราคาตั้งต้นของห้อง</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
        {activeTab === 'addon' && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr>
                    {['ห้อง', 'รายการ Add-on', 'จำนวน', 'ราคา', 'หมายเหตุ', 'วันที่ขอ', ''].map((h) => (
                      <th key={h} className="text-left px-4 py-3 font-medium text-slate-500 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {bookingAddOns.filter((a) => a.status !== 'cancelled').map((ao) => {
                    const item = addOnItems.find((i) => i.id === ao.addOnItemId)
                    const booking = bookings.find((b) => b.id === ao.bookingId)
                    const roomObj = rooms.find((r) => r.id === booking?.roomId)
                    const statusColor = { requested: 'text-amber-700 bg-amber-100', fulfilled: 'text-emerald-700 bg-emerald-100', cancelled: 'text-slate-500 bg-slate-100' }[ao.status]
                    const statusLabel = { requested: 'รอดำเนินการ', fulfilled: 'จัดให้แล้ว', cancelled: 'ยกเลิก' }[ao.status]
                    return (
                      <tr key={ao.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium">ห้อง {roomObj?.number ?? '–'}</td>
                        <td className="px-4 py-3 font-medium text-slate-800">{item?.name ?? ao.addOnItemId}</td>
                        <td className="px-4 py-3">{ao.quantity}</td>
                        <td className="px-4 py-3">{formatCurrency(ao.totalPrice)}</td>
                        <td className="px-4 py-3 text-slate-400 italic text-xs">{ao.notes || '–'}</td>
                        <td className="px-4 py-3 text-slate-500 text-xs">{formatDateTime(ao.requestedAt)}</td>
                        <td className="px-4 py-3">
                          {ao.status === 'requested' ? (
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => {
                                  if (!user) return
                                  const result = fulfillAddOn(ao.id, user.staff.id)
                                  if (!result.ok) {
                                    toast.error(result.error ?? 'จัดการ Add-on ไม่สำเร็จ')
                                    return
                                  }
                                  toast.success('จัดการ Add-on สำเร็จ', { description: 'ตัดสต็อกอัตโนมัติแล้ว (ถ้ามี)' })
                                }}
                                className="px-3 py-1.5 text-xs bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg font-medium transition-colors"
                              >
                                จัดการแล้ว
                              </button>
                              <button
                                onClick={async () => {
                                  const booking = bookings.find((b) => b.id === ao.bookingId)
                                  if ((booking?.paidAmount ?? 0) > 0 && !canRefund) { toast.error('ยกเลิก add-on ของบิลที่จ่ายเงินแล้วต้องมีสิทธิ์จัดการการเงิน (อาจมีการคืนเงิน)'); return }
                                  if (!(await confirm({ title: 'ยกเลิก Add-on?', message: `ยกเลิก add-on "${item?.name ?? 'รายการนี้'}"?\nรายได้ ${formatCurrency(ao.totalPrice)} จะหายไปจากบิล`, danger: true }))) return
                                  cancelAddOn(ao.id)
                                  toast.info('ยกเลิก Add-on แล้ว')
                                }}
                                className="px-3 py-1.5 text-xs bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 rounded-lg font-medium transition-colors"
                              >
                                ยกเลิก
                              </button>
                            </div>
                          ) : (
                            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${statusColor}`}>{statusLabel}</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                  {bookingAddOns.filter((a) => a.status !== 'cancelled').length === 0 && (
                    <tr><td colSpan={7} className="text-center py-12 text-slate-400">ไม่มีคำขอ Add-on</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Close-room (ปิดปรับปรุง) dialog — เก็บเหตุผล + audit */}
      {closeRoom && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setCloseRoom(null)}>
          <div ref={closeTrapRef} role="dialog" aria-modal="true" tabIndex={-1} className="bg-white rounded-xl shadow-xl w-full max-w-sm focus:outline-none" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h2 className="font-semibold text-slate-800">ปิดปรับปรุงห้อง {closeRoom.number}</h2>
              <button onClick={() => setCloseRoom(null)} className="p-2 rounded-lg hover:bg-slate-100"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-slate-600">ห้องนี้จะถูกปิดจากการขายจนกว่าจะเปิดกลับ — ระบุเหตุผลเพื่อเก็บเป็นประวัติ</p>
              <div>
                <label htmlFor="close-reason" className="block text-sm font-medium text-slate-700 mb-1.5">เหตุผล *</label>
                <select id="close-reason" value={closeReason} onChange={(e) => setCloseReason(e.target.value as typeof closeReason)}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none">
                  {(['repair', 'deep_clean', 'renovation', 'other'] as const).map((r) => (
                    <option key={r} value={r}>{CLOSE_REASON_LABEL[r]}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 px-5 py-4 border-t border-slate-100">
              <button onClick={() => setCloseRoom(null)} className="px-5 py-2.5 border border-slate-200 rounded-lg text-sm hover:bg-slate-50">ยกเลิก</button>
              <button onClick={confirmCloseRoom} className="px-5 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium">ปิดปรับปรุง</button>
            </div>
          </div>
        </div>
      )}

      {/* เพิ่ม/แก้ ช่วงราคา (Seasonal rate) dialog */}
      {rateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setRateModal(null)}>
          <div ref={rateTrapRef} role="dialog" aria-modal="true" tabIndex={-1} className="bg-white rounded-xl shadow-xl w-full max-w-md focus:outline-none" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h2 className="font-semibold text-slate-800">{rateModal.mode === 'edit' ? 'แก้ไขช่วงราคา' : 'เพิ่มช่วงราคา'}</h2>
              <button onClick={() => setRateModal(null)} className="p-2 rounded-lg hover:bg-slate-100"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="rate-roomtype" className="block text-sm font-medium text-slate-700 mb-1.5">ประเภทห้อง *</label>
                  <select id="rate-roomtype" value={rateForm.roomType} onChange={(e) => setRateForm({ ...rateForm, roomType: e.target.value as RoomType })}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none bg-white">
                    {(['single', 'double', 'triple'] as RoomType[]).map((t) => (
                      <option key={t} value={t}>{getRoomTypeLabel(t)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="rate-price" className="block text-sm font-medium text-slate-700 mb-1.5">ราคา/คืน (บาท) *</label>
                  <input id="rate-price" type="number" min={1} value={rateForm.price} onChange={(e) => setRateForm({ ...rateForm, price: e.target.value })}
                    placeholder="เช่น 1200" className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none" />
                </div>
              </div>
              <div>
                <label htmlFor="rate-name" className="block text-sm font-medium text-slate-700 mb-1.5">ชื่อช่วงราคา *</label>
                <input id="rate-name" value={rateForm.name} onChange={(e) => setRateForm({ ...rateForm, name: e.target.value })}
                  placeholder="เช่น ไฮซีซั่นปีใหม่" className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="rate-start" className="block text-sm font-medium text-slate-700 mb-1.5">วันเริ่ม *</label>
                  <input id="rate-start" type="date" value={rateForm.startDate} onChange={(e) => setRateForm({ ...rateForm, startDate: e.target.value })}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none" />
                </div>
                <div>
                  <label htmlFor="rate-end" className="block text-sm font-medium text-slate-700 mb-1.5">วันสิ้นสุด *</label>
                  <input id="rate-end" type="date" min={rateForm.startDate || undefined} value={rateForm.endDate} onChange={(e) => setRateForm({ ...rateForm, endDate: e.target.value })}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none" />
                </div>
              </div>
              <div>
                <label htmlFor="rate-desc" className="block text-sm font-medium text-slate-700 mb-1.5">หมายเหตุ</label>
                <input id="rate-desc" value={rateForm.description} onChange={(e) => setRateForm({ ...rateForm, description: e.target.value })}
                  placeholder="(ไม่บังคับ)" className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none" />
              </div>
            </div>
            <div className="flex justify-end gap-3 px-5 py-4 border-t border-slate-100">
              <button onClick={() => setRateModal(null)} className="px-5 py-2.5 border border-slate-200 rounded-lg text-sm hover:bg-slate-50">ยกเลิก</button>
              <button onClick={submitRate}
                disabled={!rateForm.name.trim() || !rateForm.startDate || !rateForm.endDate || !(Number(rateForm.price) > 0)}
                className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed">
                {rateModal.mode === 'edit' ? 'บันทึก' : 'เพิ่มช่วงราคา'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
