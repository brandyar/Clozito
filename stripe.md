# راهنمای تنظیمات Stripe برای نسخه اروپایی (`stripe.md`)

> این سند چک‌لیست کامل تنظیماتی است که باید در **Stripe Dashboard** و **Directus (`project_settings`)** انجام دهید تا پرداخت‌های اشتراک یورویی (EUR)، مدیریت صورتحساب‌ها (Customer Portal)، مالیات/VAT اروپا و Webhookها بدون خطا کار کنند.

---

## ۱. کلیدها و تنظیمات در Directus (`project_settings`)

سرور پروژه (`server/payment.ts`) کلیدها و تنظیمات Stripe را به‌صورت امن از کالکشن **`project_settings`** (یا متغیرهای محیطی Coolify به‌عنوان fallback) می‌خواند. در کالکشن `project_settings` در Directus، این رکوردها را ثبت یا بررسی کنید:

| `key` | مقدار نمونه (Test Mode) | مقدار نمونه (Live Mode) | توضیح |
| :--- | :--- | :--- | :--- |
| **`STRIPE_SECRET_KEY`** | `sk_test_...` | `sk_live_...` | **الزامی** — کلید محرمانه از `Developers → API keys` |
| **`STRIPE_WEBHOOK_SECRET`** | `whsec_...` | `whsec_...` | **الزامی** — کلید امضای Webhook پس از ساخت Endpoint (بخش ۴) |
| **`STRIPE_AUTOMATIC_TAX`** | `false` | `true` *(اختیاری)* | در صورت فعال کردن Stripe Tax در پنل، روی `true` بگذارید (پیش‌فرض `false` است تا در حالت تست خطا ندهد) |

> **نکته امنیتی:** هیچ‌وقت کلیدهای `sk_test_` یا `sk_live_` را در کد فرانت‌اند یا متغیرهای `VITE_` قرار ندهید. سرور خودش کلیدها را با کش ۶۰ ثانیه‌ای از Directus می‌خواند.

### ساختار قیمت‌گذاری پیاده‌سازی‌شده در سرور (`src/config/plans.ts`)
- **Desktop Local (`free`) — €0:** نسخه دسکتاپ آفلاین تک‌کاربره + امکان خرید لایسنس یک‌بارپرداخت آفلاین **فقط** برای ماژول‌های بدون هزینه سرور (`barcode: €49`، `accounting: €79`، `production: €119`).
- **Boutique Cloud (`boutique`) — €29/ماه (€79 سه‌ماهه | €149 شش‌ماهه | €269 سالانه):** همگام‌سازی ابری + چندکاربره RBAC + `barcode` + `online_catalog` + `woocommerce`.
- **Atelier & Production Cloud (`atelier`) — €49/ماه (€135 سه‌ماهه | €259 شش‌ماهه | €469 سالانه):** همه امکانات Boutique + `production` (تولید و BOM) + `accounting` (حسابداری و VAT).
- *(ماژول‌های آنلاین `woocommerce` و `online_catalog` به‌صورت یک‌بارپرداخت فروخته نمی‌شوند و سرور درخواست خرید تکی آن‌ها را مسدود می‌کند.)*

---

## ۲. فعال‌سازی Stripe Customer Portal (بسیار مهم)

دکمه **Manage Billing & Invoices** در تنظیمات برنامه به مسیر `POST /api/payment/portal` متصل است و از **Stripe Billing Portal** استفاده می‌کند. اگر این بخش در داشبورد Stripe فعال نباشد، Stripe خطای `No configuration provided` برمی‌گرداند.

**مسیر در Stripe Dashboard:**
`Settings → Billing → Customer portal` (یا جستجوی `Customer portal` در نوار بالا)

**تنظیماتی که باید روشن کنید:**
1. روی **Activate link / Save changes** کلیک کنید تا پورتال پیش‌فرض فعال شود.
2. در بخش **Invoice history**:
   - تیک **Show invoice history** را بزنید (تا کاربران فاکتورهای PDF هر ماه را دانلود کنند).
