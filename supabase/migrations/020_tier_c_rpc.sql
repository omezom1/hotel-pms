-- 020_tier_c_rpc.sql — Tier C Phase C3 (9 RPCs = atomicity ทับ dual-write ของ C2)
-- เป้าหมาย: multi-entity money actions (checkout/cancel/move/pay/add-on/extend/adjust/create)
-- เปลี่ยนจาก "optimistic set() + best-effort dual-write หลายตาราง" → "optimistic set() + 1 RPC
-- ที่เขียนทุกตาราง atomic ใน transaction เดียว" — RAISE ใด ๆ rollback ทุก DML อัตโนมัติ
--
-- หลักการ (ดูแผน ~/.claude/plans/delegated-watching-pillow.md §C3):
--   P1 client ส่ง "ราคา/เดลตา"; RPC derive "ยอดคงเหลือ/บาลานซ์" จากแถวที่ lock สด (กัน cross-tab race)
--   P2 RPC คืน jsonb ของทุกแถวที่เขียน → callRpc apply ทับ optimistic (แก้ divergence; echo suppress ตัวเอง)
--   P3 pg_advisory_xact_lock ต่อห้อง ใน create/move/extend — FOR UPDATE ล็อกแถวที่ยังไม่มีไม่ได้ (phantom overbooking)
--   P4 lock order: **booking FOR UPDATE ก่อนเสมอ** (ยกเว้น create ที่ยังไม่มี booking) → rooms → corp → guest → inventory → addon
--   P5 coded error: RAISE ERRCODE='P0001' MESSAGE='<CODE>|<ไทย>' → callRpc split '|'
--   P6 idempotent: record_payment เจอ payment id ซ้ำ = no-op คืนแถวเดิม (ห้ามแค่กัน array — paid_amount
--      จะบวกซ้ำ); extend_booking ใช้ CAS ที่ p_old_check_out (+no-op เมื่อถึงเป้าแล้ว); action อื่น retry
--      ถูก status guard (STALE_*) ตัดอยู่แล้ว; ledger/invoice/HK insert **ไม่ใช้ ON CONFLICT** —
--      id ชนจริง (client ต้อง gen id แบบ uid มี random suffix เสมอ) = corruption signal ให้ 23505
--      abort ทั้ง tx ดัง ๆ ดีกว่ากลืนแถวเงินเงียบ ๆ แล้ว balance ขยับโดย ledger ขาดแถว
--   id/timestamp ทั้งหมด client generate ส่งเข้ามา → DB row == optimistic set() (happy path ไม่ต้อง reconcile)
-- รันผ่าน MCP execute_sql หลัง 018+019 (อ้าง bookings.payments/guest_snapshot/writer_id + payments table ถูก DROP แล้ว)

-- ═══════════════════════════════════════════════════════════════════════
-- Helpers — mirror lib/utils.ts เป๊ะ (conflict logic ต้องตรงกับ client ไม่งั้น 2 ฝั่งแตกกัน)
-- ═══════════════════════════════════════════════════════════════════════

