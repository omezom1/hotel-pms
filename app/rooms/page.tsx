'use client'
import { useState } from 'react'
import { useHotelStore } from '@/lib/store'
import { useAuthStore } from '@/lib/auth-store'
import { mockDynamicPricing } from '@/lib/mock-data'
import Header from '@/components/layout/Header'
import { formatCurrency, formatDateTime, getRoomStatusLabel, getRoomTypeLabel } from '@/lib/utils'
import { ShoppingBag } from 'lucide-react'
import { toast } from 'sonner'
import type { RoomStatus, RoomType, RoomWing } from '@/types'

const statusColors: Record<RoomStatus, string> = {
  available: 'text-emerald-700 bg-emerald-100',
  occupied: 'text-blue-700 bg-blue-100',
  cleaning: 'text-amber-700 bg-amber-100',
  maintenance: 'text-red-700 bg-red-100',
}

const roomTypeStats = (rooms: ReturnType<typeof useHotelStore.getState>['rooms']) => {
  const types: RoomType[] = ['standard', 'deluxe', 'family', 'suite', 'penthouse']
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
  const { rooms, updateRoomStatus, bookingAddOns, addOnItems, bookings, fulfillAddOn, cancelAddOn } = useHotelStore()
  const { user } = useAuthStore()
  const [activeTab, setActiveTab] = useState<'rooms' | 'pricing' | 'addon'>('rooms')
  const pendingAddOns = bookingAddOns.filter((a) => a.status === 'requested')
  const [filterType, setFilterType] = useState<RoomType | 'all'>('all')
  const [filterStatus, setFilterStatus] = useState<RoomStatus | 'all'>('all')
  const [filterWing, setFilterWing] = useState<RoomWing | 'all'>('all')

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
                {(['standard', 'deluxe', 'family', 'suite', 'penthouse'] as RoomType[]).map((t) => (
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
                            onChange={(e) => {
                              const next = e.target.value as RoomStatus
                              if (
                                next === 'available' &&
                                room.status === 'cleaning' &&
                                !confirm(`ยืนยันว่าห้อง ${room.number} ทำความสะอาดเสร็จและพร้อมรับแขกแล้วใช่หรือไม่?`)
                              ) return
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
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr>
                    {['ประเภทห้อง', 'ชื่อช่วงราคา', 'วันเริ่ม', 'วันสิ้นสุด', 'ราคา/คืน', 'หมายเหตุ'].map((h) => (
                      <th key={h} className="text-left px-4 py-3 font-medium text-slate-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {mockDynamicPricing.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium">{getRoomTypeLabel(p.roomType)}</td>
                      <td className="px-4 py-3">{p.name}</td>
                      <td className="px-4 py-3 text-slate-500">{p.startDate}</td>
                      <td className="px-4 py-3 text-slate-500">{p.endDate}</td>
                      <td className="px-4 py-3 font-semibold text-amber-600">{formatCurrency(p.price)}</td>
                      <td className="px-4 py-3 text-slate-500">{p.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
                                onClick={() => {
                                  if (!confirm(`ยกเลิก add-on "${item?.name ?? 'รายการนี้'}"?\nรายได้ ${formatCurrency(ao.totalPrice)} จะหายไปจากบิล`)) return
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
    </div>
  )
}
