'use client'
import { useState } from 'react'
import { useHotelStore } from '@/lib/store'
import Header from '@/components/layout/Header'
import { formatCurrency } from '@/lib/utils'
import { Search } from 'lucide-react'
import Link from 'next/link'

export default function GuestsPage() {
  const { guests } = useHotelStore()
  const [search, setSearch] = useState('')

  const filtered = guests.filter((g) =>
    !search ||
    g.name.toLowerCase().includes(search.toLowerCase()) ||
    g.email?.toLowerCase().includes(search.toLowerCase()) ||
    g.phone.includes(search)
  )

  return (
    <div className="flex flex-col h-screen">
      <Header title="ข้อมูลลูกค้า (CRM)" subtitle="จัดการโปรไฟล์และประวัติของแขก" />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="no-print relative mb-5 max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาชื่อ, อีเมล, โทรศัพท์..."
            className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          />
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
                    <div>
                      <div className="font-semibold text-slate-800">{guest.name}</div>
                      <div className="text-xs text-slate-500">{guest.nationality}</div>
                    </div>
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
      </div>
    </div>
  )
}
