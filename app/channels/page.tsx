'use client'
import { useState } from 'react'
import { mockOTAChannels } from '@/lib/mock-data'
import Header from '@/components/layout/Header'
import { formatDateTime } from '@/lib/utils'
import { CheckCircle2, XCircle, RefreshCw, AlertTriangle, Plug } from 'lucide-react'

export default function ChannelsPage() {
  const [channels, setChannels] = useState(mockOTAChannels)
  const [syncing, setSyncing] = useState<string | null>(null)

  function handleSync(id: string) {
    setSyncing(id)
    setTimeout(() => {
      setChannels((prev) =>
        prev.map((c) =>
          c.id === id ? { ...c, lastSync: new Date().toISOString() } : c
        )
      )
      setSyncing(null)
    }, 2000)
  }

  function handleToggle(id: string) {
    setChannels((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, isConnected: !c.isConnected } : c
      )
    )
  }

  const connected = channels.filter((c) => c.isConnected)
  const totalPendingBookings = connected.reduce((s, c) => s + c.pendingBookings, 0)

  return (
    <div className="flex flex-col h-screen">
      <Header title="ช่องทางขาย (Channel Manager)" subtitle="จัดการ OTA และช่องทางการจองภายนอก" />
      <div className="flex-1 overflow-y-auto p-6 space-y-5">

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
            <div className="text-sm text-slate-500 mb-1">ช่องทางที่เชื่อมต่อ</div>
            <div className="text-3xl font-bold text-emerald-600">{connected.length}</div>
            <div className="text-xs text-slate-400">จาก {channels.length} ช่องทาง</div>
          </div>
          <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
            <div className="text-sm text-slate-500 mb-1">การจองที่รอยืนยัน</div>
            <div className="text-3xl font-bold text-amber-600">{totalPendingBookings}</div>
            <div className="text-xs text-slate-400">จาก OTA ทั้งหมด</div>
          </div>
          <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
            <div className="text-sm text-slate-500 mb-1">สต็อกห้องเฉลี่ย</div>
            <div className="text-3xl font-bold text-blue-600">
              {connected.length > 0
                ? Math.round(connected.reduce((s, c) => s + (c.inventoryMapped / c.totalRooms) * 100, 0) / connected.length)
                : 0}%
            </div>
            <div className="text-xs text-slate-400">ห้องที่แชร์กับ OTA</div>
          </div>
        </div>

        {/* OTA Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {channels.map((ch) => (
            <div key={ch.id} className={`bg-white rounded-xl shadow-sm border p-5 ${ch.isConnected ? 'border-slate-100' : 'border-slate-200 opacity-70'}`}>
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{ch.logo}</span>
                  <div>
                    <div className="font-bold text-slate-800">{ch.name}</div>
                    <div className="text-xs text-slate-400">คอมมิชชัน {ch.commission}%</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {ch.isConnected
                    ? <span className="flex items-center gap-1 text-xs text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full font-medium">
                        <CheckCircle2 size={11} /> เชื่อมต่อแล้ว
                      </span>
                    : <span className="flex items-center gap-1 text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded-full font-medium">
                        <XCircle size={11} /> ไม่ได้เชื่อมต่อ
                      </span>
                  }
                </div>
              </div>

              {ch.isConnected && (
                <div className="grid grid-cols-3 gap-3 mb-4 text-center">
                  <div className="bg-slate-50 rounded-lg p-2.5">
                    <div className="text-lg font-bold text-slate-800">{ch.inventoryMapped}</div>
                    <div className="text-xs text-slate-500">ห้องที่แชร์</div>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-2.5">
                    <div className="text-lg font-bold text-slate-800">{ch.totalRooms}</div>
                    <div className="text-xs text-slate-500">ทั้งหมด</div>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-2.5">
                    <div className={`text-lg font-bold ${ch.pendingBookings > 0 ? 'text-amber-600' : 'text-slate-800'}`}>
                      {ch.pendingBookings}
                    </div>
                    <div className="text-xs text-slate-500">รอยืนยัน</div>
                  </div>
                </div>
              )}

              {ch.pendingBookings > 0 && (
                <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 rounded-lg p-2.5 mb-3">
                  <AlertTriangle size={13} />
                  มีการจองรอยืนยัน {ch.pendingBookings} รายการ — ตรวจสอบเพื่อป้องกัน Overbooking
                </div>
              )}

              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Sync ล่าสุด: {ch.isConnected ? formatDateTime(ch.lastSync) : '-'}</span>
                <div className="no-print flex gap-2">
                  {ch.isConnected && (
                    <button
                      onClick={() => handleSync(ch.id)}
                      disabled={syncing === ch.id}
                      className="flex items-center gap-1 px-3 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
                    >
                      <RefreshCw size={11} className={syncing === ch.id ? 'animate-spin' : ''} />
                      {syncing === ch.id ? 'กำลัง Sync...' : 'Sync ตอนนี้'}
                    </button>
                  )}
                  <button
                    onClick={() => handleToggle(ch.id)}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      ch.isConnected
                        ? 'border border-red-200 text-red-600 hover:bg-red-50'
                        : 'border border-emerald-200 text-emerald-600 hover:bg-emerald-50'
                    }`}
                  >
                    <Plug size={11} />
                    {ch.isConnected ? 'ยกเลิกเชื่อมต่อ' : 'เชื่อมต่อ'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Info box */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
          <h3 className="font-semibold text-blue-800 mb-2 flex items-center gap-2">
            <Plug size={16} /> API Connectivity
          </h3>
          <p className="text-sm text-blue-700">
            ระบบรองรับการเชื่อมต่อ API กับระบบภายนอก เช่น Smart Lock, Keycard System, POS ร้านอาหาร
            ผ่าน REST API มาตรฐาน สามารถติดต่อทีม IT เพื่อขอ API Key และ Documentation เพิ่มเติม
          </p>
        </div>
      </div>
    </div>
  )
}
