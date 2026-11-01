# FIFO Placement Queue System (BullMQ + Redis & In-Memory Lock)

ระบบจัดคิวอัจฉริยะแบบ FIFO (First In, First Out) ด้วย BullMQ + Redis พร้อม Fallback In-Memory Queue เพื่อป้องกันปัญหา Race Condition ในการแย่งตำแหน่งโครงสร้างไบนารี โดยรับประกันการคำนวณ Parent ID และตำแหน่งซ้าย/ขวา อย่างแม่นยำ 100% พร้อมระบบจองตำแหน่งชั่วคราว (Position Lease Lock) และแสดงสถานะบน UI

---

## User Review & Critical Decisions

> [!IMPORTANT]
> สรุปข้อตกลงและแนวทางสถาปัตยกรรมที่ยืนยันจากการตอบคำถาม:
> - **การเชื่อมต่อคิว**: ใช้งานแบบ Dual-Engine คือมี Built-in In-Memory Queue ทำงานได้ทันทีโดยไม่ต้องพึ่งพาเซิร์ฟเวอร์ภายนอก และหากมีการตั้งค่า `REDIS_URL` ในสภาพแวดล้อม ระบบจะสลับไปใช้ **BullMQ + Redis** แบบอัตโนมัติ
> - **โฟลว์การทำรายการ**: ใช้ระบบ **Queue Reservation & Lock Ticket** โดย Worker ในคิวจะประมวลผลคำนวณตำแหน่งที่ว่างถัดไปอย่างแม่นยำทีละคน (Concurrency = 1) และทำการออกตั๋วพร้อมล็อคตำแหน่งไว้ชั่วคราว (เช่น 90-120 วินาที) จากนั้นให้ผู้ใช้กดยืนยันธุรกรรมผ่านกระเป๋า MetaMask เพื่อความโปร่งใสและปลอดภัยสูงสุด

- **Decision 1: Dual-Engine Queue (BullMQ + In-Memory FIFO Mutex)**: มอบความเสถียรสูงสุด ไม่ล่มแม้ไม่มี Redis ติดตั้งในคอนเทนเนอร์ และรองรับการสเกลกับ Redis ภายนอกได้อย่างไร้รอยต่อ
- **Decision 2: Atomic Position Lease Lock with TTL**: ตำแหน่งที่ถูกคำนวณให้ผู้ใช้คนแรกจะถูกล็อคทันที ผู้ใช้คนที่สองที่เข้าคิวมาทีหลังจะถูกคำนวณไปยังตำแหน่งถัดไปทันที แม้ธุรกรรมของคนแรกยังอยู่ระหว่างรอคอนเฟิร์มบนบล็อกเชน

---

## 1. Overview & Core Concept

- **What It Does**: เมื่อมีผู้ใช้งานลงทะเบียนพร้อมกันหลายคน ระบบจัดคิว FIFO Worker จะประมวลผลคำขอทีละรายการ คำนวณตำแหน่ง Parent ID และฝั่งซ้าย/ขวา โดยนำตำแหน่งที่ถูกจองไว้แล้ว (Reserved Slots) มารวมในการคำนวณ ทำให้ไม่มีทางที่ผู้ใช้สองคนจะได้ตำแหน่งเดียวกัน
- **Target Audience**: ผู้ใช้งาน DApp สมาชิกเครือข่าย และผู้นำทีมที่สมัครสมาชิกหรือส่งชุดโหนดแบบกลุ่ม (Batch) พร้อมๆ กัน
- **Key Value**: กำจัดปัญหาธุรกรรมชนกัน (Transaction Collision / Revert) 100% ประหยัดค่า Gas และสร้างความมั่นใจให้ผู้ใช้งานผ่าน UI แสดงสถานะคิวและการล็อคตำแหน่งแบบเรียลไทม์

---

## 2. User Experience & Visual Design

### Key User Flows
1. **ขอรับตั๋วคิว (Queue Ticket Request)**: เมื่อผู้ใช้กดปุ่ม "สมัครสมาชิก" หรือ "จองตำแหน่งลงผัง" ระบบจะส่งคำขอเข้าคิว FIFO ทันที
2. **ประมวลผลในคิว (Worker Processing)**: หน้าต่างสถานะจะแสดงขั้นตอนแบบ Real-time:
   - `กำลังเข้าคิว (Queue Position: #1)`
   - `Worker กำลังคำนวณตำแหน่งและตรวจสอบผัง...`
   - `จองตำแหน่งสำเร็จ: Parent #X (ฝั่งซ้าย/ขวา) - ล็อคตำแหน่งไว้ 90 วินาที`
3. **ยืนยันผ่านกระเป๋า (MetaMask Confirmation)**: ผู้ใช้กด Submit บน MetaMask ด้วยตำแหน่งที่ระบบล็อคไว้ให้แน่นอน
4. **ปลดล็อค/บันทึกผล (Commit / Release)**: เมื่อธุรกรรมขึ้นบล็อกเชนสำเร็จ ระบบจะอัปเดตผังเป็นโหนดถัดไปทันที และหากผู้ใช้ยกเลิกหรือหมดเวลา ตั๋วจะถูกคืนสู่ระบบอัตโนมัติ
5. **การแสดงผลบนต้นไม้ (Tree Visualizer HUD)**: โหนดที่กำลังถูกจองในคิวจะมีสัญลักษณ์ `🔒 กำลังจอง (In Queue)` ปรากฏบนต้นไม้แบบ Visualizer ให้ทุกคนเห็นแบบโปร่งใส