3. در بخش **Customer information**:
   - اجازه ویرایش **Billing address** و **Tax IDs (EU VAT / Partita IVA)** را فعال کنید.
4. در بخش **Payment methods**:
   - تیک **Allow customers to update payment methods** را بزنید.
5. در بخش **Subscriptions**:
   - تیک **Allow customers to cancel subscriptions** را بزنید و حالت لغو را روی **Cancel at end of billing period** بگذارید (تا اشتراک کاربر تا پایان دوره پرداخت‌شده فعال بماند و سپس با Webhook به پلن رایگان برگردد).
6. در بخش **Business information**:
   - لینک Privacy Policy، Terms of Service و ایمیل پشتیبانی را وارد کنید.

---

## ۳. فعال‌سازی روش‌های پرداخت محبوب اروپا

کد سرور روی حالت **Dynamic Payment Methods** (`automatic_payment_methods` / بدون محدودیت صرفاً به کارت) تنظیم شده است؛ بنابراین هر روشی که در Stripe Dashboard روشن کنید، به‌طور خودکار در صفحه Checkout برای کاربران اروپایی نمایش داده می‌شود.

**مسیر در Stripe Dashboard:**
`Settings → Payments → Payment methods`

**روش‌های پیشنهادی برای ایتالیا و اتحادیه اروپا:**
- [x] **Cards** (Visa, Mastercard, American Express) — *پیش‌فرض فعال*
- [x] **SEPA Direct Debit** — *بسیار مهم برای اشتراک‌های B2B اروپا (در Webhook با `checkout.session.async_payment_succeeded` و `invoice.paid` هندل شده است)*
- [x] **Apple Pay** — *پس از اتصال دامنه نهایی، دامنه را در بخش `Payment method domains` تأیید کنید*
- [x] **Google Pay** — *تأیید خودکار روی مرورگرهای سازگار*
- [ ] **Bancontact / iDEAL / EPS** *(اختیاری — برای مشتریان بلژیک، هلند و اتریش)*

> **توضیح مهم برای SEPA Direct Debit:** تسویه SEPA ممکن است چند روز کاری طول بکشد. در کد سرور ما هم `checkout.session.completed` و هم `checkout.session.async_payment_succeeded` و `invoice.paid` پشتیبانی شده‌اند تا پس از تأیید بانک، اشتراک بدون مشکل فعال/تمدید شود.

---

## ۴. ساخت و اتصال Webhook Endpoint (حیاتی برای تمدید خودکار)

تمدید خودکار ماهانه/سالانه، مدیریت شکست پرداخت (`past_due`) و تنزل خودکار به پلن رایگان پس از لغو (`canceled`) تماماً از طریق Webhook انجام می‌شود.

**مسیر در Stripe Dashboard:**
`Developers → Webhooks → Add endpoint`

1. **Endpoint URL** را به شکل زیر وارد کنید (دامنه واقعی خود را جایگزین کنید):
   ```
   https://<YOUR_APP_DOMAIN>/api/payment/webhook
   ```
