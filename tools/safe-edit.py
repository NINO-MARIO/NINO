#!/usr/bin/env python3
"""แก้ไฟล์แบบปลอดภัย: แก้ได้ก็ต่อเมื่อไฟล์ยังเป็นเวอร์ชันที่อ่านไว้ และข้อความเดิมมีแค่หนึ่งที่

  python3 tools/safe-edit.py sha FILE                       พิมพ์ hash 16 ตัวของไฟล์ตอนนี้ (จดไว้ก่อนแก้)
  python3 tools/safe-edit.py replace FILE OLD.txt NEW.txt --expect-sha HASH16
                                                            แทนที่ OLD ด้วย NEW (ต้องเจอ OLD ครั้งเดียวพอดี)

ไม่มี exit 0 เมื่อสำเร็จ, 1 เมื่อปฏิเสธ (hash ไม่ตรง หรือจำนวนที่เจอไม่ใช่ 1) ไม่แก้ไฟล์ถ้าปฏิเสธ
ข้อความ OLD/NEW อ่านจากไฟล์ เพื่อไม่ต้องกังวลเรื่องการ escape ภาษาไทยหรือเครื่องหมายคำพูด"""
import hashlib, sys, argparse

def sha(path):
    with open(path, 'rb') as f:
        return hashlib.sha256(f.read()).hexdigest()[:16]

def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest='cmd', required=True)
    s = sub.add_parser('sha'); s.add_argument('file')
    r = sub.add_parser('replace')
    r.add_argument('file'); r.add_argument('old'); r.add_argument('new')
    r.add_argument('--expect-sha', required=True)
    a = ap.parse_args()
    if a.cmd == 'sha':
        print(sha(a.file)); return 0
    cur = sha(a.file)
    if cur != a.expect_sha:
        print('ปฏิเสธ: ไฟล์เปลี่ยนไปแล้ว (ตอนนี้ %s ที่คาดไว้ %s) อ่านไฟล์ใหม่ก่อนแก้' % (cur, a.expect_sha)); return 1
    text = open(a.file, encoding='utf-8').read()
    old = open(a.old, encoding='utf-8').read()
    new = open(a.new, encoding='utf-8').read()
    if old == '':
        print('ปฏิเสธ: ข้อความเดิมว่าง'); return 1
    n = text.count(old)
    if n != 1:
        print('ปฏิเสธ: ข้อความเดิมเจอ %d ครั้ง (ต้องเจอ 1 ครั้งพอดี)' % n); return 1
    open(a.file, 'w', encoding='utf-8').write(text.replace(old, new, 1))
    print('แก้แล้ว: %s (hash ใหม่ %s)' % (a.file, sha(a.file)))
    return 0

if __name__ == '__main__':
    sys.exit(main())
