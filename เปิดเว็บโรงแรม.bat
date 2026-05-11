@echo off
title Hotel Paradise PMS
echo ============================================
echo   Hotel Paradise - ระบบจัดการโรงแรม
echo ============================================
echo.
echo กำลังเริ่มต้น server...
echo รอจนขึ้น "Ready" แล้วเปิด browser ที่
echo http://localhost:3000
echo.
echo *** อย่าปิดหน้าต่างนี้ขณะใช้งาน ***
echo.
cd /d "%~dp0"
set PATH=%PATH%;C:\Program Files\nodejs
npm run dev
pause