### Visual Identity & Theme
- **Color Tokens**: พื้นหลัง Dark Slate `#0A0F1D` ผสาน Accent สีเขียว Emerald `#10B981`, สีม่วง Indigo `#6366F1`, และสีส้ม Amber `#F59E0B` สำหรับสถานะการล็อคเวลา
- **Typography & Tabular Numerals**: ตัวเลขในคิว, เวลาถอยหลัง (TTL Countdown), และรหัส Parent ID ใช้ฟอนต์แบบ `font-mono tabular-nums` เพื่อความนิ่งและอ่านง่าย
- **Queue Monitor Panel**: การ์ดแสดงสถานะคิวที่กะทัดรัด (Compact Queue HUD) แสดงคิวปัจจุบัน จำนวนผู้รอ และประวัติการประมวลผลล่าสุด

---

## 3. Key Product Decisions & Trade-Offs

- **Decision: In-Memory Mutex + Optional Redis vs. Redis-Only**:
  - *Chosen Approach*: ออกแบบ Adapter Pattern รองรับทั้ง Redis (ผ่าน BullMQ + IORedis) เมื่อมี `REDIS_URL` และ Built-in FIFO Mutex Queue เมื่อรันเดี่ยว
  - *Why*: ป้องกันไม่ให้แอปพลิเคชันพังในกรณีที่ Dev Environment หรือ Sandbox ไม่มี Redis service รันอยู่ แต่ยังคงรักษาคุณสมบัติ FIFO Concurrency = 1 และ Atomic Lock ไว้อย่างครบถ้วน 100%
- **Decision: Client Wallet Signing with Lease Lock vs. Backend Relayer**:
  - *Chosen Approach*: ผู้ใช้ยังคงเป็นเจ้าของ Private Key และเซ็นธุรกรรมด้วยตนเองผ่าน MetaMask พร้อมตั๋วล็อคตำแหน่ง
  - *Why*: ปลอดภัย ไม่ต้องเก็บ Private Key ไว้บนเซิร์ฟเวอร์ และสอดคล้องกับมาตรฐาน Web3 Decentralization

---

## 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────────────────────┐
│                         Client Browser (React + Ethers)                │
│                                                                        │
│   [RegisterSection / Batch] ───────► [Queue Ticket Modal / HUD]       │
│              │                                     ▲                   │
│              ▼                                     │                   │
│      1. POST /reserve-placement                    │ 3. Return Ticket  │
│              │                                     │    & Parent ID    │
└──────────────┼─────────────────────────────────────┼───────────────────┘
               │                                     │
               ▼                                     │
┌────────────────────────────────────────────────────────────────────────┐
│                   Express Backend Server (server.ts)                   │
│                                                                        │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │ FIFO Queue Engine (BullMQ if REDIS_URL else In-Memory Mutex)   │   │
│   │                                                                │   │
│   │   [Job Queue] ────► [FIFO Worker (Concurrency = 1)]            │   │
│   │                           │                                    │   │
│   │                           ▼                                    │   │
│   │                 [Placement Algorithm]                          │   │
│   │                 - Read On-Chain Nodes                          │   │
│   │                 - Read Active Lease Locks                      │   │
│   │                 - Calculate exact Parent ID + Side             │   │
│   │                           │                                    │   │
│   │                           ▼                                    │   │
│   │                 [Create Position Lock]                         │   │
│   │                 (Ticket ID, NodeId, Parent, Side, TTL 90s)     │   │
│   └────────────────────────────────────────────────────────────────┘   │
│                                                                        │
│   Active Locks Store & Auto-Expiration Sweeper                         │
└────────────────────────────────────────────────────────────────────────┘
               │                                     │
               ▼                                     ▼
┌────────────────────────────────────────────────────────────────────────┐
│                 BNB Smart Chain Testnet (Smart Contract)               │
│                  Contract: 0x339253513C2E85d2d8F638ED71BC2C5D31e49D85  │
│                                                                        │
│   User broadcasts: register / registerBatch(targetParentIds, isLefts) │
└────────────────────────────────────────────────────────────────────────┘
```

### Components to Update & Integrate:
1. **Backend Queue Engine (`server.ts` & Queue Module)**:
   - จัดทำคลาส Queue Adapter รองรับ FIFO Queue + BullMQ (ถ้ามี REDIS) + In-Memory Atomic Lock
   - เพิ่ม API:
     - `POST /api/queue/reserve`: รับคำขอเข้าคิว คำนวณตำแหน่ง และล็อคตำแหน่งคืนตั๋ว (Ticket)
     - `POST /api/queue/confirm`: ยืนยันการลงผังเมื่อได้ TxHash
     - `POST /api/queue/release`: ยกเลิกหรือปล่อยการจอง
     - `GET /api/queue/status`: ตรวจสอบสถานะคิวและรายการที่กำลังล็อคอยู่
2. **Frontend Queue Integration (`useWeb3.ts` / Hook)**:
   - เพิ่มฟังก์ชัน `requestPlacementTicket` และ `releasePlacementTicket`
   - เมื่อกดสมัคร จะเชื่อมต่อไปยังคิว ขอตั๋วตำแหน่งที่ล็อคไว้ จากนั้นส่งเข้า MetaMask อัตโนมัติ
3. **UI Queue HUD & Visual Indicator (`RegisterSection.tsx` & `MatrixTreeVisualizer.tsx`)**:
   - เพิ่มกล่องแสดงสถานะ Queue FIFO & Active Lease Locks แบบเรียลไทม์
   - แสดงเวลาถอยหลังการล็อคตำแหน่ง (Lock Countdown Timer) พร้อมสถานะคิว
   - ผสานการแสดงผลตำแหน่งที่กำลังถูกจองบนผังต้นไม้
