'use client'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="th">
      <body style={{
        fontFamily: 'system-ui, sans-serif',
        background: '#f8fafc',
        margin: 0,
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}>
        <div style={{
          maxWidth: 480,
          width: '100%',
          background: '#fff',
          borderRadius: 16,
          boxShadow: '0 10px 25px rgba(0,0,0,0.08)',
          border: '1px solid #e2e8f0',
          padding: 32,
          textAlign: 'center',
        }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', margin: '0 0 8px' }}>
            เกิดข้อผิดพลาดร้ายแรง
          </h2>
          <p style={{ fontSize: 14, color: '#475569', margin: '0 0 16px' }}>
            ระบบไม่สามารถโหลดได้ในขณะนี้
          </p>
          {error.message && (
            <pre style={{
              fontSize: 11,
              color: '#94a3b8',
              background: '#f1f5f9',
              padding: 8,
              borderRadius: 6,
              overflow: 'auto',
              textAlign: 'left',
              margin: '0 0 16px',
            }}>
              {error.message}
            </pre>
          )}
          <button
            onClick={() => reset()}
            style={{
              background: '#f59e0b',
              color: '#0f172a',
              fontWeight: 600,
              border: 'none',
              padding: '10px 20px',
              borderRadius: 8,
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            ลองใหม่อีกครั้ง
          </button>
        </div>
      </body>
    </html>
  )
}