2. در بخش **Select events to listen to**، دقیقاً این **۶ رویداد** را انتخاب کنید:
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
   - `invoice.paid`
   - `invoice.payment_failed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
3. روی **Add endpoint** کلیک کنید.
4. در صفحه Endpoint ساخته‌شده، روی **Reveal** در کنار **Signing secret** کلیک کرده، مقدار `whsec_...` را کپی کنید و در Directus داخل `project_settings` با کلید **`STRIPE_WEBHOOK_SECRET`** ذخیره نمایید.

> **نکته Coolify / Reverse Proxy:** مطمئن شوید مسیر `/api/payment/webhook` بدون تغییر بدنه (Raw Body) به سرور Node.js برسد. در کد اکسپرس پروژه، `rawBody` به‌صورت خودکار ثبت شده و آماده است.

---

## ۵. مالیات اروپا و دریافت کد VAT / Partita IVA

- در کد Checkout، گزینه‌های زیر **از قبل فعال شده‌اند**:
  - `tax_id_collection: { enabled: true }` (فیلد وارد کردن **Partita IVA / EU VAT ID** برای مشتریان B2B اروپا)
  - `billing_address_collection: 'required'` (دریافت آدرس رسمی صورتحساب)
  - `customer_update: { address: 'auto', name: 'auto' }`
- **اگر می‌خواهید Stripe خودش VAT کشورهای مختلف اروپا را محاسبه و اعمال کند (Stripe Tax):**
  1. در Stripe Dashboard به مسیر `Settings → Tax` بروید.
  2. آدرس ثبتی شرکت (Origin Address) و ثبت‌نام‌های VAT خود را وارد کنید.
  3. Product Tax Code پیش‌فرض را روی **Software as a Service (SaaS) - Business use** (`txcd_10103001`) قرار دهید.
  4. در Directus (`project_settings`) مقدار `STRIPE_AUTOMATIC_TAX` را برابر `true` بگذارید.
  5. *(اطمینان خاطر)*: اگر به هر دلیلی Stripe Tax در حسابتان کامل پیکربندی نشده باشد، کد سرور به‌صورت خودکار خطای `automatic_tax` را گرفته و بدون خطا Checkout را بدون محاسبه خودکار مالیات می‌سازد.

---

## ۶. تست کامل قبل از رفتن به حالت Live (Test Mode)

قبل از انتشار رسمی، این ۴ سناریو را در **Test Mode** بررسی کنید:

1. **خرید اشتراک جدید:** با کارت تست `4242 4242 4242 4242` (تاریخ آینده، هر CVC) یکی از پلن‌های **Boutique Cloud (€29)** یا **Atelier Cloud (€49)** را بخرید.
   - بررسی کنید در Directus روی `organizations` فیلدهای `plan = boutique` (یا `atelier`)، `stripe_customer_id`، `stripe_subscription_id` و `stripe_subscription_status = active` پر شوند.
   - بررسی کنید رکورد پرداخت در کالکشن `subscriptions` ثبت شود.
2. **باز کردن Customer Portal:** از بخش `Settings → Organization Profile → Manage Billing & Invoices` وارد پورتال Stripe شوید و فاکتور PDF را مشاهده کنید.
3. **تست پرداخت ناموفق (`past_due`):** در Stripe CLI یا Test Clock رویداد `invoice.payment_failed` را تست کنید و مطمئن شوید بنر هشدار `Action Required: Subscription Renewal Failed` در بخش تنظیمات نمایش داده می‌شود.
4. **تست لغو اشتراک:** اشتراک را از پورتال لغو کنید و پس از دریافت `customer.subscription.deleted` مطمئن شوید سازمان به `plan = free` و `stripe_subscription_status = canceled` تغییر می‌کند.

---

## ۷. چک‌لیست نهایی انتقال از Test Mode به Live Mode

- [ ] فعال‌سازی کامل حساب بیزینس Stripe (تأیید هویت، حساب بانکی IBAN یورویی و مشخصات شرکت)
- [ ] تکرار تنظیمات **Customer Portal** در **Live Mode** (تنظیمات Test به Live منتقل نمی‌شوند!)
- [ ] تکرار فعال‌سازی **Payment Methods** (SEPA, Apple Pay, Google Pay) و ثبت دامنه در **Live Mode**
- [ ] ساخت **Webhook Endpoint جدید در Live Mode** با همان ۶ رویداد
- [ ] جایگزینی `STRIPE_SECRET_KEY` (`sk_live_...`) و `STRIPE_WEBHOOK_SECRET` (`whsec_...` جدید) در Directus `project_settings`
- [ ] پاک کردن `stripe_customer_id`های تستی (شروع‌شونده با `cus_` در حالت Test) از رکورد سازمان‌های واقعی قبل از خرید واقعی
- [ ] انجام یک تراکنش واقعی کوچک یا استفاده از کد تخفیف ۱۰۰٪ در Live Mode برای اطمینان از سلامت Webhook و صدور فاکتور
