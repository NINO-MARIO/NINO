#!/usr/bin/env bash
set -u
cd "$(dirname "$0")/.."
fail=0
step() { echo; echo "== $1"; shift; "$@" || { echo "FAILED: $*"; fail=1; }; }
step "static gate (strict)" node tools/check.js --strict
step "web tests" node tools/test/web.test.js
if [ -d node_modules/playwright ] || [ -n "${PLAYWRIGHT_BROWSERS_PATH:-}" ] || command -v npx >/dev/null 2>&1; then
  step "browser tests" node tools/test/browser.test.js
  step "outlaw offline (service worker precache, network cut)" node tools/test/outlaw-offline.test.js
  step "Outlaw: เพลงฉากไม่หายเมื่อเฟรมค้าง (browser)" node tools/test/outlaw-audio-stall.test.js
  step "หน้าแชท: แถบชื่อ ช่องพิมพ์ โหมดหน้าจอ บับเบิล Build/Commit (browser)" node tools/test/chat-layout.test.js
  step "เมนูโหนด >_ (วงโคจร Sci-fi): เปิด/ปิด ย้ายปุ่มกลับที่เดิม ไม่แตะที่เก็บข้อมูล (browser)" node tools/test/drawer-orbit.test.js
  step "ศูนย์กลาง LLM (llm-hub): เส้นทาง API/โมเดล คิว แคช อุ่นเครื่อง log ตรวจระบบ หน้าจอ (browser)" node tools/test/llm-hub.test.js
  step "โมเดลในแอป Android (llm-native): ninoNative bridge 5, ดาวน์โหลด, โหลด, ตอบ, ลบ, ข้อความผิดพลาดไทย (browser)" node tools/test/llm-native.test.js
  step "CG library and chat card (browser)" node tools/test/cg-card.test.js
  step "chat card across streaming (browser)" node tools/test/stream-transition.test.js
  step "roleplay bubbles keep their data (browser)" node tools/test/roleplay-dom.test.js
  step "AI picks CG end to end (browser)" node tools/test/cg-chat.test.js
  step "เพลง: ลิงก์และปุ่มดูวิดีโอ (browser)" node tools/test/music.test.js
  step "เพลง: กรอบวิดีโอไม่โดนขอบจอ ปุ่มขยาย เพลย์ลิสต์ในเบราว์เซอร์จริง (browser)" node tools/test/music-frame.test.js
  step "168ro in-device copy: IndexedDB, clear-cache survival, offline, backup (browser)" node tools/test/site168-copy.test.js
  step "NDS room: cartridge, shelf, BIOS gate, game page with test stub (browser)" node tools/test/nds-flow.test.js
  step "NDS room: one-pick and drag-drop import, zip, SHA-256 reference (browser)" node tools/test/nds-import.test.js
  step "NDS detective: self test (seeded defects must be caught)" python3 tools/nds-core/detective.py --selftest
  step "gofront: parser and name resolution self test" python3 tools/nds-core/gofront/check.py --selftest
  step "gofront: no syntax or name errors in the engine (both platforms)" python3 tools/nds-core/gofront/check.py
  step "NDS detective: no ERROR in the project" python3 tools/nds-core/detective.py
  step "NDS probe report: self test (gate cases)" python3 tools/nds-core/probe-report.py --selftest
  step "NDS room: Firmware is optional, ARM7 and ARM9 pass the gate (browser)" node tools/test/nds-optional-firmware.test.js
  step "NDS room: FreeBIOS button, SHA-256 check, persistence, label reset (browser)" node tools/test/nds-freebios.test.js
  step "NDS room: core contract check, test notice, broken core rejected (browser)" node tools/test/nds-core-contract.test.js
  step "NDS library: export, import in a fresh profile, refuse foreign files (browser)" node tools/test/nds-library.test.js
  step "NDS playtest: a player plays the room step by step, screenshots saved (browser)" node tools/test/nds-playtest.test.js
  step "NDS player: keys, touch pad, pause, audio, screenshot, settings, support list (browser)" node tools/test/nds-player.test.js
  step "มิ้ม popup: open, teach, enable, answer, persist, phone width (browser)" node mim/tests/mim-popup.test.js
