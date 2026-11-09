# Dahua-appLGWebostV — 1.0.0.0

تطبيق مستقل لمشاهدة كاميرات جهاز تسجيل Dahua على تلفزيونات LG webOS عبر الشبكة المحلية. يدعم العرض المباشر، البحث في التسجيلات وتشغيلها، وتخطيطات 4 و6 و8 و16 خانة مع حفظ آخر اختيار.

## التوافق

- **LG OLED C4 (webOS 24):** اختُبرت النسخ السابقة على هذا الموديل. اجتازت النسخة العامة الحالية فحص الحزمة وفحص إعداد الاتصال محلياً؛ لم يُتحقق بعد من تشغيلها مع جهاز تسجيل على تلفاز فعلي.
- **LG C5 والأجيال الأحدث:** مستهدفة إذا دعمت Developer Mode وتشغيل خدمات webOS والوسائط المستخدمة؛ لم تُختبر موديلاتها فعلياً. هذا تطبيق مستقل وليس إصداراً من LG أو Dahua.
- يحتاج جهاز Dahua يدعم RTSP للبث وواجهة CGI عبر HTTPS للتسجيلات. عدد الخانات ليس ضماناً لعدد بثوث HD المتزامنة؛ يعتمد ذلك على التلفاز والترميز والجهاز. ابدأ بـ SD للشبكة، واستخدم HD عند تكبير كاميرا. إذا تعذر HD يحاول التطبيق البث الفرعي.

## التثبيت

1. نزّل ملف IPK من [إصدار 1.0.0.0](https://github.com/sics2002/dahua-webos-viewer/releases/tag/v1.0.0.0).
2. فعّل [Developer Mode](https://webostv.developer.lge.com/develop/getting-started/developer-mode-app) على التلفاز وأضفه إلى webOS CLI. يجب أن يكون الكمبيوتر والتلفاز على الشبكة نفسها.
3. ثبّت الملف بالأمر:

       ares-install -d YOUR_TV Dahua-appLGWebostV-1.0.0.0.ipk

4. افتح **Dahua-appLGWebostV**. أدخل عنوان NVR أو اسم المضيف، اسم المستخدم، كلمة المرور، عدد القنوات، منفذ RTSP (الافتراضي 554) ومنفذ HTTPS (الافتراضي 443). استخدم حساباً مخصصاً للمشاهدة والتسجيلات إذا كان جهازك يدعم ذلك.
5. اختر تخطيط العرض. الأسهم للتنقل، وOK للتكبير، وBack للرجوع إلى الشبكة. يمكن تغيير الاتصال من **إعداد الاتصال**. افتح **التسجيلات** وحدد القناة والتاريخ.

النسخة تبدأ بلا عنوان جهاز أو بيانات دخول. حفظ كلمة المرور اختياري ويتم في مساحة التطبيق على التلفاز. استخدم التطبيق على شبكتك المحلية. بوابة إدارة NVR الأصلية تفتح من متصفحك مباشرة بعنوان جهازك؛ هذه النسخة تتضمن شاشة إعداد الاتصال والمشاهدة.

## البناء

ثبّت [webOS CLI](https://webostv.developer.lge.com/develop/tools/cli-installation)، ثم نفّذ من جذر المشروع:

    ares-package -c app service
    ares-package app service

اسم الإصدار العام **1.0.0.0**، والرقم داخل الحزمة **1.0.0** لأن [webOS يطلب ثلاثة أجزاء](https://webostv.developer.lge.com/develop/references/appinfo-json#version).

English: Independent Dahua NVR viewer for LG webOS. The original build was tested on LG OLED C4; this clean public build targets C4 and newer compatible models. Newer models and physical TV playback with this release are not yet verified. Install the IPK in Developer Mode, then enter your own NVR address, credentials, ports and channel count. Multi-channel HD depends on hardware and stream codecs.

## Third-party software

Includes the official ARM64 [go2rtc 1.9.14](https://github.com/AlexxIT/go2rtc/releases/tag/v1.9.14) binary (MIT; see [license](service/go2rtc-LICENSE.txt)). Upstream source is available at the linked release. SHA-256 of the bundled executable: 359fabade8a7a51e81a55fe6df6b0ef81764a5e1d63179577534eaaa71904b50.
