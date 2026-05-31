import type { Metadata } from 'next'
import { Noto_Sans_Thai } from 'next/font/google'
import { Toaster } from 'sonner'
import './globals.css'
import AppShell from '@/components/layout/AppShell'

const notoSansThai = Noto_Sans_Thai({
  subsets: ['thai', 'latin'],
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Pruksatara Park & Resort PMS',
  description: 'ระบบจัดการโรงแรม Pruksatara Park & Resort',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem('hotel-pms-theme')==='dark')document.documentElement.classList.add('dark')}catch(e){}`,
          }}
        />
      </head>
      <body className={`${notoSansThai.className} bg-slate-50`}>
        <AppShell>{children}</AppShell>
        <Toaster position="top-right" richColors closeButton />
      </body>
    </html>
  )
}