step "เลเวลอัปหลังรีบูต: จอรีบูต ป็อปอัพ LEVEL UP นับเลเวลเมื่ออัปเกรดเท่านั้น ลดการเคลื่อนไหว (browser)" node tools/test/level-up.test.js
step "โมเดลในเครื่อง Gemma/Qwen (ทางสำรองแชตโค้ดและโรลเพลย์): แท็บ LLM ของคอนโซล ยินยอมก่อน ดาวน์โหลด ตอบแทน API ไม่ให้มิ้ม/นาเดียร์ ลดการค้าง โหลดค้างยกเลิก เด้งกลางคันไม่โหลดเอง" node tools/test/local-llm.test.js
step "ชั้นโค้ดของโมเดลในเครื่อง: ตรวจคำตอบก่อนส่ง (ไวยากรณ์ js, json, รั้วโค้ดปิดครบ, ไม่บอกชื่อโมเดลอื่น)" node tools/test/local-code-guard.test.js
step "โหมด 1 รวมกับมิ้ม: ตอบเฉพาะคำที่มิ้มไม่รู้ ดึงความรู้ตรงคำถาม ตรวจคำตอบ ห้ามบอกชื่อโมเดลอื่น (ไม่มีเครือข่าย)" node tools/test/mim-llm.test.js
step "โหมด 1 ในหน้ามิ้มจริง (browser): ไม่รู้แล้วกลับไปตอบเดิมพร้อมเหตุผล โหมด 2 ไม่ใช้โมเดลในมิ้ม ปุ่มสลับโหมด" node tools/test/mim-llm-popup.test.js
step "วิจัย: โมเดลตัวอักษรที่เขียนเอง gradient check ควอนไทซ์ การเรียนรู้ (numpy)" python3 -I -B research/llm/test_charlm.py
else
  echo "skip browser tests (no playwright)"
