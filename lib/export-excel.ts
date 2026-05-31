// ส่งออกเป็นไฟล์ Excel (.xlsx) จริง พร้อมจัดรูปแบบให้ดูดี
// ใช้ ExcelJS แบบ dynamic import (โหลดเฉพาะตอนกดปุ่ม ไม่ถ่วงหน้าแอป)

export interface ExcelColumn {
  header: string
  width?: number          // ความกว้างคอลัมน์ (ตัวอักษร) — ไม่ระบุจะคำนวณอัตโนมัติ
  money?: boolean         // จัดรูปแบบเป็นเงิน #,##0.00 + ชิดขวา
  align?: 'left' | 'right' | 'center'
}

export interface ExcelTable {
  heading?: string                              // หัวข้อย่อยเหนือตาราง (ถ้ามี)
  columns: ExcelColumn[]
  rows: (string | number | null | undefined)[][]
  totalRow?: (string | number | null | undefined)[]  // แถวสรุปยอด (ตัวหนา ไฮไลต์)
}

const BRAND = 'F59E0B'        // amber-500 (หัวตาราง)
const BRAND_DARK = '92400E'   // amber-800 (หัวเรื่อง)
const ZEBRA = 'FFF7ED'        // amber-50 (แถวสลับ)
const TOTAL_FILL = 'FDE68A'   // amber-200 (แถวรวมยอด)
const BORDER = 'E2E8F0'       // slate-200 (เส้นตาราง)

export async function downloadExcel(opts: {
  filename: string
  sheetName: string
  title: string
  subtitle?: string
  tables: ExcelTable[]
}) {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Pruksatara Park & Resort'
  wb.created = new Date()
  const ws = wb.addWorksheet(opts.sheetName, {
    views: [{ showGridLines: false }],
  })

  // จำนวนคอลัมน์มากสุดในทุกตาราง (ใช้ merge หัวเรื่อง + คำนวณความกว้าง)
  const maxCols = Math.max(...opts.tables.map((t) => t.columns.length), 1)
  const lastColLetter = (n: number) => {
    let s = ''
    while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26) }
    return s
  }

  const thin = { style: 'thin' as const, color: { argb: BORDER } }
  const allBorders = { top: thin, left: thin, bottom: thin, right: thin }

  let r = 1

  // ===== หัวเรื่อง =====
  ws.mergeCells(`A${r}:${lastColLetter(maxCols)}${r}`)
  const titleCell = ws.getCell(`A${r}`)
  titleCell.value = opts.title
  titleCell.font = { bold: true, size: 16, color: { argb: BRAND_DARK } }
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' }
  ws.getRow(r).height = 26
  r++

  if (opts.subtitle) {
    ws.mergeCells(`A${r}:${lastColLetter(maxCols)}${r}`)
    const sub = ws.getCell(`A${r}`)
    sub.value = opts.subtitle
    sub.font = { size: 11, color: { argb: '64748B' } }
    sub.alignment = { horizontal: 'center' }
    r++
  }
  r++ // เว้น 1 บรรทัด

  // ติดตามความกว้างที่ต้องใช้ของแต่ละคอลัมน์
  const colWidths: number[] = new Array(maxCols).fill(10)
  const note = (idx: number, text: string) => {
    colWidths[idx] = Math.max(colWidths[idx], Math.min(48, text.length + 2))
  }

  let firstHeaderRow = 0

  for (const table of opts.tables) {
    if (table.heading) {
      ws.mergeCells(`A${r}:${lastColLetter(table.columns.length)}${r}`)
      const h = ws.getCell(`A${r}`)
      h.value = table.heading
      h.font = { bold: true, size: 12, color: { argb: '0F172A' } }
      r++
    }

    // หัวตาราง
    const headerRow = ws.getRow(r)
    if (!firstHeaderRow) firstHeaderRow = r
    table.columns.forEach((col, i) => {
      const cell = headerRow.getCell(i + 1)
      cell.value = col.header
      cell.font = { bold: true, color: { argb: 'FFFFFF' }, size: 11 }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } }
      cell.alignment = { vertical: 'middle', horizontal: col.align ?? (col.money ? 'right' : 'left') }
      cell.border = allBorders
      note(i, col.header)
    })
    headerRow.height = 20
    r++

    // ข้อมูล
    table.rows.forEach((row, ri) => {
      const dataRow = ws.getRow(r)
      table.columns.forEach((col, i) => {
        const cell = dataRow.getCell(i + 1)
        const val = row[i]
        cell.value = val ?? ''
        cell.border = allBorders
        cell.alignment = { horizontal: col.align ?? (col.money ? 'right' : 'left'), vertical: 'middle' }
        if (col.money && typeof val === 'number') cell.numFmt = '#,##0.00'
        if (ri % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA } }
        note(i, val == null ? '' : String(typeof val === 'number' && col.money ? val.toLocaleString() : val))
      })
      r++
    })

    // แถวรวมยอด (ถ้ามี) — ตัวหนา ไฮไลต์ ขอบบนหนา
    if (table.totalRow) {
      const totRow = ws.getRow(r)
      table.columns.forEach((col, i) => {
        const cell = totRow.getCell(i + 1)
        const val = table.totalRow![i]
        cell.value = val ?? ''
        cell.font = { bold: true, color: { argb: '0F172A' } }
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TOTAL_FILL } }
        cell.alignment = { horizontal: col.align ?? (col.money ? 'right' : 'left'), vertical: 'middle' }
        cell.border = { ...allBorders, top: { style: 'medium', color: { argb: BRAND } } }
        if (col.money && typeof val === 'number') cell.numFmt = '#,##0.00'
        note(i, val == null ? '' : String(typeof val === 'number' && col.money ? val.toLocaleString() : val))
      })
      r++
    }

    r++ // เว้น 1 บรรทัดระหว่างตาราง
  }

  // ตั้งความกว้างคอลัมน์
  colWidths.forEach((w, i) => { ws.getColumn(i + 1).width = w })

  // ตรึงหัวตารางแรก (เลื่อนดูข้อมูลยาวๆ ได้สะดวก)
  if (firstHeaderRow) {
    ws.views = [{ state: 'frozen', ySplit: firstHeaderRow, showGridLines: false }]
  }

  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = opts.filename.endsWith('.xlsx') ? opts.filename : `${opts.filename}.xlsx`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/** วันที่วันนี้รูปแบบ YYYY-MM-DD สำหรับต่อท้ายชื่อไฟล์ */
export function dateStamp(): string {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}
