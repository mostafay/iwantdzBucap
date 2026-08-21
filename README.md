# iwantdz Backend Server

سيرفر Node.js مع قاعدة بيانات MySQL لتطبيق iwantdz

## المتطلبات الأساسية

- Node.js (الإصدار 14 أو أحدث)
- MySQL Server
- phpMyAdmin (لإدارة قاعدة البيانات)

## خطوات التثبيت والتشغيل

### 1. تثبيت الحزم المطلوبة

افتح موجه الأوامر (CMD) أو PowerShell في مجلد backend وقم بتشغيل:

```bash
npm install
```

سيتم تثبيت الحزم التالية:
- express: إطار عمل السيرفر
- mysql2: للاتصال بقاعدة بيانات MySQL
- cors: للسماح بالطلبات من مصادر مختلفة
- dotenv: لإدارة متغيرات البيئة
- nodemon: لإعادة تشغيل السيرفر تلقائياً عند تغيير الكود (للتطوير فقط)

### 2. إعداد قاعدة البيانات

#### الطريقة الأولى: استخدام سطر الأوامر (MySQL CLI)

افتح موجه الأوامر (CMD) أو PowerShell وشغل:

```bash
mysql -u root -p
```

أدخل كلمة مرور MySQL إذا كانت موجودة، ثم شغل الأوامر التالية:

```sql
CREATE DATABASE iwantdz_db;
USE iwantdz_db;

-- مثال لإنشاء جدول الحاويات
CREATE TABLE containers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

للخروج من MySQL:
```sql
EXIT;
```

#### الطريقة الثانية: استخدام أدوات رسومية (اختياري)

إذا كنت تفضل واجهة رسومية، يمكنك تثبيت أحد البرامج التالية:
- **MySQL Workbench:** https://dev.mysql.com/downloads/workbench/
- **DBeaver:** https://dbeaver.io/
- **phpMyAdmin:** يتطلب تثبيت XAMPP أو WAMP

### 3. إعداد ملف البيئة (.env)

افتح ملف `.env` في مجلد backend وقم بتعديل الإعدادات حسب إعدادات قاعدة البيانات الخاصة بك:

```env
# Server Configuration
PORT=3000

# Database Configuration
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=كلمة_المرور_الخاصة_بك
DB_NAME=iwantdz_db
DB_PORT=3306
```

**ملاحظة:** إذا كنت تستخدم كلمة مرور لقاعدة البيانات، ضعها في `DB_PASSWORD`. إذا لم تكن هناك كلمة مرور، اتركها فارغة.

### 4. تشغيل السيرفر

#### للتطوير (مع إعادة التشغيل التلقائي):

```bash
npm run dev
```

#### للإنتاج:

```bash
npm start
```

### 5. اختبار السيرفر

بعد تشغيل السيرفر بنجاح، ستظهر رسالة:
```
Server running on port 3000
Connected to MySQL database
```

يمكنك اختبار السيرفر من خلال المتصفح أو باستخدام Postman:

- **الرئيسية:** http://localhost:3000
- **فحص الحالة:** http://localhost:3000/api/health
- **الحاويات:** http://localhost:3000/api/containers

## هيكل المشروع

```
backend/
├── server.js          # ملف السيرفر الرئيسي
├── package.json       # إعدادات المشروع والحزم
├── .env              # متغيرات البيئة (كلمات المرور والإعدادات)
└── README.md         # هذا الملف
```

## استكشاف الأخطاء

### خطأ في الاتصال بقاعدة البيانات

تأكد من:
1. أن MySQL Server يعمل
2. أن كلمة المرور في ملف `.env` صحيحة
3. أن قاعدة البيانات `iwantdz_db` موجودة

### خطأ في المنفذ (Port)

إذا كان المنفذ 3000 مستخدماً، يمكنك تغييره في ملف `.env`:

```env
PORT=3001
```

## ملاحظات مهمة

- لا تقم برفع ملف `.env` إلى GitHub أو أي مستودع عام لأنه يحتوي على معلومات حساسة
- يمكنك إضافة `.env` إلى ملف `.gitignore`
- للتعديل على الكود، استخدم `npm run dev` لإعادة التشغيل التلقائي