-- pms_day: "วัน" ของ ISO = 10 ตัวแรก (mirror day() = iso.split('T')[0]); YYYY-MM-DD เทียบ string = เทียบวัน
CREATE OR REPLACE FUNCTION pms_day(p_iso text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT substr(p_iso, 1, 10)
$$;

-- pms_room_conflict: mirror roomHasConflict + bookingOverlapsRange (lib/utils.ts)
--   active = status IN (confirmed, checked_in, pending); overlap = day(ci)<day(co2) AND day(co)>day(ci2)
--   ข้าม booking ที่ระบุ (แก้ของตัวเอง) + ข้าม soft-deleted (client state ไม่มี deleted)
CREATE OR REPLACE FUNCTION pms_room_conflict(p_room_id text, p_check_in text, p_check_out text, p_exclude_id text)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM bookings b
    WHERE b.deleted_at IS NULL
      AND b.id IS DISTINCT FROM p_exclude_id
      AND b.room_id = p_room_id
      AND b.status IN ('confirmed', 'checked_in', 'pending')
      AND pms_day(b.check_in) < pms_day(p_check_out)
      AND pms_day(b.check_out) > pms_day(p_check_in)
  )
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- RPC 1: create_booking_with_conflict_check (mirror store.createBooking)
--   advisory(room) กัน phantom overbooking (FOR UPDATE ล็อกแถว booking ที่ยังไม่มีไม่ได้)
--   p_booking = row snake_case จาก client (bookingRow) รวม id/created_at/payments ที่ gen แล้ว
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION create_booking_with_conflict_check(p_booking jsonb, p_writer_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_room_id  text := p_booking->>'room_id';
  v_status   text := p_booking->>'status';
  v_guest_id text := p_booking->>'guest_id';
  v_booking  bookings;
  v_room     rooms;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('room:' || v_room_id)::bigint);
  IF pms_room_conflict(v_room_id, p_booking->>'check_in', p_booking->>'check_out', NULL) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ROOM_CONFLICT|ห้องนี้มีการจองอื่นทับช่วงวันที่เลือกแล้ว';
  END IF;

  INSERT INTO bookings (
    id, room_id, room_type_at_booking, guest_id, guest_snapshot, check_in, check_out,
    nights, status, source, total_amount, paid_amount, adults, children, special_requests,
    payment_method, corporate_account_id, is_corporate, payments, created_at, writer_id
  ) VALUES (
    p_booking->>'id', v_room_id, p_booking->>'room_type_at_booking', v_guest_id,
    p_booking->'guest_snapshot', p_booking->>'check_in', p_booking->>'check_out',
    (p_booking->>'nights')::int, v_status, p_booking->>'source',
    (p_booking->>'total_amount')::numeric, (p_booking->>'paid_amount')::numeric,
    (p_booking->>'adults')::int, (p_booking->>'children')::int,
    coalesce(p_booking->>'special_requests', ''), p_booking->>'payment_method',
    p_booking->>'corporate_account_id', coalesce((p_booking->>'is_corporate')::boolean, false),
    coalesce(p_booking->'payments', '[]'::jsonb), p_booking->>'created_at', p_writer_id
  )
  RETURNING * INTO v_booking;

  -- walk-in (checked_in ตั้งแต่สร้าง) → ห้อง occupied + ผูก pointers
  IF v_status = 'checked_in' THEN
    UPDATE rooms SET status = 'occupied', current_booking_id = v_booking.id,
      current_guest_id = v_guest_id, writer_id = p_writer_id
    WHERE id = v_room_id RETURNING * INTO v_room;
  END IF;

  RETURN jsonb_build_object('booking', to_jsonb(v_booking), 'room', to_jsonb(v_room));
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- RPC 2: check_out_booking (mirror store.updateBookingStatus → checked_out; ตัวซับซ้อนสุด)
--   lock booking → room → corp → guest. derive addOnTotal/outstanding/corp-charge จาก live rows
--   client ส่ง id ที่ gen แล้ว: invoice/hk/corp-tx/corp-payment + now
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION check_out_booking(
  p_booking_id text, p_now text, p_invoice_id text, p_hk_id text,
  p_corp_tx_id text, p_corp_payment_id text, p_writer_id text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_booking     bookings;
  v_room        rooms;
  v_guest       guests;
  v_acct        corporate_accounts;
  v_corp_tx     corporate_transactions;
  v_invoice     invoices;
  v_hk          housekeeping_tasks;
  v_addon_total numeric;
  v_combined    numeric;
  v_outstanding numeric;
  v_new_paid    numeric;
  v_has_maint   boolean;
  v_room_status text;
  v_items       jsonb;
  v_inv_status  text;
  v_corp_pay    jsonb := NULL;
BEGIN
  SELECT * INTO v_booking FROM bookings WHERE id = p_booking_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'NOT_FOUND|ไม่พบการจอง';
  END IF;
  IF v_booking.status <> 'checked_in' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'STALE_BOOKING|สถานะการจองเปลี่ยนไปแล้ว (เช็คเอาต์ได้เฉพาะที่เช็คอินอยู่)';
  END IF;

  SELECT * INTO v_room FROM rooms WHERE id = v_booking.room_id FOR UPDATE;

  -- add-on ที่คิดเงิน (fulfilled) จาก live rows
  SELECT coalesce(sum(total_price), 0) INTO v_addon_total
  FROM booking_add_ons
  WHERE booking_id = p_booking_id AND status = 'fulfilled' AND deleted_at IS NULL;

  v_combined    := v_booking.total_amount + v_addon_total;
  v_outstanding := v_combined - v_booking.paid_amount;
  v_new_paid    := v_booking.paid_amount;

  -- corp auto-charge จาก live balance (กัน cross-tab ตัดเครดิตซ้อน)
  IF v_booking.corporate_account_id IS NOT NULL AND v_outstanding > 0 THEN
    SELECT * INTO v_acct FROM corporate_accounts WHERE id = v_booking.corporate_account_id FOR UPDATE;
    IF FOUND AND v_acct.available_balance >= v_outstanding THEN
      INSERT INTO corporate_transactions (
        id, corporate_account_id, type, amount, balance_before, balance_after,
        booking_id, performed_by, date, notes, writer_id
      ) VALUES (
        p_corp_tx_id, v_acct.id, 'charge', v_outstanding, v_acct.available_balance,
        v_acct.available_balance - v_outstanding, p_booking_id, 'system', p_now,
        'ตัดเครดิตอัตโนมัติเมื่อเช็คเอาต์', p_writer_id
      )
      RETURNING * INTO v_corp_tx;

      UPDATE corporate_accounts
        SET total_used = total_used + v_outstanding,
            available_balance = available_balance - v_outstanding,
            writer_id = p_writer_id
      WHERE id = v_acct.id RETURNING * INTO v_acct;

      v_new_paid := v_combined;
      v_corp_pay := jsonb_build_object(
        'id', p_corp_payment_id, 'amount', v_outstanding, 'method', 'bank_transfer',
        'date', p_now, 'staffId', 'system',
        'notes', 'ตัดเครดิตองค์กรอัตโนมัติ (' || v_acct.company_name || ')'
      );
    END IF;
  END IF;

  -- อัพเดท booking: paid + payments (append corp payment ถ้ามี, idempotent)
  UPDATE bookings
    SET status = 'checked_out', paid_amount = v_new_paid,
        payments = CASE
          WHEN v_corp_pay IS NOT NULL
            AND NOT (payments @> jsonb_build_array(jsonb_build_object('id', p_corp_payment_id)))
          THEN coalesce(payments, '[]'::jsonb) || jsonb_build_array(v_corp_pay)
          ELSE payments END,
        writer_id = p_writer_id
  WHERE id = p_booking_id RETURNING * INTO v_booking;

  -- สร้าง invoice: room line + fulfilled add-on lines (จาก live rows)
  v_items := jsonb_build_array(jsonb_build_object(
    'description', 'ค่าห้องพัก ห้อง ' || coalesce(v_room.number, '-') || ' (' || v_booking.nights || ' คืน)',
    'quantity', v_booking.nights,
    'unitPrice', CASE WHEN v_booking.nights > 0 THEN v_booking.total_amount / v_booking.nights ELSE v_booking.total_amount END,
    'total', v_booking.total_amount
  ));
  SELECT v_items || coalesce(jsonb_agg(jsonb_build_object(
      'description', 'Add-on: ' || coalesce(ai.name, '-'),
      'quantity', ba.quantity, 'unitPrice', ba.unit_price, 'total', ba.total_price
    ) ORDER BY ba.requested_at), '[]'::jsonb)
  INTO v_items
  FROM booking_add_ons ba LEFT JOIN add_on_items ai ON ai.id = ba.add_on_item_id
  WHERE ba.booking_id = p_booking_id AND ba.status = 'fulfilled' AND ba.deleted_at IS NULL;

  v_inv_status := CASE WHEN v_new_paid >= v_combined THEN 'paid' ELSE 'issued' END;
  INSERT INTO invoices (
    id, booking_id, guest_id, amount, tax, total, status, issued_at, paid_at, payment_method, items, writer_id
  ) VALUES (
    p_invoice_id, p_booking_id, v_booking.guest_id, v_combined, 0, v_combined, v_inv_status,
    p_now, CASE WHEN v_inv_status = 'paid' THEN p_now ELSE NULL END, v_booking.payment_method, v_items, p_writer_id
  )
  RETURNING * INTO v_invoice;

  -- ห้อง → cleaning (หรือ maintenance ถ้ามีแจ้งซ่อมค้าง)
  v_has_maint := EXISTS (
    SELECT 1 FROM maintenance_logs
    WHERE room_id = v_booking.room_id AND status <> 'resolved' AND deleted_at IS NULL
  );
  v_room_status := CASE WHEN v_has_maint THEN 'maintenance' ELSE 'cleaning' END;
  UPDATE rooms SET status = v_room_status, current_booking_id = NULL, current_guest_id = NULL, writer_id = p_writer_id
  WHERE id = v_booking.room_id RETURNING * INTO v_room;

  -- HK task (ข้ามถ้าห้องไปซ่อม)
  IF NOT v_has_maint THEN
    INSERT INTO housekeeping_tasks (
      id, room_id, room_number, assigned_to, staff_id, status, priority, notes, scheduled_at, writer_id
    ) VALUES (
      p_hk_id, v_booking.room_id, coalesce(v_room.number, '-'), '', '', 'pending', 'normal',
      'ทำความสะอาดหลังเช็คเอาต์ (' || p_booking_id || ')', p_now, p_writer_id
    )
    RETURNING * INTO v_hk;
  END IF;

  -- สถิติแขก (นับเฉพาะที่จ่ายจริง)
  IF v_booking.guest_id IS NOT NULL THEN
    UPDATE guests SET total_stays = total_stays + 1, total_spend = total_spend + v_new_paid, writer_id = p_writer_id
    WHERE id = v_booking.guest_id RETURNING * INTO v_guest;
  END IF;

  RETURN jsonb_build_object(
    'booking', to_jsonb(v_booking), 'room', to_jsonb(v_room), 'invoice', to_jsonb(v_invoice),
    'guest', to_jsonb(v_guest), 'corpAccount', to_jsonb(v_acct), 'corpTx', to_jsonb(v_corp_tx),
    'hkTask', to_jsonb(v_hk)
  );
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- RPC 3: cancel_booking (mirror store.cancelBooking)
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION cancel_booking(
  p_booking_id text, p_now text, p_refund_payment_id text, p_corp_tx_id text, p_hk_id text, p_writer_id text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_booking      bookings;
  v_room         rooms;
  v_acct         corporate_accounts;
  v_corp_tx      corporate_transactions;
  v_hk           housekeeping_tasks;
  v_was_checked  boolean;
  v_refund       numeric;
  v_room_status  text;
  v_refund_pay   jsonb := NULL;
BEGIN
  SELECT * INTO v_booking FROM bookings WHERE id = p_booking_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'NOT_FOUND|ไม่พบการจอง';
  END IF;
  IF v_booking.status = 'cancelled' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'STALE_BOOKING|การจองนี้ถูกยกเลิกไปแล้ว';
  END IF;

  v_was_checked := v_booking.status = 'checked_in';
  v_refund := v_booking.paid_amount;
  SELECT * INTO v_room FROM rooms WHERE id = v_booking.room_id FOR UPDATE;

  IF v_refund > 0 THEN
    v_refund_pay := jsonb_build_object(
      'id', p_refund_payment_id, 'amount', -v_refund,
      'method', coalesce(v_booking.payment_method, 'cash'), 'date', p_now,
      'staffId', 'system', 'notes', 'คืนเงินจากการยกเลิกการจอง'
    );
  END IF;

  -- คืนเครดิตองค์กร (ถ้าเป็น booking องค์กรและมีเงินจ่ายมา)
  IF v_refund > 0 AND v_booking.is_corporate AND v_booking.corporate_account_id IS NOT NULL THEN
    SELECT * INTO v_acct FROM corporate_accounts WHERE id = v_booking.corporate_account_id FOR UPDATE;
    IF FOUND THEN
      INSERT INTO corporate_transactions (
        id, corporate_account_id, type, amount, balance_before, balance_after,
        booking_id, performed_by, date, notes, writer_id
      ) VALUES (
        p_corp_tx_id, v_acct.id, 'refund', v_refund, v_acct.available_balance,
        v_acct.available_balance + v_refund, p_booking_id, 'system', p_now,
        'คืนเครดิตจากการยกเลิกการจอง', p_writer_id
      )
      RETURNING * INTO v_corp_tx;
      UPDATE corporate_accounts
        SET total_used = greatest(0, total_used - v_refund),
            available_balance = available_balance + v_refund, writer_id = p_writer_id
      WHERE id = v_acct.id RETURNING * INTO v_acct;
    END IF;
  END IF;

  UPDATE bookings
    SET status = 'cancelled', paid_amount = 0,
        payments = CASE
          WHEN v_refund_pay IS NOT NULL
            AND NOT (payments @> jsonb_build_array(jsonb_build_object('id', p_refund_payment_id)))
          THEN coalesce(payments, '[]'::jsonb) || jsonb_build_array(v_refund_pay)
          ELSE payments END,
        writer_id = p_writer_id
  WHERE id = p_booking_id RETURNING * INTO v_booking;

  -- ปล่อยห้องเฉพาะเมื่อ booking นี้ครองห้องจริง (เช็คอินอยู่ หรือ pointer ห้องชี้มาที่ booking นี้)
  -- — ยกเลิก booking อนาคตของห้องที่มีแขกอื่นพักอยู่ ห้ามสั่งห้องว่าง/ล้าง pointer ของเขา (mirror store)
  IF v_was_checked OR v_room.current_booking_id = p_booking_id THEN
    v_room_status := CASE WHEN v_was_checked THEN 'cleaning' ELSE 'available' END;
    UPDATE rooms SET status = v_room_status, current_booking_id = NULL, current_guest_id = NULL, writer_id = p_writer_id
    WHERE id = v_booking.room_id RETURNING * INTO v_room;
  END IF;

  -- invoice ของการจองนี้ → refunded
  UPDATE invoices SET status = 'refunded', writer_id = p_writer_id
  WHERE booking_id = p_booking_id AND status <> 'refunded' AND deleted_at IS NULL;

  -- HK task ถ้ายกเลิกหลังเช็คอิน
  IF v_was_checked THEN
    INSERT INTO housekeeping_tasks (
      id, room_id, room_number, assigned_to, staff_id, status, priority, notes, scheduled_at, writer_id
    ) VALUES (
      p_hk_id, v_booking.room_id, coalesce(v_room.number, '-'), '', '', 'pending', 'normal',
      'ทำความสะอาดหลังยกเลิกการจอง (' || p_booking_id || ')', p_now, p_writer_id
    )
    RETURNING * INTO v_hk;
  END IF;

  RETURN jsonb_build_object(
    'booking', to_jsonb(v_booking), 'room', to_jsonb(v_room),
    'corpAccount', to_jsonb(v_acct), 'corpTx', to_jsonb(v_corp_tx), 'hkTask', to_jsonb(v_hk),
    'invoices', (SELECT coalesce(jsonb_agg(to_jsonb(i)), '[]'::jsonb) FROM invoices i WHERE i.booking_id = p_booking_id AND i.deleted_at IS NULL)
  );
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- RPC 4: move_room (mirror store.moveBooking) — client ส่ง p_new_total (คิดราคาที่ client)
--   advisory ทั้ง 2 ห้อง (sorted กัน deadlock 2 moves) → RPC derive overpaid จาก live paid
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION move_room(
  p_booking_id text, p_new_room_id text, p_reprice boolean, p_new_total numeric,
  p_now text, p_refund_payment_id text, p_hk_id text, p_writer_id text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_booking     bookings;
  v_old_room    rooms;
  v_new_room    rooms;
  v_hk          housekeeping_tasks;
  v_was_checked boolean;
  v_old_room_id text;
  v_overpaid    numeric := 0;
  v_new_paid    numeric;
  v_refund_pay  jsonb := NULL;
  v_lo bigint; v_hi bigint;
BEGIN
  SELECT * INTO v_booking FROM bookings WHERE id = p_booking_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'NOT_FOUND|ไม่พบการจอง';
  END IF;
  IF v_booking.status IN ('checked_out', 'cancelled') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'STALE_BOOKING|ไม่สามารถย้ายห้องของการจองที่ปิดแล้ว';
  END IF;
  IF v_booking.room_id = p_new_room_id THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SAME_ROOM|เลือกห้องเดิม';
  END IF;

  v_old_room_id := v_booking.room_id;
  -- advisory 2 ห้อง sorted (กัน deadlock กับ move อีกตัวที่สลับคู่)
  v_lo := least(hashtext('room:' || v_old_room_id)::bigint, hashtext('room:' || p_new_room_id)::bigint);
  v_hi := greatest(hashtext('room:' || v_old_room_id)::bigint, hashtext('room:' || p_new_room_id)::bigint);
  PERFORM pg_advisory_xact_lock(v_lo);
  IF v_hi <> v_lo THEN PERFORM pg_advisory_xact_lock(v_hi); END IF;

  SELECT * INTO v_new_room FROM rooms WHERE id = p_new_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'NOT_FOUND|ไม่พบห้องใหม่';
  END IF;
  IF v_new_room.status = 'maintenance' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ROOM_MAINTENANCE|ห้องใหม่ปิดปรับปรุง';
  END IF;
  IF pms_room_conflict(p_new_room_id, v_booking.check_in, v_booking.check_out, p_booking_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ROOM_CONFLICT|ห้องใหม่มีการจองทับช่วงนี้';
  END IF;

  v_was_checked := v_booking.status = 'checked_in';
  SELECT * INTO v_old_room FROM rooms WHERE id = v_old_room_id FOR UPDATE;

  IF p_reprice THEN
    v_overpaid := greatest(0, v_booking.paid_amount - p_new_total);
    IF v_overpaid > 0 THEN
      v_refund_pay := jsonb_build_object(
        'id', p_refund_payment_id, 'amount', -v_overpaid,
        'method', coalesce(v_booking.payment_method, 'cash'), 'date', p_now,
        'staffId', 'system', 'notes', 'คืนเงินจากการย้ายห้อง (ราคาใหม่ต่ำกว่ายอดที่จ่าย)'
      );
    END IF;
    v_new_paid := least(v_booking.paid_amount, p_new_total);
    UPDATE bookings
      SET room_id = p_new_room_id, total_amount = p_new_total, room_type_at_booking = v_new_room.type,
          paid_amount = v_new_paid,
          payments = CASE
            WHEN v_refund_pay IS NOT NULL
              AND NOT (payments @> jsonb_build_array(jsonb_build_object('id', p_refund_payment_id)))
            THEN coalesce(payments, '[]'::jsonb) || jsonb_build_array(v_refund_pay)
            ELSE payments END,
          writer_id = p_writer_id
    WHERE id = p_booking_id RETURNING * INTO v_booking;
  ELSE
    UPDATE bookings SET room_id = p_new_room_id, writer_id = p_writer_id
    WHERE id = p_booking_id RETURNING * INTO v_booking;
  END IF;

  -- ห้องเปลี่ยน status เฉพาะเมื่อย้ายหลังเช็คอิน
  IF v_was_checked THEN
    UPDATE rooms SET status = 'cleaning', current_booking_id = NULL, current_guest_id = NULL, writer_id = p_writer_id
    WHERE id = v_old_room_id RETURNING * INTO v_old_room;
    UPDATE rooms SET status = 'occupied', current_booking_id = v_booking.id, current_guest_id = v_booking.guest_id, writer_id = p_writer_id
    WHERE id = p_new_room_id RETURNING * INTO v_new_room;
    INSERT INTO housekeeping_tasks (
      id, room_id, room_number, assigned_to, staff_id, status, priority, notes, scheduled_at, writer_id
    ) VALUES (
      p_hk_id, v_old_room_id, coalesce(v_old_room.number, '-'), '', '', 'pending', 'normal',
      'ทำความสะอาดหลังย้ายห้อง (' || p_booking_id || ')', p_now, p_writer_id
    )
    RETURNING * INTO v_hk;
  END IF;

  RETURN jsonb_build_object(
    'booking', to_jsonb(v_booking), 'oldRoom', to_jsonb(v_old_room),
    'newRoom', to_jsonb(v_new_room), 'hkTask', to_jsonb(v_hk)
  );
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- RPC 5: record_payment (mirror store.recordPayment) — outstanding จาก live rows
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION record_payment(
  p_booking_id text, p_amount numeric, p_method text, p_payment_id text,
  p_now text, p_staff_id text, p_notes text, p_writer_id text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_booking     bookings;
  v_addon_total numeric;
  v_outstanding numeric;
  v_payment     jsonb;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVALID_AMOUNT|จำนวนเงินต้องมากกว่า 0';
  END IF;
  SELECT * INTO v_booking FROM bookings WHERE id = p_booking_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'NOT_FOUND|ไม่พบการจอง';
  END IF;

  -- idempotent retry (P6): payment id นี้บันทึกไปแล้ว (retry หลัง timeout ที่รอบแรก commit จริง)
  -- → no-op คืนแถวปัจจุบัน ห้ามไหลลงไป paid_amount += ซ้ำ; ต้องเช็คก่อน validate ยอดค้าง
  -- เพราะรอบ retry ยอดค้างอาจเหลือ 0 แล้ว จะโดน ALREADY_PAID ทั้งที่งานสำเร็จไปแล้ว
  IF coalesce(v_booking.payments, '[]'::jsonb) @> jsonb_build_array(jsonb_build_object('id', p_payment_id)) THEN
    RETURN jsonb_build_object('booking', to_jsonb(v_booking));
  END IF;

  SELECT coalesce(sum(total_price), 0) INTO v_addon_total
  FROM booking_add_ons WHERE booking_id = p_booking_id AND status = 'fulfilled' AND deleted_at IS NULL;
  v_outstanding := v_booking.total_amount + v_addon_total - v_booking.paid_amount;

  IF v_outstanding <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ALREADY_PAID|การจองนี้ชำระครบแล้ว';
  END IF;
  IF p_amount > v_outstanding THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'OVERPAYMENT|เกินยอดค้างชำระ (สูงสุด ' || v_outstanding || ' บาท)';
  END IF;

  v_payment := jsonb_build_object(
    'id', p_payment_id, 'amount', p_amount, 'method', p_method, 'date', p_now,
    'staffId', p_staff_id, 'notes', p_notes
  );
  -- append ตรง ๆ ได้: แถวถูก FOR UPDATE lock อยู่ + เคส id ซ้ำ return no-op ไปแล้วด้านบน
  UPDATE bookings
    SET paid_amount = paid_amount + p_amount, payment_method = p_method,
        payments = coalesce(payments, '[]'::jsonb) || jsonb_build_array(v_payment),
        writer_id = p_writer_id
  WHERE id = p_booking_id RETURNING * INTO v_booking;

  RETURN jsonb_build_object('booking', to_jsonb(v_booking));
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- RPC 6: fulfill_add_on (mirror store.fulfillAddOn) — ตัดสต็อกจาก live stock
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION fulfill_add_on(
  p_add_on_id text, p_staff_id text, p_now text, p_inv_tx_id text, p_writer_id text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_addon   booking_add_ons;
  v_item    add_on_items;
  v_inv     inventory_items;
  v_inv_tx  inventory_transactions;
  v_deduct  int;
BEGIN
  SELECT * INTO v_addon FROM booking_add_ons WHERE id = p_add_on_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'NOT_FOUND|ไม่พบรายการ Add-on';
  END IF;
  IF v_addon.status <> 'requested' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'STALE_ADDON|รายการนี้ดำเนินการไปแล้ว';
  END IF;

  SELECT * INTO v_item FROM add_on_items WHERE id = v_addon.add_on_item_id;
  IF v_item.inventory_item_id IS NOT NULL AND v_item.inventory_qty_per_unit > 0 THEN
    v_deduct := v_item.inventory_qty_per_unit * v_addon.quantity;
    SELECT * INTO v_inv FROM inventory_items WHERE id = v_item.inventory_item_id FOR UPDATE;
    IF NOT FOUND OR v_inv.current_stock < v_deduct THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001',
        MESSAGE = 'INSUFFICIENT_STOCK|สต็อก "' || v_item.name || '" ไม่พอ (มี ' || coalesce(v_inv.current_stock, 0) || ' ต้องการ ' || v_deduct || ')';
    END IF;
    INSERT INTO inventory_transactions (
      id, item_id, type, quantity, reference_id, performed_by, date, notes, writer_id
    ) VALUES (
      p_inv_tx_id, v_item.inventory_item_id, 'use', -v_deduct, p_add_on_id, p_staff_id, p_now,
      'Add-on: ' || v_item.name || ' x' || v_addon.quantity, p_writer_id
    )
    RETURNING * INTO v_inv_tx;
    UPDATE inventory_items SET current_stock = current_stock - v_deduct, writer_id = p_writer_id
    WHERE id = v_item.inventory_item_id RETURNING * INTO v_inv;
  END IF;

  UPDATE booking_add_ons SET status = 'fulfilled', fulfilled_at = p_now, fulfilled_by = p_staff_id, writer_id = p_writer_id
  WHERE id = p_add_on_id RETURNING * INTO v_addon;

  RETURN jsonb_build_object(
    'addOn', to_jsonb(v_addon), 'inventoryItem', to_jsonb(v_inv), 'inventoryTx', to_jsonb(v_inv_tx)
  );
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- RPC 7: cancel_add_on (mirror store.cancelAddOn) — คืนสต็อก + คืนเงินส่วนเกิน จาก live rows
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION cancel_add_on(
  p_add_on_id text, p_now text, p_inv_tx_id text, p_refund_payment_id text, p_corp_tx_id text, p_writer_id text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_addon       booking_add_ons;
  v_item        add_on_items;
  v_inv         inventory_items;
  v_inv_tx      inventory_transactions;
  v_booking     bookings;
  v_acct        corporate_accounts;
  v_corp_tx     corporate_transactions;
  v_was_ful     boolean;
  v_restore     int;
  v_other_total numeric;
  v_new_charge  numeric;
  v_overpaid    numeric := 0;
  v_refund_pay  jsonb := NULL;
BEGIN
  SELECT * INTO v_addon FROM booking_add_ons WHERE id = p_add_on_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'NOT_FOUND|ไม่พบรายการ Add-on';
  END IF;
  IF v_addon.status = 'cancelled' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'STALE_ADDON|รายการนี้ถูกยกเลิกไปแล้ว';
  END IF;

  v_was_ful := v_addon.status = 'fulfilled';
  SELECT * INTO v_item FROM add_on_items WHERE id = v_addon.add_on_item_id;

  -- คืนสต็อกถ้าเคย fulfilled
  IF v_was_ful AND v_item.inventory_item_id IS NOT NULL AND v_item.inventory_qty_per_unit > 0 THEN
    v_restore := v_item.inventory_qty_per_unit * v_addon.quantity;
    SELECT * INTO v_inv FROM inventory_items WHERE id = v_item.inventory_item_id FOR UPDATE;
    IF FOUND THEN
      INSERT INTO inventory_transactions (
        id, item_id, type, quantity, reference_id, performed_by, date, notes, writer_id
      ) VALUES (
        p_inv_tx_id, v_item.inventory_item_id, 'adjust', v_restore, p_add_on_id, 'system', p_now,
        'คืนสต็อกจากการยกเลิก Add-on: ' || v_item.name || ' x' || v_addon.quantity, p_writer_id
      )
      RETURNING * INTO v_inv_tx;
      UPDATE inventory_items SET current_stock = current_stock + v_restore, writer_id = p_writer_id
      WHERE id = v_item.inventory_item_id RETURNING * INTO v_inv;
    END IF;
  END IF;

  -- คืนเงินส่วนเกิน (จาก live booking + add-on อื่น)
  SELECT * INTO v_booking FROM bookings WHERE id = v_addon.booking_id AND deleted_at IS NULL FOR UPDATE;
  IF FOUND THEN
    SELECT coalesce(sum(total_price), 0) INTO v_other_total
    FROM booking_add_ons
    WHERE booking_id = v_booking.id AND id <> p_add_on_id AND status = 'fulfilled' AND deleted_at IS NULL;
    v_new_charge := v_booking.total_amount + v_other_total;
    v_overpaid := greatest(0, v_booking.paid_amount - v_new_charge);
    IF v_overpaid > 0 THEN
      v_refund_pay := jsonb_build_object(
        'id', p_refund_payment_id, 'amount', -v_overpaid,
        'method', coalesce(v_booking.payment_method, 'cash'), 'date', p_now, 'staffId', 'system',
        'notes', 'คืนเงินจากการยกเลิก Add-on: ' || coalesce(v_item.name, v_addon.add_on_item_id)
      );
      UPDATE bookings
        SET paid_amount = paid_amount - v_overpaid,
            payments = CASE
              WHEN NOT (payments @> jsonb_build_array(jsonb_build_object('id', p_refund_payment_id)))
              THEN coalesce(payments, '[]'::jsonb) || jsonb_build_array(v_refund_pay)
              ELSE payments END,
            writer_id = p_writer_id
      WHERE id = v_booking.id RETURNING * INTO v_booking;

      IF v_booking.is_corporate AND v_booking.corporate_account_id IS NOT NULL THEN
        SELECT * INTO v_acct FROM corporate_accounts WHERE id = v_booking.corporate_account_id FOR UPDATE;
        IF FOUND THEN
          INSERT INTO corporate_transactions (
            id, corporate_account_id, type, amount, balance_before, balance_after,
            booking_id, performed_by, date, notes, writer_id
          ) VALUES (
            p_corp_tx_id, v_acct.id, 'refund', v_overpaid, v_acct.available_balance,
            v_acct.available_balance + v_overpaid, v_booking.id, 'system', p_now,
            'คืนเครดิตจากการยกเลิก Add-on', p_writer_id
          )
          RETURNING * INTO v_corp_tx;
          UPDATE corporate_accounts
            SET total_used = greatest(0, total_used - v_overpaid),
                available_balance = available_balance + v_overpaid, writer_id = p_writer_id
          WHERE id = v_acct.id RETURNING * INTO v_acct;
        END IF;
      END IF;
    END IF;
  END IF;

  UPDATE booking_add_ons SET status = 'cancelled', writer_id = p_writer_id
  WHERE id = p_add_on_id RETURNING * INTO v_addon;

  RETURN jsonb_build_object(
    'addOn', to_jsonb(v_addon), 'booking', to_jsonb(v_booking), 'inventoryItem', to_jsonb(v_inv),
    'inventoryTx', to_jsonb(v_inv_tx), 'corpAccount', to_jsonb(v_acct), 'corpTx', to_jsonb(v_corp_tx)
  );
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- RPC 8: extend_booking (mirror store.extendBooking) — client ส่ง old/new_check_out + extra_price
--   CAS ที่ p_old_check_out: extra_price/new_check_out คิดจากฐาน check_out ที่ client เห็น
--   ถ้าฐานเลื่อนไปแล้ว (อีกแท็บ extend/ปรับ) → STALE (กัน check_out ถอยหลัง + ราคาผิดช่วง)
--   retry หลังสำเร็จ (check_out ถึงเป้าแล้ว) → no-op (กัน nights/total บวกซ้ำ — P6)
-- ═══════════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS extend_booking(text, integer, text, numeric, text); -- signature เก่า (ไม่มี CAS) กัน overload ค้าง
CREATE OR REPLACE FUNCTION extend_booking(
  p_booking_id text, p_additional_nights int, p_old_check_out text, p_new_check_out text,
  p_extra_price numeric, p_writer_id text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_booking bookings;
BEGIN
  IF p_additional_nights <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVALID_NIGHTS|จำนวนคืนต้องมากกว่า 0';
  END IF;
  SELECT * INTO v_booking FROM bookings WHERE id = p_booking_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'NOT_FOUND|ไม่พบการจอง';
  END IF;
  IF v_booking.status IN ('checked_out', 'cancelled') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'STALE_BOOKING|ไม่สามารถขยายการจองที่ปิดแล้ว';
  END IF;

  -- idempotent retry (P6): extend รอบนี้ apply ไปแล้ว (check_out ถึงเป้าแล้ว) → no-op คืนแถวปัจจุบัน
  IF pms_day(v_booking.check_out) = pms_day(p_new_check_out) THEN
    RETURN jsonb_build_object('booking', to_jsonb(v_booking));
  END IF;
  -- CAS: ฐาน check_out ไม่ตรงกับที่ client เห็นตอนคิดราคา → ห้าม apply (จะได้ check_out ถอยหลัง/ราคาผิด)
  IF pms_day(v_booking.check_out) <> pms_day(p_old_check_out) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'STALE_BOOKING|วันเช็คเอาต์เปลี่ยนไปแล้ว (มีการแก้ไขจากแท็บอื่น) — โหลดข้อมูลใหม่แล้วลองอีกครั้ง';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('room:' || v_booking.room_id)::bigint);
  -- conflict ช่วงที่ขยาย [oldCheckOut, newCheckOut) ข้ามตัวเอง
  IF pms_room_conflict(v_booking.room_id, v_booking.check_out, p_new_check_out, p_booking_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ROOM_CONFLICT|มีการจองอื่นทับช่วงวันที่ขยาย';
  END IF;

  UPDATE bookings
    SET check_out = p_new_check_out, nights = nights + p_additional_nights,
        total_amount = total_amount + p_extra_price, writer_id = p_writer_id
  WHERE id = p_booking_id RETURNING * INTO v_booking;

  RETURN jsonb_build_object('booking', to_jsonb(v_booking));
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- RPC 9: adjust_for_early_checkout (mirror store.adjustForEarlyCheckout)
--   client ส่ง actual_nights + new_check_out + new_total; RPC derive overpaid จาก live paid
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION adjust_for_early_checkout(
  p_booking_id text, p_actual_nights int, p_new_check_out text, p_new_total numeric,
  p_now text, p_refund_payment_id text, p_writer_id text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_booking    bookings;
  v_overpaid   numeric := 0;
  v_new_paid   numeric;
  v_refund_pay jsonb := NULL;
BEGIN
  SELECT * INTO v_booking FROM bookings WHERE id = p_booking_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'NOT_FOUND|ไม่พบการจอง';
  END IF;
  IF v_booking.status <> 'checked_in' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'STALE_BOOKING|ปรับยอดได้เฉพาะการจองที่เช็คอินอยู่';
  END IF;
  IF p_actual_nights >= v_booking.nights THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'NOT_EARLY|ยังไม่ถึงกำหนด — ไม่ใช่การออกก่อนกำหนด';
  END IF;

  v_overpaid := greatest(0, v_booking.paid_amount - p_new_total);
  v_new_paid := least(v_booking.paid_amount, p_new_total);
  IF v_overpaid > 0 THEN
    v_refund_pay := jsonb_build_object(
      'id', p_refund_payment_id, 'amount', -v_overpaid,
      'method', coalesce(v_booking.payment_method, 'cash'), 'date', p_now, 'staffId', 'system',
      'notes', 'คืนเงินจากการออกก่อนกำหนด'
    );
  END IF;

  UPDATE bookings
    SET nights = p_actual_nights, check_out = p_now, total_amount = p_new_total, paid_amount = v_new_paid,
        payments = CASE
          WHEN v_refund_pay IS NOT NULL
            AND NOT (payments @> jsonb_build_array(jsonb_build_object('id', p_refund_payment_id)))
          THEN coalesce(payments, '[]'::jsonb) || jsonb_build_array(v_refund_pay)
          ELSE payments END,
        writer_id = p_writer_id
  WHERE id = p_booking_id RETURNING * INTO v_booking;

  RETURN jsonb_build_object('booking', to_jsonb(v_booking), 'refunded', v_overpaid);
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- Security: REVOKE จาก public, GRANT ให้ anon/authenticated (SECURITY DEFINER bypass RLS —
-- ไม่ใช่ regression: anon มี insert/update grant ตรงทุกตารางจาก 012/018/019 อยู่แล้ว;
-- invariant ทั้งหมด enforce ใน RPC; client hasPerm() = defense-in-depth)
-- ═══════════════════════════════════════════════════════════════════════
DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'create_booking_with_conflict_check(jsonb, text)',
    'check_out_booking(text, text, text, text, text, text, text)',
    'cancel_booking(text, text, text, text, text, text)',
    'move_room(text, text, boolean, numeric, text, text, text, text)',
    'record_payment(text, numeric, text, text, text, text, text, text)',
    'fulfill_add_on(text, text, text, text, text)',
    'cancel_add_on(text, text, text, text, text, text)',
    'extend_booking(text, integer, text, text, numeric, text)',
    'adjust_for_early_checkout(text, integer, text, numeric, text, text, text)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM public', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated', fn);
  END LOOP;
END $$;
