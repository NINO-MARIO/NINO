# Local AI — ความรู้และการตัดสินใจ (2026-10-31)
## ตัดสินใจ
- เว็บแอป/WebView โหลด LLM เองไม่ไหว (เพดาน RAM ของแท็บ, ไม่มี mmap, Service Worker/Worker ขึ้นกับสกีมของ APK) → ลบระบบดาวน์โหลดและหน้าตรวจอาการออกแล้ว
- เหลือโหมดเซิร์ฟเวอร์: ต่อ OpenAI-compatible ในมือถือ (Termux llama-server, MNN mnn_engine :8081, Jan/Atomic Chat :1337) หรือคอมในบ้าน (Ollama :11434)
## โฟกัส
- C = คุย (ไม่มีเครื่องมือ ใช้กับ AI ตัวไหนก็ได้) · L = คุยผ่าน Local AI + เรนเดอร์ข้อความล้วนเป็นรูปแบบที่แอปรู้จัก (ตัด <think> ออก)
## ข้อมูลอ้างอิง (ยืนยันแล้ว)
- MNN-LLM ใช้ mmap บนมือถือ https://github.com/alibaba/MNN/blob/master/transformers/README.md · เผื่อ RAM ~1.5x ขนาดโมเดล https://github.com/AdribMahmud101/mnn-android-sdk
- รูปแบบ server+key เป็นมาตรฐาน https://pub.dev/packages/mnn_engine · https://jan.ai/docs/local-api
## ยังไม่ยืนยัน
- WebView ของ APK บล็อก http://127.0.0.1 หรือไม่ → ปุ่มทดสอบในหน้า Local AI บอกข้อผิดพลาดจริง

## ระบบรองรับเซิร์ฟเวอร์ (2.5.0) — ข้อมูลที่ยืนยันแล้ว
- llama-server มี --host (ค่าเริ่มต้น 127.0.0.1) --port (8080) --api-key --ctx-size และ GET /v1/models https://github.com/karminski/llama-cpp/blob/master/examples/server/README.md · https://dev.to/multigrid/running-llamacpps-server-in-openai-compatible-mode-2nd0
- Ollama ปล่อยเฉพาะ localhost/127.0.0.1/0.0.0.0 เป็นค่าเริ่มต้น เว็บอื่น/เครื่องอื่นต้องตั้ง OLLAMA_ORIGINS (ไม่ตั้ง = 403) และ OLLAMA_HOST=0.0.0.0 เพื่อรับจากเครือข่าย https://docs.ollama.com/faq.md · https://objectgraph.com/blog/ollama-cors/
- OLLAMA_ORIGINS="*" ให้ทุกเว็บที่เปิดอยู่เรียกเซิร์ฟเวอร์เราได้ → ตัวช่วยในแอปออกคำสั่งด้วย origin จริงของแอปแทน
## ยังไม่ยืนยัน
- llama-server อนุญาต CORS ให้แอปบน https หรือไม่ (ปุ่มทดสอบจะแสดงผลจริง) · mixed content ของ WebView ใน APK
