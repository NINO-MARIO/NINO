<!-- ต้นฉบับจากผู้ใช้ (บันทึกโปรโตคอลแก้ context pointer) เก็บไว้ตามตัวอักษร ภาษาไทยส่วนบนเป็นเหตุผล ภาษาอังกฤษส่วนล่างเป็นโปรโตคอล -->
พบปัญหาสาเหตุหลัก: pointer เขียน weak → เป็น "variance bug"

Context pointer คือ reference ใน context ของ agent ที่ชี้ไปยัง material ภายนอก (เช่น ไฟล์ reference, skill อื่น) และ encode เงื่อนไขว่าควรไปดึง material นั้นเมื่อไหร่ ปัญหาคือ agent อาจเลือกไม่ทำตาม pointer ก็ได้ แม้ pointer จะ "perfect" สำหรับ task นั้น เพราะการตัดสินใจไปตาม pointer ขึ้นอยู่กับ wording ของ pointer ไม่ใช่ target ถ้า pointer เขียน weak แต่ material ข้างหลังเป็น must-have → เกิด variance bug: agent ทำ task ไม่เหมือนเดิมในแต่ละ run

วิธีแก้ระดับสถาปัตยกรรม (ลด unpredictability โดยตรง)
1. ใช้ User-invoked skill แทน Model-invoked skill ("remove a class of problem from being a problem")
2. ทำ main SKILL.md ให้เล็กที่สุด ("smaller skills are just easier to maintain, easier to audit, fewer words to think about")
3. ใช้ Progressive Disclosure อย่างถูกจุด (ผลัก reference ที่ไม่จำเป็นต่อทุก branch ไปหลัง pointer แต่ระวังซ่อนของที่ต้องใช้จริง)
4. อย่าแก้ที่ target — แก้ที่ pointer: sharpen wording → front-load trigger → แยก branch ให้ชัด → ถ้ายังไม่พอค่อย inline → ถ้าต้องตัด unpredictability ขาด เปลี่ยนเป็น user-invoked skill

Expert LLM Architect & Context Optimizer
Objective: Eliminate Unpredictability in Skill.md by optimizing Context Pointers.
Core Logic: "Stop fixing the Target; Fix the Pointer."
1. Pointer Audit (Weak Pointer Detection): check if the trigger/anchor is vague or overlaps with other skills. If pointer == weak, do NOT modify the skill's output; sharpen the wording with a high-contrast, unique identifier.
2. Front-Loading Triggers: move the most critical identifying keywords to the absolute front of the pointer (LLMs prioritize early tokens).
3. Branch Isolation: if two skills share similar pointers, create a strict branch with a clear Decision Gate (If A -> Skill 1, If B -> Skill 2).
4. Last Resort: Inline Integration — move the pointer logic inline with the execution block to minimize distance between "Call" and "Action".
5. The "Surgical Cut": if unpredictability persists, convert to a User-Invoked Skill; compact SKILL.md to the minimum.
Output Requirement: Analyze the current Skill.md -> identify the weak pointer -> propose the sharpened pointer -> execute the branch isolation.

การตรวจสุขภาพห้องสมุดผ่าน terminal: ถ้าสกิลเกิน 500 บรรทัด = สีแดง (ผู้ใช้เห็นเป็นตัวอักษรสีแดงใน terminal ส่วน NINO เห็นเป็นคำว่า "สีแดง") และตรวจอื่นๆ ที่ครอบคลุมปัญหาสถาปัตยกรรม
