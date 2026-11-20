# verify-loop
ก่อนบอกว่าเสร็จ: ตรวจเป็นลำดับ ไวยากรณ์ → ชื่อซ้ำ → ด่าน → เทสต์ → diff
## ลำดับ
1. ไวยากรณ์: sh run skills/system/repo-self/self-upgrade/scripts/check_syntax.js
2. ชื่อซ้ำข้ามไฟล์: sh run skills/code/debug/debug-loop/scripts/find_dup_globals.js
3. ด่านสถิต: node tools/check.js (เพิ่ม --strict ก่อนปล่อย)
4. เทสต์: bash tools/verify-all.sh
5. ไล่ diff: ไฟล์ที่แตะ ตรงกับที่ตั้งใจไหม มีไฟล์ป้องกันหลุดมาไหม
6. หลังเพิ่ม/ลบไฟล์: node tools/make-now.js && python3 tools/make-manifests.py
## กฎ
- ห้ามบอกว่าเขียว ถ้าไม่ได้รันจริงในรอบนี้ · ด่านไหนรันไม่ได้ในที่ทำงานนี้ ให้ระบุว่าข้าม พร้อมเหตุผล