fi
step "auto-continue tests" node tools/test/continue.test.js
step "card + self-stop tests" node tools/test/card.test.js
step "music logic tests" node tools/test/music-logic.test.js
step "เพลง: ลิงก์เพลย์ลิสต์ การเล่นเพลย์ลิสต์ ตำแหน่งกรอบวิดีโอ ปุ่มขยาย (ไม่ใช้เบราว์เซอร์)" node tools/test/music-playlist.test.js
step "mood label tests" node tools/test/mood.test.js
step "CG picker pure tests" node tools/test/cg-pick.test.js
step "research + Google tests" node tools/test/research.test.js
step "มิ้ม engine tests (53 cases from the Local AI project)" node mim/tests/engine-tests.js
step "มิ้ม เล่นจริง: คำถามทั่วไปต้องตอบถูกจุด (ตัวเลข ตัวตน อารมณ์ ทักทายก่อนนอน) และไม่ตอบมั่ว" node mim/tests/play-test.js
step "มิ้ม คำถามที่ตอบไม่ได้: จดไว้ เก็บข้ามการโหลด ออกเมื่อสอนแล้ว จำกัดจำนวน" node mim/tests/gaps-test.js
step "มิ้ม พี่นาเดียร์ tests (no network)" node mim/tests/nadia-test.js
step "มิ้ม การเรียนรู้ ผู้เรียบเรียง และกฎการไม่เดา" node mim/tests/learn-test.js
step "มิ้ม ประเมินการค้นคำตอบ: เกณฑ์กันตอบผิดเพิ่ม (ไม่ใช่การวัดความฉลาด)" node mim/tests/eval-retrieval.js --gate
step "มิ้ม พฤติกรรมการคุย: คำตอบหลากหลาย เวลาจริง อารมณ์ ไม่ตอบผิดจากคำทั่วไป" node mim/tests/chat-behavior-test.js
step "มิ้ม ความจำหัวข้อในบทสนทนา: คำชี้กลับตอบถูก ไม่ตอบผิดเมื่อไม่เกี่ยว (ชุดสุ่มและชุดซ้อน)" node mim/tests/followup-eval.js
step "มิ้ม การสำรวจคำตอบและเรียนรู้จากผลตอบรับ: สำรวจน้อยเมื่อยังไม่มีผลตอบรับ และเลือกคำตอบที่ดีขึ้นตามผลตอบรับ" node mim/tests/adapt-test.js
step "มิ้ม ปุ่มเลื่อนกลับไปต้นข้อความ: ทุกคำตอบมีปุ่มมุมขวาล่าง และกดแล้วเลื่อนถูกที่" node mim/tests/to-top-test.js
step "มิ้ม ปุ่มตอบถูก/ไม่ถูก: บันทึกเข้ารายการที่ตอบ ไม่นับซ้ำ คงอยู่หลังโหลด" node mim/tests/feedback-test.js
step "มิ้ม ปุ่มตอบถูก/ไม่ถูกในหน้าจริง: แสดงเฉพาะคำตอบจากความรู้ กดแล้วล็อกและบันทึก" node mim/tests/feedback-ui-test.js
step "มิ้ม เครื่องมือความจำ: การเรียนรู้ ช่องว่าง บันทึกคำถามเปิดเอง ทดสอบซ้ำ ร่างเข้าถาดยืนยันเท่านั้น" node mim/tests/memory-tools-test.js
step "ตัดพื้นหลังรูป GrabCut (JS): ภาพสังเคราะห์ IoU ตามเกณฑ์ ผลเดิมกับอินพุตเดิม ความเร็วพอ" node tools/test/cutout-core.test.js
step "ปุ่มกรรไกรในถาดรูป: แนบรูป ลากกรอบ ตัดเลย ใช้รูปนี้ ได้ผลพื้นหลังโปร่งใส (browser)" node tools/test/cutout-ui-test.js
step "ความจำแชต: ย่อจริง ส่งสรุปเข้า system prompt จริง คงอยู่หลังบันทึกและรีโหลด (browser)" node tools/test/chat-memory-ui-test.js
step "โมเดลที่เปิดพร้อมกัน: ฟอร์ม เปิด/ปิด ทดสอบ ลบ แชตจริงผ่านทะเบียน ทางเดิมเมื่อปิดทั้งหมด (browser)" node tools/test/llm-roster-ui-test.js
step "มิ้ม เรียนเองจากข้อความที่อ่าน: ตรวจกลับ ไม่เขียนทับ คงอยู่หลังโหลด" node mim/tests/selfstudy-test.js
step "มิ้ม แหล่งข้อมูลที่ติดตั้งได้: อ้างที่มา ถอนแล้วลบความรู้ของแหล่ง ติดตั้งซ้ำไม่เพิ่มเอง" node mim/tests/sources-test.js
step "มิ้ม ค้นเว็บหาคำตอบ: ผู้สมัครพักไว้ ไม่เข้าความรู้จนกว่าจะยืนยัน ไม่เขียนทับความรู้เดิม" node mim/tests/webcand-test.js
step "มิ้ม ค้นเว็บหาคำตอบในหน้าจริง (browser): ปุ่มตามสวิตช์ค้นเว็บ ถาดรอยืนยัน ยืนยันแล้วจึงตอบได้" node tools/test/mim-web-lookup.test.js
step "ห้องเรียนเปิดจากข้อความที่พิมพ์ (โค้ด โรลเพลย์ มิ้ม) ในหน้าจริง (browser)" node tools/test/classroom-open.test.js
step "ห้องเรียนจดสกิลแล้ว มิ้มอ่านอัตโนมัติ (browser)" node tools/test/classroom-review.test.js
step "สูตรประสิทธิภาพ (ไม่ใช้เบราว์เซอร์)" node tools/test/perf-formula.test.js
step "มิ้ม ทักษะกฎตายตัว: เลขคณิต วันที่สัมพันธ์ คำตรงข้าม อารมณ์ คำชม/ด่า นาเดียร์ นิทาน และความปลอดภัยที่ตอบแม้ปิดระบบ" node mim/tests/skills-test.js
step "มิ้ม สร้างคำใหม่จากราก: เสนอเอง ไม่เสนอคำที่รู้แล้ว สอนแล้วคงอยู่" node mim/tests/coin-test.js
step "มิ้ม ความกว้างของการคุย: ทักทาย เวลา ตัวมิ้ม ความรู้ การไม่เดา สอนแล้วตอบ (ไม่ใช่คะแนนความฉลาด)" node mim/tests/breadth-test.js
step "NOW.md matches code" node tools/make-now.js --check
step "packs manifest matches files" python3 tools/make-packs.py --check
if [ -f android/core-tests/run.sh ] && command -v java >/dev/null 2>&1; then step "android core (JVM)" bash android/core-tests/run.sh; fi
echo
if [ "$fail" = 0 ]; then echo "ALL GREEN"; else echo "SOMETHING FAILED"; exit 1; fi
